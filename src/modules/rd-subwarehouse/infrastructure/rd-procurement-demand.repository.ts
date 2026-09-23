import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RdProcurementDemandRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.runInTransaction(handler);
  }

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findPage(
    params: {
      keyword?: string;
      needDateFrom?: Date;
      needDateTo?: Date;
      rdProjectId?: number;
      projectCode?: string;
      applicantUserId?: number;
      limit: number;
      offset: number;
    },
    db?: DbClient,
  ) {
    const where: Prisma.RdProcurementDemandWhereInput = { deletedAt: null };
    if (params.keyword) {
      where.OR = [
        { applicantName: { contains: params.keyword } },
        { departmentName: { contains: params.keyword } },
        { projectCodeSnapshot: { contains: params.keyword } },
        { projectNameSnapshot: { contains: params.keyword } },
        { materialName: { contains: params.keyword } },
        { specification: { contains: params.keyword } },
        { supplierText: { contains: params.keyword } },
      ];
    }
    if (params.needDateFrom || params.needDateTo) {
      where.needDate = {};
      if (params.needDateFrom) where.needDate.gte = params.needDateFrom;
      if (params.needDateTo) where.needDate.lte = params.needDateTo;
    }
    if (params.rdProjectId) where.rdProjectId = params.rdProjectId;
    if (params.projectCode) {
      where.projectCodeSnapshot = { contains: params.projectCode };
    }
    if (params.applicantUserId) where.applicantUserId = params.applicantUserId;

    const client = this.db(db);
    const [items, total] = await Promise.all([
      client.rdProcurementDemand.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ applicantName: "asc" }, { needDate: "asc" }, { id: "asc" }],
      }),
      client.rdProcurementDemand.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: number, db?: DbClient) {
    return this.db(db).rdProcurementDemand.findUnique({ where: { id } });
  }

  findByClientRequestId(clientRequestId: string, db?: DbClient) {
    return this.db(db).rdProcurementDemand.findMany({
      where: { clientRequestId, deletedAt: null },
      orderBy: { lineNo: "asc" },
    });
  }

  create(data: Prisma.RdProcurementDemandUncheckedCreateInput, db?: DbClient) {
    return this.db(db).rdProcurementDemand.create({ data });
  }

  update(
    id: number,
    data: Prisma.RdProcurementDemandUncheckedUpdateInput,
    db?: DbClient,
  ) {
    return this.db(db).rdProcurementDemand.update({ where: { id }, data });
  }
}
