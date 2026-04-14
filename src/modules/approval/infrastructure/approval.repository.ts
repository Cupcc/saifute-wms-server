import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

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
}
