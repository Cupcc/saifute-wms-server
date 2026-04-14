import { BadRequestException } from "@nestjs/common";
import { Prisma, ProjectTargetType } from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import type { SalesProjectRepository } from "../infrastructure/sales-project.repository";

export const SALES_PROJECT_STOCK_SCOPE = "MAIN" as const;
export const SALES_PROJECT_DOCUMENT_TYPE = BusinessDocumentType.SalesProject;
export const SALES_PROJECT_LABEL = "销售项目";
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

export async function ensureSalesProjectTarget(params: {
  project: {
    id: number;
    salesProjectCode: string;
    salesProjectName: string;
    projectTargetId?: number | null;
  };
  updatedBy?: string;
  repository: SalesProjectRepository;
  tx: Prisma.TransactionClient;
}) {
  const { project, updatedBy, repository, tx } = params;

  if (project.projectTargetId) {
    return project.projectTargetId;
  }

  const existing = await repository.findProjectTargetBySource(
    {
      targetType: ProjectTargetType.SALES_PROJECT,
      sourceDocumentType: SALES_PROJECT_DOCUMENT_TYPE,
      sourceDocumentId: project.id,
    },
    tx,
  );

  if (existing) {
    const target =
      existing.targetCode !== project.salesProjectCode ||
      existing.targetName !== project.salesProjectName
        ? await repository.updateProjectTarget(
            existing.id,
            {
              targetCode: project.salesProjectCode,
              targetName: project.salesProjectName,
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
      targetType: ProjectTargetType.SALES_PROJECT,
      targetCode: project.salesProjectCode,
      targetName: project.salesProjectName,
      sourceDocumentType: SALES_PROJECT_DOCUMENT_TYPE,
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

export function requireProjectTargetId(project: {
  id: number;
  projectTargetId?: number | null;
}) {
  if (!project.projectTargetId) {
    throw new BadRequestException(
      `${SALES_PROJECT_LABEL}缺少项目维度锚点: ${project.id}`,
    );
  }
  return project.projectTargetId;
}
