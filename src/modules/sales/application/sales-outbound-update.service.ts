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
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import type { UpdateOutboundOrderDto } from "../dto/update-outbound-order.dto";
import { SalesRepository } from "../infrastructure/sales.repository";
import { OUTBOUND_SOURCE_OPERATION_TYPES } from "./sales-outbound.service";
import { SalesSharedService } from "./sales-shared.service";
import { type OutboundLineWriteData } from "./sales-snapshots.service";
import { SalesTraceabilityService } from "./sales-traceability.service";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
const BUSINESS_MODULE = "sales";

@Injectable()
export class SalesOutboundUpdateService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly shared: SalesSharedService,
    private readonly traceability: SalesTraceabilityService,
  ) {}

  async updateOrder(
    id: number,
    dto: UpdateOutboundOrderDto,
    updatedBy?: string,
  ) {
    const existing = await this.repository.findOrderById(id);
    if (!existing) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    if (existing.orderType !== SalesStockOrderType.OUTBOUND) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的单据不能修改");
    }
    if (existing.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法修改");
    }

    await this.validateMasterDataForUpdate(dto);

    const bizDate = dto.bizDate ? new Date(dto.bizDate) : existing.bizDate;
    const nextRevision = existing.revisionNo + 1;
    const finalCustomerId = dto.customerId ?? existing.customerId ?? undefined;
    const customerSnapshot = finalCustomerId
      ? await this.shared.snapshots.resolveCustomerSnapshot(finalCustomerId)
      : {
          customerCodeSnapshot: existing.customerCodeSnapshot,
          customerNameSnapshot: existing.customerNameSnapshot,
        };
    const handlerSnapshot = dto.handlerPersonnelId
      ? await this.shared.snapshots.resolveHandlerSnapshot(
          dto.handlerPersonnelId,
        )
      : { handlerNameSnapshot: existing.handlerNameSnapshot };
    const stockScopeRecord =
      await this.shared.masterDataService.getStockScopeByCode("MAIN");
    const workshop = dto.workshopId
      ? await this.shared.masterDataService.getWorkshopById(dto.workshopId)
      : { workshopName: existing.workshopNameSnapshot };
    const salesProjectById =
      await this.shared.snapshots.resolveSalesProjectReferencesForLines(
        dto.lines,
      );
    const plannedLines = await Promise.all(
      dto.lines.map((line, idx) =>
        this.shared.snapshots.buildOutboundLineWriteData(
          line,
          idx + 1,
          salesProjectById,
          {
            customerId: finalCustomerId,
            workshopId: dto.workshopId ?? existing.workshopId,
          },
        ),
      ),
    );
    const projectTargetByLineNo = new Map(
      plannedLines.map((line) => [line.lineNo, line.projectTargetId]),
    );
    this.assertNoDuplicateOutboundPriceLayers(plannedLines);

    const updatedOrder = await this.repository.runInTransaction(async (tx) => {
      const currentOrder = await this.repository.findOrderById(id, tx);
      if (!currentOrder) {
        throw new NotFoundException(`出库单不存在: ${id}`);
      }

      const logs = await this.shared.inventoryService.getLogsForDocument(
        {
          businessDocumentType: DOCUMENT_TYPE,
          businessDocumentId: id,
        },
        tx,
      );
      const logByLineId = new Map(
        logs
          .filter((log) => log.businessDocumentLineId !== null)
          .map((log) => [log.businessDocumentLineId as number, log]),
      );
      const currentLinesById = new Map(
        currentOrder.lines.map((line) => [line.id, line]),
      );
      const seenLineIds = new Set<number>();
      const workshopId = dto.workshopId ?? currentOrder.workshopId;

      for (const line of dto.lines) {
        if (!line.id) continue;
        if (seenLineIds.has(line.id)) {
          throw new BadRequestException(`重复的明细 ID: ${line.id}`);
        }
        if (!currentLinesById.has(line.id)) {
          throw new BadRequestException(`明细不存在: ${line.id}`);
        }
        seenLineIds.add(line.id);
      }

      for (const currentLine of currentOrder.lines) {
        if (seenLineIds.has(currentLine.id)) continue;

        const currentLog = logByLineId.get(currentLine.id);
        if (!currentLog) {
          throw new BadRequestException(
            `未找到明细对应的库存流水: lineId=${currentLine.id}`,
          );
        }

        // Release this line's source allocations before reversing its OUT log.
        await this.shared.inventoryService.releaseSourceUsagesForConsumerLine(
          {
            consumerDocumentType: DOCUMENT_TYPE,
            consumerDocumentId: id,
            consumerLineId: currentLine.id,
            operatorId: updatedBy,
          },
          tx,
        );

        await this.shared.inventoryService.reverseStock(
          {
            logIdToReverse: currentLog.id,
            idempotencyKey: `SalesStockOrder:${id}:rev:${nextRevision}:delete:${currentLine.id}`,
            note: `改单删除明细冲回: ${existing.documentNo}`,
          },
          tx,
        );
        if (currentLine.startNumber && currentLine.endNumber) {
          await this.shared.inventoryService.releaseFactoryNumberReservations(
            {
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: id,
              businessDocumentLineId: currentLine.id,
              operatorId: updatedBy,
            },
            tx,
          );
        }
        await this.repository.deleteOrderLine(currentLine.id, tx);
      }

      const finalLines = [];
      for (let index = 0; index < dto.lines.length; index++) {
        const incomingLine = dto.lines[index];
        const lineData = plannedLines[index];

        if (incomingLine.id) {
          const currentLine = currentLinesById.get(incomingLine.id);
          if (!currentLine) {
            throw new BadRequestException(`明细不存在: ${incomingLine.id}`);
          }

          const inventoryNeedsRepost =
            currentLine.materialId !== lineData.materialId ||
            (currentLine.salesProjectId ?? null) !== lineData.salesProjectId ||
            !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity) ||
            !new Prisma.Decimal(currentLine.selectedUnitCost).eq(
              lineData.selectedUnitCost,
            );
          const reservationChanged =
            currentLine.materialId !== lineData.materialId ||
            currentLine.startNumber !== lineData.startNumber ||
            currentLine.endNumber !== lineData.endNumber;

          if (inventoryNeedsRepost) {
            const currentLog = logByLineId.get(currentLine.id);
            if (!currentLog) {
              throw new BadRequestException(
                `未找到明细对应的库存流水: lineId=${currentLine.id}`,
              );
            }

            // Release this line's source allocations before reversing its OUT log.
            await this.shared.inventoryService.releaseSourceUsagesForConsumerLine(
              {
                consumerDocumentType: DOCUMENT_TYPE,
                consumerDocumentId: id,
                consumerLineId: currentLine.id,
                operatorId: updatedBy,
              },
              tx,
            );

            await this.shared.inventoryService.reverseStock(
              {
                logIdToReverse: currentLog.id,
                idempotencyKey: `SalesStockOrder:${id}:rev:${nextRevision}:replace:${currentLine.id}`,
                note: `改单重算明细冲回: ${existing.documentNo}`,
              },
              tx,
            );
          }
          if (
            reservationChanged &&
            currentLine.startNumber &&
            currentLine.endNumber
          ) {
            await this.shared.inventoryService.releaseFactoryNumberReservations(
              {
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: id,
                businessDocumentLineId: currentLine.id,
                operatorId: updatedBy,
              },
              tx,
            );
          }

          const updatedLine = await this.repository.updateOrderLine(
            currentLine.id,
            {
              lineNo: lineData.lineNo,
              materialId: lineData.materialId,
              salesProjectId: lineData.salesProjectId,
              salesProjectCodeSnapshot: lineData.salesProjectCodeSnapshot,
              salesProjectNameSnapshot: lineData.salesProjectNameSnapshot,
              materialCategoryIdSnapshot: lineData.materialCategoryIdSnapshot,
              materialCategoryCodeSnapshot:
                lineData.materialCategoryCodeSnapshot,
              materialCategoryNameSnapshot:
                lineData.materialCategoryNameSnapshot,
              materialCategoryPathSnapshot:
                lineData.materialCategoryPathSnapshot,
              materialCodeSnapshot: lineData.materialCodeSnapshot,
              materialNameSnapshot: lineData.materialNameSnapshot,
              materialSpecSnapshot: lineData.materialSpecSnapshot,
              unitCodeSnapshot: lineData.unitCodeSnapshot,
              quantity: lineData.quantity,
              unitPrice: lineData.unitPrice,
              amount: lineData.amount,
              selectedUnitCost: lineData.selectedUnitCost,
              startNumber: lineData.startNumber,
              endNumber: lineData.endNumber,
              remark: lineData.remark,
              updatedBy,
            },
            tx,
          );

          if (inventoryNeedsRepost) {
            const repostSettlement =
              await this.shared.inventoryService.settleConsumerOut(
                {
                  materialId: updatedLine.materialId,
                  stockScope: "MAIN",
                  bizDate,
                  quantity: updatedLine.quantity,
                  selectedUnitCost: updatedLine.selectedUnitCost,
                  operationType: InventoryOperationType.OUTBOUND_OUT,
                  businessModule: BUSINESS_MODULE,
                  businessDocumentType: DOCUMENT_TYPE,
                  businessDocumentId: id,
                  businessDocumentNumber: existing.documentNo,
                  businessDocumentLineId: updatedLine.id,
                  projectTargetId:
                    projectTargetByLineNo.get(lineData.lineNo) ?? undefined,
                  operatorId: updatedBy,
                  idempotencyKey: `SalesStockOrder:${id}:rev:${nextRevision}:line:${updatedLine.id}`,
                  consumerLineId: updatedLine.id,
                  sourceOperationTypes: OUTBOUND_SOURCE_OPERATION_TYPES,
                },
                tx,
              );
            await this.repository.updateOrderLine(
              updatedLine.id,
              {
                costUnitPrice: repostSettlement.settledUnitCost,
                costAmount: repostSettlement.settledCostAmount,
              },
              tx,
            );
          }
          if (
            reservationChanged &&
            updatedLine.startNumber &&
            updatedLine.endNumber
          ) {
            await this.shared.inventoryService.reserveFactoryNumber(
              {
                materialId: updatedLine.materialId,
                stockScope: "MAIN",
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: id,
                businessDocumentLineId: updatedLine.id,
                startNumber: updatedLine.startNumber,
                endNumber: updatedLine.endNumber,
                operatorId: updatedBy,
              },
              tx,
            );
          }

          finalLines.push(updatedLine);
          continue;
        }

        const createdLine = await this.repository.createOrderLine(
          {
            orderId: id,
            lineNo: lineData.lineNo,
            materialId: lineData.materialId,
            salesProjectId: lineData.salesProjectId,
            salesProjectCodeSnapshot: lineData.salesProjectCodeSnapshot,
            salesProjectNameSnapshot: lineData.salesProjectNameSnapshot,
            materialCategoryIdSnapshot: lineData.materialCategoryIdSnapshot,
            materialCategoryCodeSnapshot: lineData.materialCategoryCodeSnapshot,
            materialCategoryNameSnapshot: lineData.materialCategoryNameSnapshot,
            materialCategoryPathSnapshot: lineData.materialCategoryPathSnapshot,
            materialCodeSnapshot: lineData.materialCodeSnapshot,
            materialNameSnapshot: lineData.materialNameSnapshot,
            materialSpecSnapshot: lineData.materialSpecSnapshot,
            unitCodeSnapshot: lineData.unitCodeSnapshot,
            quantity: lineData.quantity,
            unitPrice: lineData.unitPrice,
            amount: lineData.amount,
            selectedUnitCost: lineData.selectedUnitCost,
            startNumber: lineData.startNumber,
            endNumber: lineData.endNumber,
            remark: lineData.remark,
            createdBy: updatedBy,
            updatedBy,
          },
          tx,
        );

        const newLineSettlement =
          await this.shared.inventoryService.settleConsumerOut(
            {
              materialId: createdLine.materialId,
              stockScope: "MAIN",
              bizDate,
              quantity: createdLine.quantity,
              selectedUnitCost: createdLine.selectedUnitCost,
              operationType: InventoryOperationType.OUTBOUND_OUT,
              businessModule: BUSINESS_MODULE,
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: id,
              businessDocumentNumber: existing.documentNo,
              businessDocumentLineId: createdLine.id,
              projectTargetId:
                projectTargetByLineNo.get(lineData.lineNo) ?? undefined,
              operatorId: updatedBy,
              idempotencyKey: `SalesStockOrder:${id}:rev:${nextRevision}:line:${createdLine.id}`,
              consumerLineId: createdLine.id,
              sourceOperationTypes: OUTBOUND_SOURCE_OPERATION_TYPES,
            },
            tx,
          );
        await this.repository.updateOrderLine(
          createdLine.id,
          {
            costUnitPrice: newLineSettlement.settledUnitCost,
            costAmount: newLineSettlement.settledCostAmount,
          },
          tx,
        );

        if (createdLine.startNumber && createdLine.endNumber) {
          await this.shared.inventoryService.reserveFactoryNumber(
            {
              materialId: createdLine.materialId,
              stockScope: "MAIN",
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: id,
              businessDocumentLineId: createdLine.id,
              startNumber: createdLine.startNumber,
              endNumber: createdLine.endNumber,
              operatorId: updatedBy,
            },
            tx,
          );
        }

        finalLines.push(createdLine);
      }

      const totalQty = finalLines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.quantity)),
        new Prisma.Decimal(0),
      );
      const totalAmount = finalLines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.amount)),
        new Prisma.Decimal(0),
      );

      await this.repository.updateOrder(
        id,
        {
          bizDate,
          customerId: finalCustomerId,
          handlerPersonnelId:
            dto.handlerPersonnelId ?? existing.handlerPersonnelId,
          stockScopeId: stockScopeRecord.id,
          workshopId,
          customerCodeSnapshot: customerSnapshot.customerCodeSnapshot,
          customerNameSnapshot: customerSnapshot.customerNameSnapshot,
          handlerNameSnapshot: handlerSnapshot.handlerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark ?? existing.remark,
          auditStatusSnapshot: AuditStatusSnapshot.PENDING,
          revisionNo: { increment: 1 },
          updatedBy,
        },
        tx,
      );

      await this.shared.approvalService.createOrRefreshApprovalDocument(
        {
          documentFamily: DocumentFamily.SALES_STOCK,
          documentType: DOCUMENT_TYPE,
          documentId: id,
          documentNumber: existing.documentNo,
          submittedBy: updatedBy,
          createdBy: updatedBy,
        },
        tx,
      );

      const refreshedOrder = await this.repository.findOrderById(id, tx);
      if (!refreshedOrder) {
        throw new NotFoundException(`出库单不存在: ${id}`);
      }
      return refreshedOrder;
    });

    return this.traceability.attachOutboundTraceability(updatedOrder);
  }

  private async validateMasterDataForUpdate(dto: UpdateOutboundOrderDto) {
    if (dto.workshopId) {
      await this.shared.masterDataService.getWorkshopById(dto.workshopId);
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
}
