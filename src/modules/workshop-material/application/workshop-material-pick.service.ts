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
import type { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import type { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import type { UpdateWorkshopMaterialOrderDto } from "../dto/update-workshop-material-order.dto";
import { WorkshopMaterialPickRevisionHelpers } from "./workshop-material-pick-revision.helpers";
import {
  WORKSHOP_MATERIAL_DOCUMENT_TYPE,
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
  private readonly revisionHelpers: WorkshopMaterialPickRevisionHelpers;

  constructor(private readonly shared: WorkshopMaterialSharedService) {
    this.revisionHelpers = new WorkshopMaterialPickRevisionHelpers(shared);
  }

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
    this.assertPriceLayersSelected(dto.lines);

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

        const settledTotalAmount =
          await this.revisionHelpers.settleConsumerOutForLines({
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
    this.assertPriceLayersSelected(effectiveDto.lines);
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

      const hasReturn = await this.shared.repository.hasActiveReturnDownstream(
        id,
        tx,
      );
      if (hasReturn) {
        throw new BadRequestException("存在未作废的退料单下游，不能修改领料单");
      }

      const businessDateChanged = !this.revisionHelpers.sameCalendarDate(
        currentOrder.bizDate,
        bizDate,
      );
      const currentLinesById = new Map(
        currentOrder.lines.map((line) => [line.id, line]),
      );
      const seenLineIds = new Set<number>();
      let hasActualChange =
        businessDateChanged ||
        currentOrder.handlerPersonnelId !==
          (effectiveDto.handlerPersonnelId ?? null) ||
        currentOrder.workshopId !== workshopId ||
        (currentOrder.remark ?? null) !== (effectiveDto.remark ?? null);

      for (let index = 0; index < effectiveDto.lines.length; index++) {
        const incomingLine = effectiveDto.lines[index];
        if (!incomingLine.id) {
          hasActualChange = true;
          continue;
        }
        if (seenLineIds.has(incomingLine.id)) {
          throw new BadRequestException(`重复的明细 ID: ${incomingLine.id}`);
        }
        const currentLine = currentLinesById.get(incomingLine.id);
        if (!currentLine) {
          throw new BadRequestException(`明细不存在: ${incomingLine.id}`);
        }
        seenLineIds.add(incomingLine.id);
        const lineData = linesWithSnapshots[index];
        const inventoryNeedsRepost =
          businessDateChanged ||
          currentLine.materialId !== lineData.materialId ||
          !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity) ||
          !this.revisionHelpers.currentCostMatchesSelection(
            currentLine,
            incomingLine,
          ) ||
          (await this.revisionHelpers.manualSourceNeedsRepost(
            id,
            currentLine.id,
            incomingLine.sourceLogId,
            tx,
          ));
        if (
          inventoryNeedsRepost ||
          this.revisionHelpers.lineNeedsDataUpdate(
            currentLine,
            lineData,
            incomingLine,
          )
        ) {
          hasActualChange = true;
        }
      }

      if (
        currentOrder.lines.some(
          (currentLine) => !seenLineIds.has(currentLine.id),
        )
      ) {
        hasActualChange = true;
      }
      if (!hasActualChange) {
        return currentOrder;
      }

      const nextRevision = currentOrder.revisionNo + 1;

      const logs = await this.shared.inventoryService.getLogsForDocument(
        {
          businessDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
          businessDocumentId: id,
        },
        tx,
      );
      const logByLineId = new Map(
        logs
          .filter((log) => log.businessDocumentLineId !== null)
          .map((log) => [log.businessDocumentLineId as number, log]),
      );
      // Removed lines are the only lines that need to be reversed for a
      // deletion. Unchanged lines keep their original inventory history.
      for (const currentLine of currentOrder.lines) {
        if (seenLineIds.has(currentLine.id)) continue;

        const currentLog = logByLineId.get(currentLine.id);
        if (!currentLog) {
          throw new BadRequestException(
            `未找到明细对应的库存流水: lineId=${currentLine.id}`,
          );
        }

        await this.shared.inventoryService.releaseSourceUsagesForConsumerLine(
          {
            consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
            consumerDocumentId: id,
            consumerLineId: currentLine.id,
            operatorId: updatedBy,
          },
          tx,
        );
        await this.shared.inventoryService.reverseStock(
          {
            logIdToReverse: currentLog.id,
            idempotencyKey: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${id}:rev:${nextRevision}:delete:${currentLine.id}`,
            note: `改单删除明细冲回: ${currentOrder.documentNo}`,
          },
          tx,
        );
        await this.shared.repository.deleteOrderLine(currentLine.id, tx);
      }

      const lineNoChanges: Array<{
        currentLine: WorkshopMaterialOrderLineEntity;
        lineNo: number;
      }> = [];
      for (let index = 0; index < effectiveDto.lines.length; index++) {
        const incomingLine = effectiveDto.lines[index];
        if (!incomingLine.id) continue;
        const currentLine = currentLinesById.get(incomingLine.id);
        if (
          currentLine &&
          currentLine.lineNo !== linesWithSnapshots[index].lineNo
        ) {
          lineNoChanges.push({
            currentLine,
            lineNo: linesWithSnapshots[index].lineNo,
          });
        }
      }
      if (lineNoChanges.length > 1) {
        // Free the unique (order_id, line_no) slots before applying a reorder.
        // This only touches rows whose display order changed; it has no
        // inventory effect.
        for (const { currentLine } of lineNoChanges) {
          await this.shared.repository.updateOrderLine(
            currentLine.id,
            { lineNo: -currentLine.id, updatedBy },
            tx,
          );
        }
      }

      let settledTotalAmount = new Prisma.Decimal(0);
      for (let index = 0; index < effectiveDto.lines.length; index++) {
        const incomingLine = effectiveDto.lines[index];
        const lineData = linesWithSnapshots[index];

        if (incomingLine.id) {
          const currentLine = currentLinesById.get(incomingLine.id);
          if (!currentLine) {
            throw new BadRequestException(`明细不存在: ${incomingLine.id}`);
          }

          const inventoryNeedsRepost =
            businessDateChanged ||
            currentLine.materialId !== lineData.materialId ||
            !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity) ||
            !this.revisionHelpers.currentCostMatchesSelection(
              currentLine,
              incomingLine,
            ) ||
            (await this.revisionHelpers.manualSourceNeedsRepost(
              id,
              currentLine.id,
              incomingLine.sourceLogId,
              tx,
            ));

          if (inventoryNeedsRepost) {
            const currentLog = logByLineId.get(currentLine.id);
            if (!currentLog) {
              throw new BadRequestException(
                `未找到明细对应的库存流水: lineId=${currentLine.id}`,
              );
            }

            await this.shared.inventoryService.releaseSourceUsagesForConsumerLine(
              {
                consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
                consumerDocumentId: id,
                consumerLineId: currentLine.id,
                operatorId: updatedBy,
              },
              tx,
            );
            await this.shared.inventoryService.reverseStock(
              {
                logIdToReverse: currentLog.id,
                idempotencyKey: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${id}:rev:${nextRevision}:replace:${currentLine.id}`,
                note: `改单重算明细冲回: ${currentOrder.documentNo}`,
              },
              tx,
            );
          }

          const updatedLine = await this.revisionHelpers.updateExistingLine(
            currentLine,
            lineData,
            incomingLine,
            inventoryNeedsRepost,
            updatedBy,
            tx,
          );

          if (inventoryNeedsRepost) {
            settledTotalAmount = settledTotalAmount.add(
              await this.revisionHelpers.settleConsumerOutForLine({
                orderId: id,
                documentNo: currentOrder.documentNo,
                inventoryStockScope,
                bizDate,
                line: updatedLine,
                inputLine: incomingLine,
                idempotencyKey: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${id}:rev:${nextRevision}:line:${updatedLine.id}`,
                operatorId: updatedBy,
                tx,
              }),
            );
          } else {
            settledTotalAmount = settledTotalAmount.add(
              this.revisionHelpers.lineAmount(currentLine),
            );
          }
          continue;
        }

        const createdLine = await this.shared.repository.createOrderLine(
          {
            orderId: id,
            ...lineData,
            sourceDocumentType: incomingLine.sourceDocumentType,
            sourceDocumentId: incomingLine.sourceDocumentId ?? undefined,
            sourceDocumentLineId:
              incomingLine.sourceDocumentLineId ?? undefined,
            createdBy: updatedBy,
            updatedBy,
          },
          tx,
        );
        settledTotalAmount = settledTotalAmount.add(
          await this.revisionHelpers.settleConsumerOutForLine({
            orderId: id,
            documentNo: currentOrder.documentNo,
            inventoryStockScope,
            bizDate,
            line: createdLine,
            inputLine: incomingLine,
            idempotencyKey: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${id}:rev:${nextRevision}:line:${createdLine.id}`,
            operatorId: updatedBy,
            tx,
          }),
        );
      }

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

  private assertPriceLayersSelected(
    lines: readonly CreateWorkshopMaterialOrderLineDto[],
  ) {
    for (let index = 0; index < lines.length; index++) {
      const selectedUnitCost = lines[index]?.selectedUnitCost?.trim();
      if (!selectedUnitCost) {
        throw new BadRequestException(`第 ${index + 1} 行单价不能为空`);
      }
    }
  }

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
}
