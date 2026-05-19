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
  StockInOrderType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateSupplierReturnDto } from "../dto/create-supplier-return.dto";
import type { QueryInboundOrderDto } from "../dto/query-inbound-order.dto";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundSharedService } from "./inbound-shared.service";

const DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
const BUSINESS_MODULE = "inbound";
const SOURCE_OPERATION_TYPES = [
  InventoryOperationType.ACCEPTANCE_IN,
  InventoryOperationType.PRICE_CORRECTION_IN,
];

type StockInOrder = NonNullable<
  Awaited<ReturnType<InboundRepository["findOrderById"]>>
>;
type StockInOrderLine = StockInOrder["lines"][number];
type InventoryDocumentLog = Awaited<
  ReturnType<InventoryService["getLogsForDocument"]>
>[number];

@Injectable()
export class InboundSupplierReturnService {
  constructor(
    private readonly repository: InboundRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly approvalService: ApprovalService,
    private readonly shared: InboundSharedService,
  ) {}

  async listSupplierReturns(
    query: QueryInboundOrderDto & { stockScopeId?: number },
  ) {
    return this.repository.findOrders({
      ...query,
      orderType: StockInOrderType.SUPPLIER_RETURN,
      includeVoided: true,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
    });
  }

  async listSupplierReturnLines(
    query: QueryInboundOrderDto & { stockScopeId?: number },
  ) {
    return this.repository.findOrderLines({
      ...query,
      orderType: StockInOrderType.SUPPLIER_RETURN,
      includeVoided: true,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
    });
  }

  async getSupplierReturnById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order || order.orderType !== StockInOrderType.SUPPLIER_RETURN) {
      throw new NotFoundException(`供应商退货单不存在：${id}`);
    }
    return order;
  }

  async getSupplierReturnPreview(sourceOrderId: number) {
    const sourceOrder = await this.repository.findOrderById(sourceOrderId);
    if (!sourceOrder) {
      throw new NotFoundException(`来源验收单不存在：${sourceOrderId}`);
    }
    this.assertSourceOrderReturnable(sourceOrder);

    const sourceLogByLineId =
      await this.resolveCurrentAcceptanceSourceLogsByLineId(sourceOrder.id);
    const activeReturnedByLine =
      await this.repository.sumActiveSupplierReturnedQtyBySourceLine(
        sourceOrder.id,
      );
    const lines = await Promise.all(
      sourceOrder.lines.map(async (line) => {
        const sourceLog = sourceLogByLineId.get(line.id);
        if (!sourceLog) {
          throw new BadRequestException(
            `来源验收明细缺少有效库存来源流水：${line.id}`,
          );
        }
        const sourceAvailability =
          await this.repository.getInventorySourceAvailability(sourceLog.id);
        const sourceQty = new Prisma.Decimal(line.quantity);
        const activeReturnedQty =
          activeReturnedByLine.get(line.id) ?? new Prisma.Decimal(0);
        const notReturnedQty = Prisma.Decimal.max(
          sourceQty.sub(activeReturnedQty),
          0,
        );
        const sourceAvailableQty = Prisma.Decimal.max(
          sourceAvailability?.availableQty ?? new Prisma.Decimal(0),
          0,
        );
        const availableQty = Prisma.Decimal.min(
          notReturnedQty,
          sourceAvailableQty,
        );
        const currentUnitCost =
          sourceLog.unitCost != null
            ? new Prisma.Decimal(sourceLog.unitCost)
            : new Prisma.Decimal(line.unitPrice);

        return {
          sourceStockInOrderLineId: line.id,
          materialId: line.materialId,
          materialCode: line.materialCodeSnapshot,
          materialName: line.materialNameSnapshot,
          materialSpec: line.materialSpecSnapshot,
          unitCode: line.unitCodeSnapshot,
          sourceQuantity: sourceQty,
          activeReturnedQty,
          sourceAvailableQty,
          availableQty,
          sourceLogId: sourceLog.id,
          currentUnitCost,
          remark: line.remark,
        };
      }),
    );

    return {
      sourceOrder: {
        id: sourceOrder.id,
        documentNo: sourceOrder.documentNo,
        bizDate: sourceOrder.bizDate,
        supplierId: sourceOrder.supplierId,
        supplierName: sourceOrder.supplierNameSnapshot,
        handlerName: sourceOrder.handlerNameSnapshot,
        workshopId: sourceOrder.workshopId,
        workshopName: sourceOrder.workshopNameSnapshot,
      },
      lines,
    };
  }

  async createSupplierReturn(
    sourceOrderId: number,
    dto: CreateSupplierReturnDto,
    createdBy?: string,
  ) {
    const sourceOrder = await this.repository.findOrderById(sourceOrderId);
    if (!sourceOrder) {
      throw new NotFoundException(`来源验收单不存在：${sourceOrderId}`);
    }
    this.assertSourceOrderReturnable(sourceOrder);
    await this.validateMasterData(dto);

    const bizDate = new Date(dto.bizDate);
    const stockScopeRecord =
      sourceOrder.stockScopeId != null
        ? null
        : await this.masterDataService.getStockScopeByCode("MAIN");
    const finalStockScopeId = sourceOrder.stockScopeId ?? stockScopeRecord?.id;
    const finalHandlerPersonnelId =
      dto.handlerPersonnelId ?? sourceOrder.handlerPersonnelId ?? null;
    const { handlerNameSnapshot } = await this.shared.resolveHandlerSnapshot(
      finalHandlerPersonnelId ?? undefined,
      dto.handlerName ?? sourceOrder.handlerNameSnapshot ?? undefined,
    );
    const sourceLineById = new Map(
      sourceOrder.lines.map((line) => [line.id, line]),
    );
    const sourceLogByLineId =
      await this.resolveCurrentAcceptanceSourceLogsByLineId(sourceOrder.id);
    const activeReturnedByLine =
      await this.repository.sumActiveSupplierReturnedQtyBySourceLine(
        sourceOrder.id,
      );
    const lineInputs = this.buildSupplierReturnLineInputs(
      dto,
      sourceLineById,
      sourceLogByLineId,
      activeReturnedByLine,
    );
    const totalQty = lineInputs.reduce(
      (sum, line) => sum.add(line.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = lineInputs.reduce(
      (sum, line) => sum.add(line.amount),
      new Prisma.Decimal(0),
    );

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildCompactDocumentNo("TG", bizDate, attempt);
      return this.repository.runInTransaction(async (tx) => {
        const order = await this.repository.createOrder(
          {
            documentNo,
            orderType: StockInOrderType.SUPPLIER_RETURN,
            bizDate,
            supplierId: sourceOrder.supplierId,
            handlerPersonnelId: finalHandlerPersonnelId,
            stockScopeId: finalStockScopeId,
            workshopId: sourceOrder.workshopId,
            rdProcurementRequestId: sourceOrder.rdProcurementRequestId,
            supplierCodeSnapshot: sourceOrder.supplierCodeSnapshot,
            supplierNameSnapshot: sourceOrder.supplierNameSnapshot,
            handlerNameSnapshot,
            workshopNameSnapshot: sourceOrder.workshopNameSnapshot,
            rdProcurementRequestNoSnapshot:
              sourceOrder.rdProcurementRequestNoSnapshot,
            rdProcurementProjectCodeSnapshot:
              sourceOrder.rdProcurementProjectCodeSnapshot,
            rdProcurementProjectNameSnapshot:
              sourceOrder.rdProcurementProjectNameSnapshot,
            totalQty,
            totalAmount,
            remark: dto.remark,
            auditStatusSnapshot: AuditStatusSnapshot.PENDING,
            createdBy,
            updatedBy: createdBy,
          },
          lineInputs.map((line) => ({
            lineNo: line.lineNo,
            materialId: line.materialId,
            rdProcurementRequestLineId: line.rdProcurementRequestLineId,
            materialCategoryIdSnapshot: line.materialCategoryIdSnapshot,
            materialCategoryCodeSnapshot: line.materialCategoryCodeSnapshot,
            materialCategoryNameSnapshot: line.materialCategoryNameSnapshot,
            materialCategoryPathSnapshot:
              line.materialCategoryPathSnapshot ?? Prisma.JsonNull,
            materialCodeSnapshot: line.materialCodeSnapshot,
            materialNameSnapshot: line.materialNameSnapshot,
            materialSpecSnapshot: line.materialSpecSnapshot,
            unitCodeSnapshot: line.unitCodeSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
            remark: line.remark,
            createdBy,
            updatedBy: createdBy,
          })),
          tx,
        );

        await this.repository.createDocumentRelation(
          {
            relationType: DocumentRelationType.STOCK_IN_RETURN_TO_SUPPLIER,
            upstreamFamily: DocumentFamily.STOCK_IN,
            upstreamDocumentType: DOCUMENT_TYPE,
            upstreamDocumentId: sourceOrder.id,
            downstreamFamily: DocumentFamily.STOCK_IN,
            downstreamDocumentType: DOCUMENT_TYPE,
            downstreamDocumentId: order.id,
            isActive: true,
            createdBy,
            updatedBy: createdBy,
          },
          tx,
        );

        const sourceInfoByLineNo = new Map(
          lineInputs.map((line) => [line.lineNo, line]),
        );
        for (const line of order.lines) {
          const sourceInfo = sourceInfoByLineNo.get(line.lineNo);
          if (!sourceInfo) {
            throw new BadRequestException(
              `退货明细缺少来源信息：lineNo=${line.lineNo}`,
            );
          }

          await this.inventoryService.settleConsumerOut(
            {
              materialId: line.materialId,
              stockScope: "MAIN",
              bizDate,
              quantity: line.quantity,
              selectedUnitCost: line.unitPrice,
              sourceLogId: sourceInfo.sourceLogId,
              sourceOperationTypes: SOURCE_OPERATION_TYPES,
              operationType: InventoryOperationType.SUPPLIER_RETURN_OUT,
              businessModule: BUSINESS_MODULE,
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: order.id,
              businessDocumentNumber: order.documentNo,
              businessDocumentLineId: line.id,
              operatorId: createdBy,
              idempotencyKey: `StockInSupplierReturn:${order.id}:line:${line.id}`,
              consumerLineId: line.id,
              note: `退给厂家：来源验收单 ${sourceOrder.documentNo}`,
            },
            tx,
          );

          await this.repository.createDocumentLineRelation(
            {
              relationType: DocumentRelationType.STOCK_IN_RETURN_TO_SUPPLIER,
              upstreamFamily: DocumentFamily.STOCK_IN,
              upstreamDocumentType: DOCUMENT_TYPE,
              upstreamDocumentId: sourceOrder.id,
              upstreamLineId: sourceInfo.sourceLineId,
              downstreamFamily: DocumentFamily.STOCK_IN,
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

        await this.approvalService.createOrRefreshApprovalDocument(
          {
            documentFamily: DocumentFamily.STOCK_IN,
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

  async voidSupplierReturn(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.getSupplierReturnById(id);
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.repository.runInTransaction(async (tx) => {
      await this.inventoryService.releaseAllSourceUsagesForConsumer(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: id,
          operatorId: voidedBy,
        },
        tx,
      );

      const logs = await this.inventoryService.getLogsForDocument(
        { businessDocumentType: DOCUMENT_TYPE, businessDocumentId: id },
        tx,
      );
      if (logs.length === 0) {
        throw new BadRequestException("未找到可冲回的库存流水");
      }

      for (const log of logs) {
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: log.id,
            idempotencyKey: `StockInSupplierReturn:void:${id}:log:${log.id}`,
            note: `作废供应商退货单：${order.documentNo}`,
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
      await this.approvalService.markApprovalNotRequired(
        DOCUMENT_TYPE,
        id,
        voidedBy,
        tx,
      );
      return this.repository.findOrderById(id, tx);
    });
  }

  private assertSourceOrderReturnable(sourceOrder: StockInOrder) {
    if (sourceOrder.orderType !== StockInOrderType.ACCEPTANCE) {
      throw new BadRequestException("只能从验收单发起供应商退货");
    }
    if (sourceOrder.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("来源验收单已作废，不能退货");
    }
    if (sourceOrder.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("来源验收单库存状态异常，不能退货");
    }
    if (!sourceOrder.supplierId) {
      throw new BadRequestException("来源验收单缺少供应商，不能退给厂家");
    }
  }

  private async validateMasterData(dto: CreateSupplierReturnDto) {
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
  }

  private async resolveCurrentAcceptanceSourceLogsByLineId(
    sourceOrderId: number,
  ) {
    const logs = await this.inventoryService.getLogsForDocument({
      businessDocumentType: DOCUMENT_TYPE,
      businessDocumentId: sourceOrderId,
    });
    const result = new Map<number, (typeof logs)[number]>();
    for (const log of logs) {
      if (log.businessDocumentLineId == null) continue;
      if (log.operationType !== InventoryOperationType.ACCEPTANCE_IN) continue;
      result.set(
        log.businessDocumentLineId,
        await this.resolveCurrentReturnSourceLog(log),
      );
    }
    return result;
  }

  private async resolveCurrentReturnSourceLog(log: InventoryDocumentLog) {
    let currentLog = log;
    const visitedLogIds = new Set<number>();

    while (!visitedLogIds.has(currentLog.id)) {
      visitedLogIds.add(currentLog.id);
      const correctionLine =
        await this.repository.findEffectivePriceCorrectionLineBySourceLogId(
          currentLog.id,
        );
      if (!correctionLine?.generatedInLog) {
        return currentLog;
      }
      currentLog = correctionLine.generatedInLog as InventoryDocumentLog;
    }

    throw new BadRequestException(
      `来源验收明细调价链存在循环：inventoryLogId=${log.id}`,
    );
  }

  private buildSupplierReturnLineInputs(
    dto: CreateSupplierReturnDto,
    sourceLineById: Map<number, StockInOrderLine>,
    sourceLogByLineId: Map<number, InventoryDocumentLog>,
    activeReturnedByLine: Map<number, Prisma.Decimal>,
  ) {
    const seenSourceLineIds = new Set<number>();
    return dto.lines.map((line, index) => {
      if (seenSourceLineIds.has(line.sourceStockInOrderLineId)) {
        throw new BadRequestException(
          `同一来源验收明细不能重复退货：${line.sourceStockInOrderLineId}`,
        );
      }
      seenSourceLineIds.add(line.sourceStockInOrderLineId);

      const sourceLine = sourceLineById.get(line.sourceStockInOrderLineId);
      if (!sourceLine) {
        throw new BadRequestException(
          `来源验收明细不属于当前验收单：${line.sourceStockInOrderLineId}`,
        );
      }
      const sourceLog = sourceLogByLineId.get(sourceLine.id);
      if (!sourceLog) {
        throw new BadRequestException(
          `来源验收明细缺少有效库存来源流水：${sourceLine.id}`,
        );
      }

      const returnQty = new Prisma.Decimal(line.quantity);
      const alreadyReturned =
        activeReturnedByLine.get(sourceLine.id) ?? new Prisma.Decimal(0);
      const sourceQty = new Prisma.Decimal(sourceLine.quantity);
      if (alreadyReturned.add(returnQty).gt(sourceQty)) {
        throw new BadRequestException(
          `来源验收明细 ${sourceLine.id} 累计退货数量超过验收数量`,
        );
      }

      const unitPrice =
        sourceLog.unitCost != null
          ? new Prisma.Decimal(sourceLog.unitCost)
          : new Prisma.Decimal(sourceLine.unitPrice);
      const amount = returnQty.mul(unitPrice);

      return {
        sourceLineId: sourceLine.id,
        sourceLogId: sourceLog.id,
        lineNo: index + 1,
        materialId: sourceLine.materialId,
        rdProcurementRequestLineId: sourceLine.rdProcurementRequestLineId,
        materialCategoryIdSnapshot: sourceLine.materialCategoryIdSnapshot,
        materialCategoryCodeSnapshot: sourceLine.materialCategoryCodeSnapshot,
        materialCategoryNameSnapshot: sourceLine.materialCategoryNameSnapshot,
        materialCategoryPathSnapshot: sourceLine.materialCategoryPathSnapshot,
        materialCodeSnapshot: sourceLine.materialCodeSnapshot,
        materialNameSnapshot: sourceLine.materialNameSnapshot,
        materialSpecSnapshot: sourceLine.materialSpecSnapshot,
        unitCodeSnapshot: sourceLine.unitCodeSnapshot,
        quantity: returnQty,
        unitPrice,
        amount,
        remark: line.remark,
      };
    });
  }
}
