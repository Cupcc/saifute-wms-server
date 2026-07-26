import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateRdProjectMaterialActionLineDto } from "../dto/create-rd-project-material-action-line.dto";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import {
  maxZero,
  RD_PROJECT_ACTION_DOCUMENT_TYPE,
  toDecimal,
} from "./rd-project.shared";

type ProjectDetail = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findProjectById"]>>
>;
type ProjectActionDetail = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findMaterialActionById"]>>
>;
type ActionLineRef = {
  lineNo: number;
  materialName: string;
};

@Injectable()
export class RdProjectMaterialActionHelperService {
  constructor(
    private readonly repository: RdProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
  ) {}

  async prepareActionLines(
    project: ProjectDetail,
    actionType: RdProjectMaterialActionType,
    lines: CreateRdProjectMaterialActionLineDto[],
    tx?: Prisma.TransactionClient,
  ) {
    const preparedLines = [] as Array<{
      lineNo: number;
      materialId: number;
      materialCodeSnapshot: string;
      materialNameSnapshot: string;
      materialSpecSnapshot: string;
      unitCodeSnapshot: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      amount: Prisma.Decimal;
      costUnitPrice: Prisma.Decimal;
      costAmount: Prisma.Decimal;
      sourceDocumentType?: string;
      sourceDocumentId?: number;
      sourceDocumentLineId?: number;
      remark?: string;
    }>;

    const activeReturnedQtyBySource = new Map<
      number,
      Map<number, Prisma.Decimal>
    >();
    const requestQtyBySourceLine = new Map<number, Prisma.Decimal>();
    const sourceActionCache = new Map<number, ProjectActionDetail>();

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const material = await this.masterDataService.getMaterialById(
        line.materialId,
      );
      const quantity = new Prisma.Decimal(line.quantity);
      let unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
      let costUnitPrice = unitPrice;
      let costAmount = quantity.mul(costUnitPrice);

      if (actionType === RdProjectMaterialActionType.RETURN) {
        const lineLabel = `第 ${index + 1} 行（物料 ${material.materialName}）`;
        if (
          line.sourceDocumentType !== RD_PROJECT_ACTION_DOCUMENT_TYPE ||
          !line.sourceDocumentId ||
          !line.sourceDocumentLineId
        ) {
          throw new BadRequestException(
            `${lineLabel}：退料必须关联上游研发项目领料行`,
          );
        }

        const sourceAction = await this.getCachedSourceAction(
          line.sourceDocumentId,
          sourceActionCache,
          tx,
        );
        if (!sourceAction) {
          throw new BadRequestException(
            `${lineLabel}：退料来源领料动作不存在，请重新选择来源领料`,
          );
        }
        if (sourceAction.projectId !== project.id) {
          throw new BadRequestException(
            `${lineLabel}：退料来源必须属于当前项目`,
          );
        }
        if (sourceAction.actionType !== RdProjectMaterialActionType.PICK) {
          throw new BadRequestException(
            `${lineLabel}：退料来源必须是研发项目领料动作`,
          );
        }
        if (
          sourceAction.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE
        ) {
          throw new BadRequestException(`${lineLabel}：退料来源领料动作已作废`);
        }

        const sourceLine = sourceAction.lines.find(
          (item: { id: number }) => item.id === line.sourceDocumentLineId,
        );
        if (!sourceLine) {
          throw new BadRequestException(
            `${lineLabel}：退料来源领料行不存在，请重新选择来源领料`,
          );
        }
        if (sourceLine.materialId !== material.id) {
          throw new BadRequestException(
            `${lineLabel}：退料物料必须与来源领料行一致`,
          );
        }

        if (!activeReturnedQtyBySource.has(sourceAction.id)) {
          activeReturnedQtyBySource.set(
            sourceAction.id,
            await this.repository.sumActiveReturnedQtyBySourceLine(
              sourceAction.id,
              tx,
            ),
          );
        }

        const pendingMap =
          activeReturnedQtyBySource.get(sourceAction.id) ??
          new Map<number, Prisma.Decimal>();
        const currentReturned =
          pendingMap.get(sourceLine.id) ?? new Prisma.Decimal(0);
        const requestQty =
          requestQtyBySourceLine.get(sourceLine.id) ?? new Prisma.Decimal(0);
        const nextRequested = requestQty.add(quantity);
        const maxReturnable = new Prisma.Decimal(sourceLine.quantity).sub(
          currentReturned,
        );
        if (nextRequested.gt(maxReturnable)) {
          const remaining = maxZero(maxReturnable.sub(requestQty));
          throw new BadRequestException(
            `${lineLabel}：累计退料数量超过来源领料行可退数量，当前最多还可退 ${remaining.toString()}`,
          );
        }
        requestQtyBySourceLine.set(sourceLine.id, nextRequested);

        unitPrice = toDecimal(sourceLine.costUnitPrice);
        costUnitPrice = unitPrice;
        costAmount = quantity.mul(costUnitPrice);
      }

      preparedLines.push({
        lineNo: index + 1,
        materialId: material.id,
        materialCodeSnapshot: material.materialCode,
        materialNameSnapshot: material.materialName,
        materialSpecSnapshot: material.specModel ?? "",
        unitCodeSnapshot: material.unitCode,
        quantity,
        unitPrice,
        amount: quantity.mul(unitPrice),
        costUnitPrice,
        costAmount,
        sourceDocumentType: line.sourceDocumentType,
        sourceDocumentId: line.sourceDocumentId,
        sourceDocumentLineId: line.sourceDocumentLineId,
        remark: line.remark,
      });
    }

    return preparedLines;
  }

  private async getCachedSourceAction(
    actionId: number,
    cache: Map<number, ProjectActionDetail>,
    tx?: Prisma.TransactionClient,
  ) {
    const cached = cache.get(actionId);
    if (cached) {
      return cached;
    }
    const action = await this.repository.findMaterialActionById(actionId, tx);
    if (!action) {
      return null;
    }
    cache.set(actionId, action);
    return action;
  }

  async releaseSourceUsageForReturnCreation(
    sourceActionId: number,
    sourceLineId: number,
    quantity: Prisma.Decimal,
    line: ActionLineRef,
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
      (left, right) => Number(left.sourceLogId) - Number(right.sourceLogId),
    );

    let remainingToRelease = new Prisma.Decimal(quantity);
    for (const usage of sourceUsages) {
      if (remainingToRelease.lte(0)) {
        break;
      }
      const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      const unreleasedQty = allocatedQty.sub(releasedQty);
      if (unreleasedQty.lte(0)) {
        continue;
      }
      const toRelease = unreleasedQty.gt(remainingToRelease)
        ? remainingToRelease
        : unreleasedQty;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
          consumerDocumentId: sourceActionId,
          consumerLineId: sourceLineId,
          targetReleasedQty: releasedQty.add(toRelease),
          operatorId,
        },
        tx,
      );
      remainingToRelease = remainingToRelease.sub(toRelease);
    }

    if (remainingToRelease.gt(0)) {
      throw new BadRequestException(
        `第 ${line.lineNo} 行（物料 ${line.materialName}）：退料数量超过来源领料行剩余可退数量，请刷新后重试`,
      );
    }
  }

  async restoreSourceUsageForReturnVoid(
    sourceActionId: number,
    sourceLineId: number,
    quantity: Prisma.Decimal,
    line: ActionLineRef,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
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
      const availableQty = await this.getSourceLogAvailableQty(usage, tx);
      if (availableQty.lt(0)) {
        throw new BadRequestException(
          `第 ${line.lineNo} 行（物料 ${line.materialName}）：退料释放的库存已被再次领用，请先撤销后续领料后再作废退料`,
        );
      }
      remainingToRestore = remainingToRestore.sub(toRestore);
    }

    if (remainingToRestore.gt(0)) {
      throw new BadRequestException(
        `第 ${line.lineNo} 行（物料 ${line.materialName}）：退料对应的库存占用数据异常，无法作废退料`,
      );
    }
  }

  private async getSourceLogAvailableQty(
    usage: { sourceLogId: number; sourceLog: { changeQty: Prisma.Decimal } },
    tx: Prisma.TransactionClient,
  ) {
    const totals = await tx.inventorySourceUsage.aggregate({
      where: { sourceLogId: usage.sourceLogId },
      _sum: { allocatedQty: true, releasedQty: true },
    });
    const allocatedQty = toDecimal(totals._sum.allocatedQty);
    const releasedQty = toDecimal(totals._sum.releasedQty);
    return toDecimal(usage.sourceLog.changeQty).sub(
      allocatedQty.sub(releasedQty),
    );
  }
}
