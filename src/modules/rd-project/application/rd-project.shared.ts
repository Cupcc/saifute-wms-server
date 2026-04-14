import { BadRequestException } from "@nestjs/common";
import {
  InventoryOperationType,
  Prisma,
  ProjectTargetType,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import type { RdProjectRepository } from "../infrastructure/rd-project.repository";

export const FIXED_RD_PROJECT_STOCK_SCOPE = "RD_SUB" as const;
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
      return "RAP";
    case RdProjectMaterialActionType.RETURN:
      return "RAR";
    case RdProjectMaterialActionType.SCRAP:
      return "RAS";
    default:
      throw new BadRequestException(`Unsupported actionType: ${actionType}`);
  }
}

export async function createProjectActionDocumentNo(
  actionType: RdProjectMaterialActionType,
  bizDate: Date,
  factory: (documentNo: string) => Promise<unknown>,
) {
  const prefix = getActionPrefix(actionType);
  return createWithGeneratedDocumentNo((attempt) =>
    factory(buildCompactDocumentNo(prefix, bizDate, attempt)),
  );
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
