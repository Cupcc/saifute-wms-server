import { BadRequestException } from "@nestjs/common";
import {
  InventoryOperationType,
  Prisma,
  ProjectTargetType,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  buildDailyDocumentNoStem,
  createWithGeneratedDocumentNo,
  resolveDailyStartAttempt,
} from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import type { RdProjectRepository } from "../infrastructure/rd-project.repository";

export const FIXED_RD_PROJECT_STOCK_SCOPE = "RD_SUB" as const;
export const RD_PROJECT_WORKSHOP_NAME = "研发技术";
export const RD_PROJECT_DOCUMENT_TYPE = BusinessDocumentType.RdProject;
export const RD_PROJECT_ACTION_DOCUMENT_TYPE =
  BusinessDocumentType.RdProjectMaterialAction;
export const RD_PROJECT_BUSINESS_MODULE = "rd-project";
export const RD_PROJECT_LABEL = "研发项目";
export const RD_PROJECT_ACTION_LABEL = "研发项目物料动作";
export const ZERO = new Prisma.Decimal(0);

export function toDecimal(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  if (value == null) {
    return new Prisma.Decimal(0);
  }
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function maxZero(value: Prisma.Decimal) {
  return Prisma.Decimal.max(value, ZERO);
}

export function toProjectInventoryOperationType(
  actionType: RdProjectMaterialActionType,
) {
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

function getActionPrefix(actionType: RdProjectMaterialActionType) {
  switch (actionType) {
    case RdProjectMaterialActionType.PICK:
      return "RL";
    case RdProjectMaterialActionType.RETURN:
      return "RR";
    case RdProjectMaterialActionType.SCRAP:
      return "RS";
    default:
      throw new BadRequestException(`Unsupported actionType: ${actionType}`);
  }
}

export async function createProjectActionDocumentNo(
  actionType: RdProjectMaterialActionType,
  bizDate: Date,
  factory: (documentNo: string) => Promise<unknown>,
  findExistingDocumentNos?: (stem: string) => Promise<string[]>,
) {
  const prefix = getActionPrefix(actionType);
  const stem = buildDailyDocumentNoStem(prefix, bizDate);
  return createWithGeneratedDocumentNo(
    (attempt) => factory(buildCompactDocumentNo(prefix, bizDate, attempt)),
    findExistingDocumentNos
      ? {
          resolveStartAttempt: async () =>
            resolveDailyStartAttempt(await findExistingDocumentNos(stem), stem),
        }
      : {},
  );
}

export interface RdProjectFieldChange {
  label: string;
  before: string | null;
  after: string | null;
}

export const RD_PROJECT_CHANGE_ACTIONS = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  VOID: "VOID",
  ACTION_CREATE: "ACTION_CREATE",
  ACTION_VOID: "ACTION_VOID",
} as const;

export function formatQtyText(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  return toDecimal(value).toString();
}

function formatDateOnlyText(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function pushIfChanged(
  changes: RdProjectFieldChange[],
  label: string,
  before: string | null | undefined,
  after: string | null | undefined,
) {
  const beforeText = before ?? null;
  const afterText = after ?? null;
  if (beforeText !== afterText) {
    changes.push({ label, before: beforeText, after: afterText });
  }
}

export function buildRdProjectHeaderChanges(
  existing: {
    projectCode: string;
    projectName: string;
    bizDate: Date;
    remark: string | null;
    customerNameSnapshot: string | null;
    supplierNameSnapshot: string | null;
    managerNameSnapshot: string | null;
  },
  next: {
    projectCode: string;
    projectName: string;
    bizDate: Date;
    remark: string | null;
    customerNameSnapshot: string | null;
    supplierNameSnapshot: string | null;
    managerNameSnapshot: string | null;
  },
): RdProjectFieldChange[] {
  const changes: RdProjectFieldChange[] = [];
  pushIfChanged(changes, "项目编码", existing.projectCode, next.projectCode);
  pushIfChanged(changes, "项目名称", existing.projectName, next.projectName);
  pushIfChanged(
    changes,
    "业务日期",
    formatDateOnlyText(existing.bizDate),
    formatDateOnlyText(next.bizDate),
  );
  pushIfChanged(
    changes,
    "客户",
    existing.customerNameSnapshot,
    next.customerNameSnapshot,
  );
  pushIfChanged(
    changes,
    "供应商",
    existing.supplierNameSnapshot,
    next.supplierNameSnapshot,
  );
  pushIfChanged(
    changes,
    "负责人",
    existing.managerNameSnapshot,
    next.managerNameSnapshot,
  );
  pushIfChanged(changes, "备注", existing.remark, next.remark);
  return changes;
}

interface RdProjectBomLineSnapshot {
  materialId: number;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  quantity: Prisma.Decimal | number | string;
  unitPrice: Prisma.Decimal | number | string;
  manufacturer?: string | null;
  productLink?: string | null;
  remark?: string | null;
}

export function buildRdProjectBomChanges(
  existingLines: RdProjectBomLineSnapshot[],
  nextLines: RdProjectBomLineSnapshot[],
): RdProjectFieldChange[] {
  const changes: RdProjectFieldChange[] = [];
  const byMaterial = (lines: RdProjectBomLineSnapshot[]) =>
    new Map(lines.map((line) => [line.materialId, line]));
  const existingMap = byMaterial(existingLines);
  const nextMap = byMaterial(nextLines);
  const materialLabel = (line: RdProjectBomLineSnapshot) =>
    `${line.materialCodeSnapshot} ${line.materialNameSnapshot}`.trim();

  for (const [materialId, next] of nextMap) {
    const before = existingMap.get(materialId);
    if (!before) {
      changes.push({
        label: `BOM 新增 ${materialLabel(next)}`,
        before: null,
        after: `数量 ${formatQtyText(next.quantity)}，单价 ${formatQtyText(next.unitPrice)}`,
      });
      continue;
    }
    const prefix = `BOM ${materialLabel(next)}`;
    if (!toDecimal(before.quantity).eq(toDecimal(next.quantity))) {
      pushIfChanged(
        changes,
        `${prefix} 计划数量`,
        formatQtyText(before.quantity),
        formatQtyText(next.quantity),
      );
    }
    if (!toDecimal(before.unitPrice).eq(toDecimal(next.unitPrice))) {
      pushIfChanged(
        changes,
        `${prefix} 参考单价`,
        formatQtyText(before.unitPrice),
        formatQtyText(next.unitPrice),
      );
    }
    pushIfChanged(
      changes,
      `${prefix} 厂家`,
      before.manufacturer ?? null,
      next.manufacturer ?? null,
    );
    pushIfChanged(
      changes,
      `${prefix} 链接`,
      before.productLink ?? null,
      next.productLink ?? null,
    );
    pushIfChanged(
      changes,
      `${prefix} 备注`,
      before.remark ?? null,
      next.remark ?? null,
    );
  }

  for (const [materialId, before] of existingMap) {
    if (!nextMap.has(materialId)) {
      changes.push({
        label: `BOM 删除 ${materialLabel(before)}`,
        before: `数量 ${formatQtyText(before.quantity)}，单价 ${formatQtyText(before.unitPrice)}`,
        after: null,
      });
    }
  }

  return changes;
}

export async function ensureProjectTarget(params: {
  project: {
    id: number;
    projectCode: string;
    projectName: string;
    projectTargetId?: number | null;
  };
  updatedBy?: string;
  repository: RdProjectRepository;
  tx: Prisma.TransactionClient;
}) {
  const { project, updatedBy, repository, tx } = params;

  if (project.projectTargetId) {
    return project.projectTargetId;
  }

  const existing = await repository.findProjectTargetBySource(
    {
      targetType: ProjectTargetType.RD_PROJECT,
      sourceDocumentType: RD_PROJECT_DOCUMENT_TYPE,
      sourceDocumentId: project.id,
    },
    tx,
  );

  if (existing) {
    const target =
      existing.targetCode !== project.projectCode ||
      existing.targetName !== project.projectName
        ? await repository.updateProjectTarget(
            existing.id,
            {
              targetCode: project.projectCode,
              targetName: project.projectName,
              updatedBy,
            },
            tx,
          )
        : existing;

    await repository.attachProjectTargetToProject(
      project.id,
      target.id,
      updatedBy,
      tx,
    );
    return target.id;
  }

  const created = await repository.createProjectTarget(
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

  await repository.attachProjectTargetToProject(
    project.id,
    created.id,
    updatedBy,
    tx,
  );
  return created.id;
}
