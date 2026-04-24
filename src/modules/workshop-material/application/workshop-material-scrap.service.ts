import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import {
  applyScrapStatusesForOrder,
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
  reverseScrapStatusesForOrder,
} from "../../rd-subwarehouse/application/rd-material-status.helper";
import { type StockScopeCode } from "../../session/domain/user-session";
import { toOperationType } from "../domain/workshop-material-order-type.helper";
import type { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import type { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import type { UpdateWorkshopMaterialOrderDto } from "../dto/update-workshop-material-order.dto";
import {
  WORKSHOP_MATERIAL_BUSINESS_MODULE,
  WORKSHOP_MATERIAL_DOCUMENT_TYPE,
  type WorkshopMaterialLineWriteData,
  type WorkshopMaterialOrderLineEntity,
  WorkshopMaterialSharedService,
} from "./workshop-material-shared.service";

/**
 * Owns the lifecycle (create / update / void / list / read) for SCRAP orders,
 * including RD-scoped scrap that also updates rd-subwarehouse material status.
 */
@Injectable()
export class WorkshopMaterialScrapService {
  private readonly orderType = WorkshopMaterialOrderType.SCRAP;

  constructor(private readonly shared: WorkshopMaterialSharedService) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async listScrapOrders(
    query: QueryWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
  ) {
    return this.shared.listOrders({ ...query, orderType: this.orderType });
  }

  async getScrapOrderById(id: number) {
    return this.shared.getOrderById(id, this.orderType);
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createScrapOrder(
    dto: CreateWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
    createdBy?: string,
  ) {
    if (dto.orderType !== this.orderType) {
      throw new BadRequestException("orderType 必须为 SCRAP");
    }

    const bizDate = new Date(dto.bizDate);
    const workshopId = this.shared.requireWorkshopId(dto.workshopId);
    const createDto = { ...dto, workshopId };
    await this.shared.validateMasterData(createDto);

    const { handlerNameSnapshot } = await this.shared.resolveHandlerSnapshot(
      dto.handlerPersonnelId,
      dto.handlerName,
    );
    const workshop =
      await this.shared.masterDataService.getWorkshopById(workshopId);
    const inventoryStockScope = this.shared.resolveInventoryStockScope(
      this.orderType,
      dto.stockScope,
    );
    const stockScopeRecord =
      await this.shared.masterDataService.getStockScopeByCode(
        inventoryStockScope,
      );
    const isRdScrapOrder = inventoryStockScope === "RD_SUB";
    const rdRequestCache = this.shared.buildRdScrapRequestCache();

    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) => {
        const lineWriteData = await this.shared.buildLineWriteData(
          line,
          idx + 1,
        );
        if (isRdScrapOrder) {
          await this.shared.assertRdScrapSourceLine(
            line,
            lineWriteData.materialId,
            rdRequestCache,
          );
        }
        return lineWriteData;
      }),
    );

    const { totalQty, totalAmount } =
      this.shared.computeTotals(linesWithSnapshots);

    return this.shared.createWithDocumentNo(
      this.orderType,
      bizDate,
      async (documentNo, tx) => {
        const order = await this.shared.repository.createOrder(
          {
            documentNo,
            orderType: this.orderType,
            bizDate,
            handlerPersonnelId: dto.handlerPersonnelId,
            stockScopeId: stockScopeRecord.id,
            workshopId,
            handlerNameSnapshot,
            workshopNameSnapshot: workshop.workshopName,
            totalQty,
            totalAmount,
            remark: dto.remark,
            auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
            createdBy,
            updatedBy: createdBy,
          },
          linesWithSnapshots.map((l, idx) => {
            const lineDto = dto.lines[
              idx
            ] as CreateWorkshopMaterialOrderLineDto;
            return {
              ...l,
              sourceDocumentType:
                lineDto.sourceDocumentType ??
                (isRdScrapOrder
                  ? RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE
                  : undefined),
              sourceDocumentId: lineDto.sourceDocumentId ?? undefined,
              sourceDocumentLineId: lineDto.sourceDocumentLineId ?? undefined,
              createdBy,
              updatedBy: createdBy,
            };
          }),
          tx,
        );

        await this.settleConsumerOutForLines({
          orderId: order.id,
          documentNo: order.documentNo,
          inventoryStockScope,
          bizDate,
          lines: order.lines,
          inputLines: dto.lines,
          idempotencyPrefix: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${order.id}`,
          operatorId: createdBy,
          isRdScrapOrder,
          tx,
        });

        return order;
      },
    );
  }

  // ─── Update (revise) ──────────────────────────────────────────────────────

  async updateScrapOrder(
    id: number,
    dto: UpdateWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
    updatedBy?: string,
  ) {
    const existing = await this.shared.getOrderById(id, this.orderType);
    this.shared.assertOrderMutable(existing);
    this.shared.assertUpdateHeaderCompatibility(existing, dto);

    const effectiveDto = this.shared.toEffectiveUpdateDto(existing, dto);
    await this.shared.validateMasterData(effectiveDto);

    const bizDate = new Date(effectiveDto.bizDate);
    const workshopId = this.shared.requireWorkshopId(effectiveDto.workshopId);
    const { handlerNameSnapshot } = await this.shared.resolveHandlerSnapshot(
      effectiveDto.handlerPersonnelId,
      effectiveDto.handlerName,
    );
    const workshop =
      await this.shared.masterDataService.getWorkshopById(workshopId);
    const inventoryStockScope = this.shared.resolveInventoryStockScope(
      this.orderType,
      effectiveDto.stockScope,
    );
    const stockScopeRecord =
      await this.shared.masterDataService.getStockScopeByCode(
        inventoryStockScope,
      );
    const isRdScrapOrder = inventoryStockScope === "RD_SUB";
    const rdRequestCache = this.shared.buildRdScrapRequestCache();

    const linesWithSnapshots = await Promise.all(
      effectiveDto.lines.map(async (line, idx) => {
        const lineWriteData = await this.shared.buildLineWriteData(
          line,
          idx + 1,
        );
        if (isRdScrapOrder) {
          await this.shared.assertRdScrapSourceLine(
            line,
            lineWriteData.materialId,
            rdRequestCache,
          );
        }
        return lineWriteData;
      }),
    );

    const { totalQty, totalAmount } =
      this.shared.computeTotals(linesWithSnapshots);

    return this.shared.runInTransaction(async (tx) => {
      const currentOrder = await this.shared.repository.findOrderById(id, tx);
      if (!currentOrder) {
        throw new NotFoundException(`车间物料单不存在: ${id}`);
      }
      if (currentOrder.orderType !== this.orderType) {
        throw new NotFoundException(
          `单据类型不匹配: 期望 ${this.orderType}, 实际 ${currentOrder.orderType}`,
        );
      }
      this.shared.assertOrderMutable(currentOrder);

      const nextRevision = currentOrder.revisionNo + 1;

      await this.shared.releaseAllSourceUsages(id, updatedBy, tx);
      await reverseScrapStatusesForOrder(
        {
          orderId: id,
          documentNo: currentOrder.documentNo,
          operatorId: updatedBy,
          note: `改单重算报废状态: ${currentOrder.documentNo}`,
        },
        tx,
      );

      await this.shared.reverseAllLogsForOrder(
        {
          orderId: id,
          documentNo: currentOrder.documentNo,
          keySuffix: `rev:${id}:r${nextRevision}`,
          note: `改单重算冲回: ${currentOrder.documentNo}`,
        },
        tx,
      );

      await this.shared.repository.deleteOrderLinesByOrderId(id, tx);

      const recreatedLines = await this.recreateLines(
        id,
        linesWithSnapshots,
        effectiveDto.lines,
        updatedBy,
        isRdScrapOrder,
        tx,
      );

      await this.settleConsumerOutForLines({
        orderId: id,
        documentNo: currentOrder.documentNo,
        inventoryStockScope,
        bizDate,
        lines: recreatedLines,
        inputLines: effectiveDto.lines,
        idempotencyPrefix: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${id}:rev:${nextRevision}`,
        operatorId: updatedBy,
        isRdScrapOrder,
        tx,
      });

      await this.shared.repository.updateOrder(
        id,
        {
          bizDate,
          handlerPersonnelId: effectiveDto.handlerPersonnelId,
          stockScopeId: stockScopeRecord.id,
          workshopId,
          handlerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: effectiveDto.remark,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          revisionNo: { increment: 1 },
          updatedBy,
        },
        tx,
      );

      await this.shared.markApprovalNotRequired(id, updatedBy, tx);

      return this.shared.repository.findOrderById(id, tx);
    });
  }

  // ─── Void ─────────────────────────────────────────────────────────────────

  async voidScrapOrder(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.shared.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`车间物料单不存在: ${id}`);
    }
    if (order.orderType !== this.orderType) {
      throw new NotFoundException(
        `单据类型不匹配: 期望 ${this.orderType}, 实际 ${order.orderType}`,
      );
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.shared.runInTransaction(async (tx) => {
      await this.shared.releaseAllSourceUsages(id, voidedBy, tx);
      await reverseScrapStatusesForOrder(
        {
          orderId: id,
          documentNo: order.documentNo,
          operatorId: voidedBy,
          note: `作废报废单: ${order.documentNo}`,
        },
        tx,
      );

      await this.shared.reverseAllLogsForOrder(
        {
          orderId: id,
          documentNo: order.documentNo,
          keySuffix: `void:${id}`,
          note: `作废单据: ${order.documentNo}`,
        },
        tx,
      );

      await this.shared.repository.updateOrder(
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

      await this.shared.markApprovalNotRequired(id, voidedBy, tx);

      return this.shared.repository.findOrderById(id, tx);
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async recreateLines(
    orderId: number,
    linesWithSnapshots: WorkshopMaterialLineWriteData[],
    inputLines: CreateWorkshopMaterialOrderLineDto[],
    operatorId: string | undefined,
    isRdScrapOrder: boolean,
    tx: Prisma.TransactionClient,
  ): Promise<WorkshopMaterialOrderLineEntity[]> {
    const created: WorkshopMaterialOrderLineEntity[] = [];
    for (let idx = 0; idx < linesWithSnapshots.length; idx++) {
      const lineData = linesWithSnapshots[idx];
      const inputLine = inputLines[idx];
      const createdLine = await this.shared.repository.createOrderLine(
        {
          orderId,
          ...lineData,
          sourceDocumentType:
            inputLine?.sourceDocumentType ??
            (isRdScrapOrder ? RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE : undefined),
          sourceDocumentId: inputLine?.sourceDocumentId ?? undefined,
          sourceDocumentLineId: inputLine?.sourceDocumentLineId ?? undefined,
          createdBy: operatorId,
          updatedBy: operatorId,
        },
        tx,
      );
      created.push(createdLine);
    }
    return created;
  }

  private async settleConsumerOutForLines(params: {
    orderId: number;
    documentNo: string;
    inventoryStockScope: StockScopeCode;
    bizDate: Date;
    lines: WorkshopMaterialOrderLineEntity[];
    inputLines: CreateWorkshopMaterialOrderLineDto[];
    idempotencyPrefix: string;
    operatorId?: string;
    isRdScrapOrder: boolean;
    tx: Prisma.TransactionClient;
  }) {
    const operationType = toOperationType(this.orderType);
    const sourceTypes =
      params.inventoryStockScope === "RD_SUB"
        ? (["RD_HANDOFF_IN"] as typeof FIFO_SOURCE_OPERATION_TYPES)
        : FIFO_SOURCE_OPERATION_TYPES.filter((t) => t !== "RD_HANDOFF_IN");

    const logIdByLineId = new Map<number, number>();

    for (const line of params.lines) {
      const lineDto = params.inputLines[line.lineNo - 1];
      const settlement = await (
        this.shared.inventoryService as InventoryService
      ).settleConsumerOut(
        {
          materialId: line.materialId,
          stockScope: params.inventoryStockScope,
          bizDate: params.bizDate,
          quantity: line.quantity,
          operationType,
          businessModule: WORKSHOP_MATERIAL_BUSINESS_MODULE,
          businessDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
          businessDocumentId: params.orderId,
          businessDocumentNumber: params.documentNo,
          businessDocumentLineId: line.id,
          operatorId: params.operatorId,
          idempotencyKey: `${params.idempotencyPrefix}:line:${line.id}`,
          consumerLineId: line.id,
          sourceLogId: lineDto?.sourceLogId ?? undefined,
          sourceOperationTypes: sourceTypes,
        },
        params.tx,
      );
      logIdByLineId.set(line.id, settlement.outLog.id);
      await this.shared.repository.updateOrderLineCost(
        line.id,
        {
          costUnitPrice: settlement.settledUnitCost,
          costAmount: settlement.settledCostAmount,
        },
        params.tx,
      );
    }

    if (params.isRdScrapOrder) {
      await applyScrapStatusesForOrder(
        {
          orderId: params.orderId,
          documentNo: params.documentNo,
          lines: params.lines,
          operatorId: params.operatorId,
          logIdByLineId,
        },
        params.tx,
      );
    }
  }
}
