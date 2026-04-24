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
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  applyAcceptanceStatusesForOrder,
  reverseAcceptanceStatusesForOrder,
} from "../../rd-subwarehouse/application/rd-material-status.helper";
import type { UpdateInboundOrderDto } from "../dto/update-inbound-order.dto";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundSharedService } from "./inbound-shared.service";

const DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
const BUSINESS_MODULE = "inbound";

@Injectable()
export class InboundAcceptanceUpdateService {
  constructor(
    private readonly repository: InboundRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly approvalService: ApprovalService,
    private readonly shared: InboundSharedService,
  ) {}

  async updateOrder(
    id: number,
    dto: UpdateInboundOrderDto,
    updatedBy?: string,
  ) {
    const existing = await this.repository.findOrderById(id);
    if (!existing) throw new NotFoundException(`入库单不存在：${id}`);
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED)
      throw new BadRequestException("已作废的单据不能修改");
    if (existing.inventoryEffectStatus !== InventoryEffectStatus.POSTED)
      throw new BadRequestException("库存状态异常，无法修改");
    if (existing.orderType !== StockInOrderType.ACCEPTANCE)
      throw new BadRequestException("此方法仅用于验收单");

    const bizDate = dto.bizDate ? new Date(dto.bizDate) : existing.bizDate;
    const nextRevision = existing.revisionNo + 1;
    const finalWorkshopId = Object.hasOwn(dto, "workshopId")
      ? (dto.workshopId ?? null)
      : existing.workshopId;
    const workshop = finalWorkshopId
      ? await this.masterDataService.getWorkshopById(finalWorkshopId)
      : null;
    const rdProcurementLink = existing.rdProcurementRequestId
      ? await this.shared.resolveRdProcurementLink(
          StockInOrderType.ACCEPTANCE,
          existing.rdProcurementRequestId,
          dto.supplierId ?? existing.supplierId ?? undefined,
        )
      : {
          request: null,
          supplierId: dto.supplierId ?? existing.supplierId ?? undefined,
          lineMap: null,
        };

    await this.shared.validateMasterDataForUpdate(
      dto,
      StockInOrderType.ACCEPTANCE,
      rdProcurementLink.supplierId,
      finalWorkshopId,
    );
    const finalSupplierId = rdProcurementLink.supplierId;
    const supplierSnapshot = finalSupplierId
      ? await this.shared.resolveSupplierSnapshot(finalSupplierId)
      : {
          supplierCodeSnapshot: existing.supplierCodeSnapshot,
          supplierNameSnapshot: existing.supplierNameSnapshot,
        };

    const hasHandlerOverride =
      Object.hasOwn(dto, "handlerPersonnelId") ||
      Object.hasOwn(dto, "handlerName");
    const handlerSnapshot = hasHandlerOverride
      ? await this.shared.resolveHandlerSnapshot(
          dto.handlerPersonnelId ?? undefined,
          dto.handlerName,
        )
      : { handlerNameSnapshot: existing.handlerNameSnapshot };
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode("MAIN");
    const operationType = InventoryOperationType.ACCEPTANCE_IN;

    return this.repository.runInTransaction(async (tx) => {
      const currentOrder = await this.repository.findOrderById(id, tx);
      if (!currentOrder) throw new NotFoundException(`入库单不存在：${id}`);

      await reverseAcceptanceStatusesForOrder(
        {
          orderId: id,
          documentNo: existing.documentNo,
          operatorId: updatedBy,
          note: `改单重算验收状态：${existing.documentNo}`,
        },
        tx,
      );

      const logs = await this.inventoryService.getLogsForDocument(
        { businessDocumentType: DOCUMENT_TYPE, businessDocumentId: id },
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
      const acceptanceLogIdByLineId = new Map(
        logs
          .filter((log) => log.businessDocumentLineId !== null)
          .map((log) => [log.businessDocumentLineId as number, log.id]),
      );
      const seenLineIds = new Set<number>();
      const workshopId = finalWorkshopId;
      const seenRdProcurementLineIds = new Set<number>();

      for (const line of dto.lines) {
        if (!line.id) continue;
        if (seenLineIds.has(line.id))
          throw new BadRequestException(`重复的明细 ID: ${line.id}`);
        if (!currentLinesById.has(line.id))
          throw new BadRequestException(`明细不存在：${line.id}`);
        seenLineIds.add(line.id);
      }

      for (const currentLine of currentOrder.lines) {
        if (seenLineIds.has(currentLine.id)) continue;
        const currentLog = logByLineId.get(currentLine.id);
        if (!currentLog)
          throw new BadRequestException(
            `未找到明细对应的库存流水：lineId=${currentLine.id}`,
          );
        const hasAllocations =
          await this.inventoryService.hasUnreleasedAllocations(
            currentLog.id,
            tx,
          );
        if (hasAllocations)
          throw new BadRequestException(
            `入库明细 ${currentLine.id} 已有下游消耗分配`,
          );
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: currentLog.id,
            idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:delete:${currentLine.id}`,
            note: `改单删除明细冲回：${existing.documentNo}`,
          },
          tx,
        );
        await this.repository.deleteOrderLine(currentLine.id, tx);
      }

      const finalLines: Array<
        Awaited<ReturnType<InboundRepository["createOrderLine"]>>
      > = [];
      for (let index = 0; index < dto.lines.length; index++) {
        const incomingLine = dto.lines[index];
        if (incomingLine.id) {
          const currentLine = currentLinesById.get(incomingLine.id);
          if (!currentLine) {
            throw new BadRequestException(`入库明细不存在：${incomingLine.id}`);
          }
          const lineData = await this.shared.buildLineWriteData(
            {
              ...incomingLine,
              rdProcurementRequestLineId:
                currentLine.rdProcurementRequestLineId ?? undefined,
            },
            index + 1,
            {
              rdProcurementLineMap: rdProcurementLink.lineMap,
              seenRdProcurementLineIds,
            },
          );
          const inventoryNeedsRepost =
            currentLine.materialId !== lineData.materialId ||
            !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity);
          if (inventoryNeedsRepost) {
            const currentLog = logByLineId.get(currentLine.id);
            if (!currentLog) {
              throw new BadRequestException(
                `未找到明细对应的库存流水：lineId=${currentLine.id}`,
              );
            }
            const hasAllocations =
              await this.inventoryService.hasUnreleasedAllocations(
                currentLog.id,
                tx,
              );
            if (hasAllocations)
              throw new BadRequestException(
                `入库明细 ${currentLine.id} 已有下游消耗分配`,
              );
            await this.inventoryService.reverseStock(
              {
                logIdToReverse: currentLog.id,
                idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:replace:${currentLine.id}`,
                note: `改单重算明细冲回：${existing.documentNo}`,
              },
              tx,
            );
          }
          const updatedLine = await this.repository.updateOrderLine(
            currentLine.id,
            {
              lineNo: lineData.lineNo,
              materialId: lineData.materialId,
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
              rdProcurementRequestLineId: lineData.rdProcurementRequestLineId,
              remark: lineData.remark,
              updatedBy,
            },
            tx,
          );
          if (inventoryNeedsRepost) {
            const log = await this.inventoryService.increaseStock(
              {
                materialId: updatedLine.materialId,
                stockScope: "MAIN",
                bizDate,
                quantity: updatedLine.quantity,
                operationType,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: id,
                businessDocumentNumber: existing.documentNo,
                businessDocumentLineId: updatedLine.id,
                operatorId: updatedBy,
                idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:line:${updatedLine.id}`,
                unitCost: new Prisma.Decimal(updatedLine.unitPrice),
                costAmount: new Prisma.Decimal(updatedLine.unitPrice).mul(
                  new Prisma.Decimal(updatedLine.quantity),
                ),
              },
              tx,
            );
            acceptanceLogIdByLineId.set(updatedLine.id, log.id);
          }
          finalLines.push(updatedLine);
          continue;
        }
        const lineData = await this.shared.buildLineWriteData(
          incomingLine,
          index + 1,
          { seenRdProcurementLineIds },
        );
        const createdLine = await this.repository.createOrderLine(
          {
            orderId: id,
            lineNo: lineData.lineNo,
            materialId: lineData.materialId,
            rdProcurementRequestLineId: lineData.rdProcurementRequestLineId,
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
            remark: lineData.remark,
            createdBy: updatedBy,
            updatedBy,
          },
          tx,
        );
        const log = await this.inventoryService.increaseStock(
          {
            materialId: createdLine.materialId,
            stockScope: "MAIN",
            bizDate,
            quantity: createdLine.quantity,
            operationType,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: id,
            businessDocumentNumber: existing.documentNo,
            businessDocumentLineId: createdLine.id,
            operatorId: updatedBy,
            idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:line:${createdLine.id}`,
            unitCost: new Prisma.Decimal(createdLine.unitPrice),
            costAmount: new Prisma.Decimal(createdLine.unitPrice).mul(
              new Prisma.Decimal(createdLine.quantity),
            ),
          },
          tx,
        );
        acceptanceLogIdByLineId.set(createdLine.id, log.id);
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

      await this.shared.assertRdProcurementAcceptedQtyWithinLimit(
        rdProcurementLink.lineMap,
        finalLines,
        id,
        tx,
      );
      await this.repository.updateOrder(
        id,
        {
          bizDate,
          supplierId: finalSupplierId,
          handlerPersonnelId: hasHandlerOverride
            ? (dto.handlerPersonnelId ?? null)
            : existing.handlerPersonnelId,
          stockScopeId: stockScopeRecord.id,
          workshopId,
          rdProcurementRequestId:
            rdProcurementLink.request?.id ?? existing.rdProcurementRequestId,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
          handlerNameSnapshot: handlerSnapshot.handlerNameSnapshot,
          workshopNameSnapshot: workshop?.workshopName ?? null,
          ...this.toRdProcurementOrderSnapshots(
            rdProcurementLink.request ??
              (existing.rdProcurementRequestId
                ? {
                    id: existing.rdProcurementRequestId,
                    documentNo: existing.rdProcurementRequestNoSnapshot ?? "",
                    projectCode:
                      existing.rdProcurementProjectCodeSnapshot ?? "",
                    projectName:
                      existing.rdProcurementProjectNameSnapshot ?? "",
                  }
                : null),
          ),
          totalQty,
          totalAmount,
          remark: dto.remark ?? existing.remark,
          auditStatusSnapshot: AuditStatusSnapshot.PENDING,
          revisionNo: { increment: 1 },
          updatedBy,
        },
        tx,
      );

      await applyAcceptanceStatusesForOrder(
        {
          orderId: id,
          documentNo: existing.documentNo,
          lines: finalLines,
          operatorId: updatedBy,
          logIdByLineId: acceptanceLogIdByLineId,
        },
        tx,
      );
      await this.approvalService.createOrRefreshApprovalDocument(
        {
          documentFamily: DocumentFamily.STOCK_IN,
          documentType: DOCUMENT_TYPE,
          documentId: id,
          documentNumber: existing.documentNo,
          submittedBy: updatedBy,
          createdBy: updatedBy,
        },
        tx,
      );
      return this.repository.findOrderById(id, tx);
    });
  }

  async voidOrder(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.repository.findOrderById(id);
    if (!order) throw new NotFoundException(`入库单不存在：${id}`);
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED)
      throw new BadRequestException("单据已作废");
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED)
      throw new BadRequestException("库存状态异常，无法作废");
    if (order.orderType !== StockInOrderType.ACCEPTANCE)
      throw new BadRequestException("此方法仅用于验收单");

    return this.repository.runInTransaction(async (tx) => {
      const hasDownstreamDependencies =
        await this.repository.hasActiveDownstreamDependencies(id, tx);
      if (hasDownstreamDependencies)
        throw new BadRequestException("存在下游依赖，不能作废");

      await reverseAcceptanceStatusesForOrder(
        {
          orderId: id,
          documentNo: order.documentNo,
          operatorId: voidedBy,
          note: `作废验收单：${order.documentNo}`,
        },
        tx,
      );
      const logs = await this.inventoryService.getLogsForDocument(
        { businessDocumentType: DOCUMENT_TYPE, businessDocumentId: id },
        tx,
      );
      if (logs.length === 0)
        throw new BadRequestException("未找到可冲回的库存流水");

      for (const log of logs) {
        const hasAllocations =
          await this.inventoryService.hasUnreleasedAllocations(log.id, tx);
        if (hasAllocations)
          throw new BadRequestException(
            `入库流水 ${log.id} 已有下游消耗分配，不能作废`,
          );
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: log.id,
            idempotencyKey: `StockInOrder:void:${id}:log:${log.id}`,
            note: `作废单据：${order.documentNo}`,
          },
          tx,
        );
      }

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

  private toRdProcurementOrderSnapshots(
    request: {
      id: number;
      documentNo: string;
      projectCode: string;
      projectName: string;
    } | null,
  ) {
    if (!request) {
      return {
        rdProcurementRequestNoSnapshot: null,
        rdProcurementProjectCodeSnapshot: null,
        rdProcurementProjectNameSnapshot: null,
      };
    }
    return {
      rdProcurementRequestNoSnapshot: request.documentNo,
      rdProcurementProjectCodeSnapshot: request.projectCode,
      rdProcurementProjectNameSnapshot: request.projectName,
    };
  }
}
