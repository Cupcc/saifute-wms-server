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
import { WorkflowRepository } from "../infrastructure/workflow.repository";

export interface CreateAuditDocumentCommand {
  documentFamily: DocumentFamily;
  documentType: string;
  documentId: number;
  documentNumber: string;
  submittedBy?: string;
  createdBy?: string;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: WorkflowRepository,
  ) {}

  async createOrRefreshAuditDocument(
    cmd: CreateAuditDocumentCommand,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    return db.workflowAuditDocument.upsert({
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

  async markAuditNotRequired(
    documentType: string,
    documentId: number,
    updatedBy?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    return db.workflowAuditDocument.updateMany({
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

  async getAuditStatus(documentType: string, documentId: number) {
    const audit = await this.repository.findAuditByDocument(
      documentType,
      documentId,
    );
    return audit?.auditStatus ?? null;
  }

  async approve(id: number, decidedBy?: string) {
    const audit = await this.repository.findAuditById(id);
    if (!audit) {
      throw new NotFoundException(`审核记录不存在: ${id}`);
    }
    if (audit.auditStatus !== AuditStatusSnapshot.PENDING) {
      throw new BadRequestException(`当前状态不可审批: ${audit.auditStatus}`);
    }

    return this.prisma.workflowAuditDocument.update({
      where: { id },
      data: {
        auditStatus: AuditStatusSnapshot.APPROVED,
        decidedBy: decidedBy ?? audit.decidedBy,
        decidedAt: new Date(),
        rejectReason: null,
        updatedBy: decidedBy,
      },
    });
  }

  async reject(id: number, rejectReason?: string, decidedBy?: string) {
    const audit = await this.repository.findAuditById(id);
    if (!audit) {
      throw new NotFoundException(`审核记录不存在: ${id}`);
    }
    if (audit.auditStatus !== AuditStatusSnapshot.PENDING) {
      throw new BadRequestException(`当前状态不可审批: ${audit.auditStatus}`);
    }

    return this.prisma.workflowAuditDocument.update({
      where: { id },
      data: {
        auditStatus: AuditStatusSnapshot.REJECTED,
        decidedBy: decidedBy ?? audit.decidedBy,
        decidedAt: new Date(),
        rejectReason: rejectReason ?? null,
        updatedBy: decidedBy,
      },
    });
  }

  async reset(id: number, updatedBy?: string) {
    const audit = await this.repository.findAuditById(id);
    if (!audit) {
      throw new NotFoundException(`审核记录不存在: ${id}`);
    }

    return this.prisma.workflowAuditDocument.update({
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

  async listAudits(params: {
    documentFamily?: DocumentFamily;
    auditStatus?: AuditStatusSnapshot;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;
    return this.repository.findAudits({
      documentFamily: params.documentFamily,
      auditStatus: params.auditStatus,
      limit,
      offset,
    });
  }
}
