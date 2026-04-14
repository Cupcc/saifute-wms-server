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
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  type SalesProjectBindingReference,
  SalesProjectService,
} from "../../sales-project/application/sales-project.service";
import type { CreateOutboundOrderDto } from "../dto/create-outbound-order.dto";
import type { CreateSalesReturnDto } from "../dto/create-sales-return.dto";
import type { QueryOutboundOrderDto } from "../dto/query-outbound-order.dto";
import type { QuerySalesReturnDto } from "../dto/query-sales-return.dto";
import type { UpdateOutboundOrderDto } from "../dto/update-outbound-order.dto";
import { SalesRepository } from "../infrastructure/sales.repository";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
const BUSINESS_MODULE = "sales";
const OUTBOUND_SOURCE_OPERATION_TYPES = FIFO_SOURCE_OPERATION_TYPES.filter(
  (type) => type !== InventoryOperationType.RD_HANDOFF_IN,
);

type OutboundLineWriteData = {
  lineNo: number;
  materialId: number;
  salesProjectId: number | null;
  salesProjectCodeSnapshot: string | null;
  salesProjectNameSnapshot: string | null;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string;
  unitCodeSnapshot: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  selectedUnitCost: Prisma.Decimal;
  projectTargetId: number | null;
  startNumber: string | null;
  endNumber: string | null;
  remark?: string;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: SalesRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly approvalService: ApprovalService,
    private readonly salesProjectService: SalesProjectService,
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
    return this.attachOutboundTraceability(order);
  }

  async createOrder(dto: CreateOutboundOrderDto, createdBy?: string) {
    await this.validateMasterDataForOutbound(dto);

    const bizDate = new Date(dto.bizDate);
    const { customerCodeSnapshot, customerNameSnapshot } =
      await this.resolveCustomerSnapshot(dto.customerId);
    const { handlerNameSnapshot } = await this.resolveHandlerSnapshot(
      dto.handlerPersonnelId,
    );
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode("MAIN");
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    const salesProjectById = await this.resolveSalesProjectReferencesForLines(
      dto.lines,
    );

    const linesWithSnapshots = await Promise.all(
      dto.lines.map((line, idx) =>
        this.buildOutboundLineWriteData(line, idx + 1, salesProjectById, {
          customerId: dto.customerId,
          workshopId: dto.workshopId,
        }),
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
      return this.prisma.runInTransaction(async (tx) => {
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
          const settlement = await this.inventoryService.settleConsumerOut(
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
            await this.inventoryService.reserveFactoryNumber(
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

        await this.approvalService.createOrRefreshApprovalDocument(
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

    return this.attachOutboundTraceability(createdOrder);
  }

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
      ? await this.resolveCustomerSnapshot(finalCustomerId)
      : {
          customerCodeSnapshot: existing.customerCodeSnapshot,
          customerNameSnapshot: existing.customerNameSnapshot,
        };
    const handlerSnapshot = dto.handlerPersonnelId
      ? await this.resolveHandlerSnapshot(dto.handlerPersonnelId)
      : { handlerNameSnapshot: existing.handlerNameSnapshot };
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode("MAIN");
    const workshop = dto.workshopId
      ? await this.masterDataService.getWorkshopById(dto.workshopId)
      : { workshopName: existing.workshopNameSnapshot };
    const salesProjectById = await this.resolveSalesProjectReferencesForLines(
      dto.lines,
    );
    const plannedLines = await Promise.all(
      dto.lines.map((line, idx) =>
        this.buildOutboundLineWriteData(line, idx + 1, salesProjectById, {
          customerId: finalCustomerId,
          workshopId: dto.workshopId ?? existing.workshopId,
        }),
      ),
    );
    const projectTargetByLineNo = new Map(
      plannedLines.map((line) => [line.lineNo, line.projectTargetId]),
    );
    this.assertNoDuplicateOutboundPriceLayers(plannedLines);

    const updatedOrder = await this.prisma.runInTransaction(async (tx) => {
      const currentOrder = await this.repository.findOrderById(id, tx);
      if (!currentOrder) {
        throw new NotFoundException(`出库单不存在: ${id}`);
      }

      const logs = await this.inventoryService.getLogsForDocument(
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
        await this.inventoryService.releaseSourceUsagesForConsumerLine(
          {
            consumerDocumentType: DOCUMENT_TYPE,
            consumerDocumentId: id,
            consumerLineId: currentLine.id,
            operatorId: updatedBy,
          },
          tx,
        );

        await this.inventoryService.reverseStock(
          {
            logIdToReverse: currentLog.id,
            idempotencyKey: `SalesStockOrder:${id}:rev:${nextRevision}:delete:${currentLine.id}`,
            note: `改单删除明细冲回: ${existing.documentNo}`,
          },
          tx,
        );
        if (currentLine.startNumber && currentLine.endNumber) {
          await this.inventoryService.releaseFactoryNumberReservations(
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
            await this.inventoryService.releaseSourceUsagesForConsumerLine(
              {
                consumerDocumentType: DOCUMENT_TYPE,
                consumerDocumentId: id,
                consumerLineId: currentLine.id,
                operatorId: updatedBy,
              },
              tx,
            );

            await this.inventoryService.reverseStock(
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
            await this.inventoryService.releaseFactoryNumberReservations(
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
              await this.inventoryService.settleConsumerOut(
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
            await this.inventoryService.reserveFactoryNumber(
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

        const newLineSettlement = await this.inventoryService.settleConsumerOut(
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
          await this.inventoryService.reserveFactoryNumber(
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

      await this.approvalService.createOrRefreshApprovalDocument(
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

    return this.attachOutboundTraceability(updatedOrder);
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

    return this.prisma.runInTransaction(async (tx) => {
      const hasActiveDownstream =
        await this.repository.hasActiveDownstreamSalesReturns(id, tx);
      if (hasActiveDownstream) {
        throw new BadRequestException(
          "存在未作废的销售退货下游，不能作废出库单",
        );
      }

      // Release FIFO source allocations before reversing the OUT log.
      await this.inventoryService.releaseAllSourceUsagesForConsumer(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: id,
          operatorId: voidedBy,
        },
        tx,
      );

      const logs = await this.inventoryService.getLogsForDocument(
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
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: log.id,
            idempotencyKey: `SalesStockOrder:void:${id}:log:${log.id}`,
            note: `作废单据: ${order.documentNo}`,
          },
          tx,
        );
      }

      await this.inventoryService.releaseFactoryNumberReservations(
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

      await this.approvalService.markApprovalNotRequired(
        DOCUMENT_TYPE,
        id,
        voidedBy,
        tx,
      );

      return this.repository.findOrderById(id, tx);
    });
  }

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
      await this.resolveCustomerSnapshot(customerId);
    const { handlerNameSnapshot } = await this.resolveHandlerSnapshot(
      dto.handlerPersonnelId,
    );
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode("MAIN");
    const workshop = await this.masterDataService.getWorkshopById(
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
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
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
      return this.prisma.runInTransaction(async (tx) => {
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
            const releaseResult = await this.releaseOutboundSourceForReturn(
              dto.sourceOutboundOrderId,
              line.sourceDocumentLineId,
              new Prisma.Decimal(line.quantity),
              createdBy,
              tx,
            );
            returnCostUnitPrice = releaseResult.releasedUnitCost;
            returnCostAmount = releaseResult.releasedCostAmount;
          }

          await this.inventoryService.increaseStock(
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

        await this.approvalService.createOrRefreshApprovalDocument(
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

    return this.prisma.runInTransaction(async (tx) => {
      // Restore the outbound source allocations that were released when this
      // return was created (mirrors the release done in createSalesReturn).
      for (const line of order.lines) {
        if (
          line.sourceDocumentLineId != null &&
          line.sourceDocumentId != null
        ) {
          await this.restoreOutboundSourceForReturnVoid(
            line.sourceDocumentId,
            line.sourceDocumentLineId,
            new Prisma.Decimal(line.quantity),
            voidedBy,
            tx,
          );
        }
      }

      const logs = await this.inventoryService.getLogsForDocument(
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
        await this.inventoryService.reverseStock(
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

      await this.approvalService.markApprovalNotRequired(
        DOCUMENT_TYPE,
        id,
        voidedBy,
        tx,
      );

      return this.repository.findOrderById(id, tx);
    });
  }

  /**
   * Releases outbound source usages proportional to the returned quantity and
   * returns the derived cost (unit cost and total cost) from those released layers.
   * Oldest allocations are released first (FIFO order).
   */
  private async releaseOutboundSourceForReturn(
    outboundOrderId: number,
    outboundLineId: number,
    returnQty: Prisma.Decimal,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<{
    releasedUnitCost: Prisma.Decimal;
    releasedCostAmount: Prisma.Decimal;
  }> {
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
        },
        tx,
      )
    ).sort((a, b) => Number(a.sourceLogId) - Number(b.sourceLogId));

    let remaining = new Prisma.Decimal(returnQty);
    let releasedCostAmount = new Prisma.Decimal(0);
    const releasedPieces: { qty: Prisma.Decimal; unitCost: Prisma.Decimal }[] =
      [];

    for (const usage of lineUsages) {
      if (remaining.lte(0)) break;
      const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      const unreleased = allocatedQty.sub(releasedQty);
      if (unreleased.lte(0)) continue;

      const toReleaseNow = unreleased.gt(remaining) ? remaining : unreleased;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
          targetReleasedQty: releasedQty.add(toReleaseNow),
          operatorId,
        },
        tx,
      );

      const srcUnitCost = usage.sourceLog.unitCost
        ? new Prisma.Decimal(usage.sourceLog.unitCost)
        : new Prisma.Decimal(0);
      releasedCostAmount = releasedCostAmount.add(
        srcUnitCost.mul(toReleaseNow),
      );
      releasedPieces.push({ qty: toReleaseNow, unitCost: srcUnitCost });
      remaining = remaining.sub(toReleaseNow);
    }

    if (remaining.gt(0)) {
      throw new BadRequestException(
        `销售退货来源库存释放不足: outboundOrderId=${outboundOrderId}, outboundLineId=${outboundLineId}，退货需释放 ${returnQty.toFixed()} 但实际只能释放 ${returnQty.sub(remaining).toFixed()}`,
      );
    }

    const releasedUnitCost = returnQty.gt(0)
      ? releasedCostAmount.div(returnQty)
      : new Prisma.Decimal(0);

    return { releasedUnitCost, releasedCostAmount };
  }

  /**
   * Restores (un-releases) outbound source usage releases that were applied when
   * a sales return was created. Processes usages newest-first to mirror the
   * forward-release sequence in reverse.
   */
  private async restoreOutboundSourceForReturnVoid(
    outboundOrderId: number | undefined,
    outboundLineId: number,
    quantityToRestore: Prisma.Decimal,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!outboundOrderId) return;

    // Line-scoped lookup avoids document-level truncation when a large outbound
    // order has many source-usage rows across multiple lines.
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
        },
        tx,
      )
    ).sort((a, b) => Number(b.sourceLogId) - Number(a.sourceLogId));

    let remainingToRestore = new Prisma.Decimal(quantityToRestore);
    for (const usage of lineUsages) {
      if (remainingToRestore.lte(0)) break;
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      if (releasedQty.lte(0)) continue;
      const toRestoreNow = releasedQty.gt(remainingToRestore)
        ? remainingToRestore
        : releasedQty;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
          targetReleasedQty: releasedQty.sub(toRestoreNow),
          operatorId,
        },
        tx,
      );
      remainingToRestore = remainingToRestore.sub(toRestoreNow);
    }

    if (remainingToRestore.gt(0)) {
      throw new BadRequestException(
        `销售退货来源库存恢复不足: outboundOrderId=${outboundOrderId}, outboundLineId=${outboundLineId}，需恢复 ${quantityToRestore.toFixed()} 但实际只能恢复 ${quantityToRestore.sub(remainingToRestore).toFixed()}`,
      );
    }
  }

  private async validateMasterDataForOutbound(dto: CreateOutboundOrderDto) {
    await this.masterDataService.getWorkshopById(dto.workshopId);
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async validateMasterDataForUpdate(dto: UpdateOutboundOrderDto) {
    if (dto.workshopId) {
      await this.masterDataService.getWorkshopById(dto.workshopId);
    }
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async validateMasterDataForSalesReturn(
    dto: CreateSalesReturnDto,
    sourceOutbound: { workshopId: number; customerId: number | null },
  ) {
    await this.masterDataService.getWorkshopById(dto.workshopId);
    if (dto.workshopId !== sourceOutbound.workshopId) {
      throw new BadRequestException("销售退货车间必须与来源出库单一致");
    }
    if (dto.customerId && sourceOutbound.customerId) {
      if (dto.customerId !== sourceOutbound.customerId) {
        throw new BadRequestException("销售退货客户应与来源出库单一致");
      }
    }
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async resolveCustomerSnapshot(customerId?: number) {
    if (!customerId) {
      return {
        customerCodeSnapshot: null,
        customerNameSnapshot: null,
      };
    }
    const c = await this.masterDataService.getCustomerById(customerId);
    return {
      customerCodeSnapshot: c.customerCode,
      customerNameSnapshot: c.customerName,
    };
  }

  private async resolveHandlerSnapshot(handlerPersonnelId?: number) {
    if (!handlerPersonnelId) {
      return { handlerNameSnapshot: null };
    }
    const p = await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: p.personnelName };
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
        await this.inventoryService.listPriceLayerAvailability({
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

  private async attachOutboundTraceability(
    order: NonNullable<Awaited<ReturnType<SalesRepository["findOrderById"]>>>,
  ) {
    const sourceUsagesByLine = new Map<
      number,
      Awaited<ReturnType<InventoryService["listSourceUsagesForConsumerLine"]>>
    >();

    for (const line of order.lines) {
      sourceUsagesByLine.set(
        line.id,
        await this.inventoryService.listSourceUsagesForConsumerLine({
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: order.id,
          consumerLineId: line.id,
        }),
      );
    }

    const sourceLogIds = [
      ...new Set(
        [...sourceUsagesByLine.values()].flatMap((usages) =>
          usages.map((usage) => usage.sourceLogId),
        ),
      ),
    ];

    const correctionLines =
      sourceLogIds.length > 0
        ? await this.prisma.stockInPriceCorrectionOrderLine.findMany({
            where: {
              OR: [
                { sourceInventoryLogId: { in: sourceLogIds } },
                { generatedInLogId: { in: sourceLogIds } },
              ],
            },
            include: {
              order: {
                select: {
                  id: true,
                  documentNo: true,
                  bizDate: true,
                },
              },
              sourceStockInOrder: {
                select: {
                  id: true,
                  documentNo: true,
                  bizDate: true,
                },
              },
              sourceStockInOrderLine: {
                select: {
                  id: true,
                  lineNo: true,
                  materialId: true,
                  materialCodeSnapshot: true,
                  materialNameSnapshot: true,
                  quantity: true,
                  unitPrice: true,
                },
              },
            },
          })
        : [];
    const correctionByGeneratedInLogId = new Map<
      number,
      (typeof correctionLines)[number]
    >();
    for (const correctionLine of correctionLines) {
      if (correctionLine.generatedInLogId != null) {
        correctionByGeneratedInLogId.set(
          correctionLine.generatedInLogId,
          correctionLine,
        );
      }
    }

    const directStockInLineIds = [
      ...new Set(
        [...sourceUsagesByLine.values()].flatMap((usages) =>
          usages
            .filter(
              (usage) =>
                usage.sourceLog.businessDocumentType ===
                  BusinessDocumentType.StockInOrder &&
                usage.sourceLog.businessDocumentLineId != null,
            )
            .map((usage) => usage.sourceLog.businessDocumentLineId as number),
        ),
      ),
    ];
    const directStockInLines =
      directStockInLineIds.length > 0
        ? await this.prisma.stockInOrderLine.findMany({
            where: { id: { in: directStockInLineIds } },
            include: {
              order: {
                select: {
                  id: true,
                  documentNo: true,
                  bizDate: true,
                },
              },
            },
          })
        : [];
    const directStockInLineById = new Map(
      directStockInLines.map((line) => [line.id, line]),
    );

    return {
      ...order,
      lines: order.lines.map((line) => ({
        ...line,
        sourceUsages: (sourceUsagesByLine.get(line.id) ?? []).map((usage) => {
          const directStockInLine =
            usage.sourceLog.businessDocumentType ===
              BusinessDocumentType.StockInOrder &&
            usage.sourceLog.businessDocumentLineId != null
              ? directStockInLineById.get(
                  usage.sourceLog.businessDocumentLineId,
                )
              : null;
          const correctionLine =
            directStockInLine == null
              ? (correctionByGeneratedInLogId.get(usage.sourceLogId) ?? null)
              : null;

          const originalInboundOrder =
            correctionLine?.sourceStockInOrder ??
            directStockInLine?.order ??
            null;
          const originalInboundLine =
            correctionLine?.sourceStockInOrderLine ?? directStockInLine ?? null;

          return {
            ...usage,
            priceCorrection: correctionLine
              ? {
                  id: correctionLine.id,
                  orderId: correctionLine.orderId,
                  documentNo: correctionLine.order.documentNo,
                  bizDate: correctionLine.order.bizDate,
                  sourceInventoryLogId: correctionLine.sourceInventoryLogId,
                  wrongUnitCost: correctionLine.wrongUnitCost,
                  correctUnitCost: correctionLine.correctUnitCost,
                  historicalDiffAmount: correctionLine.historicalDiffAmount,
                  generatedInLogId: correctionLine.generatedInLogId,
                  generatedOutLogId: correctionLine.generatedOutLogId,
                }
              : null,
            originalInboundOrder,
            originalInboundLine,
          };
        }),
      })),
    };
  }

  private async resolveSalesProjectReferencesForLines(
    lines: Array<{ salesProjectId?: number | null }>,
    options?: { allowVoided?: boolean },
  ) {
    const projectIds = lines
      .map((line) => line.salesProjectId)
      .filter((value): value is number => value != null);
    return this.salesProjectService.listProjectReferencesByIds(
      projectIds,
      options,
    );
  }

  private assertSalesProjectBindingContext(
    project: SalesProjectBindingReference,
    context: {
      customerId?: number;
      workshopId: number;
    },
  ) {
    if (project.workshopId !== context.workshopId) {
      throw new BadRequestException(
        `销售项目与出库车间不一致: salesProjectId=${project.id}`,
      );
    }
    if (
      context.customerId &&
      project.customerId &&
      context.customerId !== project.customerId
    ) {
      throw new BadRequestException(
        `销售项目与出库客户不一致: salesProjectId=${project.id}`,
      );
    }
  }

  private async buildOutboundLineWriteData(
    line: {
      materialId: number;
      salesProjectId?: number;
      quantity: string;
      selectedUnitCost: string;
      unitPrice?: string;
      startNumber?: string;
      endNumber?: string;
      remark?: string;
    },
    lineNo: number,
    salesProjectById: Map<number, SalesProjectBindingReference>,
    context: {
      customerId?: number;
      workshopId: number;
    },
  ): Promise<OutboundLineWriteData> {
    const material = await this.masterDataService.getMaterialById(
      line.materialId,
    );
    const salesProject =
      line.salesProjectId != null
        ? (salesProjectById.get(line.salesProjectId) ?? null)
        : null;
    if (line.salesProjectId != null && !salesProject) {
      throw new NotFoundException(`销售项目不存在: ${line.salesProjectId}`);
    }
    if (salesProject) {
      this.assertSalesProjectBindingContext(salesProject, context);
    }
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
    const amount = quantity.mul(unitPrice);
    const selectedUnitCost = new Prisma.Decimal(line.selectedUnitCost);

    return {
      lineNo,
      materialId: material.id,
      salesProjectId: salesProject?.id ?? null,
      salesProjectCodeSnapshot: salesProject?.salesProjectCode ?? null,
      salesProjectNameSnapshot: salesProject?.salesProjectName ?? null,
      materialCodeSnapshot: material.materialCode,
      materialNameSnapshot: material.materialName,
      materialSpecSnapshot: material.specModel ?? "",
      unitCodeSnapshot: material.unitCode,
      quantity,
      unitPrice,
      amount,
      selectedUnitCost,
      projectTargetId: salesProject?.projectTargetId ?? null,
      startNumber: line.startNumber ?? null,
      endNumber: line.endNumber ?? null,
      remark: line.remark,
    };
  }
}
