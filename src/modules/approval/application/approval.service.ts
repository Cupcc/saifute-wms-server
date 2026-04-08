import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  type Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalRepository } from "../infrastructure/approval.repository";

export interface CreateApprovalDocumentCommand {
  documentFamily: DocumentFamily;
  documentType: string;
  documentId: number;
  documentNumber: string;
  submittedBy?: string;
  createdBy?: string;
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ApprovalRepository,
  ) {}

  async createOrRefreshApprovalDocument(
    cmd: CreateApprovalDocumentCommand,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    return db.approvalDocument.upsert({
      where: {
        documentType_documentId: {
          documentType: cmd.documentType,
          documentId: cmd.documentId,
        },
      },
      create: {
        documentFamily: cmd.documentFamily,
        documentType: cmd.documentType,
        documentId: cmd.documentId,
        documentNumber: cmd.documentNumber,
        auditStatus: AuditStatusSnapshot.PENDING,
        submittedBy: cmd.submittedBy,
        submittedAt: cmd.submittedBy ? new Date() : null,
        createdBy: cmd.createdBy,
        updatedBy: cmd.createdBy,
      },
      update: {
        auditStatus: AuditStatusSnapshot.PENDING,
        documentNumber: cmd.documentNumber,
        submittedBy: cmd.submittedBy,
        submittedAt: cmd.submittedBy ? new Date() : undefined,
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
        resetCount: { increment: 1 },
        lastResetAt: new Date(),
        updatedBy: cmd.createdBy,
      },
    });
  }

  async markApprovalNotRequired(
    documentType: string,
    documentId: number,
    updatedBy?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    return db.approvalDocument.updateMany({
      where: {
        documentType,
        documentId,
      },
      data: {
        auditStatus: AuditStatusSnapshot.NOT_REQUIRED,
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
        updatedBy,
      },
    });
  }

  async getApprovalStatus(documentType: string, documentId: number) {
    const approval = await this.repository.findApprovalByDocument(
      documentType,
      documentId,
    );
    return approval?.auditStatus ?? null;
  }

  async getApprovalDocument(documentType: string, documentId: number) {
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

    return this.prisma.approvalDocument.update({
      where: { id },
      data: {
        auditStatus: AuditStatusSnapshot.APPROVED,
        decidedBy: decidedBy ?? approval.decidedBy,
        decidedAt: new Date(),
        rejectReason: null,
        updatedBy: decidedBy,
      },
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

    return this.prisma.approvalDocument.update({
      where: { id },
      data: {
        auditStatus: AuditStatusSnapshot.REJECTED,
        decidedBy: decidedBy ?? approval.decidedBy,
        decidedAt: new Date(),
        rejectReason: rejectReason ?? null,
        updatedBy: decidedBy,
      },
    });
  }

  async reset(id: number, updatedBy?: string) {
    const approval = await this.repository.findApprovalById(id);
    if (!approval) {
      throw new NotFoundException(`审核记录不存在: ${id}`);
    }

    return this.prisma.approvalDocument.update({
      where: { id },
      data: {
        auditStatus: AuditStatusSnapshot.PENDING,
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
        resetCount: { increment: 1 },
        lastResetAt: new Date(),
        updatedBy,
      },
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
