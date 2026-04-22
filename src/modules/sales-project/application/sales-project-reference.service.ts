import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import { SalesProjectRepository } from "../infrastructure/sales-project.repository";
import {
  requireProjectTargetId,
  SALES_PROJECT_LABEL,
} from "./sales-project.shared";

export type SalesProjectBindingReference = {
  id: number;
  salesProjectCode: string;
  salesProjectName: string;
  customerId: number | null;
  workshopId: number;
  projectTargetId: number;
  lifecycleStatus: DocumentLifecycleStatus;
};

@Injectable()
export class SalesProjectReferenceService {
  constructor(private readonly repository: SalesProjectRepository) {}

  async getProjectReferenceById(
    projectId: number,
    options?: { allowVoided?: boolean },
    tx?: Prisma.TransactionClient,
  ) {
    const result = await this.listProjectReferencesByIds(
      [projectId],
      options,
      tx,
    );
    const project = result.get(projectId);
    if (!project) {
      throw new NotFoundException(`${SALES_PROJECT_LABEL}不存在: ${projectId}`);
    }
    return project;
  }

  async listProjectReferencesByIds(
    projectIds: number[],
    options?: { allowVoided?: boolean },
    tx?: Prisma.TransactionClient,
  ) {
    const distinctIds = [...new Set(projectIds.filter(Boolean))];
    if (distinctIds.length === 0) {
      return new Map<number, SalesProjectBindingReference>();
    }

    const records = await this.repository.findProjectsByIds(distinctIds, tx);
    const recordById = new Map(records.map((record) => [record.id, record]));

    for (const projectId of distinctIds) {
      const record = recordById.get(projectId);
      if (!record) {
        throw new NotFoundException(
          `${SALES_PROJECT_LABEL}不存在: ${projectId}`,
        );
      }
      if (
        !options?.allowVoided &&
        record.lifecycleStatus === DocumentLifecycleStatus.VOIDED
      ) {
        throw new BadRequestException(
          `已作废的销售项目不能继续引用: ${projectId}`,
        );
      }
      requireProjectTargetId(record);
    }

    return new Map<number, SalesProjectBindingReference>(
      records.map((record) => [
        record.id,
        {
          id: record.id,
          salesProjectCode: record.salesProjectCode,
          salesProjectName: record.salesProjectName,
          customerId: record.customerId,
          workshopId: record.workshopId,
          projectTargetId: record.projectTargetId as number,
          lifecycleStatus: record.lifecycleStatus,
        },
      ]),
    );
  }
}
