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
import { toOperationType } from "../domain/workshop-material-order-type.helper";
import type { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import type { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import type { UpdateWorkshopMaterialOrderDto } from "../dto/update-workshop-material-order.dto";
import { WorkshopMaterialReturnHelpersService } from "./workshop-material-return-helpers.service";
import {
  WORKSHOP_MATERIAL_BUSINESS_MODULE,
  WORKSHOP_MATERIAL_DOCUMENT_TYPE,
  type WorkshopMaterialLineWriteData,
  type WorkshopMaterialOrderLineEntity,
  WorkshopMaterialSharedService,
} from "./workshop-material-shared.service";

/**
 * Owns the lifecycle (create / update / void / list / read) for RETURN orders.
 * RETURN differs from PICK/SCRAP in two ways:
 *
 *   1. It calls `increaseStock` instead of `settleConsumerOut`.
 *   2. It maintains document-relation rows and incrementally releases the
 *      source pick-line usage. The helpers for this live in
 *      {@link WorkshopMaterialReturnHelpersService}.
 */
@Injectable()
export class WorkshopMaterialReturnService {
  private readonly orderType = WorkshopMaterialOrderType.RETURN;

  constructor(
    private readonly shared: WorkshopMaterialSharedService,
    private readonly returnHelpers: WorkshopMaterialReturnHelpersService,
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  async listReturnOrders(query: QueryWorkshopMaterialOrderDto) {
    return this.shared.listOrders({ ...query, orderType: this.orderType });
  }

  async getReturnOrderById(id: number) {
    return this.shared.getOrderById(id, this.orderType);
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createReturnOrder(
    dto: CreateWorkshopMaterialOrderDto,
    createdBy?: string,
  ) {
    if (dto.orderType !== this.orderType) {
      throw new BadRequestException("orderType 必须为 RETURN");
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
      dto.lines.map((line, idx) =>
        this.shared.buildLineWriteData(line, idx + 1),
      ),
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

        await this.returnHelpers.validateReturnReplayQuantities(
          order.lines,
          dto.lines,
          tx,
        );

        await this.applyIncreaseStockForLines({
          orderId: order.id,
          documentNo: order.documentNo,
          bizDate,
          lines: order.lines,
          idempotencyPrefix: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${order.id}`,
          operatorId: createdBy,
          tx,
        });

        await this.recordReturnRelationsForLines(
          order.id,
          order.lines,
          dto.lines,
          createdBy,
          tx,
        );

        await this.shared.requestApproval(
          order.id,
          order.documentNo,
          createdBy,
          tx,
        );

        return order;
      },
    );
  }

  // ─── Update (revise) ──────────────────────────────────────────────────────

  async updateReturnOrder(
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
        this.shared.buildLineWriteData(line, idx + 1),
      ),
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

      // Restore source usages that were released when this return was created
      // so downstream cumulative-return accounting matches only the new state.
      for (const line of currentOrder.lines) {
        if (
          line.sourceDocumentId != null &&
          line.sourceDocumentLineId != null
        ) {
          await this.returnHelpers.restoreSourceUsageForReturnVoid(
            line.sourceDocumentId,
            line.sourceDocumentLineId,
            new Prisma.Decimal(line.quantity),
            updatedBy,
            tx,
          );
        }
      }
      await this.shared.repository.deactivateDocumentRelationsForReturn(id, tx);
      await this.shared.repository.deleteDocumentLineRelationsForReturn(id, tx);

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

      await this.returnHelpers.validateReturnReplayQuantities(
        recreatedLines,
        effectiveDto.lines,
        tx,
      );

      await this.applyIncreaseStockForLines({
        orderId: id,
        documentNo: currentOrder.documentNo,
        bizDate,
        lines: recreatedLines,
        idempotencyPrefix: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${id}:rev:${nextRevision}`,
        operatorId: updatedBy,
        tx,
      });

      await this.recordReturnRelationsForLines(
        id,
        recreatedLines,
        effectiveDto.lines,
        updatedBy,
        tx,
      );

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

  async voidReturnOrder(id: number, voidReason?: string, voidedBy?: string) {
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
      await this.shared.reverseAllLogsForOrder(
        {
          orderId: id,
          documentNo: order.documentNo,
          keySuffix: `void:${id}`,
          note: `作废单据: ${order.documentNo}`,
        },
        tx,
      );

      // Restore the source-usage state so the upstream pick line's release
      // capacity reflects only still-active returns after this void.
      for (const line of order.lines) {
        if (
          line.sourceDocumentId != null &&
          line.sourceDocumentLineId != null
        ) {
          await this.returnHelpers.restoreSourceUsageForReturnVoid(
            line.sourceDocumentId,
            line.sourceDocumentLineId,
            new Prisma.Decimal(line.quantity),
            voidedBy,
            tx,
          );
        }
      }
      await this.shared.repository.deactivateDocumentRelationsForReturn(id, tx);

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

  private async applyIncreaseStockForLines(params: {
    orderId: number;
    documentNo: string;
    bizDate: Date;
    lines: WorkshopMaterialOrderLineEntity[];
    idempotencyPrefix: string;
    operatorId?: string;
    tx: Prisma.TransactionClient;
  }) {
    const operationType = toOperationType(this.orderType);
    for (const line of params.lines) {
      await this.shared.inventoryService.increaseStock(
        {
          materialId: line.materialId,
          stockScope: "MAIN",
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
        },
        params.tx,
      );
    }
  }

  private async recordReturnRelationsForLines(
    orderId: number,
    lines: WorkshopMaterialOrderLineEntity[],
    inputLines: CreateWorkshopMaterialOrderLineDto[],
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const lineDto = inputLines[idx];
      if (
        lineDto?.sourceDocumentType &&
        lineDto?.sourceDocumentId &&
        lineDto?.sourceDocumentLineId
      ) {
        await this.returnHelpers.validateAndRecordReturnRelation(
          orderId,
          line.id,
          new Prisma.Decimal(line.quantity),
          lineDto.sourceDocumentType,
          lineDto.sourceDocumentId,
          lineDto.sourceDocumentLineId,
          operatorId,
          tx,
        );
      }
    }
  }
}
