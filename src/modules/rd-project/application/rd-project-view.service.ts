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
export class RdProjectViewService {
  constructor(
    private readonly repository: RdProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly rdProcurementRequestService: RdProcurementRequestService,
  ) {}

  private getEffectiveBomLines(project: RdProjectRecord) {
    if (project.bomLines.length > 0) {
      return project.bomLines;
    }
    return project.materialLines.map((line) => ({
      ...line,
    }));
  }


  async buildProjectView(
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

    const attributedBalanceMap = project.projectTargetId
      ? await this.inventoryService.summarizeAttributedQuantities(
          {
            materialIds: Array.from(ledgerSeed.keys()),
            stockScope: RD_PROJECT_STOCK_SCOPE,
            projectTargetId: project.projectTargetId,
          },
          tx,
        )
      : new Map<number, PrismaNamespace.Decimal>();

    const materialLedger = Array.from(ledgerSeed.values()).map((row) => {
        const availableQty = toDecimal(
          attributedBalanceMap.get(row.materialId) ?? 0,
        );
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
      });

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


  async buildBomLines(
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

}
