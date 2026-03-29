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
import {
  applyAcceptanceStatusesForOrder,
  reverseAcceptanceStatusesForOrder,
} from "../../rd-subwarehouse/application/rd-material-status.helper";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { WorkflowService } from "../../workflow/application/workflow.service";
import type { CreateInboundOrderDto } from "../dto/create-inbound-order.dto";
import type { QueryInboundOrderDto } from "../dto/query-inbound-order.dto";
import type { UpdateInboundOrderDto } from "../dto/update-inbound-order.dto";
import { InboundRepository } from "../infrastructure/inbound.repository";

const DOCUMENT_TYPE = "StockInOrder";
const BUSINESS_MODULE = "inbound";
const MAIN_WAREHOUSE_CODE = "MAIN";

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
    private readonly rdProcurementRequestService: RdProcurementRequestService,
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
      handlerName: query.handlerName,
      materialId: query.materialId,
      materialName: query.materialName,
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

    const bizDate = new Date(dto.bizDate);
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    const rdProcurementLink = await this.resolveRdProcurementLink(
      dto.orderType,
      workshop,
      dto.rdProcurementRequestId,
      dto.supplierId,
    );
    await this.validateMasterData(dto, rdProcurementLink.supplierId);
    const { supplierCodeSnapshot, supplierNameSnapshot } =
      await this.resolveSupplierSnapshot(rdProcurementLink.supplierId);
    const { handlerNameSnapshot } = await this.resolveHandlerSnapshot(
      dto.handlerPersonnelId,
    );
    const seenRdProcurementLineIds = new Set<number>();
    const linesWithSnapshots: Array<{
      lineNo: number;
      materialId: number;
      rdProcurementRequestLineId: number | null;
      materialCodeSnapshot: string;
      materialNameSnapshot: string;
      materialSpecSnapshot: string;
      unitCodeSnapshot: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      amount: Prisma.Decimal;
      remark?: string;
    }> = [];
    for (let index = 0; index < dto.lines.length; index++) {
      linesWithSnapshots.push(
        await this.buildLineWriteData(dto.lines[index], index + 1, {
          rdProcurementLineMap: rdProcurementLink.lineMap,
          seenRdProcurementLineIds,
        }),
      );
    }

    const totalQty = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.amount),
      new Prisma.Decimal(0),
    );

    return this.prisma.runInTransaction(async (tx) => {
      await this.assertRdProcurementAcceptedQtyWithinLimit(
        rdProcurementLink.lineMap,
        linesWithSnapshots,
        undefined,
        tx,
      );

      const order = await this.repository.createOrder(
        {
          documentNo: dto.documentNo,
          orderType: dto.orderType,
          bizDate,
          supplierId: rdProcurementLink.supplierId,
          handlerPersonnelId: dto.handlerPersonnelId,
          workshopId: dto.workshopId,
          rdProcurementRequestId: rdProcurementLink.request?.id,
          supplierCodeSnapshot,
          supplierNameSnapshot,
          handlerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          ...this.toRdProcurementOrderSnapshots(rdProcurementLink.request),
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
      const logIdByLineId = new Map<number, number>();
      for (const line of order.lines) {
        const log = await this.inventoryService.increaseStock(
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
        logIdByLineId.set(line.id, log.id);
      }

      await applyAcceptanceStatusesForOrder(
        {
          orderId: order.id,
          documentNo: order.documentNo,
          lines: order.lines,
          operatorId: createdBy,
          logIdByLineId,
        },
        tx,
      );

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

    const bizDate = dto.bizDate ? new Date(dto.bizDate) : existing.bizDate;
    const nextRevision = existing.revisionNo + 1;
    const linkedRdProcurementRequestId =
      dto.rdProcurementRequestId ??
      existing.rdProcurementRequestId ??
      undefined;
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId ?? existing.workshopId,
    );
    const rdProcurementLink = await this.resolveRdProcurementLink(
      existing.orderType,
      workshop,
      linkedRdProcurementRequestId,
      dto.supplierId ?? existing.supplierId ?? undefined,
    );
    await this.validateMasterDataForUpdate(
      dto,
      existing.orderType,
      rdProcurementLink.supplierId,
    );
    const finalSupplierId = rdProcurementLink.supplierId;
    const supplierSnapshot = finalSupplierId
      ? await this.resolveSupplierSnapshot(finalSupplierId)
      : {
          supplierCodeSnapshot: existing.supplierCodeSnapshot,
          supplierNameSnapshot: existing.supplierNameSnapshot,
        };
    const handlerSnapshot = dto.handlerPersonnelId
      ? await this.resolveHandlerSnapshot(dto.handlerPersonnelId)
      : { handlerNameSnapshot: existing.handlerNameSnapshot };

    const operationType = toOperationType(existing.orderType);

    return this.prisma.runInTransaction(async (tx) => {
      const currentOrder = await this.repository.findOrderById(id, tx);
      if (!currentOrder) {
        throw new NotFoundException(`入库单不存在: ${id}`);
      }

      await reverseAcceptanceStatusesForOrder(
        {
          orderId: id,
          documentNo: existing.documentNo,
          operatorId: updatedBy,
          note: `改单重算验收状态: ${existing.documentNo}`,
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
      const workshopId = dto.workshopId ?? currentOrder.workshopId;
      const workshopChanged = workshopId !== currentOrder.workshopId;
      const seenRdProcurementLineIds = new Set<number>();

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

        if (incomingLine.id) {
          const currentLine = currentLinesById.get(incomingLine.id);
          if (!currentLine) {
            throw new BadRequestException(`明细不存在: ${incomingLine.id}`);
          }
          const lineData = await this.buildLineWriteData(
            {
              ...incomingLine,
              rdProcurementRequestLineId:
                incomingLine.rdProcurementRequestLineId ??
                currentLine.rdProcurementRequestLineId ??
                undefined,
            },
            index + 1,
            {
              rdProcurementLineMap: rdProcurementLink.lineMap,
              seenRdProcurementLineIds,
            },
          );

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
            acceptanceLogIdByLineId.set(updatedLine.id, log.id);
          }

          finalLines.push(updatedLine);
          continue;
        }

        const lineData = await this.buildLineWriteData(
          incomingLine,
          index + 1,
          {
            rdProcurementLineMap: rdProcurementLink.lineMap,
            seenRdProcurementLineIds,
          },
        );

        const createdLine = await this.repository.createOrderLine(
          {
            orderId: id,
            lineNo: lineData.lineNo,
            materialId: lineData.materialId,
            rdProcurementRequestLineId: lineData.rdProcurementRequestLineId,
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

      await this.assertRdProcurementAcceptedQtyWithinLimit(
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
          handlerPersonnelId:
            dto.handlerPersonnelId ?? existing.handlerPersonnelId,
          workshopId,
          rdProcurementRequestId: rdProcurementLink.request?.id ?? null,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
          handlerNameSnapshot: handlerSnapshot.handlerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          ...this.toRdProcurementOrderSnapshots(rdProcurementLink.request),
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

      await reverseAcceptanceStatusesForOrder(
        {
          orderId: id,
          documentNo: order.documentNo,
          operatorId: voidedBy,
          note: `作废验收单: ${order.documentNo}`,
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

  private async validateMasterData(
    dto: CreateInboundOrderDto,
    supplierId?: number,
  ) {
    this.ensureSupplierRequirement(dto.orderType, supplierId);
    await this.masterDataService.getWorkshopById(dto.workshopId);
    if (supplierId) {
      await this.masterDataService.getSupplierById(supplierId);
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
    supplierId?: number,
  ) {
    this.ensureSupplierRequirement(orderType, supplierId);
    if (dto.workshopId) {
      await this.masterDataService.getWorkshopById(dto.workshopId);
    }
    if (supplierId) {
      await this.masterDataService.getSupplierById(supplierId);
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
      rdProcurementRequestLineId?: number;
      remark?: string;
    },
    lineNo: number,
    options?: {
      rdProcurementLineMap?: Map<
        number,
        {
          id: number;
          materialId: number;
          quantity: Prisma.Decimal;
        }
      > | null;
      seenRdProcurementLineIds?: Set<number>;
    },
  ) {
    const material = await this.masterDataService.getMaterialById(
      line.materialId,
    );
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
    const amount = quantity.mul(unitPrice);
    const requestLine = this.resolveRdProcurementLineLink(
      line.rdProcurementRequestLineId,
      material.id,
      quantity,
      options?.rdProcurementLineMap,
      options?.seenRdProcurementLineIds,
    );

    return {
      lineNo,
      materialId: material.id,
      rdProcurementRequestLineId: requestLine?.id ?? null,
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

  private async resolveRdProcurementLink(
    orderType: StockInOrderType,
    workshop: { id: number; workshopCode: string; workshopName: string },
    rdProcurementRequestId?: number,
    supplierId?: number,
  ) {
    if (!rdProcurementRequestId) {
      return {
        request: null,
        supplierId,
        lineMap: null,
      };
    }

    if (orderType !== StockInOrderType.ACCEPTANCE) {
      throw new BadRequestException("只有验收单可以关联 RD 采购需求");
    }
    if (workshop.workshopCode !== MAIN_WAREHOUSE_CODE) {
      throw new BadRequestException("关联 RD 采购需求的验收单必须先入主仓");
    }

    const request = await this.rdProcurementRequestService.getRequestById(
      rdProcurementRequestId,
    );
    if (request.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException("只能关联有效的 RD 采购需求");
    }
    if (request.supplierId && supplierId && request.supplierId !== supplierId) {
      throw new BadRequestException("验收单供应商需与 RD 采购需求一致");
    }

    return {
      request,
      supplierId: supplierId ?? request.supplierId ?? undefined,
      lineMap: new Map(
        request.lines.map((line) => [
          line.id,
          {
            id: line.id,
            materialId: line.materialId,
            quantity: new Prisma.Decimal(line.quantity),
          },
        ]),
      ),
    };
  }

  private resolveRdProcurementLineLink(
    rdProcurementRequestLineId: number | undefined,
    materialId: number,
    quantity: Prisma.Decimal,
    rdProcurementLineMap?: Map<
      number,
      {
        id: number;
        materialId: number;
        quantity: Prisma.Decimal;
      }
    > | null,
    seenRdProcurementLineIds?: Set<number>,
  ) {
    if (!rdProcurementLineMap) {
      if (rdProcurementRequestLineId) {
        throw new BadRequestException(
          "明细不能在未关联采购需求时单独引用 RD 采购行",
        );
      }
      return null;
    }

    if (!rdProcurementRequestLineId) {
      throw new BadRequestException(
        "关联 RD 采购需求时，每条明细都必须绑定采购需求行",
      );
    }
    if (seenRdProcurementLineIds?.has(rdProcurementRequestLineId)) {
      throw new BadRequestException(
        "同一条 RD 采购需求行不能重复关联到多个验收明细",
      );
    }

    const requestLine = rdProcurementLineMap.get(rdProcurementRequestLineId);
    if (!requestLine) {
      throw new BadRequestException("存在不属于当前 RD 采购需求的明细关联");
    }
    if (requestLine.materialId !== materialId) {
      throw new BadRequestException("验收物料必须与 RD 采购需求行一致");
    }
    if (quantity.gt(requestLine.quantity)) {
      throw new BadRequestException("验收数量不能大于对应 RD 采购需求数量");
    }

    seenRdProcurementLineIds?.add(rdProcurementRequestLineId);
    return requestLine;
  }

  private async assertRdProcurementAcceptedQtyWithinLimit(
    rdProcurementLineMap:
      | Map<
          number,
          {
            id: number;
            materialId: number;
            quantity: Prisma.Decimal;
          }
        >
      | null
      | undefined,
    lines: Array<{
      rdProcurementRequestLineId: number | null;
      quantity: Prisma.Decimal;
    }>,
    excludeOrderId?: number,
    tx?: Prisma.TransactionClient,
  ) {
    if (!rdProcurementLineMap || lines.length === 0) {
      return;
    }

    const requestedLineIds = lines
      .map((line) => line.rdProcurementRequestLineId)
      .filter((lineId): lineId is number => Boolean(lineId));
    if (requestedLineIds.length === 0) {
      return;
    }

    const existingAcceptedQtyMap =
      await this.repository.sumEffectiveAcceptedQtyByRdProcurementLineIds(
        requestedLineIds,
        excludeOrderId,
        tx,
      );
    const newAcceptedQtyMap = new Map<number, Prisma.Decimal>();
    lines.forEach((line) => {
      if (!line.rdProcurementRequestLineId) {
        return;
      }
      const current =
        newAcceptedQtyMap.get(line.rdProcurementRequestLineId) ??
        new Prisma.Decimal(0);
      newAcceptedQtyMap.set(
        line.rdProcurementRequestLineId,
        current.add(new Prisma.Decimal(line.quantity)),
      );
    });

    requestedLineIds.forEach((lineId) => {
      const requestLine = rdProcurementLineMap.get(lineId);
      if (!requestLine) {
        return;
      }
      const existingAcceptedQty =
        existingAcceptedQtyMap.get(lineId) ?? new Prisma.Decimal(0);
      const newAcceptedQty =
        newAcceptedQtyMap.get(lineId) ?? new Prisma.Decimal(0);
      if (existingAcceptedQty.add(newAcceptedQty).gt(requestLine.quantity)) {
        throw new BadRequestException(
          "累计验收数量不能大于对应 RD 采购需求数量",
        );
      }
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
