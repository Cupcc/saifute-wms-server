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
import { WorkflowService } from "../../workflow/application/workflow.service";
import type { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import type { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import { WorkshopMaterialRepository } from "../infrastructure/workshop-material.repository";

const DOCUMENT_TYPE = "WorkshopMaterialOrder";
const BUSINESS_MODULE = "workshop-material";

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

    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) =>
        this.buildLineWriteData(line, idx + 1),
      ),
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
            sourceDocumentType: lineDto.sourceDocumentType ?? undefined,
            sourceDocumentId: lineDto.sourceDocumentId ?? undefined,
            sourceDocumentLineId: lineDto.sourceDocumentLineId ?? undefined,
            createdBy,
            updatedBy: createdBy,
          };
        }),
        tx,
      );

      const operationType = toOperationType(dto.orderType);

      if (
        dto.orderType === WorkshopMaterialOrderType.PICK ||
        dto.orderType === WorkshopMaterialOrderType.SCRAP
      ) {
        for (const line of order.lines) {
          await this.inventoryService.decreaseStock(
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
      } else {
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

    const usages = await this.inventoryService.listSourceUsages({
      consumerDocumentType: DOCUMENT_TYPE,
      consumerDocumentId: sourceDocumentId,
      limit: 100,
      offset: 0,
    });
    const lineUsages = usages.items.filter(
      (u) => u.consumerLineId === sourceDocumentLineId,
    );
    for (const usage of lineUsages) {
      const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      const toRelease = allocatedQty.sub(releasedQty);
      if (toRelease.gt(0)) {
        await this.inventoryService.releaseInventorySource(
          {
            sourceLogId: usage.sourceLogId,
            consumerDocumentType: DOCUMENT_TYPE,
            consumerDocumentId: sourceDocumentId,
            consumerLineId: sourceDocumentLineId,
            targetReleasedQty: allocatedQty,
            operatorId: createdBy,
          },
          tx,
        );
      }
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
}
