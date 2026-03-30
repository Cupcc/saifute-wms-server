import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateRdStocktakeOrderDto } from "../dto/create-rd-stocktake-order.dto";
import type { QueryRdStocktakeOrderDto } from "../dto/query-rd-stocktake-order.dto";
import { RdStocktakeOrderRepository } from "../infrastructure/rd-stocktake-order.repository";

const DOCUMENT_TYPE = "RdStocktakeOrder";
const BUSINESS_MODULE = "rd-subwarehouse";
const RD_SUBWAREHOUSE_CODE = "RD";

@Injectable()
export class RdStocktakeOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RdStocktakeOrderRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
  ) {}

  async listOrders(query: QueryRdStocktakeOrderDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      materialId: query.materialId,
      workshopId: query.workshopId,
      limit,
      offset,
    });
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`RD 盘点调整单不存在: ${id}`);
    }
    return order;
  }

  async createOrder(dto: CreateRdStocktakeOrderDto, createdBy?: string) {
    const existing = await this.repository.findOrderByDocumentNo(
      dto.documentNo,
    );
    if (existing) {
      throw new ConflictException(`单据编号已存在: ${dto.documentNo}`);
    }
    this.assertUniqueMaterials(dto);

    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    if (workshop.workshopCode !== RD_SUBWAREHOUSE_CODE) {
      throw new BadRequestException("RD 盘点调整单只能归属研发小仓");
    }

    return this.prisma.runInTransaction(async (tx) => {
      const linesWithSnapshots = await Promise.all(
        dto.lines.map(async (line, idx) => {
          const material = await this.masterDataService.getMaterialById(
            line.materialId,
          );
          const countedQty = new Prisma.Decimal(line.countedQty);
          const balance = await this.inventoryService.getBalanceSnapshot(
            {
              materialId: material.id,
              stockScope: "RD_SUB",
            },
            tx,
          );
          const bookQty = new Prisma.Decimal(balance?.quantityOnHand ?? 0);
          const adjustmentQty = countedQty.sub(bookQty);

          return {
            lineNo: idx + 1,
            materialId: material.id,
            materialCodeSnapshot: material.materialCode,
            materialNameSnapshot: material.materialName,
            materialSpecSnapshot: material.specModel ?? "",
            unitCodeSnapshot: material.unitCode,
            bookQty,
            countedQty,
            adjustmentQty,
            reason: line.reason,
            remark: line.remark,
          };
        }),
      );

      const totalBookQty = linesWithSnapshots.reduce(
        (sum, line) => sum.add(line.bookQty),
        new Prisma.Decimal(0),
      );
      const totalCountQty = linesWithSnapshots.reduce(
        (sum, line) => sum.add(line.countedQty),
        new Prisma.Decimal(0),
      );
      const totalAdjustmentQty = linesWithSnapshots.reduce(
        (sum, line) => sum.add(line.adjustmentQty),
        new Prisma.Decimal(0),
      );

      const order = await this.repository.createOrder(
        {
          documentNo: dto.documentNo,
          bizDate: new Date(dto.bizDate),
          workshopId: dto.workshopId,
          inventoryEffectStatus: InventoryEffectStatus.POSTED,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          countedBy: dto.countedBy,
          approvedBy: dto.approvedBy,
          totalBookQty,
          totalCountQty,
          totalAdjustmentQty,
          remark: dto.remark,
          createdBy,
          updatedBy: createdBy,
        },
        linesWithSnapshots.map((line) => ({
          ...line,
          createdBy,
          updatedBy: createdBy,
        })),
        tx,
      );

      for (const line of order.lines) {
        const adjustmentQty = new Prisma.Decimal(line.adjustmentQty);
        if (adjustmentQty.eq(0)) {
          continue;
        }

        const log = adjustmentQty.gt(0)
          ? await this.inventoryService.increaseStock(
              {
                materialId: line.materialId,
                stockScope: "RD_SUB",
                quantity: adjustmentQty,
                operationType: InventoryOperationType.RD_STOCKTAKE_IN,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: order.id,
                businessDocumentNumber: order.documentNo,
                businessDocumentLineId: line.id,
                operatorId: createdBy,
                idempotencyKey: `${DOCUMENT_TYPE}:${order.id}:in:${line.id}`,
                note: `RD 盘点调增: ${line.bookQty.toString()} -> ${line.countedQty.toString()}`,
              },
              tx,
            )
          : await this.inventoryService.decreaseStock(
              {
                materialId: line.materialId,
                stockScope: "RD_SUB",
                quantity: adjustmentQty.abs(),
                operationType: InventoryOperationType.RD_STOCKTAKE_OUT,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: order.id,
                businessDocumentNumber: order.documentNo,
                businessDocumentLineId: line.id,
                operatorId: createdBy,
                idempotencyKey: `${DOCUMENT_TYPE}:${order.id}:out:${line.id}`,
                note: `RD 盘点调减: ${line.bookQty.toString()} -> ${line.countedQty.toString()}`,
              },
              tx,
            );

        await this.repository.updateOrderLine(
          line.id,
          {
            inventoryLogId: log.id,
            updatedBy: createdBy,
          },
          tx,
        );
      }

      const result = await this.repository.findOrderById(order.id, tx);
      if (!result) {
        throw new NotFoundException(`RD 盘点调整单不存在: ${order.id}`);
      }
      return result;
    });
  }

  async voidOrder(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`RD 盘点调整单不存在: ${id}`);
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
      for (const line of order.lines) {
        if (!line.inventoryLogId) {
          continue;
        }
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: line.inventoryLogId,
            idempotencyKey: `${DOCUMENT_TYPE}:void:${id}:line:${line.id}`,
            note: `作废 RD 盘点调整单: ${order.documentNo}`,
          },
          tx,
        );
      }

      await this.repository.updateOrder(
        id,
        {
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          voidReason: voidReason ?? null,
          voidedBy: voidedBy ?? null,
          voidedAt: new Date(),
          updatedBy: voidedBy,
        },
        tx,
      );

      const result = await this.repository.findOrderById(id, tx);
      if (!result) {
        throw new NotFoundException(`RD 盘点调整单不存在: ${id}`);
      }
      return result;
    });
  }

  private assertUniqueMaterials(dto: CreateRdStocktakeOrderDto) {
    const seenMaterialIds = new Set<number>();
    for (const line of dto.lines) {
      if (seenMaterialIds.has(line.materialId)) {
        throw new BadRequestException(
          `同一张 RD 盘点调整单不能重复出现物料: ${line.materialId}`,
        );
      }
      seenMaterialIds.add(line.materialId);
    }
  }
}
