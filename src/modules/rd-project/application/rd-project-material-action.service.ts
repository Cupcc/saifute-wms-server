import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateRdProjectMaterialActionDto } from "../dto/create-rd-project-material-action.dto";
import type { QueryRdProjectMaterialActionDto } from "../dto/query-rd-project-material-action.dto";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import {
  createProjectActionDocumentNo,
  ensureProjectTarget,
  FIXED_RD_PROJECT_STOCK_SCOPE,
  formatQtyText,
  RD_PROJECT_ACTION_DOCUMENT_TYPE,
  RD_PROJECT_ACTION_LABEL,
  RD_PROJECT_BUSINESS_MODULE,
  RD_PROJECT_CHANGE_ACTIONS,
  RD_PROJECT_LABEL,
  toDecimal,
  toProjectInventoryOperationType,
} from "./rd-project.shared";
import { RdProjectMaterialActionHelperService } from "./rd-project-material-action-helper.service";

const ACTION_TYPE_LABELS: Record<RdProjectMaterialActionType, string> = {
  [RdProjectMaterialActionType.PICK]: "领料",
  [RdProjectMaterialActionType.RETURN]: "退料",
  [RdProjectMaterialActionType.SCRAP]: "报废",
};
@Injectable()
export class RdProjectMaterialActionService {
  constructor(
    private readonly repository: RdProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly actionHelper: RdProjectMaterialActionHelperService,
  ) {}
  async listMaterialActions(
    projectId: number,
    query?: QueryRdProjectMaterialActionDto,
  ) {
    await this.getProjectOrThrow(projectId);
    const { items, total } =
      await this.repository.findMaterialActionsByProjectId({
        projectId,
        materialId: query?.materialId,
        actionType: query?.actionType,
        limit: Math.min(query?.limit ?? 50, 100),
        offset: query?.offset,
      });
    const pickActionIds = items
      .filter(
        (action) => action.actionType === RdProjectMaterialActionType.PICK,
      )
      .map((action) => action.id);
    const returnedQtyMap =
      await this.repository.sumActiveReturnedQtyForSourceActions(pickActionIds);
    const enriched = items.map((action) => ({
      ...action,
      lines: action.lines.map((line) => {
        const returnedQty =
          returnedQtyMap.get(line.id) ?? new Prisma.Decimal(0);
        return {
          ...line,
          availableReturnQty:
            action.actionType === RdProjectMaterialActionType.PICK
              ? new Prisma.Decimal(line.quantity).sub(returnedQty)
              : undefined,
        };
      }),
    }));
    return {
      total,
      items: enriched,
    };
  }
  async getMaterialActionById(actionId: number) {
    const action = await this.getMaterialActionOrThrow(actionId);
    const lines = await Promise.all(
      action.lines.map(async (line) => {
        const sourceUsages =
          action.actionType === RdProjectMaterialActionType.PICK ||
          action.actionType === RdProjectMaterialActionType.SCRAP
            ? await this.inventoryService.listSourceUsagesForConsumerLine({
                consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
                consumerDocumentId: action.id,
                consumerLineId: line.id,
              })
            : [];
        return {
          ...line,
          sourceUsages,
        };
      }),
    );
    return {
      ...action,
      lines,
    };
  }
  async createMaterialAction(
    projectId: number,
    dto: CreateRdProjectMaterialActionDto,
    createdBy?: string,
  ) {
    if (dto.clientRequestId) {
      const existing =
        await this.repository.findMaterialActionByClientRequestId(
          dto.clientRequestId,
        );
      if (existing) {
        return existing;
      }
    }
    const project = await this.getProjectOrThrow(projectId);
    if (project.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException("已作废的研发项目不能新增物料动作");
    }
    const bizDate = new Date(dto.bizDate);
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      FIXED_RD_PROJECT_STOCK_SCOPE,
    );
    const persistAction = async (documentNo: string) =>
      this.repository.runInTransaction(async (tx) => {
        const preparedLines = await this.actionHelper.prepareActionLines(
          project,
          dto.actionType,
          dto.lines,
          tx,
        );
        const totalQty = preparedLines.reduce(
          (sum, line) => sum.add(line.quantity),
          new Prisma.Decimal(0),
        );
        const totalAmount = preparedLines.reduce(
          (sum, line) => sum.add(line.amount),
          new Prisma.Decimal(0),
        );
        const warnings =
          dto.actionType === RdProjectMaterialActionType.PICK
            ? this.collectPickBomWarnings(project, preparedLines)
            : [];
        const projectTargetId = await ensureProjectTarget({
          project,
          updatedBy: createdBy,
          repository: this.repository,
          tx,
        });
        const action = await this.repository.createMaterialAction(
          {
            documentNo,
            projectId: project.id,
            actionType: dto.actionType,
            bizDate,
            stockScopeId: stockScopeRecord.id,
            workshopId: project.workshopId,
            totalQty,
            totalAmount,
            remark: dto.remark,
            clientRequestId: dto.clientRequestId,
            createdBy,
            updatedBy: createdBy,
          },
          preparedLines.map((line) => ({
            lineNo: line.lineNo,
            materialId: line.materialId,
            materialCodeSnapshot: line.materialCodeSnapshot,
            materialNameSnapshot: line.materialNameSnapshot,
            materialSpecSnapshot: line.materialSpecSnapshot,
            unitCodeSnapshot: line.unitCodeSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
            sourceDocumentType: line.sourceDocumentType,
            sourceDocumentId: line.sourceDocumentId,
            sourceDocumentLineId: line.sourceDocumentLineId,
            remark: line.remark,
            createdBy,
            updatedBy: createdBy,
          })),
          tx,
        );
        if (
          dto.actionType === RdProjectMaterialActionType.PICK ||
          dto.actionType === RdProjectMaterialActionType.SCRAP
        ) {
          for (const line of action.lines) {
            const settlement = await this.inventoryService.settleConsumerOut(
              {
                materialId: line.materialId,
                stockScope: FIXED_RD_PROJECT_STOCK_SCOPE,
                bizDate,
                quantity: line.quantity,
                operationType: toProjectInventoryOperationType(dto.actionType),
                businessModule: RD_PROJECT_BUSINESS_MODULE,
                businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
                businessDocumentId: action.id,
                businessDocumentNumber: action.documentNo,
                businessDocumentLineId: line.id,
                projectTargetId,
                operatorId: createdBy,
                idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:${action.id}:line:${line.id}`,
                consumerLineId: line.id,
                sourceOperationTypes: [InventoryOperationType.RD_HANDOFF_IN],
                sourceProjectTargetId: projectTargetId,
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
            const preparedLine = preparedLines[line.lineNo - 1];
            await this.inventoryService.increaseStock(
              {
                materialId: line.materialId,
                stockScope: FIXED_RD_PROJECT_STOCK_SCOPE,
                bizDate,
                quantity: line.quantity,
                operationType: toProjectInventoryOperationType(dto.actionType),
                businessModule: RD_PROJECT_BUSINESS_MODULE,
                businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
                businessDocumentId: action.id,
                businessDocumentNumber: action.documentNo,
                businessDocumentLineId: line.id,
                projectTargetId,
                operatorId: createdBy,
                idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:${action.id}:line:${line.id}`,
                unitCost: preparedLine.costUnitPrice,
                costAmount: preparedLine.costAmount,
              },
              tx,
            );
            await this.repository.updateMaterialActionLineCost(
              line.id,
              {
                costUnitPrice: preparedLine.costUnitPrice,
                costAmount: preparedLine.costAmount,
              },
              tx,
            );
            await this.actionHelper.releaseSourceUsageForReturnCreation(
              preparedLine.sourceDocumentId as number,
              preparedLine.sourceDocumentLineId as number,
              preparedLine.quantity,
              {
                lineNo: line.lineNo,
                materialName: line.materialNameSnapshot,
              },
              createdBy,
              tx,
            );
          }
        }
        await this.repository.appendProjectChangeLog(
          {
            projectId: project.id,
            revisionNo: project.revisionNo,
            action: RD_PROJECT_CHANGE_ACTIONS.ACTION_CREATE,
            summary: `新增${ACTION_TYPE_LABELS[dto.actionType]}单 ${action.documentNo}（${action.lines.length} 行，合计数量 ${formatQtyText(totalQty)}）`,
            changes: JSON.stringify(
              action.lines.map((line) => ({
                label: `明细 ${line.lineNo}`,
                before: null,
                after: `${line.materialCodeSnapshot} ${line.materialNameSnapshot} × ${formatQtyText(line.quantity)}`,
              })),
            ),
            changedBy: createdBy,
          },
          tx,
        );
        const detail = await this.repository.findMaterialActionById(
          action.id,
          tx,
        );
        if (!detail || warnings.length === 0) {
          return detail;
        }
        return { ...detail, warnings };
      });

    try {
      return await createProjectActionDocumentNo(
        dto.actionType,
        bizDate,
        persistAction,
        (stem) => this.repository.findMaterialActionDocumentNosByPrefix(stem),
      );
    } catch (error) {
      if (dto.clientRequestId && isClientRequestIdUniqueConflict(error)) {
        const existing =
          await this.repository.findMaterialActionByClientRequestId(
            dto.clientRequestId,
          );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }
  async voidMaterialAction(
    actionId: number,
    voidReason?: string,
    voidedBy?: string,
  ) {
    const action = await this.getMaterialActionOrThrow(actionId);
    if (action.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("研发项目物料动作已作废");
    }
    if (action.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }
    return this.repository.runInTransaction(async (tx) => {
      if (action.actionType === RdProjectMaterialActionType.PICK) {
        const hasReturn = await this.repository.hasActiveReturnDownstream(
          action.id,
          tx,
        );
        if (hasReturn) {
          throw new BadRequestException("存在有效退料下游，不能作废领料动作");
        }
        await this.inventoryService.releaseAllSourceUsagesForConsumer(
          {
            consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
            consumerDocumentId: action.id,
            operatorId: voidedBy,
          },
          tx,
        );
      }
      if (action.actionType === RdProjectMaterialActionType.SCRAP) {
        await this.inventoryService.releaseAllSourceUsagesForConsumer(
          {
            consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
            consumerDocumentId: action.id,
            operatorId: voidedBy,
          },
          tx,
        );
      }
      const logs = await this.inventoryService.getLogsForDocument(
        {
          businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          businessDocumentId: action.id,
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
            idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:void:${action.id}:log:${log.id}`,
            note: `作废研发项目物料动作: ${action.documentNo}`,
          },
          tx,
        );
      }
      if (action.actionType === RdProjectMaterialActionType.RETURN) {
        for (const line of action.lines) {
          if (
            line.sourceDocumentId == null ||
            line.sourceDocumentLineId == null
          ) {
            continue;
          }
          await this.actionHelper.restoreSourceUsageForReturnVoid(
            line.sourceDocumentId,
            line.sourceDocumentLineId,
            new Prisma.Decimal(line.quantity),
            {
              lineNo: line.lineNo,
              materialName: line.materialNameSnapshot,
            },
            voidedBy,
            tx,
          );
        }
      }
      await this.repository.updateMaterialAction(
        action.id,
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
      await this.repository.appendProjectChangeLog(
        {
          projectId: action.projectId,
          revisionNo: action.rdProject.revisionNo,
          action: RD_PROJECT_CHANGE_ACTIONS.ACTION_VOID,
          summary: `作废${ACTION_TYPE_LABELS[action.actionType]}单 ${action.documentNo}${voidReason ? `，原因：${voidReason}` : ""}`,
          changedBy: voidedBy,
        },
        tx,
      );
      return this.repository.findMaterialActionById(action.id, tx);
    });
  }
  private collectPickBomWarnings(
    project: {
      bomLines: Array<{ materialId: number; quantity: Prisma.Decimal }>;
      materialLines: Array<{ materialId: number; quantity: Prisma.Decimal }>;
      materialActions: Array<{
        lifecycleStatus: DocumentLifecycleStatus;
        actionType: RdProjectMaterialActionType;
        lines: Array<{ materialId: number; quantity: Prisma.Decimal }>;
      }>;
    },
    preparedLines: Array<{
      lineNo: number;
      materialId: number;
      materialNameSnapshot: string;
      quantity: Prisma.Decimal;
    }>,
  ) {
    const plannedByMaterial = new Map<number, Prisma.Decimal>();
    for (const bomLine of project.bomLines) {
      const current =
        plannedByMaterial.get(bomLine.materialId) ?? new Prisma.Decimal(0);
      plannedByMaterial.set(
        bomLine.materialId,
        current.add(toDecimal(bomLine.quantity)),
      );
    }
    const netPickedByMaterial = new Map<number, Prisma.Decimal>();
    const addNetPicked = (materialId: number, delta: Prisma.Decimal) => {
      const current =
        netPickedByMaterial.get(materialId) ?? new Prisma.Decimal(0);
      netPickedByMaterial.set(materialId, current.add(delta));
    };
    for (const line of project.materialLines) {
      addNetPicked(line.materialId, toDecimal(line.quantity));
    }
    for (const action of project.materialActions) {
      if (
        action.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE ||
        (action.actionType !== RdProjectMaterialActionType.PICK &&
          action.actionType !== RdProjectMaterialActionType.RETURN)
      ) {
        continue;
      }
      const isReturn = action.actionType === RdProjectMaterialActionType.RETURN;
      for (const line of action.lines) {
        const qty = toDecimal(line.quantity);
        addNetPicked(line.materialId, isReturn ? qty.neg() : qty);
      }
    }
    const warnings: string[] = [];
    for (const line of preparedLines) {
      addNetPicked(line.materialId, line.quantity);
      const planned = plannedByMaterial.get(line.materialId);
      if (!planned) {
        warnings.push(
          `第 ${line.lineNo} 行：物料 ${line.materialNameSnapshot} 不在项目 BOM 计划内，请及时调整 BOM`,
        );
        continue;
      }
      const netPicked =
        netPickedByMaterial.get(line.materialId) ?? new Prisma.Decimal(0);
      if (netPicked.gt(planned)) {
        warnings.push(
          `第 ${line.lineNo} 行：物料 ${line.materialNameSnapshot} 累计净领用 ${netPicked.toString()} 已超过 BOM 计划数量 ${planned.toString()}，请及时调整 BOM`,
        );
      }
    }
    return warnings;
  }

  private async getProjectOrThrow(projectId: number) {
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${projectId}`);
    }
    return project;
  }
  private async getMaterialActionOrThrow(actionId: number) {
    const action = await this.repository.findMaterialActionById(actionId);
    if (!action) {
      throw new NotFoundException(
        `${RD_PROJECT_ACTION_LABEL}不存在: ${actionId}`,
      );
    }
    return action;
  }
}

function isClientRequestIdUniqueConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const conflictText =
    `${JSON.stringify(error.meta ?? {})} ${error.message}`.toLowerCase();
  return (
    conflictText.includes("client_request_id") ||
    conflictText.includes("clientrequestid")
  );
}
