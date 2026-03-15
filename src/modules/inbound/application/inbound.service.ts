import {
  BadRequestException,
  ConflictException,
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
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { WorkflowService } from "../../workflow/application/workflow.service";
import type { CreateInboundOrderDto } from "../dto/create-inbound-order.dto";
import type { QueryInboundOrderDto } from "../dto/query-inbound-order.dto";
import type { UpdateInboundOrderDto } from "../dto/update-inbound-order.dto";
import { InboundRepository } from "../infrastructure/inbound.repository";

const DOCUMENT_TYPE = "StockInOrder";
const BUSINESS_MODULE = "inbound";

function toOperationType(orderType: StockInOrderType): InventoryOperationType {
  switch (orderType) {
    case StockInOrderType.ACCEPTANCE:
      return InventoryOperationType.ACCEPTANCE_IN;
    case StockInOrderType.PRODUCTION_RECEIPT:
      return InventoryOperationType.PRODUCTION_RECEIPT_IN;
    default:
      throw new BadRequestException(`Unsupported orderType: ${orderType}`);
  }
}

@Injectable()
export class InboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InboundRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly workflowService: WorkflowService,
  ) {}

  async listOrders(query: QueryInboundOrderDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      orderType: query.orderType,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      supplierId: query.supplierId,
      workshopId: query.workshopId,
      limit,
      offset,
    });
  }

  async listIntoOrders(query: QueryInboundOrderDto) {
    return this.listOrders({
      ...query,
      orderType: StockInOrderType.PRODUCTION_RECEIPT,
    });
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`入库单不存在: ${id}`);
    }
    return order;
  }

  async createOrder(dto: CreateInboundOrderDto, createdBy?: string) {
    const existing = await this.repository.findOrderByDocumentNo(
      dto.documentNo,
    );
    if (existing) {
      throw new ConflictException(`单据编号已存在: ${dto.documentNo}`);
    }

    await this.validateMasterData(dto);

    const bizDate = new Date(dto.bizDate);
    const { supplierCodeSnapshot, supplierNameSnapshot } =
      await this.resolveSupplierSnapshot(dto.supplierId);
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
          orderType: dto.orderType,
          bizDate,
          supplierId: dto.supplierId,
          handlerPersonnelId: dto.handlerPersonnelId,
          workshopId: dto.workshopId,
          supplierCodeSnapshot,
          supplierNameSnapshot,
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

      const operationType = toOperationType(dto.orderType);
      for (const line of order.lines) {
        await this.inventoryService.increaseStock(
          {
            materialId: line.materialId,
            workshopId: order.workshopId,
            quantity: line.quantity,
            operationType,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: order.id,
            businessDocumentNumber: order.documentNo,
            businessDocumentLineId: line.id,
            operatorId: createdBy,
            idempotencyKey: `StockInOrder:${order.id}:line:${line.id}`,
          },
          tx,
        );
      }

      await this.workflowService.createOrRefreshAuditDocument(
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
  }

  async createIntoOrder(dto: CreateInboundOrderDto, createdBy?: string) {
    return this.createOrder(
      { ...dto, orderType: StockInOrderType.PRODUCTION_RECEIPT },
      createdBy,
    );
  }

  async updateOrder(
    id: number,
    dto: UpdateInboundOrderDto,
    updatedBy?: string,
  ) {
    const existing = await this.repository.findOrderById(id);
    if (!existing) {
      throw new NotFoundException(`入库单不存在: ${id}`);
    }
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的单据不能修改");
    }
    if (existing.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法修改");
    }

    await this.validateMasterDataForUpdate(
      dto,
      existing.orderType,
      existing.supplierId ?? undefined,
    );

    const bizDate = dto.bizDate ? new Date(dto.bizDate) : existing.bizDate;
    const nextRevision = existing.revisionNo + 1;
    const finalSupplierId = dto.supplierId ?? existing.supplierId ?? undefined;
    const supplierSnapshot = finalSupplierId
      ? await this.resolveSupplierSnapshot(finalSupplierId)
      : {
          supplierCodeSnapshot: existing.supplierCodeSnapshot,
          supplierNameSnapshot: existing.supplierNameSnapshot,
        };
    const handlerSnapshot = dto.handlerPersonnelId
      ? await this.resolveHandlerSnapshot(dto.handlerPersonnelId)
      : { handlerNameSnapshot: existing.handlerNameSnapshot };
    const workshop = dto.workshopId
      ? await this.masterDataService.getWorkshopById(dto.workshopId)
      : { workshopName: existing.workshopNameSnapshot };

    const operationType = toOperationType(existing.orderType);

    return this.prisma.runInTransaction(async (tx) => {
      const currentOrder = await this.repository.findOrderById(id, tx);
      if (!currentOrder) {
        throw new NotFoundException(`入库单不存在: ${id}`);
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
        if (!line.id) {
          continue;
        }
        if (seenLineIds.has(line.id)) {
          throw new BadRequestException(`重复的明细 ID: ${line.id}`);
        }
        if (!currentLinesById.has(line.id)) {
          throw new BadRequestException(`明细不存在: ${line.id}`);
        }
        seenLineIds.add(line.id);
      }

      for (const currentLine of currentOrder.lines) {
        if (seenLineIds.has(currentLine.id)) {
          continue;
        }

        const currentLog = logByLineId.get(currentLine.id);
        if (!currentLog) {
          throw new BadRequestException(
            `未找到明细对应的库存流水: lineId=${currentLine.id}`,
          );
        }

        await this.inventoryService.reverseStock(
          {
            logIdToReverse: currentLog.id,
            idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:delete:${currentLine.id}`,
            note: `改单删除明细冲回: ${existing.documentNo}`,
          },
          tx,
        );
        await this.repository.deleteOrderLine(currentLine.id, tx);
      }

      const finalLines = [];
      for (let index = 0; index < dto.lines.length; index++) {
        const incomingLine = dto.lines[index];
        const lineData = await this.buildLineWriteData(incomingLine, index + 1);

        if (incomingLine.id) {
          const currentLine = currentLinesById.get(incomingLine.id);
          if (!currentLine) {
            throw new BadRequestException(`明细不存在: ${incomingLine.id}`);
          }

          const inventoryNeedsRepost =
            workshopChanged ||
            currentLine.materialId !== lineData.materialId ||
            !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity);

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
                idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:replace:${currentLine.id}`,
                note: `改单重算明细冲回: ${existing.documentNo}`,
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
              remark: lineData.remark,
              updatedBy,
            },
            tx,
          );

          if (inventoryNeedsRepost) {
            await this.inventoryService.increaseStock(
              {
                materialId: updatedLine.materialId,
                workshopId,
                quantity: updatedLine.quantity,
                operationType,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: id,
                businessDocumentNumber: existing.documentNo,
                businessDocumentLineId: updatedLine.id,
                operatorId: updatedBy,
                idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:line:${updatedLine.id}`,
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
            remark: lineData.remark,
            createdBy: updatedBy,
            updatedBy,
          },
          tx,
        );

        await this.inventoryService.increaseStock(
          {
            materialId: createdLine.materialId,
            workshopId,
            quantity: createdLine.quantity,
            operationType,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: id,
            businessDocumentNumber: existing.documentNo,
            businessDocumentLineId: createdLine.id,
            operatorId: updatedBy,
            idempotencyKey: `StockInOrder:${id}:rev:${nextRevision}:line:${createdLine.id}`,
          },
          tx,
        );

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
          supplierId: finalSupplierId,
          handlerPersonnelId:
            dto.handlerPersonnelId ?? existing.handlerPersonnelId,
          workshopId,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
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
    if (!order) {
      throw new NotFoundException(`入库单不存在: ${id}`);
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
      const hasDownstreamDependencies =
        await this.repository.hasActiveDownstreamDependencies(id, tx);
      if (hasDownstreamDependencies) {
        throw new BadRequestException("存在下游依赖，不能作废");
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

      for (let i = 0; i < logs.length; i++) {
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: logs[i].id,
            idempotencyKey: `StockInOrder:void:${id}:log:${logs[i].id}`,
            note: `作废单据: ${order.documentNo}`,
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

      await this.workflowService.markAuditNotRequired(
        DOCUMENT_TYPE,
        id,
        voidedBy,
        tx,
      );

      return this.repository.findOrderById(id, tx);
    });
  }

  private async validateMasterData(dto: CreateInboundOrderDto) {
    this.ensureSupplierRequirement(dto.orderType, dto.supplierId);
    await this.masterDataService.getWorkshopById(dto.workshopId);
    if (dto.supplierId) {
      await this.masterDataService.getSupplierById(dto.supplierId);
    }
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async validateMasterDataForUpdate(
    dto: UpdateInboundOrderDto,
    orderType: StockInOrderType,
    currentSupplierId?: number,
  ) {
    this.ensureSupplierRequirement(
      orderType,
      dto.supplierId ?? currentSupplierId,
    );
    if (dto.workshopId) {
      await this.masterDataService.getWorkshopById(dto.workshopId);
    }
    if (dto.supplierId) {
      await this.masterDataService.getSupplierById(dto.supplierId);
    }
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async resolveSupplierSnapshot(supplierId?: number) {
    if (!supplierId) {
      return { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    }
    const s = await this.masterDataService.getSupplierById(supplierId);
    return {
      supplierCodeSnapshot: s.supplierCode,
      supplierNameSnapshot: s.supplierName,
    };
  }

  private async resolveHandlerSnapshot(handlerPersonnelId?: number) {
    if (!handlerPersonnelId) {
      return { handlerNameSnapshot: null };
    }
    const p = await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: p.personnelName };
  }

  private ensureSupplierRequirement(
    orderType: StockInOrderType,
    supplierId?: number,
  ) {
    if (orderType === StockInOrderType.ACCEPTANCE && !supplierId) {
      throw new BadRequestException("验收单必须选择供应商");
    }
  }

  private async buildLineWriteData(
    line: {
      materialId: number;
      quantity: string;
      unitPrice?: string;
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
      remark: line.remark,
    };
  }
}
