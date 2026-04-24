import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
} from "../../../../generated/prisma/client";
import {
  buildDashedTimestampDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import type { CreateRdStocktakeOrderDto } from "../dto/create-rd-stocktake-order.dto";
import type { QueryRdStocktakeOrderDto } from "../dto/query-rd-stocktake-order.dto";
import { RdStocktakeOrderRepository } from "../infrastructure/rd-stocktake-order.repository";

const DOCUMENT_TYPE = BusinessDocumentType.RdStocktakeOrder;
const BUSINESS_MODULE = "rd-subwarehouse";

@Injectable()
export class RdStocktakeOrderService {
  constructor(
    private readonly repository: RdStocktakeOrderRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly rdProjectLookupService: RdProjectLookupService,
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

  async listProjectOptions(workshopId?: number) {
    const resolvedWorkshopId = this.requireWorkshopId(workshopId);
    const result = await this.rdProjectLookupService.listEffectiveProjects({
      workshopId: resolvedWorkshopId,
      stockScope: "RD_SUB",
      limit: 200,
      offset: 0,
    });

    return {
      items: result.items.map((project) => ({
        id: project.id,
        projectCode: project.projectCode,
        projectName: project.projectName,
        workshopId: project.workshopId,
        workshopNameSnapshot: project.workshopNameSnapshot,
      })),
      total: result.total,
    };
  }

  async getProjectMaterialBookQty(params: {
    workshopId?: number;
    rdProjectId: number;
    materialId: number;
  }) {
    const workshopId = this.requireWorkshopId(params.workshopId);
    const [project] = await Promise.all([
      this.requireEffectiveRdProject(params.rdProjectId, workshopId),
      this.masterDataService.getMaterialById(params.materialId),
    ]);

    const bookQty = project.projectTargetId
      ? await this.inventoryService.getAttributedQuantitySnapshot({
          materialId: params.materialId,
          stockScope: "RD_SUB",
          projectTargetId: project.projectTargetId,
        })
      : new Prisma.Decimal(0);

    return {
      workshopId,
      rdProjectId: project.id,
      rdProjectCode: project.projectCode,
      rdProjectName: project.projectName,
      materialId: params.materialId,
      bookQty: bookQty.toString(),
    };
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`RD 盘点调整单不存在: ${id}`);
    }
    return order;
  }

  async createOrder(dto: CreateRdStocktakeOrderDto, createdBy?: string) {
    this.assertUniqueMaterials(dto);
    const workshopId = this.requireWorkshopId(dto.workshopId);

    await this.masterDataService.getWorkshopById(workshopId);
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode("RD_SUB");
    const bizDate = new Date(dto.bizDate);

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildDashedTimestampDocumentNo(
        "RDST",
        bizDate,
        attempt,
      );
      return this.repository.runInTransaction(async (tx) => {
        const projectTargetIdByProjectId = new Map<number, number>();
        const linesWithSnapshots = await Promise.all(
          dto.lines.map(async (line, idx) => {
            const material = await this.masterDataService.getMaterialById(
              line.materialId,
            );
            const rdProject = await this.requireEffectiveRdProject(
              line.rdProjectId,
              workshopId,
              tx,
            );
            const countedQty = new Prisma.Decimal(line.countedQty);
            let projectTargetId = projectTargetIdByProjectId.get(rdProject.id);
            if (projectTargetId == null) {
              projectTargetId =
                await this.rdProjectLookupService.ensureProjectTarget({
                  project: rdProject,
                  updatedBy: createdBy,
                  tx,
                });
              projectTargetIdByProjectId.set(rdProject.id, projectTargetId);
            }
            const bookQty =
              await this.inventoryService.getAttributedQuantitySnapshot(
                {
                  materialId: material.id,
                  stockScope: "RD_SUB",
                  projectTargetId,
                },
                tx,
              );
            const adjustmentQty = countedQty.sub(bookQty);

            return {
              lineNo: idx + 1,
              materialId: material.id,
              rdProjectId: rdProject.id,
              rdProjectCodeSnapshot: rdProject.projectCode,
              rdProjectNameSnapshot: rdProject.projectName,
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
            documentNo,
            bizDate,
            stockScopeId: stockScopeRecord.id,
            workshopId,
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
          if (!line.rdProjectId) {
            throw new BadRequestException("RD 盘点明细缺少研发项目归属");
          }
          const projectTargetId = projectTargetIdByProjectId.get(
            line.rdProjectId,
          );
          if (projectTargetId == null) {
            throw new BadRequestException("RD 盘点明细缺少项目目标映射");
          }
          const adjustmentQty = new Prisma.Decimal(line.adjustmentQty);
          if (adjustmentQty.eq(0)) {
            continue;
          }

          const log = adjustmentQty.gt(0)
            ? await this.inventoryService.increaseStock(
                {
                  materialId: line.materialId,
                  stockScope: "RD_SUB",
                  bizDate,
                  quantity: adjustmentQty,
                  operationType: InventoryOperationType.RD_STOCKTAKE_IN,
                  businessModule: BUSINESS_MODULE,
                  businessDocumentType: DOCUMENT_TYPE,
                  businessDocumentId: order.id,
                  businessDocumentNumber: order.documentNo,
                  businessDocumentLineId: line.id,
                  projectTargetId,
                  operatorId: createdBy,
                  idempotencyKey: `${DOCUMENT_TYPE}:${order.id}:in:${line.id}`,
                  note: `RD 盘点调增 / ${line.rdProjectCodeSnapshot ?? "未命名项目"}: ${line.bookQty.toString()} -> ${line.countedQty.toString()}`,
                },
                tx,
              )
            : await this.inventoryService.decreaseStock(
                {
                  materialId: line.materialId,
                  stockScope: "RD_SUB",
                  bizDate,
                  quantity: adjustmentQty.abs(),
                  operationType: InventoryOperationType.RD_STOCKTAKE_OUT,
                  businessModule: BUSINESS_MODULE,
                  businessDocumentType: DOCUMENT_TYPE,
                  businessDocumentId: order.id,
                  businessDocumentNumber: order.documentNo,
                  businessDocumentLineId: line.id,
                  projectTargetId,
                  operatorId: createdBy,
                  idempotencyKey: `${DOCUMENT_TYPE}:${order.id}:out:${line.id}`,
                  note: `RD 盘点调减 / ${line.rdProjectCodeSnapshot ?? "未命名项目"}: ${line.bookQty.toString()} -> ${line.countedQty.toString()}`,
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

    return this.repository.runInTransaction(async (tx) => {
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
    const seenMaterialKeys = new Set<string>();
    for (const line of dto.lines) {
      const key = `${line.materialId}:${line.rdProjectId}`;
      if (seenMaterialKeys.has(key)) {
        throw new BadRequestException(
          `同一张 RD 盘点调整单不能重复出现相同项目物料: ${line.materialId}`,
        );
      }
      seenMaterialKeys.add(key);
    }
  }

  private requireWorkshopId(workshopId?: number) {
    if (!workshopId || workshopId < 1) {
      throw new BadRequestException("workshopId 必填");
    }
    return workshopId;
  }

  private async requireEffectiveRdProject(
    rdProjectId: number,
    workshopId: number,
    tx?: Prisma.TransactionClient,
  ) {
    const project =
      await this.rdProjectLookupService.requireEffectiveProjectById(
        rdProjectId,
        tx,
      );
    if (project.workshopId !== workshopId) {
      throw new BadRequestException(
        `研发项目与盘点业务车间不一致: ${project.projectCode}`,
      );
    }
    return project;
  }
}
