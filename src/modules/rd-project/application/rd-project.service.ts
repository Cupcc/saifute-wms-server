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
  type Prisma,
  Prisma as PrismaNamespace,
  ProjectTargetType,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { type StockScopeCode } from "../../session/domain/user-session";
import type { CreateRdProjectDto } from "../dto/create-rd-project.dto";
import type { CreateRdProjectMaterialActionDto } from "../dto/create-rd-project-material-action.dto";
import type { QueryRdProjectDto } from "../dto/query-rd-project.dto";
import type { QueryRdProjectMaterialActionDto } from "../dto/query-rd-project-material-action.dto";
import type { UpdateRdProjectDto } from "../dto/update-rd-project.dto";
import {
  RD_PROJECT_ACTION_DOCUMENT_TYPE,
  RD_PROJECT_DOCUMENT_TYPE,
} from "./rd-project.shared";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";

const BUSINESS_MODULE = "rd-project";
const RD_PROJECT_STOCK_SCOPE: StockScopeCode = "RD_SUB";
const RD_PROJECT_LABEL = "研发项目";
const RD_PROJECT_ACTION_LABEL = "研发项目物料动作";

type RdProjectRecord = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findProjectById"]>>
>;
type RdProjectActionRecord = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findMaterialActionById"]>>
>;

function toDecimal(
  value: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
  if (value == null) {
    return new PrismaNamespace.Decimal(0);
  }
  return new PrismaNamespace.Decimal(value);
}

function decimalMax(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): Prisma.Decimal {
  return left.gte(right) ? left : right;
}

function actionPrefix(actionType: RdProjectMaterialActionType) {
  switch (actionType) {
    case RdProjectMaterialActionType.PICK:
      return "PJPK";
    case RdProjectMaterialActionType.RETURN:
      return "PJRT";
    case RdProjectMaterialActionType.SCRAP:
      return "PJSC";
    default:
      throw new BadRequestException(`Unsupported actionType: ${actionType}`);
  }
}

function actionOperationType(actionType: RdProjectMaterialActionType) {
  switch (actionType) {
    case RdProjectMaterialActionType.PICK:
      return InventoryOperationType.RD_PROJECT_OUT;
    case RdProjectMaterialActionType.RETURN:
      return InventoryOperationType.RETURN_IN;
    case RdProjectMaterialActionType.SCRAP:
      return InventoryOperationType.SCRAP_OUT;
    default:
      throw new BadRequestException(`Unsupported actionType: ${actionType}`);
  }
}

function replenishmentStatusLabel(params: {
  shortageQty: Prisma.Decimal;
  procurementOpenQty: Prisma.Decimal;
}) {
  if (params.shortageQty.lte(0)) {
    return "充足";
  }
  if (params.procurementOpenQty.gt(0)) {
    return "补货中";
  }
  return "待补货";
}

@Injectable()
export class RdProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RdProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly rdProcurementRequestService: RdProcurementRequestService,
  ) {}

  async listProjects(
    query: QueryRdProjectDto & { stockScope?: StockScopeCode },
  ) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findProjects({
      projectCode: query.projectCode,
      projectName: query.projectName,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      customerId: query.customerId,
      supplierId: query.supplierId,
      workshopId: query.workshopId,
      stockScope: RD_PROJECT_STOCK_SCOPE,
      limit,
      offset,
    });
  }

  async getProjectById(id: number) {
    const project = await this.requireProject(id);
    return this.buildProjectView(project);
  }

  async createProject(
    dto: CreateRdProjectDto & { stockScope?: StockScopeCode },
    createdBy?: string,
  ) {
    const existing = await this.repository.findProjectByCode(dto.projectCode);
    if (existing) {
      throw new ConflictException(`研发项目编码已存在: ${dto.projectCode}`);
    }

    await this.validateMasterData(dto);

    const bizDate = new Date(dto.bizDate);
    const customerSnapshot = dto.customerId
      ? await this.resolveCustomerSnapshot(dto.customerId)
      : { customerCodeSnapshot: null, customerNameSnapshot: null };
    const supplierSnapshot = dto.supplierId
      ? await this.resolveSupplierSnapshot(dto.supplierId)
      : { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    const managerSnapshot = dto.managerPersonnelId
      ? await this.resolveManagerSnapshot(dto.managerPersonnelId)
      : { managerNameSnapshot: null };
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      RD_PROJECT_STOCK_SCOPE,
    );
    const bomLines = await this.buildBomLines(dto.bomLines ?? [], createdBy);
    const totalQty = bomLines.reduce(
      (sum, line) => sum.add(line.quantity),
      new PrismaNamespace.Decimal(0),
    );
    const totalAmount = bomLines.reduce(
      (sum, line) => sum.add(line.amount),
      new PrismaNamespace.Decimal(0),
    );

    return this.prisma.runInTransaction(async (tx) => {
      const project = await this.repository.createProject(
        {
          projectCode: dto.projectCode,
          projectName: dto.projectName,
          bizDate,
          customerId: dto.customerId,
          supplierId: dto.supplierId,
          managerPersonnelId: dto.managerPersonnelId,
          stockScopeId: stockScopeRecord.id,
          workshopId: dto.workshopId,
          customerCodeSnapshot: customerSnapshot.customerCodeSnapshot,
          customerNameSnapshot: customerSnapshot.customerNameSnapshot,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
          managerNameSnapshot: managerSnapshot.managerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          createdBy,
          updatedBy: createdBy,
        },
        bomLines,
        tx,
      );
      await this.ensureProjectTarget(project, createdBy, tx);
      const latest = await this.repository.findProjectById(project.id, tx);
      if (!latest) {
        throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${project.id}`);
      }
      return this.buildProjectView(latest, tx);
    });
  }

  async updateProject(
    id: number,
    dto: UpdateRdProjectDto & { stockScope?: StockScopeCode },
    updatedBy?: string,
  ) {
    const existing = await this.requireProject(id);
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的研发项目不能修改");
    }

    if (dto.projectCode && dto.projectCode !== existing.projectCode) {
      const conflict = await this.repository.findProjectByCode(dto.projectCode);
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`研发项目编码已存在: ${dto.projectCode}`);
      }
      const hasProcurement = await this.hasActiveProcurementRequests(
        existing.projectCode,
        existing.workshopId,
      );
      if (hasProcurement) {
        throw new BadRequestException("已有采购补货关联，不能修改研发项目编码");
      }
      if (await this.repository.hasEffectiveMaterialActions(id)) {
        throw new BadRequestException(
          "已有研发项目物料动作，不能修改研发项目编码",
        );
      }
    }

    await this.validateMasterDataForUpdate(dto);

    const finalProjectCode = dto.projectCode ?? existing.projectCode;
    const finalProjectName = dto.projectName ?? existing.projectName;
    const finalCustomerId = dto.customerId ?? existing.customerId ?? undefined;
    const finalSupplierId = dto.supplierId ?? existing.supplierId ?? undefined;
    const finalManagerId =
      dto.managerPersonnelId ?? existing.managerPersonnelId ?? undefined;
    const finalWorkshopId = dto.workshopId ?? existing.workshopId;
    const bizDate = dto.bizDate ? new Date(dto.bizDate) : existing.bizDate;
    const customerSnapshot = finalCustomerId
      ? await this.resolveCustomerSnapshot(finalCustomerId)
      : { customerCodeSnapshot: null, customerNameSnapshot: null };
    const supplierSnapshot = finalSupplierId
      ? await this.resolveSupplierSnapshot(finalSupplierId)
      : { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    const managerSnapshot = finalManagerId
      ? await this.resolveManagerSnapshot(finalManagerId)
      : { managerNameSnapshot: null };
    const workshop =
      await this.masterDataService.getWorkshopById(finalWorkshopId);
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      RD_PROJECT_STOCK_SCOPE,
    );
    const nextBomLines =
      dto.bomLines !== undefined
        ? await this.buildBomLines(dto.bomLines, updatedBy)
        : existing.bomLines;
    const totalQty = nextBomLines.reduce(
      (sum, line) => sum.add(toDecimal(line.quantity)),
      new PrismaNamespace.Decimal(0),
    );
    const totalAmount = nextBomLines.reduce(
      (sum, line) => sum.add(toDecimal(line.amount)),
      new PrismaNamespace.Decimal(0),
    );

    return this.prisma.runInTransaction(async (tx) => {
      await this.repository.updateProject(
        id,
        {
          projectCode: finalProjectCode,
          projectName: finalProjectName,
          bizDate,
          customerId: finalCustomerId,
          supplierId: finalSupplierId,
          managerPersonnelId: finalManagerId,
          stockScopeId: stockScopeRecord.id,
          workshopId: finalWorkshopId,
          customerCodeSnapshot: customerSnapshot.customerCodeSnapshot,
          customerNameSnapshot: customerSnapshot.customerNameSnapshot,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
          managerNameSnapshot: managerSnapshot.managerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark ?? existing.remark,
          revisionNo: { increment: 1 },
          updatedBy,
        },
        tx,
      );

      if (dto.bomLines !== undefined) {
        await this.repository.replaceProjectBomLines(
          id,
          nextBomLines.map((line, index) => ({
            lineNo: index + 1,
            materialId: line.materialId,
            materialCodeSnapshot: line.materialCodeSnapshot,
            materialNameSnapshot: line.materialNameSnapshot,
            materialSpecSnapshot: line.materialSpecSnapshot,
            unitCodeSnapshot: line.unitCodeSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
            remark: line.remark,
            createdBy: updatedBy,
            updatedBy,
          })),
          tx,
        );
      }

      await this.syncProjectTarget(
        {
          id,
          projectCode: finalProjectCode,
          projectName: finalProjectName,
          projectTargetId: existing.projectTargetId,
        },
        updatedBy,
        tx,
      );

      const latest = await this.repository.findProjectById(id, tx);
      if (!latest) {
        throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${id}`);
      }
      return this.buildProjectView(latest, tx);
    });
  }

  async voidProject(id: number, voidReason?: string, voidedBy?: string) {
    const project = await this.requireProject(id);
    if (project.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("研发项目已作废");
    }
    if (await this.repository.hasEffectiveMaterialActions(id)) {
      throw new BadRequestException("存在研发项目物料动作，不能作废研发项目");
    }
    if (
      await this.hasActiveProcurementRequests(
        project.projectCode,
        project.workshopId,
      )
    ) {
      throw new BadRequestException("存在采购补货记录，不能作废项目");
    }

    return this.prisma.runInTransaction(async (tx) => {
      if (await this.repository.hasActiveDownstreamDependencies(id, tx)) {
        throw new BadRequestException("存在下游依赖，不能作废");
      }

      await this.repository.updateProject(
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

      const latest = await this.repository.findProjectById(id, tx);
      if (!latest) {
        throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${id}`);
      }
      return this.buildProjectView(latest, tx);
    });
  }

  async listMaterials(projectId: number) {
    const project = await this.requireProject(projectId);
    const detail = await this.buildProjectView(project);
    return detail.materialLedger;
  }

  async listMaterialActions(
    projectId: number,
    query: QueryRdProjectMaterialActionDto,
  ) {
    await this.requireProject(projectId);
    const actions =
      await this.repository.findMaterialActionsByProjectId(projectId);
    const filtered = actions.filter((action) => {
      if (query.actionType && action.actionType !== query.actionType) {
        return false;
      }
      if (
        query.materialId &&
        !action.lines.some((line) => line.materialId === query.materialId)
      ) {
        return false;
      }
      return true;
    });
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 100);
    return {
      total: filtered.length,
      items: filtered.slice(offset, offset + limit),
    };
  }

  async getMaterialActionById(id: number) {
    const action = await this.repository.findMaterialActionById(id);
    if (!action) {
      throw new NotFoundException(`${RD_PROJECT_ACTION_LABEL}不存在: ${id}`);
    }
    return action;
  }

  async createMaterialAction(
    projectId: number,
    dto: CreateRdProjectMaterialActionDto,
    createdBy?: string,
  ) {
    const project = await this.requireProject(projectId);
    if (project.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的研发项目不能新增物料动作");
    }

    const effectiveBomLines = this.getEffectiveBomLines(project);
    const bomMaterialIds = new Set(
      effectiveBomLines.map((line) => line.materialId),
    );
    if (bomMaterialIds.size === 0) {
      throw new BadRequestException(
        "请先维护研发项目 BOM，再录入研发项目物料动作",
      );
    }

    await this.validateMaterialActionMasterData(dto);
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      RD_PROJECT_STOCK_SCOPE,
    );
    const bizDate = new Date(dto.bizDate);
    const actionLines = await Promise.all(
      dto.lines.map(async (line, index) => {
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
        if (!bomMaterialIds.has(material.id)) {
          throw new BadRequestException(
            `物料未在研发项目 BOM 中维护: ${material.materialCode}`,
          );
        }
        const quantity = toDecimal(line.quantity);
        const unitPrice = toDecimal(line.unitPrice);
        return {
          lineNo: index + 1,
          materialId: material.id,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity,
          unitPrice,
          amount: quantity.mul(unitPrice),
          sourceDocumentType: line.sourceDocumentType,
          sourceDocumentId: line.sourceDocumentId,
          sourceDocumentLineId: line.sourceDocumentLineId,
          remark: line.remark,
          createdBy,
          updatedBy: createdBy,
        };
      }),
    );

    if (dto.actionType === RdProjectMaterialActionType.RETURN) {
      await this.validateReturnSources(actionLines, projectId);
    }

    const totalQty = actionLines.reduce(
      (sum, line) => sum.add(line.quantity),
      new PrismaNamespace.Decimal(0),
    );
    const totalAmount = actionLines.reduce(
      (sum, line) => sum.add(line.amount),
      new PrismaNamespace.Decimal(0),
    );

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildCompactDocumentNo(
        actionPrefix(dto.actionType),
        bizDate,
        attempt,
      );
      return this.prisma.runInTransaction(async (tx) => {
        const currentProject = await this.repository.findProjectById(
          projectId,
          tx,
        );
        if (!currentProject) {
          throw new NotFoundException(
            `${RD_PROJECT_LABEL}不存在: ${projectId}`,
          );
        }
        const projectTargetId = await this.ensureProjectTarget(
          currentProject,
          createdBy,
          tx,
        );
        const action = await this.repository.createMaterialAction(
          {
            documentNo,
            projectId,
            actionType: dto.actionType,
            bizDate,
            stockScopeId: stockScopeRecord.id,
            workshopId: currentProject.workshopId,
            totalQty,
            totalAmount,
            remark: dto.remark,
            createdBy,
            updatedBy: createdBy,
          },
          actionLines,
          tx,
        );

        if (dto.actionType === RdProjectMaterialActionType.PICK) {
          for (const line of action.lines) {
            const settlement = await this.inventoryService.settleConsumerOut(
              {
                materialId: line.materialId,
                stockScope: RD_PROJECT_STOCK_SCOPE,
                bizDate,
                quantity: line.quantity,
                operationType: actionOperationType(dto.actionType),
                businessModule: BUSINESS_MODULE,
                businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
                businessDocumentId: action.id,
                businessDocumentNumber: action.documentNo,
                businessDocumentLineId: line.id,
                projectTargetId,
                operatorId: createdBy,
                idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:${action.id}:line:${line.id}`,
                consumerLineId: line.id,
                sourceOperationTypes: [
                  "RD_HANDOFF_IN",
                ] as typeof FIFO_SOURCE_OPERATION_TYPES,
              },
              tx,
            );
            await this.repository.updateMaterialActionLineCost(
              line.id,
              {
                costUnitPrice: settlement.settledUnitCost,
                costAmount: settlement.settledCostAmount,
              },
              tx,
            );
          }
        } else if (dto.actionType === RdProjectMaterialActionType.SCRAP) {
          for (const line of action.lines) {
            const settlement = await this.inventoryService.settleConsumerOut(
              {
                materialId: line.materialId,
                stockScope: RD_PROJECT_STOCK_SCOPE,
                bizDate,
                quantity: line.quantity,
                operationType: actionOperationType(dto.actionType),
                businessModule: BUSINESS_MODULE,
                businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
                businessDocumentId: action.id,
                businessDocumentNumber: action.documentNo,
                businessDocumentLineId: line.id,
                projectTargetId,
                operatorId: createdBy,
                idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:${action.id}:line:${line.id}`,
                consumerLineId: line.id,
                sourceOperationTypes: [
                  "RD_HANDOFF_IN",
                ] as typeof FIFO_SOURCE_OPERATION_TYPES,
              },
              tx,
            );
            await this.repository.updateMaterialActionLineCost(
              line.id,
              {
                costUnitPrice: settlement.settledUnitCost,
                costAmount: settlement.settledCostAmount,
              },
              tx,
            );
          }
        } else {
          for (const line of action.lines) {
            if (
              !line.sourceDocumentType ||
              !line.sourceDocumentId ||
              !line.sourceDocumentLineId
            ) {
              throw new BadRequestException("退料必须关联上游领料明细");
            }
            const releaseResult = await this.releaseProjectSourceUsageForReturn(
              line.sourceDocumentId,
              line.sourceDocumentLineId,
              line.quantity,
              createdBy,
              tx,
            );
            await this.inventoryService.increaseStock(
              {
                materialId: line.materialId,
                stockScope: RD_PROJECT_STOCK_SCOPE,
                bizDate,
                quantity: line.quantity,
                operationType: actionOperationType(dto.actionType),
                businessModule: BUSINESS_MODULE,
                businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
                businessDocumentId: action.id,
                businessDocumentNumber: action.documentNo,
                businessDocumentLineId: line.id,
                projectTargetId,
                operatorId: createdBy,
                idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:${action.id}:line:${line.id}`,
                unitCost: releaseResult.costUnitPrice,
                costAmount: releaseResult.costAmount,
              },
              tx,
            );
            await this.repository.updateMaterialActionLineCost(
              line.id,
              {
                costUnitPrice: releaseResult.costUnitPrice,
                costAmount: releaseResult.costAmount,
              },
              tx,
            );
          }
        }

        const latest = await this.repository.findMaterialActionById(
          action.id,
          tx,
        );
        if (!latest) {
          throw new NotFoundException(
            `${RD_PROJECT_ACTION_LABEL}不存在: ${action.id}`,
          );
        }
        return latest;
      });
    });
  }

  async voidMaterialAction(
    actionId: number,
    voidReason?: string,
    voidedBy?: string,
  ) {
    const action = await this.getMaterialActionById(actionId);
    if (action.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("研发项目物料动作已作废");
    }
    if (action.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.repository.findMaterialActionById(
        actionId,
        tx,
      );
      if (!current) {
        throw new NotFoundException(
          `${RD_PROJECT_ACTION_LABEL}不存在: ${actionId}`,
        );
      }

      if (current.actionType === RdProjectMaterialActionType.PICK) {
        if (await this.repository.hasActiveReturnDownstream(actionId, tx)) {
          throw new BadRequestException(
            "存在未作废的下游退料，不能作废领料动作",
          );
        }
        await this.inventoryService.releaseAllSourceUsagesForConsumer(
          {
            consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
            consumerDocumentId: actionId,
            operatorId: voidedBy,
          },
          tx,
        );
      }

      if (current.actionType === RdProjectMaterialActionType.SCRAP) {
        await this.inventoryService.releaseAllSourceUsagesForConsumer(
          {
            consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
            consumerDocumentId: actionId,
            operatorId: voidedBy,
          },
          tx,
        );
      }

      if (current.actionType === RdProjectMaterialActionType.RETURN) {
        for (const line of current.lines) {
          if (
            line.sourceDocumentId != null &&
            line.sourceDocumentLineId != null
          ) {
            await this.restoreProjectSourceUsageForReturnVoid(
              line.sourceDocumentId,
              line.sourceDocumentLineId,
              toDecimal(line.quantity),
              voidedBy,
              tx,
            );
          }
        }
      }

      const logs = await this.inventoryService.getLogsForDocument(
        {
          businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          businessDocumentId: actionId,
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
            idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:void:${actionId}:log:${log.id}`,
            note: `作废研发项目物料动作: ${current.documentNo}`,
          },
          tx,
        );
      }

      await this.repository.updateMaterialAction(
        actionId,
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

      const latest = await this.repository.findMaterialActionById(actionId, tx);
      if (!latest) {
        throw new NotFoundException(
          `${RD_PROJECT_ACTION_LABEL}不存在: ${actionId}`,
        );
      }
      return latest;
    });
  }

  private async requireProject(id: number, tx?: Prisma.TransactionClient) {
    const project = await this.repository.findProjectById(id, tx);
    if (!project) {
      throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${id}`);
    }
    return project;
  }

  private getEffectiveBomLines(project: RdProjectRecord) {
    if (project.bomLines.length > 0) {
      return project.bomLines;
    }
    return project.materialLines.map((line) => ({
      ...line,
    }));
  }

  private async buildProjectView(
    project: RdProjectRecord,
    tx?: Prisma.TransactionClient,
  ) {
    const procurementSummary = await this.loadProcurementSummary(
      project.projectCode,
      project.workshopId,
    );
    const bomLines = this.getEffectiveBomLines(project);
    const effectiveActions = project.materialActions.filter(
      (action) => action.lifecycleStatus === DocumentLifecycleStatus.EFFECTIVE,
    );

    const ledgerSeed = new Map<
      number,
      {
        materialId: number;
        materialCodeSnapshot: string;
        materialNameSnapshot: string;
        materialSpecSnapshot: string | null;
        unitCodeSnapshot: string;
        plannedQty: Prisma.Decimal;
        plannedUnitPrice: Prisma.Decimal;
        plannedAmount: Prisma.Decimal;
        pickedQty: Prisma.Decimal;
        pickedCostAmount: Prisma.Decimal;
        returnedQty: Prisma.Decimal;
        returnedCostAmount: Prisma.Decimal;
        scrappedQty: Prisma.Decimal;
        scrappedCostAmount: Prisma.Decimal;
        remark: string | null;
      }
    >();

    for (const line of bomLines) {
      ledgerSeed.set(line.materialId, {
        materialId: line.materialId,
        materialCodeSnapshot: line.materialCodeSnapshot,
        materialNameSnapshot: line.materialNameSnapshot,
        materialSpecSnapshot: line.materialSpecSnapshot,
        unitCodeSnapshot: line.unitCodeSnapshot,
        plannedQty: toDecimal(line.quantity),
        plannedUnitPrice: toDecimal(line.unitPrice),
        plannedAmount: toDecimal(line.amount),
        pickedQty: new PrismaNamespace.Decimal(0),
        pickedCostAmount: new PrismaNamespace.Decimal(0),
        returnedQty: new PrismaNamespace.Decimal(0),
        returnedCostAmount: new PrismaNamespace.Decimal(0),
        scrappedQty: new PrismaNamespace.Decimal(0),
        scrappedCostAmount: new PrismaNamespace.Decimal(0),
        remark: line.remark ?? null,
      });
    }

    for (const legacyLine of project.materialLines) {
      const current = ledgerSeed.get(legacyLine.materialId) ?? {
        materialId: legacyLine.materialId,
        materialCodeSnapshot: legacyLine.materialCodeSnapshot,
        materialNameSnapshot: legacyLine.materialNameSnapshot,
        materialSpecSnapshot: legacyLine.materialSpecSnapshot,
        unitCodeSnapshot: legacyLine.unitCodeSnapshot,
        plannedQty: new PrismaNamespace.Decimal(0),
        plannedUnitPrice: new PrismaNamespace.Decimal(0),
        plannedAmount: new PrismaNamespace.Decimal(0),
        pickedQty: new PrismaNamespace.Decimal(0),
        pickedCostAmount: new PrismaNamespace.Decimal(0),
        returnedQty: new PrismaNamespace.Decimal(0),
        returnedCostAmount: new PrismaNamespace.Decimal(0),
        scrappedQty: new PrismaNamespace.Decimal(0),
        scrappedCostAmount: new PrismaNamespace.Decimal(0),
        remark: legacyLine.remark ?? null,
      };
      current.pickedQty = current.pickedQty.add(toDecimal(legacyLine.quantity));
      current.pickedCostAmount = current.pickedCostAmount.add(
        toDecimal(legacyLine.costAmount),
      );
      ledgerSeed.set(legacyLine.materialId, current);
    }

    for (const action of effectiveActions) {
      for (const line of action.lines) {
        const current = ledgerSeed.get(line.materialId) ?? {
          materialId: line.materialId,
          materialCodeSnapshot: line.materialCodeSnapshot,
          materialNameSnapshot: line.materialNameSnapshot,
          materialSpecSnapshot: line.materialSpecSnapshot,
          unitCodeSnapshot: line.unitCodeSnapshot,
          plannedQty: new PrismaNamespace.Decimal(0),
          plannedUnitPrice: new PrismaNamespace.Decimal(0),
          plannedAmount: new PrismaNamespace.Decimal(0),
          pickedQty: new PrismaNamespace.Decimal(0),
          pickedCostAmount: new PrismaNamespace.Decimal(0),
          returnedQty: new PrismaNamespace.Decimal(0),
          returnedCostAmount: new PrismaNamespace.Decimal(0),
          scrappedQty: new PrismaNamespace.Decimal(0),
          scrappedCostAmount: new PrismaNamespace.Decimal(0),
          remark: line.remark ?? null,
        };

        if (action.actionType === RdProjectMaterialActionType.PICK) {
          current.pickedQty = current.pickedQty.add(toDecimal(line.quantity));
          current.pickedCostAmount = current.pickedCostAmount.add(
            toDecimal(line.costAmount),
          );
        } else if (action.actionType === RdProjectMaterialActionType.RETURN) {
          current.returnedQty = current.returnedQty.add(
            toDecimal(line.quantity),
          );
          current.returnedCostAmount = current.returnedCostAmount.add(
            toDecimal(line.costAmount),
          );
        } else if (action.actionType === RdProjectMaterialActionType.SCRAP) {
          current.scrappedQty = current.scrappedQty.add(
            toDecimal(line.quantity),
          );
          current.scrappedCostAmount = current.scrappedCostAmount.add(
            toDecimal(line.costAmount),
          );
        }

        ledgerSeed.set(line.materialId, current);
      }
    }

    const materialLedger = await Promise.all(
      Array.from(ledgerSeed.values()).map(async (row) => {
        const availableBalance = await this.inventoryService.getBalanceSnapshot(
          {
            materialId: row.materialId,
            stockScope: RD_PROJECT_STOCK_SCOPE,
          },
          tx,
        );
        const availableQty = toDecimal(availableBalance?.quantityOnHand);
        const procurement = procurementSummary.get(row.materialId) ?? {
          pendingQty: new PrismaNamespace.Decimal(0),
          inProcurementQty: new PrismaNamespace.Decimal(0),
          acceptedQty: new PrismaNamespace.Decimal(0),
          handedOffQty: new PrismaNamespace.Decimal(0),
        };
        const procurementOpenQty = procurement.pendingQty
          .add(procurement.inProcurementQty)
          .add(procurement.acceptedQty);
        const netUsedQty = row.pickedQty
          .sub(row.returnedQty)
          .add(row.scrappedQty);
        const netUsedCostAmount = row.pickedCostAmount
          .sub(row.returnedCostAmount)
          .add(row.scrappedCostAmount);
        const remainingDemandQty = decimalMax(
          row.plannedQty.sub(netUsedQty),
          new PrismaNamespace.Decimal(0),
        );
        const shortageQty = decimalMax(
          remainingDemandQty.sub(availableQty).sub(procurementOpenQty),
          new PrismaNamespace.Decimal(0),
        );

        return {
          ...row,
          availableQty,
          currentAvailableQty: availableQty,
          procurementPendingQty: procurement.pendingQty,
          procurementInProcurementQty: procurement.inProcurementQty,
          procurementAcceptedQty: procurement.acceptedQty,
          procurementHandedOffQty: procurement.handedOffQty,
          procurementOpenQty,
          netUsedQty,
          netConsumedQty: netUsedQty,
          netUsedCostAmount,
          netCost: netUsedCostAmount,
          pickedCost: row.pickedCostAmount,
          returnedCost: row.returnedCostAmount,
          scrappedCost: row.scrappedCostAmount,
          remainingDemandQty,
          shortageQty,
          replenishmentStatus: replenishmentStatusLabel({
            shortageQty,
            procurementOpenQty,
          }),
        };
      }),
    );

    const summary = materialLedger.reduce(
      (acc, row) => ({
        plannedQty: acc.plannedQty.add(row.plannedQty),
        plannedAmount: acc.plannedAmount.add(row.plannedAmount),
        availableQty: acc.availableQty.add(row.availableQty),
        pickedQty: acc.pickedQty.add(row.pickedQty),
        pickedCostAmount: acc.pickedCostAmount.add(row.pickedCostAmount),
        returnedQty: acc.returnedQty.add(row.returnedQty),
        returnedCostAmount: acc.returnedCostAmount.add(row.returnedCostAmount),
        scrappedQty: acc.scrappedQty.add(row.scrappedQty),
        scrappedCostAmount: acc.scrappedCostAmount.add(row.scrappedCostAmount),
        netUsedQty: acc.netUsedQty.add(row.netUsedQty),
        netUsedCostAmount: acc.netUsedCostAmount.add(row.netUsedCostAmount),
        shortageQty: acc.shortageQty.add(row.shortageQty),
      }),
      {
        plannedQty: new PrismaNamespace.Decimal(0),
        plannedAmount: new PrismaNamespace.Decimal(0),
        availableQty: new PrismaNamespace.Decimal(0),
        pickedQty: new PrismaNamespace.Decimal(0),
        pickedCostAmount: new PrismaNamespace.Decimal(0),
        returnedQty: new PrismaNamespace.Decimal(0),
        returnedCostAmount: new PrismaNamespace.Decimal(0),
        scrappedQty: new PrismaNamespace.Decimal(0),
        scrappedCostAmount: new PrismaNamespace.Decimal(0),
        netUsedQty: new PrismaNamespace.Decimal(0),
        netUsedCostAmount: new PrismaNamespace.Decimal(0),
        shortageQty: new PrismaNamespace.Decimal(0),
      },
    );

    const ledgerSummary = {
      ...summary,
      pickedCost: summary.pickedCostAmount,
      returnedCost: summary.returnedCostAmount,
      scrappedCost: summary.scrappedCostAmount,
      netCost: summary.netUsedCostAmount,
      shortageLineCount: materialLedger.filter((row) => row.shortageQty.gt(0))
        .length,
    };

    return {
      ...project,
      fixedStockScope: RD_PROJECT_STOCK_SCOPE,
      materialLedger,
      summary,
      ledgerSummary,
      hasShortage: materialLedger.some((row) => row.shortageQty.gt(0)),
    };
  }

  private async loadProcurementSummary(
    projectCode: string,
    workshopId: number,
  ) {
    const result = await this.rdProcurementRequestService.listRequests({
      projectCode,
      workshopId,
      limit: 100,
      offset: 0,
    });
    const summary = new Map<
      number,
      {
        pendingQty: Prisma.Decimal;
        inProcurementQty: Prisma.Decimal;
        acceptedQty: Prisma.Decimal;
        handedOffQty: Prisma.Decimal;
      }
    >();

    for (const request of result.items) {
      for (const line of request.lines) {
        const current = summary.get(line.materialId) ?? {
          pendingQty: new PrismaNamespace.Decimal(0),
          inProcurementQty: new PrismaNamespace.Decimal(0),
          acceptedQty: new PrismaNamespace.Decimal(0),
          handedOffQty: new PrismaNamespace.Decimal(0),
        };
        const statusLedger = (line.statusLedger ?? {}) as {
          pendingQty?: Prisma.Decimal | number | string | null;
          inProcurementQty?: Prisma.Decimal | number | string | null;
          acceptedQty?: Prisma.Decimal | number | string | null;
          handedOffQty?: Prisma.Decimal | number | string | null;
        };
        current.pendingQty = current.pendingQty.add(
          toDecimal(statusLedger.pendingQty),
        );
        current.inProcurementQty = current.inProcurementQty.add(
          toDecimal(statusLedger.inProcurementQty),
        );
        current.acceptedQty = current.acceptedQty.add(
          toDecimal(statusLedger.acceptedQty),
        );
        current.handedOffQty = current.handedOffQty.add(
          toDecimal(statusLedger.handedOffQty),
        );
        summary.set(line.materialId, current);
      }
    }

    return summary;
  }

  private async buildBomLines(
    lines: Array<{
      materialId: number;
      quantity: string;
      unitPrice?: string;
      remark?: string;
    }>,
    operatorId?: string,
  ) {
    return Promise.all(
      lines.map(async (line, index) => {
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
        const quantity = toDecimal(line.quantity);
        const unitPrice = toDecimal(line.unitPrice);
        return {
          lineNo: index + 1,
          materialId: material.id,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity,
          unitPrice,
          amount: quantity.mul(unitPrice),
          remark: line.remark,
          createdBy: operatorId,
          updatedBy: operatorId,
        };
      }),
    );
  }

  private async validateReturnSources(
    lines: Array<{
      quantity: Prisma.Decimal;
      materialId: number;
      sourceDocumentType?: string | null;
      sourceDocumentId?: number | null;
      sourceDocumentLineId?: number | null;
    }>,
    projectId: number,
  ) {
    const incomingByAction = new Map<number, Map<number, Prisma.Decimal>>();
    const sourceActionCache = new Map<number, RdProjectActionRecord>();

    for (const line of lines) {
      if (!line.sourceDocumentId || !line.sourceDocumentLineId) {
        throw new BadRequestException("退料必须关联上游领料明细");
      }
      const sourceType =
        line.sourceDocumentType ?? RD_PROJECT_ACTION_DOCUMENT_TYPE;
      if (sourceType !== RD_PROJECT_ACTION_DOCUMENT_TYPE) {
        throw new BadRequestException("研发项目退料只能回冲研发项目领料动作");
      }

      let sourceAction = sourceActionCache.get(line.sourceDocumentId);
      if (!sourceAction) {
        sourceAction = await this.getMaterialActionById(line.sourceDocumentId);
        sourceActionCache.set(line.sourceDocumentId, sourceAction);
      }
      if (sourceAction.projectId !== projectId) {
        throw new BadRequestException("退料上游领料不属于当前项目");
      }
      if (sourceAction.actionType !== RdProjectMaterialActionType.PICK) {
        throw new BadRequestException("退料上游必须是领料动作");
      }
      if (sourceAction.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
        throw new BadRequestException("退料上游领料已作废");
      }

      const sourceLine = sourceAction.lines.find(
        (item) => item.id === line.sourceDocumentLineId,
      );
      if (!sourceLine) {
        throw new BadRequestException(
          `退料上游明细不存在: ${line.sourceDocumentLineId}`,
        );
      }
      if (sourceLine.materialId !== line.materialId) {
        throw new BadRequestException("退料物料必须与上游领料明细一致");
      }

      const lineTotals =
        incomingByAction.get(sourceAction.id) ??
        new Map<number, Prisma.Decimal>();
      const current =
        lineTotals.get(sourceLine.id) ?? new PrismaNamespace.Decimal(0);
      lineTotals.set(sourceLine.id, current.add(line.quantity));
      incomingByAction.set(sourceAction.id, lineTotals);
    }

    for (const [actionId, lineTotals] of incomingByAction) {
      const returnedMap =
        await this.repository.sumActiveReturnedQtyBySourceLine(actionId);
      const sourceAction = sourceActionCache.get(actionId);
      if (!sourceAction) {
        throw new NotFoundException(
          `${RD_PROJECT_ACTION_LABEL}不存在: ${actionId}`,
        );
      }
      for (const [sourceLineId, incomingQty] of lineTotals) {
        const sourceLine = sourceAction.lines.find(
          (item) => item.id === sourceLineId,
        );
        if (!sourceLine) {
          throw new BadRequestException(`退料上游明细不存在: ${sourceLineId}`);
        }
        const alreadyReturned =
          returnedMap.get(sourceLineId) ?? new PrismaNamespace.Decimal(0);
        if (
          alreadyReturned.add(incomingQty).gt(toDecimal(sourceLine.quantity))
        ) {
          throw new BadRequestException(
            `上游领料明细 ${sourceLineId} 累计退料数量超过领料数量`,
          );
        }
      }
    }
  }

  private async releaseProjectSourceUsageForReturn(
    sourceActionId: number,
    sourceLineId: number,
    quantityToRelease: Prisma.Decimal,
    operatorId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          consumerDocumentId: sourceActionId,
          consumerLineId: sourceLineId,
        },
        tx,
      )
    ).sort((a, b) => Number(a.sourceLogId) - Number(b.sourceLogId));

    let remainingToRelease = new PrismaNamespace.Decimal(quantityToRelease);
    let releasedCostAmount = new PrismaNamespace.Decimal(0);
    for (const usage of lineUsages) {
      if (remainingToRelease.lte(0)) {
        break;
      }
      const allocatedQty = toDecimal(usage.allocatedQty);
      const releasedQty = toDecimal(usage.releasedQty);
      const unreleasedQty = allocatedQty.sub(releasedQty);
      if (unreleasedQty.lte(0)) {
        continue;
      }
      const releasingQty = unreleasedQty.gt(remainingToRelease)
        ? remainingToRelease
        : unreleasedQty;
      const sourceUnitCost = toDecimal(usage.sourceLog.unitCost);
      releasedCostAmount = releasedCostAmount.add(
        sourceUnitCost.mul(releasingQty),
      );
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          consumerDocumentId: sourceActionId,
          consumerLineId: sourceLineId,
          targetReleasedQty: releasedQty.add(releasingQty),
          operatorId,
        },
        tx,
      );
      remainingToRelease = remainingToRelease.sub(releasingQty);
    }

    if (remainingToRelease.gt(0)) {
      throw new BadRequestException(
        `研发项目领料来源库存释放不足: actionId=${sourceActionId}, lineId=${sourceLineId}`,
      );
    }

    const releasedQty = quantityToRelease;
    const costUnitPrice = releasedQty.eq(0)
      ? new PrismaNamespace.Decimal(0)
      : releasedCostAmount.div(releasedQty);

    return {
      costUnitPrice,
      costAmount: releasedCostAmount,
    };
  }

  private async restoreProjectSourceUsageForReturnVoid(
    sourceActionId: number,
    sourceLineId: number,
    quantityToRestore: Prisma.Decimal,
    operatorId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          consumerDocumentId: sourceActionId,
          consumerLineId: sourceLineId,
        },
        tx,
      )
    ).sort((a, b) => Number(b.sourceLogId) - Number(a.sourceLogId));

    let remainingToRestore = new PrismaNamespace.Decimal(quantityToRestore);
    for (const usage of lineUsages) {
      if (remainingToRestore.lte(0)) {
        break;
      }
      const releasedQty = toDecimal(usage.releasedQty);
      if (releasedQty.lte(0)) {
        continue;
      }
      const restoringQty = releasedQty.gt(remainingToRestore)
        ? remainingToRestore
        : releasedQty;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          consumerDocumentId: sourceActionId,
          consumerLineId: sourceLineId,
          targetReleasedQty: releasedQty.sub(restoringQty),
          operatorId,
        },
        tx,
      );
      remainingToRestore = remainingToRestore.sub(restoringQty);
    }

    if (remainingToRestore.gt(0)) {
      throw new BadRequestException(
        `研发项目领料来源库存恢复不足: actionId=${sourceActionId}, lineId=${sourceLineId}`,
      );
    }
  }

  private async hasActiveProcurementRequests(
    projectCode: string,
    workshopId: number,
  ) {
    const result = await this.rdProcurementRequestService.listRequests({
      projectCode,
      workshopId,
      limit: 1,
      offset: 0,
    });
    return result.total > 0;
  }

  private async validateMasterData(dto: CreateRdProjectDto) {
    await this.masterDataService.getWorkshopById(dto.workshopId);
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.supplierId) {
      await this.masterDataService.getSupplierById(dto.supplierId);
    }
    if (dto.managerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.managerPersonnelId);
    }
    for (const line of dto.bomLines ?? []) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async validateMasterDataForUpdate(dto: UpdateRdProjectDto) {
    if (dto.workshopId) {
      await this.masterDataService.getWorkshopById(dto.workshopId);
    }
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.supplierId) {
      await this.masterDataService.getSupplierById(dto.supplierId);
    }
    if (dto.managerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.managerPersonnelId);
    }
    for (const line of dto.bomLines ?? []) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async validateMaterialActionMasterData(
    dto: CreateRdProjectMaterialActionDto,
  ) {
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async resolveCustomerSnapshot(customerId?: number) {
    if (!customerId) {
      return { customerCodeSnapshot: null, customerNameSnapshot: null };
    }
    const customer = await this.masterDataService.getCustomerById(customerId);
    return {
      customerCodeSnapshot: customer.customerCode,
      customerNameSnapshot: customer.customerName,
    };
  }

  private async resolveSupplierSnapshot(supplierId?: number) {
    if (!supplierId) {
      return { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    }
    const supplier = await this.masterDataService.getSupplierById(supplierId);
    return {
      supplierCodeSnapshot: supplier.supplierCode,
      supplierNameSnapshot: supplier.supplierName,
    };
  }

  private async resolveManagerSnapshot(managerPersonnelId?: number) {
    if (!managerPersonnelId) {
      return { managerNameSnapshot: null };
    }
    const personnel =
      await this.masterDataService.getPersonnelById(managerPersonnelId);
    return { managerNameSnapshot: personnel.personnelName };
  }

  private async ensureProjectTarget(
    project: {
      id: number;
      projectCode: string;
      projectName: string;
      projectTargetId?: number | null;
    },
    updatedBy: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (project.projectTargetId) {
      await this.repository.updateProjectTarget(
        project.projectTargetId,
        {
          targetCode: project.projectCode,
          targetName: project.projectName,
          updatedBy,
        },
        tx,
      );
      return project.projectTargetId;
    }

    const existing = await this.repository.findProjectTargetBySource(
      {
        targetType: ProjectTargetType.RD_PROJECT,
        sourceDocumentType: RD_PROJECT_DOCUMENT_TYPE,
        sourceDocumentId: project.id,
      },
      tx,
    );

    if (existing) {
      const target = await this.repository.updateProjectTarget(
        existing.id,
        {
          targetCode: project.projectCode,
          targetName: project.projectName,
          updatedBy,
        },
        tx,
      );
      await this.repository.attachProjectTargetToProject(
        project.id,
        target.id,
        updatedBy,
        tx,
      );
      return target.id;
    }

    const created = await this.repository.createProjectTarget(
      {
        targetType: ProjectTargetType.RD_PROJECT,
        targetCode: project.projectCode,
        targetName: project.projectName,
        sourceDocumentType: RD_PROJECT_DOCUMENT_TYPE,
        sourceDocumentId: project.id,
        createdBy: updatedBy,
        updatedBy,
      },
      tx,
    );
    await this.repository.attachProjectTargetToProject(
      project.id,
      created.id,
      updatedBy,
      tx,
    );
    return created.id;
  }

  private async syncProjectTarget(
    project: {
      id: number;
      projectCode: string;
      projectName: string;
      projectTargetId?: number | null;
    },
    updatedBy: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    await this.ensureProjectTarget(project, updatedBy, tx);
  }
}
