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
  DocumentRelationType,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  applyScrapStatusesForOrder,
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
  reverseScrapStatusesForOrder,
} from "../../rd-subwarehouse/application/rd-material-status.helper";
import { WorkflowService } from "../../workflow/application/workflow.service";
import type { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import type { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import { WorkshopMaterialRepository } from "../infrastructure/workshop-material.repository";

const DOCUMENT_TYPE = "WorkshopMaterialOrder";
const BUSINESS_MODULE = "workshop-material";
const RD_SUBWAREHOUSE_CODE = "RD";

function toOperationType(
  orderType: WorkshopMaterialOrderType,
): InventoryOperationType {
  switch (orderType) {
    case WorkshopMaterialOrderType.PICK:
      return InventoryOperationType.PICK_OUT;
    case WorkshopMaterialOrderType.RETURN:
      return InventoryOperationType.RETURN_IN;
    case WorkshopMaterialOrderType.SCRAP:
      return InventoryOperationType.SCRAP_OUT;
    default:
      throw new BadRequestException(`Unsupported orderType: ${orderType}`);
  }
}

@Injectable()
export class WorkshopMaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: WorkshopMaterialRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly workflowService: WorkflowService,
  ) {}

  async listPickOrders(query: QueryWorkshopMaterialOrderDto) {
    return this.listOrders({
      ...query,
      orderType: WorkshopMaterialOrderType.PICK,
    });
  }

  async listReturnOrders(query: QueryWorkshopMaterialOrderDto) {
    return this.listOrders({
      ...query,
      orderType: WorkshopMaterialOrderType.RETURN,
    });
  }

  async listScrapOrders(query: QueryWorkshopMaterialOrderDto) {
    return this.listOrders({
      ...query,
      orderType: WorkshopMaterialOrderType.SCRAP,
    });
  }

  async listOrders(query: QueryWorkshopMaterialOrderDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      handlerName: query.handlerName,
      materialId: query.materialId,
      materialName: query.materialName,
      orderType: query.orderType,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      workshopId: query.workshopId,
      limit,
      offset,
    });
  }

  async getPickOrderById(id: number) {
    return this.getOrderById(id, WorkshopMaterialOrderType.PICK);
  }

  async getReturnOrderById(id: number) {
    return this.getOrderById(id, WorkshopMaterialOrderType.RETURN);
  }

  async getScrapOrderById(id: number) {
    return this.getOrderById(id, WorkshopMaterialOrderType.SCRAP);
  }

  async getOrderById(id: number, orderType?: WorkshopMaterialOrderType) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`车间物料单不存在: ${id}`);
    }
    if (orderType && order.orderType !== orderType) {
      throw new NotFoundException(
        `单据类型不匹配: 期望 ${orderType}, 实际 ${order.orderType}`,
      );
    }
    return order;
  }

  async createPickOrder(
    dto: CreateWorkshopMaterialOrderDto,
    createdBy?: string,
  ) {
    if (dto.orderType !== WorkshopMaterialOrderType.PICK) {
      throw new BadRequestException("orderType 必须为 PICK");
    }
    return this.createOrder(dto, createdBy);
  }

  async createReturnOrder(
    dto: CreateWorkshopMaterialOrderDto,
    createdBy?: string,
  ) {
    if (dto.orderType !== WorkshopMaterialOrderType.RETURN) {
      throw new BadRequestException("orderType 必须为 RETURN");
    }
    return this.createOrder(dto, createdBy);
  }

  async createScrapOrder(
    dto: CreateWorkshopMaterialOrderDto,
    createdBy?: string,
  ) {
    if (dto.orderType !== WorkshopMaterialOrderType.SCRAP) {
      throw new BadRequestException("orderType 必须为 SCRAP");
    }
    return this.createOrder(dto, createdBy);
  }

  async createOrder(dto: CreateWorkshopMaterialOrderDto, createdBy?: string) {
    const existing = await this.repository.findOrderByDocumentNo(
      dto.documentNo,
    );
    if (existing) {
      throw new ConflictException(`单据编号已存在: ${dto.documentNo}`);
    }

    await this.validateMasterData(dto);

    const bizDate = new Date(dto.bizDate);
    const { handlerNameSnapshot } = await this.resolveHandlerSnapshot(
      dto.handlerPersonnelId,
    );
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    const isRdScrapOrder =
      dto.orderType === WorkshopMaterialOrderType.SCRAP &&
      workshop.workshopCode === RD_SUBWAREHOUSE_CODE;
    const rdRequestCache = new Map<
      number,
      {
        lifecycleStatus: DocumentLifecycleStatus;
        lines: Array<{ id: number; materialId: number }>;
      } | null
    >();

    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) => {
        const lineWriteData = await this.buildLineWriteData(line, idx + 1);
        if (isRdScrapOrder) {
          await this.assertRdScrapSourceLine(
            line,
            lineWriteData.materialId,
            rdRequestCache,
          );
        }
        return lineWriteData;
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

    const auditStatus =
      dto.orderType === WorkshopMaterialOrderType.SCRAP
        ? AuditStatusSnapshot.NOT_REQUIRED
        : AuditStatusSnapshot.PENDING;

    return this.prisma.runInTransaction(async (tx) => {
      const order = await this.repository.createOrder(
        {
          documentNo: dto.documentNo,
          orderType: dto.orderType,
          bizDate,
          handlerPersonnelId: dto.handlerPersonnelId,
          workshopId: dto.workshopId,
          handlerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark,
          auditStatusSnapshot: auditStatus,
          createdBy,
          updatedBy: createdBy,
        },
        linesWithSnapshots.map((l, idx) => {
          const lineDto = dto.lines[idx] as CreateWorkshopMaterialOrderLineDto;
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

      const operationType = toOperationType(dto.orderType);
      const logIdByLineId = new Map<number, number>();

      if (
        dto.orderType === WorkshopMaterialOrderType.PICK ||
        dto.orderType === WorkshopMaterialOrderType.SCRAP
      ) {
        for (const line of order.lines) {
          const log = await this.inventoryService.decreaseStock(
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
              idempotencyKey: `${DOCUMENT_TYPE}:${order.id}:line:${line.id}`,
            },
            tx,
          );
          logIdByLineId.set(line.id, log.id);
          const lineDto = dto.lines[line.lineNo - 1];
          if (lineDto?.sourceLogId) {
            await this.inventoryService.allocateInventorySource(
              {
                sourceLogId: lineDto.sourceLogId,
                consumerDocumentType: DOCUMENT_TYPE,
                consumerDocumentId: order.id,
                consumerLineId: line.id,
                targetAllocatedQty: line.quantity,
                operatorId: createdBy,
              },
              tx,
            );
          }
        }

        if (isRdScrapOrder) {
          await applyScrapStatusesForOrder(
            {
              orderId: order.id,
              documentNo: order.documentNo,
              lines: order.lines,
              operatorId: createdBy,
              logIdByLineId,
            },
            tx,
          );
        }
      } else {
        // Pre-validate cumulative return quantities before writing any relations.
        // Groups incoming lines by source pick-line ID to catch split-line over-returns
        // within a single request, then checks against existing active downstream returns.
        const incomingQtyByPickLine = new Map<number, Prisma.Decimal>();
        const pickLineToPickOrderId = new Map<number, number>();
        for (let i = 0; i < order.lines.length; i++) {
          const lineDto = dto.lines[i] as CreateWorkshopMaterialOrderLineDto;
          if (!lineDto?.sourceDocumentId || !lineDto?.sourceDocumentLineId)
            continue;
          const pickLineId = lineDto.sourceDocumentLineId;
          const pickOrderId = lineDto.sourceDocumentId;
          pickLineToPickOrderId.set(pickLineId, pickOrderId);
          const prev =
            incomingQtyByPickLine.get(pickLineId) ?? new Prisma.Decimal(0);
          incomingQtyByPickLine.set(
            pickLineId,
            prev.add(new Prisma.Decimal(order.lines[i].quantity)),
          );
        }
        // For each unique (pickOrderId, pickLineId) pair, enforce the cumulative cap.
        const checkedPickOrders = new Map<
          number,
          Map<number, Prisma.Decimal>
        >();
        for (const [pickLineId, incomingQty] of incomingQtyByPickLine) {
          const pickOrderId = pickLineToPickOrderId.get(pickLineId);
          if (pickOrderId === undefined) continue;
          if (!checkedPickOrders.has(pickOrderId)) {
            const activeMap =
              await this.repository.sumActiveReturnedQtyByPickLine(
                pickOrderId,
                tx,
              );
            checkedPickOrders.set(pickOrderId, activeMap);
          }
          const activeMap =
            checkedPickOrders.get(pickOrderId) ??
            new Map<number, Prisma.Decimal>();
          const pickOrder = await this.repository.findOrderById(
            pickOrderId,
            tx,
          );
          if (
            !pickOrder ||
            pickOrder.orderType !== WorkshopMaterialOrderType.PICK ||
            pickOrder.lifecycleStatus === DocumentLifecycleStatus.VOIDED
          ) {
            // Detailed error is raised inside validateAndRecordReturnRelation below
            continue;
          }
          const pickLine = pickOrder.lines.find((l) => l.id === pickLineId);
          if (!pickLine) continue;
          const alreadyReturned =
            activeMap.get(pickLineId) ?? new Prisma.Decimal(0);
          if (
            alreadyReturned
              .add(incomingQty)
              .gt(new Prisma.Decimal(pickLine.quantity))
          ) {
            throw new BadRequestException(
              `领料明细 ${pickLineId} 累计有效退料数量超过领料数量`,
            );
          }
        }

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
              idempotencyKey: `${DOCUMENT_TYPE}:${order.id}:line:${line.id}`,
            },
            tx,
          );
        }

        for (let i = 0; i < order.lines.length; i++) {
          const line = order.lines[i];
          const lineDto = dto.lines[i];
          if (
            lineDto?.sourceDocumentType &&
            lineDto?.sourceDocumentId &&
            lineDto?.sourceDocumentLineId
          ) {
            await this.validateAndRecordReturnRelation(
              order.id,
              line.id,
              line.quantity,
              lineDto.sourceDocumentType,
              lineDto.sourceDocumentId,
              lineDto.sourceDocumentLineId,
              createdBy,
              tx,
            );
          }
        }
      }

      if (auditStatus === AuditStatusSnapshot.PENDING) {
        await this.workflowService.createOrRefreshAuditDocument(
          {
            documentFamily: DocumentFamily.WORKSHOP_MATERIAL,
            documentType: DOCUMENT_TYPE,
            documentId: order.id,
            documentNumber: order.documentNo,
            submittedBy: createdBy,
            createdBy,
          },
          tx,
        );
      }

      return order;
    });
  }

  private async validateAndRecordReturnRelation(
    returnOrderId: number,
    returnLineId: number,
    linkedQty: Prisma.Decimal,
    _sourceDocumentType: string,
    sourceDocumentId: number,
    sourceDocumentLineId: number,
    createdBy?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const pickOrder = await this.repository.findOrderById(sourceDocumentId, tx);
    if (!pickOrder) {
      throw new BadRequestException(`上游领料单不存在: id=${sourceDocumentId}`);
    }
    if (pickOrder.orderType !== WorkshopMaterialOrderType.PICK) {
      throw new BadRequestException(
        `上游单据必须是领料单: type=${pickOrder.orderType}`,
      );
    }
    if (pickOrder.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException(`上游领料单已作废: id=${sourceDocumentId}`);
    }

    const pickLine = pickOrder.lines.find((l) => l.id === sourceDocumentLineId);
    if (!pickLine) {
      throw new BadRequestException(
        `上游领料明细不存在: lineId=${sourceDocumentLineId}`,
      );
    }

    // Paginate through ALL source usages for this pick order so no usages are
    // silently truncated, then filter to just the specific pick line.
    const usagePageSize = 200;
    let usagePage = await this.inventoryService.listSourceUsages(
      {
        consumerDocumentType: DOCUMENT_TYPE,
        consumerDocumentId: sourceDocumentId,
        limit: usagePageSize,
        offset: 0,
      },
      tx,
    );
    const allDocUsages = [...usagePage.items];
    let usageOffset = usagePageSize;
    while (usagePage.items.length === usagePageSize) {
      usagePage = await this.inventoryService.listSourceUsages(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: sourceDocumentId,
          limit: usagePageSize,
          offset: usageOffset,
        },
        tx,
      );
      allDocUsages.push(...usagePage.items);
      usageOffset += usagePageSize;
    }

    // Release source usage only up to the quantity returned in this operation,
    // processing usages in deterministic (sourceLogId ascending) order so that
    // partial returns are always applied against the oldest allocations first.
    const lineUsages = allDocUsages
      .filter((u) => u.consumerLineId === sourceDocumentLineId)
      .sort((a, b) => Number(a.sourceLogId) - Number(b.sourceLogId));
    let remainingToRelease = new Prisma.Decimal(linkedQty);
    for (const usage of lineUsages) {
      if (remainingToRelease.lte(0)) break;
      const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      const unreleased = allocatedQty.sub(releasedQty);
      if (unreleased.lte(0)) continue;
      const toReleaseNow = unreleased.gt(remainingToRelease)
        ? remainingToRelease
        : unreleased;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: sourceDocumentId,
          consumerLineId: sourceDocumentLineId,
          targetReleasedQty: releasedQty.add(toReleaseNow),
          operatorId: createdBy,
        },
        tx,
      );
      remainingToRelease = remainingToRelease.sub(toReleaseNow);
    }

    // Guard: if the source-usage scan could not release the full linkedQty,
    // the relation must not be persisted; the data state would otherwise diverge
    // from the active return set.
    if (remainingToRelease.gt(0)) {
      throw new BadRequestException(
        `领料来源库存释放不足: pickOrderId=${sourceDocumentId}, pickLineId=${sourceDocumentLineId}，退料需释放 ${new Prisma.Decimal(linkedQty).toFixed()} 但实际只能释放 ${new Prisma.Decimal(linkedQty).sub(remainingToRelease).toFixed()}`,
      );
    }

    const client = tx ?? this.prisma;
    await client.documentRelation.upsert({
      where: {
        relationType_upstreamFamily_upstreamDocumentId_downstreamFamily_downstreamDocumentId:
          {
            relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
            upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            upstreamDocumentId: sourceDocumentId,
            downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            downstreamDocumentId: returnOrderId,
          },
      },
      create: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: sourceDocumentId,
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: DOCUMENT_TYPE,
        downstreamDocumentId: returnOrderId,
        isActive: true,
        createdBy,
        updatedBy: createdBy,
      },
      update: { isActive: true, updatedBy: createdBy },
    });

    await client.documentLineRelation.upsert({
      where: {
        relationType_upstreamFamily_upstreamLineId_downstreamFamily_downstreamLineId:
          {
            relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
            upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            upstreamLineId: sourceDocumentLineId,
            downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            downstreamLineId: returnLineId,
          },
      },
      create: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: DOCUMENT_TYPE,
        upstreamDocumentId: sourceDocumentId,
        upstreamLineId: sourceDocumentLineId,
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: DOCUMENT_TYPE,
        downstreamDocumentId: returnOrderId,
        downstreamLineId: returnLineId,
        linkedQty,
        createdBy,
        updatedBy: createdBy,
      },
      update: { linkedQty, updatedBy: createdBy },
    });
  }

  async voidPickOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.voidOrder(
      id,
      WorkshopMaterialOrderType.PICK,
      voidReason,
      voidedBy,
    );
  }

  async voidReturnOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.voidOrder(
      id,
      WorkshopMaterialOrderType.RETURN,
      voidReason,
      voidedBy,
    );
  }

  async voidScrapOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.voidOrder(
      id,
      WorkshopMaterialOrderType.SCRAP,
      voidReason,
      voidedBy,
    );
  }

  async voidOrder(
    id: number,
    orderType: WorkshopMaterialOrderType,
    voidReason?: string,
    voidedBy?: string,
  ) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`车间物料单不存在: ${id}`);
    }
    if (order.orderType !== orderType) {
      throw new NotFoundException(
        `单据类型不匹配: 期望 ${orderType}, 实际 ${order.orderType}`,
      );
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
      if (orderType === WorkshopMaterialOrderType.PICK) {
        const hasReturn = await this.repository.hasActiveReturnDownstream(
          id,
          tx,
        );
        if (hasReturn) {
          throw new BadRequestException(
            "存在未作废的退料单下游，不能作废领料单",
          );
        }

        const usages = await this.inventoryService.listSourceUsages(
          {
            consumerDocumentType: DOCUMENT_TYPE,
            consumerDocumentId: id,
            limit: 1000,
            offset: 0,
          },
          tx,
        );
        for (const usage of usages.items) {
          const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
          const releasedQty = new Prisma.Decimal(usage.releasedQty);
          if (releasedQty.gte(allocatedQty)) {
            continue;
          }

          await this.inventoryService.releaseInventorySource(
            {
              sourceLogId: usage.sourceLogId,
              consumerDocumentType: DOCUMENT_TYPE,
              consumerDocumentId: id,
              consumerLineId: usage.consumerLineId,
              targetReleasedQty: allocatedQty,
              operatorId: voidedBy,
            },
            tx,
          );
        }
      }

      if (orderType === WorkshopMaterialOrderType.SCRAP) {
        await reverseScrapStatusesForOrder(
          {
            orderId: id,
            documentNo: order.documentNo,
            operatorId: voidedBy,
            note: `作废报废单: ${order.documentNo}`,
          },
          tx,
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
            idempotencyKey: `${DOCUMENT_TYPE}:void:${id}:log:${log.id}`,
            note: `作废单据: ${order.documentNo}`,
          },
          tx,
        );
      }

      if (orderType === WorkshopMaterialOrderType.RETURN) {
        // Restore source usages that were incrementally released when this return
        // order was created, so that the pick line's source-usage state reflects
        // only currently active returns after the void.
        for (const line of order.lines) {
          if (
            line.sourceDocumentId != null &&
            line.sourceDocumentLineId != null
          ) {
            await this.restoreSourceUsageForReturnVoid(
              line.sourceDocumentId,
              line.sourceDocumentLineId,
              new Prisma.Decimal(line.quantity),
              voidedBy,
              tx,
            );
          }
        }
        await this.repository.deactivateDocumentRelationsForReturn(id, tx);
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

  /**
   * Reverses the source-usage releases that were applied when a return order was
   * created. Processes usages in reverse sourceLogId order (newest first) so the
   * un-release mirrors the forward-release sequence in reverse, restoring the pick
   * line's available release capacity for future returns.
   */
  private async restoreSourceUsageForReturnVoid(
    pickOrderId: number,
    pickLineId: number,
    quantityToRestore: Prisma.Decimal,
    operatorId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const usagePageSize = 200;
    let usagePage = await this.inventoryService.listSourceUsages(
      {
        consumerDocumentType: DOCUMENT_TYPE,
        consumerDocumentId: pickOrderId,
        limit: usagePageSize,
        offset: 0,
      },
      tx,
    );
    const allDocUsages = [...usagePage.items];
    let usageOffset = usagePageSize;
    while (usagePage.items.length === usagePageSize) {
      usagePage = await this.inventoryService.listSourceUsages(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: pickOrderId,
          limit: usagePageSize,
          offset: usageOffset,
        },
        tx,
      );
      allDocUsages.push(...usagePage.items);
      usageOffset += usagePageSize;
    }

    // Reverse order: undo the youngest release first (mirrors forward allocation order).
    const lineUsages = allDocUsages
      .filter((u) => u.consumerLineId === pickLineId)
      .sort((a, b) => Number(b.sourceLogId) - Number(a.sourceLogId));

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
          consumerDocumentId: pickOrderId,
          consumerLineId: pickLineId,
          targetReleasedQty: releasedQty.sub(toRestoreNow),
          operatorId,
        },
        tx,
      );
      remainingToRestore = remainingToRestore.sub(toRestoreNow);
    }
  }

  private async validateMasterData(dto: CreateWorkshopMaterialOrderDto) {
    await this.masterDataService.getWorkshopById(dto.workshopId);
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async resolveHandlerSnapshot(handlerPersonnelId?: number) {
    if (!handlerPersonnelId) {
      return { handlerNameSnapshot: null };
    }
    const p = await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: p.personnelName };
  }

  private async buildLineWriteData(
    line: CreateWorkshopMaterialOrderLineDto,
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

  private async assertRdScrapSourceLine(
    line: CreateWorkshopMaterialOrderLineDto,
    materialId: number,
    requestCache: Map<
      number,
      {
        lifecycleStatus: DocumentLifecycleStatus;
        lines: Array<{ id: number; materialId: number }>;
      } | null
    >,
  ) {
    const sourceDocumentType =
      line.sourceDocumentType ?? RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE;
    if (sourceDocumentType !== RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE) {
      throw new BadRequestException("RD 报废只能关联 RD 采购需求行");
    }
    if (!line.sourceDocumentId || !line.sourceDocumentLineId) {
      throw new BadRequestException("RD 报废明细必须绑定采购需求行");
    }

    let request = requestCache.get(line.sourceDocumentId);
    if (!request) {
      request = await this.prisma.rdProcurementRequest.findUnique({
        where: { id: line.sourceDocumentId },
        include: { lines: true },
      });
      requestCache.set(line.sourceDocumentId, request);
    }
    if (
      !request ||
      request.lifecycleStatus === DocumentLifecycleStatus.VOIDED
    ) {
      throw new BadRequestException("RD 报废来源采购需求不存在或已作废");
    }

    const requestLine = request.lines.find(
      (item) => item.id === line.sourceDocumentLineId,
    );
    if (!requestLine) {
      throw new BadRequestException("RD 报废来源采购行不存在");
    }
    if (requestLine.materialId !== materialId) {
      throw new BadRequestException("RD 报废物料必须与采购需求行一致");
    }
  }
}
