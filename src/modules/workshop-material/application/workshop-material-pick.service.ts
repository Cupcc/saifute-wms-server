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
 * Owns the lifecycle (create / update / void / list / read) for PICK orders.
 * Delegates cross-cutting concerns (master-data validation, snapshot building,
 * approval bookkeeping, log reversal) to {@link WorkshopMaterialSharedService}.
 */
@Injectable()
export class WorkshopMaterialPickService {
  private readonly orderType = WorkshopMaterialOrderType.PICK;

  constructor(private readonly shared: WorkshopMaterialSharedService) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async listPickOrders(query: QueryWorkshopMaterialOrderDto) {
    return this.shared.listOrders({ ...query, orderType: this.orderType });
  }

  async listPickOrderLines(query: QueryWorkshopMaterialOrderDto) {
    return this.shared.listOrderLines({ ...query, orderType: this.orderType });
  }

  async getPickOrderById(id: number) {
    return this.shared.getOrderById(id, this.orderType);
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createPickOrder(
    dto: CreateWorkshopMaterialOrderDto,
    createdBy?: string,
  ) {
    if (dto.orderType !== this.orderType) {
      throw new BadRequestException("orderType 必须为 PICK");
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
    );
    const stockScopeRecord =
      await this.shared.masterDataService.getStockScopeByCode(
        inventoryStockScope,
      );

    const linesWithSnapshots = await Promise.all(
      dto.lines.map((line, idx) => this.buildPickLineWriteData(line, idx + 1)),
    );

    const { totalQty } = this.shared.computeTotals(linesWithSnapshots);

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
            totalAmount: new Prisma.Decimal(0),
            remark: dto.remark,
            auditStatusSnapshot: AuditStatusSnapshot.PENDING,
            createdBy,
            updatedBy: createdBy,
          },
          linesWithSnapshots.map((l, idx) => {
            const lineDto = dto.lines[
              idx
            ] as CreateWorkshopMaterialOrderLineDto;
            return {
              ...l,
              sourceDocumentType: lineDto.sourceDocumentType,
              sourceDocumentId: lineDto.sourceDocumentId ?? undefined,
              sourceDocumentLineId: lineDto.sourceDocumentLineId ?? undefined,
              createdBy,
              updatedBy: createdBy,
            };
          }),
          tx,
        );

        const settledTotalAmount = await this.settleConsumerOutForLines({
          orderId: order.id,
          documentNo: order.documentNo,
          inventoryStockScope,
          bizDate,
          lines: order.lines,
          inputLines: dto.lines,
          idempotencyPrefix: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${order.id}`,
          operatorId: createdBy,
          tx,
        });

        const settledOrder = await this.shared.repository.updateOrder(
          order.id,
          {
            totalAmount: settledTotalAmount,
            updatedBy: createdBy,
          },
          tx,
        );

        await this.shared.requestApproval(
          order.id,
          order.documentNo,
          createdBy,
          tx,
        );

        return settledOrder;
      },
    );
  }

  // ─── Update (revise) ──────────────────────────────────────────────────────

  async updatePickOrder(
    id: number,
    dto: UpdateWorkshopMaterialOrderDto,
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
    );
    const stockScopeRecord =
      await this.shared.masterDataService.getStockScopeByCode(
        inventoryStockScope,
      );

    const linesWithSnapshots = await Promise.all(
      effectiveDto.lines.map((line, idx) =>
        this.buildPickLineWriteData(line, idx + 1),
      ),
    );

    const { totalQty } = this.shared.computeTotals(linesWithSnapshots);

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

      const hasReturn = await this.shared.repository.hasActiveReturnDownstream(
        id,
        tx,
      );
      if (hasReturn) {
        throw new BadRequestException("存在未作废的退料单下游，不能修改领料单");
      }

      await this.shared.releaseAllSourceUsages(id, updatedBy, tx);

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
        tx,
      );

      const settledTotalAmount = await this.settleConsumerOutForLines({
        orderId: id,
        documentNo: currentOrder.documentNo,
        inventoryStockScope,
        bizDate,
        lines: recreatedLines,
        inputLines: effectiveDto.lines,
        idempotencyPrefix: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${id}:rev:${nextRevision}`,
        operatorId: updatedBy,
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
          totalAmount: settledTotalAmount,
          remark: effectiveDto.remark,
          auditStatusSnapshot: AuditStatusSnapshot.PENDING,
          revisionNo: { increment: 1 },
          updatedBy,
        },
        tx,
      );

      await this.shared.requestApproval(
        id,
        currentOrder.documentNo,
        updatedBy,
        tx,
      );

      return this.shared.repository.findOrderById(id, tx);
    });
  }

  // ─── Void ─────────────────────────────────────────────────────────────────

  async voidPickOrder(id: number, voidReason?: string, voidedBy?: string) {
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
      const hasReturn = await this.shared.repository.hasActiveReturnDownstream(
        id,
        tx,
      );
      if (hasReturn) {
        throw new BadRequestException("存在未作废的退料单下游，不能作废领料单");
      }

      await this.shared.releaseAllSourceUsages(id, voidedBy, tx);

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

  private buildPickLineWriteData(
    line: CreateWorkshopMaterialOrderLineDto,
    lineNo: number,
  ) {
    return this.shared.buildLineWriteData(
      {
        ...line,
        unitPrice: undefined,
      },
      lineNo,
    );
  }

  private async recreateLines(
    orderId: number,
    linesWithSnapshots: WorkshopMaterialLineWriteData[],
    inputLines: CreateWorkshopMaterialOrderLineDto[],
    operatorId: string | undefined,
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
          sourceDocumentType: inputLine?.sourceDocumentType,
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
    tx: Prisma.TransactionClient;
  }): Promise<Prisma.Decimal> {
    const operationType = toOperationType(this.orderType);
    const sourceTypes = FIFO_SOURCE_OPERATION_TYPES.filter(
      (t) => t !== "RD_HANDOFF_IN",
    );
    let settledTotalAmount = new Prisma.Decimal(0);

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
          selectedUnitCost: lineDto?.selectedUnitCost ?? undefined,
          sourceOperationTypes: sourceTypes,
        },
        params.tx,
      );
      await this.shared.repository.updateOrderLineCost(
        line.id,
        {
          costUnitPrice: settlement.settledUnitCost,
          costAmount: settlement.settledCostAmount,
          unitPrice: settlement.settledUnitCost,
          amount: settlement.settledCostAmount,
        },
        params.tx,
      );
      settledTotalAmount = settledTotalAmount.add(settlement.settledCostAmount);
    }
    return settledTotalAmount;
  }
}
