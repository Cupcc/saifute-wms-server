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
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateRdProjectMaterialActionDto } from "../dto/create-rd-project-material-action.dto";
import type { CreateRdProjectMaterialActionLineDto } from "../dto/create-rd-project-material-action-line.dto";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import { RdProjectMaterialActionHelperService } from "./rd-project-material-action-helper.service";
import {
  createProjectActionDocumentNo,
  ensureProjectTarget,
  FIXED_RD_PROJECT_STOCK_SCOPE,
  RD_PROJECT_ACTION_DOCUMENT_TYPE,
  RD_PROJECT_ACTION_LABEL,
  RD_PROJECT_BUSINESS_MODULE,
  RD_PROJECT_LABEL,
  toDecimal,
  toProjectInventoryOperationType,
} from "./rd-project.shared";
type ProjectDetail = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findProjectById"]>>
>;
type ProjectActionDetail = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findMaterialActionById"]>>
>;
@Injectable()
export class RdProjectMaterialActionService {
  constructor(
    private readonly repository: RdProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly actionHelper: RdProjectMaterialActionHelperService,
  ) {}
  async listMaterialActions(projectId: number) {
    await this.getProjectOrThrow(projectId);
    const actions =
      await this.repository.findMaterialActionsByProjectId(projectId);
    const enriched = await Promise.all(
      actions.map(async (action) => {
        const returnedQtyMap =
          action.actionType === RdProjectMaterialActionType.PICK
            ? await this.repository.sumActiveReturnedQtyBySourceLine(action.id)
            : new Map<number, Prisma.Decimal>();
        return {
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
        };
      }),
    );
    return {
      total: enriched.length,
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
    const project = await this.getProjectOrThrow(projectId);
    if (project.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException("已作废的研发项目不能新增物料动作");
    }
    const preparedLines = await this.actionHelper.prepareActionLines(
      project,
      dto.actionType,
      dto.lines,
    );
    const totalQty = preparedLines.reduce(
      (sum, line) => sum.add(line.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = preparedLines.reduce(
      (sum, line) => sum.add(line.amount),
      new Prisma.Decimal(0),
    );
    const bizDate = new Date(dto.bizDate);
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      FIXED_RD_PROJECT_STOCK_SCOPE,
    );
    return createProjectActionDocumentNo(
      dto.actionType,
      bizDate,
      async (documentNo) =>
        this.repository.runInTransaction(async (tx) => {
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
            const sourceTypes =
              FIXED_RD_PROJECT_STOCK_SCOPE === "RD_SUB"
                ? ([InventoryOperationType.RD_HANDOFF_IN] as const)
                : FIFO_SOURCE_OPERATION_TYPES;
            for (const line of action.lines) {
              const settlement = await this.inventoryService.settleConsumerOut(
                {
                  materialId: line.materialId,
                  stockScope: FIXED_RD_PROJECT_STOCK_SCOPE,
                  bizDate,
                  quantity: line.quantity,
                  operationType: toProjectInventoryOperationType(
                    dto.actionType,
                  ),
                  businessModule: RD_PROJECT_BUSINESS_MODULE,
                  businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
                  businessDocumentId: action.id,
                  businessDocumentNumber: action.documentNo,
                  businessDocumentLineId: line.id,
                  projectTargetId,
                  operatorId: createdBy,
                  idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:${action.id}:line:${line.id}`,
                  consumerLineId: line.id,
                  sourceOperationTypes: [...sourceTypes],
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
                  operationType: toProjectInventoryOperationType(
                    dto.actionType,
                  ),
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
                createdBy,
                tx,
              );
            }
          }
          return this.repository.findMaterialActionById(action.id, tx);
        }),
    );
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
      return this.repository.findMaterialActionById(action.id, tx);
    });
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
  private async getCachedSourceAction(
    actionId: number,
    cache: Map<number, ProjectActionDetail>,
  ) {
    const cached = cache.get(actionId);
    if (cached) {
      return cached;
    }
    const action = await this.getMaterialActionOrThrow(actionId);
    cache.set(actionId, action);
    return action;
  }
  private async restoreSourceUsageForReturnVoid(
    sourceActionId: number,
    sourceLineId: number,
    quantity: Prisma.Decimal,
    operatorId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const sourceUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          consumerDocumentId: sourceActionId,
          consumerLineId: sourceLineId,
        },
        tx,
      )
    ).sort(
      (left, right) => Number(right.sourceLogId) - Number(left.sourceLogId),
    );
    let remainingToRestore = new Prisma.Decimal(quantity);
    for (const usage of sourceUsages) {
      if (remainingToRestore.lte(0)) {
        break;
      }
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      if (releasedQty.lte(0)) {
        continue;
      }
      const toRestore = releasedQty.gt(remainingToRestore)
        ? remainingToRestore
        : releasedQty;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          consumerDocumentId: sourceActionId,
          consumerLineId: sourceLineId,
          targetReleasedQty: releasedQty.sub(toRestore),
          operatorId,
        },
        tx,
      );
      remainingToRestore = remainingToRestore.sub(toRestore);
    }
    if (remainingToRestore.gt(0)) {
      throw new BadRequestException(
        `退料来源库存恢复不足: actionId=${sourceActionId}, lineId=${sourceLineId}`,
      );
    }
  }
}
