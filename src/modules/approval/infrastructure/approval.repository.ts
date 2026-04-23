import { Injectable } from "@nestjs/common";
import {
  AuditStatusSnapshot,
  type Prisma,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { CreateApprovalDocumentCommand } from "../domain/approval.types";

@Injectable()
export class ApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listApprovals(params: {
    documentFamily?: Prisma.ApprovalDocumentWhereInput["documentFamily"];
    auditStatus?: Prisma.ApprovalDocumentWhereInput["auditStatus"];
    limit: number;
    offset: number;
  }) {
    const where: Prisma.ApprovalDocumentWhereInput = {};
    if (params.documentFamily) where.documentFamily = params.documentFamily;
    if (params.auditStatus) where.auditStatus = params.auditStatus;

    const [items, total] = await Promise.all([
      this.prisma.approvalDocument.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.approvalDocument.count({ where }),
    ]);

    return { items, total };
  }

  async findApprovalByDocument(
    documentType: string,
    documentId: number,
  ) {
    return this.prisma.approvalDocument.findUnique({
      where: {
        documentType_documentId: { documentType, documentId },
      },
    });
  }

  async findApprovalById(id: number) {
    return this.prisma.approvalDocument.findUnique({
      where: { id },
    });
  }

  async upsertApprovalDocument(
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

  async updateApprovalStatus(
    id: number,
    data: Prisma.ApprovalDocumentUpdateInput,
  ) {
    return this.prisma.approvalDocument.update({
      where: { id },
      data,
    });
  }
}
