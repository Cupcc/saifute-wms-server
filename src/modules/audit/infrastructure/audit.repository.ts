import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAudits(params: {
    documentFamily?: Prisma.AuditDocumentWhereInput["documentFamily"];
    auditStatus?: Prisma.AuditDocumentWhereInput["auditStatus"];
    limit: number;
    offset: number;
  }) {
    const where: Prisma.AuditDocumentWhereInput = {};
    if (params.documentFamily) where.documentFamily = params.documentFamily;
    if (params.auditStatus) where.auditStatus = params.auditStatus;

    const [items, total] = await Promise.all([
      this.prisma.auditDocument.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditDocument.count({ where }),
    ]);

    return { items, total };
  }

  async findAuditByDocument(documentType: string, documentId: number) {
    return this.prisma.auditDocument.findUnique({
      where: {
        documentType_documentId: { documentType, documentId },
      },
    });
  }

  async findAuditById(id: number) {
    return this.prisma.auditDocument.findUnique({
      where: { id },
    });
  }
}
