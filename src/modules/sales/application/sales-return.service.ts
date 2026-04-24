import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  DocumentRelationType,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { SalesProjectService } from "../../sales-project/application/sales-project.service";
import type { CreateSalesReturnDto } from "../dto/create-sales-return.dto";
import type { QuerySalesReturnDto } from "../dto/query-sales-return.dto";
import { SalesRepository } from "../infrastructure/sales.repository";
import { SalesReturnSourceService } from "./sales-return-source.service";
import { SalesSharedService } from "./sales-shared.service";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
const BUSINESS_MODULE = "sales";

@Injectable()
export class SalesReturnService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly shared: SalesSharedService,
    private readonly salesProjectService: SalesProjectService,
    private readonly returnSource: SalesReturnSourceService,
  ) {}

  async listSalesReturns(query: QuerySalesReturnDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findSalesReturns({
      documentNo: query.documentNo,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      customerId: query.customerId,
      sourceOutboundOrderId: query.sourceOutboundOrderId,
      workshopId: query.workshopId,
      limit,
      offset,
    });
  }

  async getSalesReturnById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`销售退货单不存在: ${id}`);
    }
    if (order.orderType !== SalesStockOrderType.SALES_RETURN) {
      throw new NotFoundException(`销售退货单不存在: ${id}`);
    }
    return order;
  }

  async createSalesReturn(dto: CreateSalesReturnDto, createdBy?: string) {
    const sourceOutbound = await this.repository.findOrderById(
      dto.sourceOutboundOrderId,
    );
    if (!sourceOutbound) {
      throw new NotFoundException(
        `来源出库单不存在: ${dto.sourceOutboundOrderId}`,
      );
    }
    if (sourceOutbound.orderType !== SalesStockOrderType.OUTBOUND) {
      throw new BadRequestException(
        `来源单据不是出库单: ${dto.sourceOutboundOrderId}`,
      );
    }
    if (sourceOutbound.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException(
        `来源出库单已作废: ${dto.sourceOutboundOrderId}`,
      );
    }

    await this.validateMasterDataForSalesReturn(dto, sourceOutbound);

    const bizDate = new Date(dto.bizDate);
    const customerId = dto.customerId ?? sourceOutbound.customerId ?? undefined;
    const { customerCodeSnapshot, customerNameSnapshot } =
      await this.shared.snapshots.resolveCustomerSnapshot(customerId);
    const { handlerNameSnapshot } =
      await this.shared.snapshots.resolveHandlerSnapshot(
        dto.handlerPersonnelId,
      );
    const stockScopeRecord =
      await this.shared.masterDataService.getStockScopeByCode("MAIN");
    const workshop = await this.shared.masterDataService.getWorkshopById(
      dto.workshopId,
    );

    const outboundLinesById = new Map(
      sourceOutbound.lines.map((l) => [l.id, l]),
    );
    const salesProjectById =
      await this.salesProjectService.listProjectReferencesByIds(
        sourceOutbound.lines
          .map((line) => line.salesProjectId)
          .filter((value): value is number => value != null),
        { allowVoided: true },
      );

    // Enforce cumulative active return limit per source outbound line.
    // Aggregate (a) existing non-voided downstream returns from DB and (b) all
    // incoming lines in this request that point to the same source line, so that
    // split lines within a single request cannot bypass the cap.
    const incomingBySourceLine = new Map<number, Prisma.Decimal>();
    for (const line of dto.lines) {
      const prev =
        incomingBySourceLine.get(line.sourceOutboundLineId) ??
        new Prisma.Decimal(0);
      incomingBySourceLine.set(
        line.sourceOutboundLineId,
        prev.add(new Prisma.Decimal(line.quantity)),
      );
    }
    const activeReturnedByLine =
      await this.repository.sumActiveReturnedQtyByOutboundLine(
        dto.sourceOutboundOrderId,
      );
    for (const [sourceLineId, incomingQty] of incomingBySourceLine) {
      const sourceLine = outboundLinesById.get(sourceLineId);
      if (sourceLine) {
        const alreadyReturned =
          activeReturnedByLine.get(sourceLineId) ?? new Prisma.Decimal(0);
        if (
          alreadyReturned
            .add(incomingQty)
            .gt(new Prisma.Decimal(sourceLine.quantity))
        ) {
          throw new BadRequestException(
            `来源出库明细 ${sourceLineId} 累计有效退货数量超过出库数量`,
          );
        }
      }
    }

    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) => {
        const sourceLine = outboundLinesById.get(line.sourceOutboundLineId);
        if (!sourceLine) {
          throw new BadRequestException(
            `来源出库明细不存在: ${line.sourceOutboundLineId}`,
          );
        }
        if (sourceLine.materialId !== line.materialId) {
          throw new BadRequestException(
            `明细 ${idx + 1} 物料与来源出库明细不一致`,
          );
        }
        const returnQty = new Prisma.Decimal(line.quantity);
        const sourceQty = new Prisma.Decimal(sourceLine.quantity);
        if (returnQty.gt(sourceQty)) {
          throw new BadRequestException(
            `明细 ${idx + 1} 退货数量不能超过来源出库数量`,
          );
        }
        const material = await this.shared.masterDataService.getMaterialById(
          line.materialId,
        );
        const materialCategorySnapshot =
          await this.shared.snapshots.buildMaterialCategorySnapshot(material);
        const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
        const amount = returnQty.mul(unitPrice);
        const selectedUnitCost = new Prisma.Decimal(
          sourceLine.selectedUnitCost,
        );
        const salesProjectReference =
          sourceLine.salesProjectId != null
            ? (salesProjectById.get(sourceLine.salesProjectId) ?? null)
            : null;
        return {
          lineNo: idx + 1,
          materialId: material.id,
          salesProjectId: sourceLine.salesProjectId ?? null,
          salesProjectCodeSnapshot: sourceLine.salesProjectCodeSnapshot ?? null,
          salesProjectNameSnapshot: sourceLine.salesProjectNameSnapshot ?? null,
          materialCategoryIdSnapshot: materialCategorySnapshot.id,
          materialCategoryCodeSnapshot: materialCategorySnapshot.code,
          materialCategoryNameSnapshot: materialCategorySnapshot.name,
          materialCategoryPathSnapshot: materialCategorySnapshot.path,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity: returnQty,
          unitPrice,
          amount,
          selectedUnitCost,
          projectTargetId: salesProjectReference?.projectTargetId ?? null,
          sourceDocumentType: DOCUMENT_TYPE,
          sourceDocumentId: dto.sourceOutboundOrderId,
          sourceDocumentLineId: line.sourceOutboundLineId,
          remark: line.remark,
        };
      }),
    );

    const totalQty = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.amount),
      new Prisma.Decimal(0),
    );
    const projectTargetByLineNo = new Map(
      linesWithSnapshots.map((line) => [line.lineNo, line.projectTargetId]),
    );

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildCompactDocumentNo("XSTH", bizDate, attempt);
      return this.repository.runInTransaction(async (tx) => {
        const order = await this.repository.createOrder(
          {
            documentNo,
            orderType: SalesStockOrderType.SALES_RETURN,
            bizDate,
            customerId,
            handlerPersonnelId: dto.handlerPersonnelId,
            stockScopeId: stockScopeRecord.id,
            workshopId: dto.workshopId,
            customerCodeSnapshot,
            customerNameSnapshot,
            handlerNameSnapshot,
            workshopNameSnapshot: workshop.workshopName,
            totalQty,
            totalAmount,
            remark: dto.remark,
            auditStatusSnapshot: AuditStatusSnapshot.PENDING,
            createdBy,
            updatedBy: createdBy,
          },
          linesWithSnapshots.map(({ projectTargetId, ...line }) => ({
            ...line,
            createdBy,
            updatedBy: createdBy,
          })),
          tx,
        );

        await this.repository.createDocumentRelation(
          {
            relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
            upstreamFamily: DocumentFamily.SALES_STOCK,
            upstreamDocumentType: DOCUMENT_TYPE,
            upstreamDocumentId: dto.sourceOutboundOrderId,
            downstreamFamily: DocumentFamily.SALES_STOCK,
            downstreamDocumentType: DOCUMENT_TYPE,
            downstreamDocumentId: order.id,
            isActive: true,
            createdBy,
            updatedBy: createdBy,
          },
          tx,
        );

        for (const line of order.lines) {
          // Release original outbound source allocations proportional to return qty,
          // and derive settled return cost from released allocation cost layers.
          let returnCostUnitPrice: Prisma.Decimal | null = null;
          let returnCostAmount: Prisma.Decimal | null = null;
          if (line.sourceDocumentLineId) {
            const releaseResult =
              await this.returnSource.releaseOutboundSourceForReturn(
                dto.sourceOutboundOrderId,
                line.sourceDocumentLineId,
                new Prisma.Decimal(line.quantity),
                createdBy,
                tx,
              );
            returnCostUnitPrice = releaseResult.releasedUnitCost;
            returnCostAmount = releaseResult.releasedCostAmount;
          }

          await this.shared.inventoryService.increaseStock(
            {
              materialId: line.materialId,
              stockScope: "MAIN",
              bizDate,
              quantity: line.quantity,
              operationType: InventoryOperationType.SALES_RETURN_IN,
              businessModule: BUSINESS_MODULE,
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: order.id,
              businessDocumentNumber: order.documentNo,
              businessDocumentLineId: line.id,
              projectTargetId:
                projectTargetByLineNo.get(line.lineNo) ?? undefined,
              operatorId: createdBy,
              idempotencyKey: `SalesStockOrder:${order.id}:line:${line.id}`,
            },
            tx,
          );

          // Persist settled return cost on the return line.
          if (returnCostUnitPrice !== null) {
            await this.repository.updateOrderLine(
              line.id,
              {
                costUnitPrice: returnCostUnitPrice,
                costAmount: returnCostAmount ?? undefined,
              },
              tx,
            );
          }

          if (line.sourceDocumentLineId) {
            await this.repository.createDocumentLineRelation(
              {
                relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
                upstreamFamily: DocumentFamily.SALES_STOCK,
                upstreamDocumentType: DOCUMENT_TYPE,
                upstreamDocumentId: dto.sourceOutboundOrderId,
                upstreamLineId: line.sourceDocumentLineId,
                downstreamFamily: DocumentFamily.SALES_STOCK,
                downstreamDocumentType: DOCUMENT_TYPE,
                downstreamDocumentId: order.id,
                downstreamLineId: line.id,
                linkedQty: line.quantity,
                createdBy,
                updatedBy: createdBy,
              },
              tx,
            );
          }
        }

        await this.shared.approvalService.createOrRefreshApprovalDocument(
          {
            documentFamily: DocumentFamily.SALES_STOCK,
            documentType: DOCUMENT_TYPE,
            documentId: order.id,
            documentNumber: order.documentNo,
            submittedBy: createdBy,
            createdBy,
          },
          tx,
        );

        return order;
      });
    });
  }

  async voidSalesReturn(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`销售退货单不存在: ${id}`);
    }
    if (order.orderType !== SalesStockOrderType.SALES_RETURN) {
      throw new NotFoundException(`销售退货单不存在: ${id}`);
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.repository.runInTransaction(async (tx) => {
      // Restore the outbound source allocations that were released when this
      // return was created (mirrors the release done in createSalesReturn).
      for (const line of order.lines) {
        if (
          line.sourceDocumentLineId != null &&
          line.sourceDocumentId != null
        ) {
          await this.returnSource.restoreOutboundSourceForReturnVoid(
            line.sourceDocumentId,
            line.sourceDocumentLineId,
            new Prisma.Decimal(line.quantity),
            voidedBy,
            tx,
          );
        }
      }

      const logs = await this.shared.inventoryService.getLogsForDocument(
        {
          businessDocumentType: DOCUMENT_TYPE,
          businessDocumentId: id,
        },
        tx,
      );

      if (logs.length === 0) {
        throw new BadRequestException("未找到可冲回的库存流水");
      }

      for (const log of logs) {
        await this.shared.inventoryService.reverseStock(
          {
            logIdToReverse: log.id,
            idempotencyKey: `SalesStockOrder:void:${id}:log:${log.id}`,
            note: `作废销售退货单: ${order.documentNo}`,
          },
          tx,
        );
      }

      await this.repository.deactivateDocumentRelationsForOrder(
        id,
        DOCUMENT_TYPE,
        tx,
      );

      await this.repository.updateOrder(
        id,
        {
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          voidReason: voidReason ?? null,
          voidedBy: voidedBy ?? null,
          voidedAt: new Date(),
          updatedBy: voidedBy,
        },
        tx,
      );

      await this.shared.approvalService.markApprovalNotRequired(
        DOCUMENT_TYPE,
        id,
        voidedBy,
        tx,
      );

      return this.repository.findOrderById(id, tx);
    });
  }

  private async validateMasterDataForSalesReturn(
    dto: CreateSalesReturnDto,
    sourceOutbound: { workshopId: number; customerId: number | null },
  ) {
    await this.shared.masterDataService.getWorkshopById(dto.workshopId);
    if (dto.workshopId !== sourceOutbound.workshopId) {
      throw new BadRequestException("销售退货车间必须与来源出库单一致");
    }
    if (dto.customerId && sourceOutbound.customerId) {
      if (dto.customerId !== sourceOutbound.customerId) {
        throw new BadRequestException("销售退货客户应与来源出库单一致");
      }
    }
    if (dto.customerId) {
      await this.shared.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.handlerPersonnelId) {
      await this.shared.masterDataService.getPersonnelById(
        dto.handlerPersonnelId,
      );
    }
    for (const line of dto.lines) {
      await this.shared.masterDataService.getMaterialById(line.materialId);
    }
  }
}
