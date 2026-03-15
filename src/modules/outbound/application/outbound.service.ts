import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  CustomerStockOrderType,
  DocumentFamily,
  DocumentLifecycleStatus,
  DocumentRelationType,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { WorkflowService } from "../../workflow/application/workflow.service";
import type { CreateOutboundOrderDto } from "../dto/create-outbound-order.dto";
import type { CreateSalesReturnDto } from "../dto/create-sales-return.dto";
import type { QueryOutboundOrderDto } from "../dto/query-outbound-order.dto";
import type { QuerySalesReturnDto } from "../dto/query-sales-return.dto";
import type { UpdateOutboundOrderDto } from "../dto/update-outbound-order.dto";
import { OutboundRepository } from "../infrastructure/outbound.repository";

const DOCUMENT_TYPE = "CustomerStockOrder";
const BUSINESS_MODULE = "outbound";

@Injectable()
export class OutboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: OutboundRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly workflowService: WorkflowService,
  ) {}

  async listOrders(query: QueryOutboundOrderDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      orderType: CustomerStockOrderType.OUTBOUND,
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
    if (order.orderType !== CustomerStockOrderType.OUTBOUND) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    return order;
  }

  async createOrder(dto: CreateOutboundOrderDto, createdBy?: string) {
    const existing = await this.repository.findOrderByDocumentNo(
      dto.documentNo,
    );
    if (existing) {
      throw new ConflictException(`单据编号已存在: ${dto.documentNo}`);
    }

    await this.validateMasterDataForOutbound(dto);

    const bizDate = new Date(dto.bizDate);
    const { customerCodeSnapshot, customerNameSnapshot } =
      await this.resolveCustomerSnapshot(dto.customerId);
    const { handlerNameSnapshot } = await this.resolveHandlerSnapshot(
      dto.handlerPersonnelId,
    );
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );

    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) => {
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
        const qty = new Prisma.Decimal(line.quantity);
        const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
        const amount = qty.mul(unitPrice);
        return {
          lineNo: idx + 1,
          materialId: material.id,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity: qty,
          unitPrice,
          amount,
          startNumber: line.startNumber ?? null,
          endNumber: line.endNumber ?? null,
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

    return this.prisma.runInTransaction(async (tx) => {
      const order = await this.repository.createOrder(
        {
          documentNo: dto.documentNo,
          orderType: CustomerStockOrderType.OUTBOUND,
          bizDate,
          customerId: dto.customerId,
          handlerPersonnelId: dto.handlerPersonnelId,
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
        linesWithSnapshots.map((l) => ({
          ...l,
          createdBy,
          updatedBy: createdBy,
        })),
        tx,
      );

      for (const line of order.lines) {
        await this.inventoryService.decreaseStock(
          {
            materialId: line.materialId,
            workshopId: order.workshopId,
            quantity: line.quantity,
            operationType: InventoryOperationType.OUTBOUND_OUT,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: order.id,
            businessDocumentNumber: order.documentNo,
            businessDocumentLineId: line.id,
            operatorId: createdBy,
            idempotencyKey: `CustomerStockOrder:${order.id}:line:${line.id}`,
          },
          tx,
        );

        if (line.startNumber && line.endNumber) {
          await this.inventoryService.reserveFactoryNumber(
            {
              materialId: line.materialId,
              workshopId: order.workshopId,
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

      await this.workflowService.createOrRefreshAuditDocument(
        {
          documentFamily: DocumentFamily.CUSTOMER_STOCK,
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
    if (existing.orderType !== CustomerStockOrderType.OUTBOUND) {
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
    const workshop = dto.workshopId
      ? await this.masterDataService.getWorkshopById(dto.workshopId)
      : { workshopName: existing.workshopNameSnapshot };

    return this.prisma.runInTransaction(async (tx) => {
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
      const workshopChanged = workshopId !== currentOrder.workshopId;

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

        await this.inventoryService.reverseStock(
          {
            logIdToReverse: currentLog.id,
            idempotencyKey: `CustomerStockOrder:${id}:rev:${nextRevision}:delete:${currentLine.id}`,
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
        const lineData = await this.buildOutboundLineWriteData(
          incomingLine,
          index + 1,
        );

        if (incomingLine.id) {
          const currentLine = currentLinesById.get(incomingLine.id);
          if (!currentLine) {
            throw new BadRequestException(`明细不存在: ${incomingLine.id}`);
          }

          const inventoryNeedsRepost =
            workshopChanged ||
            currentLine.materialId !== lineData.materialId ||
            !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity);
          const reservationChanged =
            workshopChanged ||
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

            await this.inventoryService.reverseStock(
              {
                logIdToReverse: currentLog.id,
                idempotencyKey: `CustomerStockOrder:${id}:rev:${nextRevision}:replace:${currentLine.id}`,
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
              materialCodeSnapshot: lineData.materialCodeSnapshot,
              materialNameSnapshot: lineData.materialNameSnapshot,
              materialSpecSnapshot: lineData.materialSpecSnapshot,
              unitCodeSnapshot: lineData.unitCodeSnapshot,
              quantity: lineData.quantity,
              unitPrice: lineData.unitPrice,
              amount: lineData.amount,
              startNumber: lineData.startNumber,
              endNumber: lineData.endNumber,
              remark: lineData.remark,
              updatedBy,
            },
            tx,
          );

          if (inventoryNeedsRepost) {
            await this.inventoryService.decreaseStock(
              {
                materialId: updatedLine.materialId,
                workshopId,
                quantity: updatedLine.quantity,
                operationType: InventoryOperationType.OUTBOUND_OUT,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: id,
                businessDocumentNumber: existing.documentNo,
                businessDocumentLineId: updatedLine.id,
                operatorId: updatedBy,
                idempotencyKey: `CustomerStockOrder:${id}:rev:${nextRevision}:line:${updatedLine.id}`,
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
                workshopId,
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
            materialCodeSnapshot: lineData.materialCodeSnapshot,
            materialNameSnapshot: lineData.materialNameSnapshot,
            materialSpecSnapshot: lineData.materialSpecSnapshot,
            unitCodeSnapshot: lineData.unitCodeSnapshot,
            quantity: lineData.quantity,
            unitPrice: lineData.unitPrice,
            amount: lineData.amount,
            startNumber: lineData.startNumber,
            endNumber: lineData.endNumber,
            remark: lineData.remark,
            createdBy: updatedBy,
            updatedBy,
          },
          tx,
        );

        await this.inventoryService.decreaseStock(
          {
            materialId: createdLine.materialId,
            workshopId,
            quantity: createdLine.quantity,
            operationType: InventoryOperationType.OUTBOUND_OUT,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: id,
            businessDocumentNumber: existing.documentNo,
            businessDocumentLineId: createdLine.id,
            operatorId: updatedBy,
            idempotencyKey: `CustomerStockOrder:${id}:rev:${nextRevision}:line:${createdLine.id}`,
          },
          tx,
        );

        if (createdLine.startNumber && createdLine.endNumber) {
          await this.inventoryService.reserveFactoryNumber(
            {
              materialId: createdLine.materialId,
              workshopId,
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

      await this.workflowService.createOrRefreshAuditDocument(
        {
          documentFamily: DocumentFamily.CUSTOMER_STOCK,
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
    if (!order) {
      throw new NotFoundException(`出库单不存在: ${id}`);
    }
    if (order.orderType !== CustomerStockOrderType.OUTBOUND) {
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
            idempotencyKey: `CustomerStockOrder:void:${id}:log:${log.id}`,
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

      await this.workflowService.markAuditNotRequired(
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
    if (order.orderType !== CustomerStockOrderType.SALES_RETURN) {
      throw new NotFoundException(`销售退货单不存在: ${id}`);
    }
    return order;
  }

  async createSalesReturn(dto: CreateSalesReturnDto, createdBy?: string) {
    const existing = await this.repository.findOrderByDocumentNo(
      dto.documentNo,
    );
    if (existing) {
      throw new ConflictException(`单据编号已存在: ${dto.documentNo}`);
    }

    const sourceOutbound = await this.repository.findOrderById(
      dto.sourceOutboundOrderId,
    );
    if (!sourceOutbound) {
      throw new NotFoundException(
        `来源出库单不存在: ${dto.sourceOutboundOrderId}`,
      );
    }
    if (sourceOutbound.orderType !== CustomerStockOrderType.OUTBOUND) {
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
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );

    const outboundLinesById = new Map(
      sourceOutbound.lines.map((l) => [l.id, l]),
    );

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
        return {
          lineNo: idx + 1,
          materialId: material.id,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity: returnQty,
          unitPrice,
          amount,
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

    return this.prisma.runInTransaction(async (tx) => {
      const order = await this.repository.createOrder(
        {
          documentNo: dto.documentNo,
          orderType: CustomerStockOrderType.SALES_RETURN,
          bizDate,
          customerId,
          handlerPersonnelId: dto.handlerPersonnelId,
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
        linesWithSnapshots.map((l) => ({
          ...l,
          createdBy,
          updatedBy: createdBy,
        })),
        tx,
      );

      await this.repository.createDocumentRelation(
        {
          relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
          upstreamFamily: DocumentFamily.CUSTOMER_STOCK,
          upstreamDocumentType: DOCUMENT_TYPE,
          upstreamDocumentId: dto.sourceOutboundOrderId,
          downstreamFamily: DocumentFamily.CUSTOMER_STOCK,
          downstreamDocumentType: DOCUMENT_TYPE,
          downstreamDocumentId: order.id,
          isActive: true,
          createdBy,
          updatedBy: createdBy,
        },
        tx,
      );

      for (const line of order.lines) {
        await this.inventoryService.increaseStock(
          {
            materialId: line.materialId,
            workshopId: order.workshopId,
            quantity: line.quantity,
            operationType: InventoryOperationType.SALES_RETURN_IN,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: order.id,
            businessDocumentNumber: order.documentNo,
            businessDocumentLineId: line.id,
            operatorId: createdBy,
            idempotencyKey: `CustomerStockOrder:${order.id}:line:${line.id}`,
          },
          tx,
        );

        if (line.sourceDocumentLineId) {
          await this.repository.createDocumentLineRelation(
            {
              relationType: DocumentRelationType.SALES_RETURN_FROM_OUTBOUND,
              upstreamFamily: DocumentFamily.CUSTOMER_STOCK,
              upstreamDocumentType: DOCUMENT_TYPE,
              upstreamDocumentId: dto.sourceOutboundOrderId,
              upstreamLineId: line.sourceDocumentLineId,
              downstreamFamily: DocumentFamily.CUSTOMER_STOCK,
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

      await this.workflowService.createOrRefreshAuditDocument(
        {
          documentFamily: DocumentFamily.CUSTOMER_STOCK,
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
  }

  async voidSalesReturn(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`销售退货单不存在: ${id}`);
    }
    if (order.orderType !== CustomerStockOrderType.SALES_RETURN) {
      throw new NotFoundException(`销售退货单不存在: ${id}`);
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
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
            idempotencyKey: `CustomerStockOrder:void:${id}:log:${log.id}`,
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

      await this.workflowService.markAuditNotRequired(
        DOCUMENT_TYPE,
        id,
        voidedBy,
        tx,
      );

      return this.repository.findOrderById(id, tx);
    });
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

  private async buildOutboundLineWriteData(
    line: {
      materialId: number;
      quantity: string;
      unitPrice?: string;
      startNumber?: string;
      endNumber?: string;
      remark?: string;
    },
    lineNo: number,
  ) {
    const material = await this.masterDataService.getMaterialById(
      line.materialId,
    );
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
    const amount = quantity.mul(unitPrice);

    return {
      lineNo,
      materialId: material.id,
      materialCodeSnapshot: material.materialCode,
      materialNameSnapshot: material.materialName,
      materialSpecSnapshot: material.specModel ?? "",
      unitCodeSnapshot: material.unitCode,
      quantity,
      unitPrice,
      amount,
      startNumber: line.startNumber ?? null,
      endNumber: line.endNumber ?? null,
      remark: line.remark,
    };
  }
}
