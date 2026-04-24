import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
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
import { FIFO_SOURCE_OPERATION_TYPES } from "../../inventory-core/application/inventory.service";
import type { CreateOutboundOrderDto } from "../dto/create-outbound-order.dto";
import type { QueryOutboundOrderDto } from "../dto/query-outbound-order.dto";
import { SalesRepository } from "../infrastructure/sales.repository";
import { SalesSharedService } from "./sales-shared.service";
import { type OutboundLineWriteData } from "./sales-snapshots.service";
import { SalesTraceabilityService } from "./sales-traceability.service";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
const BUSINESS_MODULE = "sales";
export const OUTBOUND_SOURCE_OPERATION_TYPES =
  FIFO_SOURCE_OPERATION_TYPES.filter(
    (type) => type !== InventoryOperationType.RD_HANDOFF_IN,
  );

@Injectable()
export class SalesOutboundService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly shared: SalesSharedService,
    private readonly traceability: SalesTraceabilityService,
  ) {}

  async listOrders(query: QueryOutboundOrderDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      orderType: SalesStockOrderType.OUTBOUND,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      customerId: query.customerId,
      workshopId: query.workshopId,
      limit,
      offset,
    });
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    if (order.orderType !== SalesStockOrderType.OUTBOUND) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    return this.traceability.attachOutboundTraceability(order);
  }

  async createOrder(dto: CreateOutboundOrderDto, createdBy?: string) {
    await this.validateMasterDataForOutbound(dto);

    const bizDate = new Date(dto.bizDate);
    const { customerCodeSnapshot, customerNameSnapshot } =
      await this.shared.snapshots.resolveCustomerSnapshot(dto.customerId);
    const { handlerNameSnapshot } =
      await this.shared.snapshots.resolveHandlerSnapshot(
        dto.handlerPersonnelId,
      );
    const stockScopeRecord =
      await this.shared.masterDataService.getStockScopeByCode("MAIN");
    const workshop = await this.shared.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    const salesProjectById =
      await this.shared.snapshots.resolveSalesProjectReferencesForLines(
        dto.lines,
      );

    const linesWithSnapshots = await Promise.all(
      dto.lines.map((line, idx) =>
        this.shared.snapshots.buildOutboundLineWriteData(
          line,
          idx + 1,
          salesProjectById,
          {
            customerId: dto.customerId,
            workshopId: dto.workshopId,
          },
        ),
      ),
    );
    const projectTargetByLineNo = new Map(
      linesWithSnapshots.map((line) => [line.lineNo, line.projectTargetId]),
    );
    this.assertNoDuplicateOutboundPriceLayers(linesWithSnapshots);
    await this.assertOutboundPriceLayerAvailability(
      linesWithSnapshots,
      dto.workshopId,
    );

    const totalQty = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.amount),
      new Prisma.Decimal(0),
    );

    const createdOrder = await createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildCompactDocumentNo("CK", bizDate, attempt);
      return this.repository.runInTransaction(async (tx) => {
        const order = await this.repository.createOrder(
          {
            documentNo,
            orderType: SalesStockOrderType.OUTBOUND,
            bizDate,
            customerId: dto.customerId,
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

        for (const line of order.lines) {
          const settlement =
            await this.shared.inventoryService.settleConsumerOut(
              {
                materialId: line.materialId,
                stockScope: "MAIN",
                bizDate,
                quantity: line.quantity,
                selectedUnitCost: line.selectedUnitCost,
                operationType: InventoryOperationType.OUTBOUND_OUT,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: order.id,
                businessDocumentNumber: order.documentNo,
                businessDocumentLineId: line.id,
                projectTargetId:
                  projectTargetByLineNo.get(line.lineNo) ?? undefined,
                operatorId: createdBy,
                idempotencyKey: `SalesStockOrder:${order.id}:line:${line.id}`,
                consumerLineId: line.id,
                sourceOperationTypes: OUTBOUND_SOURCE_OPERATION_TYPES,
              },
              tx,
            );
          await this.repository.updateOrderLine(
            line.id,
            {
              costUnitPrice: settlement.settledUnitCost,
              costAmount: settlement.settledCostAmount,
            },
            tx,
          );

          if (line.startNumber && line.endNumber) {
            await this.shared.inventoryService.reserveFactoryNumber(
              {
                materialId: line.materialId,
                stockScope: "MAIN",
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: order.id,
                businessDocumentLineId: line.id,
                startNumber: line.startNumber,
                endNumber: line.endNumber,
                operatorId: createdBy,
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

        const refreshedOrder = await this.repository.findOrderById(
          order.id,
          tx,
        );
        if (!refreshedOrder) {
          throw new NotFoundException(`出库单不存在: ${order.id}`);
        }
        return refreshedOrder;
      });
    });

    return this.traceability.attachOutboundTraceability(createdOrder);
  }

  async voidOrder(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    if (order.orderType !== SalesStockOrderType.OUTBOUND) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.repository.runInTransaction(async (tx) => {
      const hasActiveDownstream =
        await this.repository.hasActiveDownstreamSalesReturns(id, tx);
      if (hasActiveDownstream) {
        throw new BadRequestException(
          "存在未作废的销售退货下游，不能作废出库单",
        );
      }

      // Release FIFO source allocations before reversing the OUT log.
      await this.shared.inventoryService.releaseAllSourceUsagesForConsumer(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: id,
          operatorId: voidedBy,
        },
        tx,
      );

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
            note: `作废单据: ${order.documentNo}`,
          },
          tx,
        );
      }

      await this.shared.inventoryService.releaseFactoryNumberReservations(
        {
          businessDocumentType: DOCUMENT_TYPE,
          businessDocumentId: id,
          operatorId: voidedBy,
        },
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

  private async validateMasterDataForOutbound(dto: CreateOutboundOrderDto) {
    await this.shared.masterDataService.getWorkshopById(dto.workshopId);
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

  private assertNoDuplicateOutboundPriceLayers(lines: OutboundLineWriteData[]) {
    const keys = new Set<string>();
    for (const line of lines) {
      const key = `${line.materialId}:${line.selectedUnitCost.toString()}`;
      if (keys.has(key)) {
        throw new BadRequestException(
          `同一单据内不允许重复的物料+价格层: materialId=${line.materialId}, selectedUnitCost=${line.selectedUnitCost.toString()}`,
        );
      }
      keys.add(key);
    }
  }

  private async assertOutboundPriceLayerAvailability(
    lines: OutboundLineWriteData[],
    workshopId: number,
  ) {
    const materialIds = [...new Set(lines.map((line) => line.materialId))];
    const availabilityByMaterial = new Map<
      number,
      Map<string, Prisma.Decimal>
    >();

    for (const materialId of materialIds) {
      const priceLayers =
        await this.shared.inventoryService.listPriceLayerAvailability({
          materialId,
          stockScope: "MAIN",
          workshopId,
          sourceOperationTypes: OUTBOUND_SOURCE_OPERATION_TYPES,
        });
      availabilityByMaterial.set(
        materialId,
        new Map(
          priceLayers.map((layer) => [
            layer.unitCost.toString(),
            new Prisma.Decimal(layer.availableQty),
          ]),
        ),
      );
    }

    for (const line of lines) {
      const materialLayers = availabilityByMaterial.get(line.materialId);
      const availableQty = materialLayers?.get(
        line.selectedUnitCost.toString(),
      );
      if (!availableQty || availableQty.lt(line.quantity)) {
        throw new BadRequestException(
          `所选价格层库存不足: materialId=${line.materialId}, selectedUnitCost=${line.selectedUnitCost.toString()}, requiredQty=${line.quantity.toString()}, availableQty=${availableQty?.toString() ?? "0"}`,
        );
      }
    }
  }
}
