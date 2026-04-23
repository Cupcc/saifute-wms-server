import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  type Prisma,
} from "../../../../generated/prisma/client";
import { ApprovalRepository } from "../infrastructure/approval.repository";
import type { CreateApprovalDocumentCommand } from "../domain/approval.types";

export type { CreateApprovalDocumentCommand };

@Injectable()
export class ApprovalService {
  constructor(
    private readonly repository: ApprovalRepository,
  ) {}

  async createOrRefreshApprovalDocument(
    cmd: CreateApprovalDocumentCommand,
    tx?: Prisma.TransactionClient,
  ) {
    return this.repository.upsertApprovalDocument(cmd, tx);
  }

  async markApprovalNotRequired(
    documentType: string,
    documentId: number,
    updatedBy?: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.repository.markApprovalNotRequired(
      documentType,
      documentId,
      updatedBy,
      tx,
    );
  }

  async getApprovalStatus(
    documentType: string,
    documentId: number,
  ) {
    const approval = await this.repository.findApprovalByDocument(
      documentType,
      documentId,
    );
    return approval?.auditStatus ?? null;
  }

  async getApprovalDocument(
    documentType: string,
    documentId: number,
  ) {
    return this.repository.findApprovalByDocument(documentType, documentId);
  }

  async approve(id: number, decidedBy?: string) {
    const approval = await this.repository.findApprovalById(id);
    if (!approval) {
      throw new NotFoundException(`审核记录不存在: ${id}`);
    }
    if (approval.auditStatus !== AuditStatusSnapshot.PENDING) {
      throw new BadRequestException(
        `当前状态不可审批: ${approval.auditStatus}`,
      );
    }

    return this.repository.updateApprovalStatus(id, {
      auditStatus: AuditStatusSnapshot.APPROVED,
      decidedBy: decidedBy ?? approval.decidedBy,
      decidedAt: new Date(),
      rejectReason: null,
      updatedBy: decidedBy,
    });
  }

  async reject(id: number, rejectReason?: string, decidedBy?: string) {
    const approval = await this.repository.findApprovalById(id);
    if (!approval) {
      throw new NotFoundException(`审核记录不存在: ${id}`);
    }
    if (approval.auditStatus !== AuditStatusSnapshot.PENDING) {
      throw new BadRequestException(
        `当前状态不可审批: ${approval.auditStatus}`,
      );
    }

    return this.repository.updateApprovalStatus(id, {
      auditStatus: AuditStatusSnapshot.REJECTED,
      decidedBy: decidedBy ?? approval.decidedBy,
      decidedAt: new Date(),
      rejectReason: rejectReason ?? null,
      updatedBy: decidedBy,
    });
  }

  async reset(id: number, updatedBy?: string) {
    const approval = await this.repository.findApprovalById(id);
    if (!approval) {
      throw new NotFoundException(`审核记录不存在: ${id}`);
    }

    return this.repository.updateApprovalStatus(id, {
      auditStatus: AuditStatusSnapshot.PENDING,
      decidedBy: null,
      decidedAt: null,
      rejectReason: null,
      resetCount: { increment: 1 },
      lastResetAt: new Date(),
      updatedBy,
    });
  }

  async listApprovals(params: {
    documentFamily?: DocumentFamily;
    auditStatus?: AuditStatusSnapshot;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    return this.repository.listApprovals({
      documentFamily: params.documentFamily,
      auditStatus: params.auditStatus,
      limit,
      offset,
    });
  }
}
