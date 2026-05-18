import { Injectable } from "@nestjs/common";
import {
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class WorkshopMaterialDocumentNumberRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findDocumentNosByOrderTypeAndStem(
    orderType: WorkshopMaterialOrderType,
    documentNoStem: string,
    db?: DbClient,
  ) {
    const rows = await this.db(db).workshopMaterialOrder.findMany({
      where: {
        orderType,
        documentNo: { startsWith: documentNoStem },
      },
      select: { documentNo: true },
    });
    return rows.map((row) => row.documentNo);
  }
}
