import { Injectable } from "@nestjs/common";
import {
  FactoryNumberReservationStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type InventoryDbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class FactoryNumberRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(
    tx: Prisma.TransactionClient | undefined,
    handler: (db: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (tx) {
      return handler(tx);
    }

    return this.prisma.runInTransaction(handler);
  }

  async createFactoryNumberReservation(
    data: Prisma.FactoryNumberReservationUncheckedCreateInput,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.factoryNumberReservation.create({ data });
  }

  async findFactoryNumberReservationsByDocument(
    params: {
      businessDocumentType: string;
      businessDocumentId: number;
      status?: FactoryNumberReservationStatus;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const where: Prisma.FactoryNumberReservationWhereInput = {
      businessDocumentType: params.businessDocumentType,
      businessDocumentId: params.businessDocumentId,
    };
    if (params.status) {
      where.status = params.status;
    }
    return db.factoryNumberReservation.findMany({
      where,
      orderBy: { id: "asc" },
    });
  }

  async findFactoryNumberReservations(params: {
    stockScopeIds?: number[];
    businessDocumentType?: string;
    businessDocumentLineId?: number;
    startNumber?: string;
    endNumber?: string;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.FactoryNumberReservationWhereInput = {};
    if (params.stockScopeIds?.length === 1) {
      where.stockScopeId = params.stockScopeIds[0];
    } else if (params.stockScopeIds?.length) {
      where.stockScopeId = { in: params.stockScopeIds };
    }
    if (params.businessDocumentType) {
      where.businessDocumentType = params.businessDocumentType;
    }
    if (params.businessDocumentLineId) {
      where.businessDocumentLineId = params.businessDocumentLineId;
    }
    if (params.startNumber) {
      where.startNumber = {
        contains: params.startNumber,
      };
    }
    if (params.endNumber) {
      where.endNumber = {
        contains: params.endNumber,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.factoryNumberReservation.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        include: { material: true, stockScope: true, workshop: true },
        orderBy: { id: "desc" },
      }),
      this.prisma.factoryNumberReservation.count({ where }),
    ]);

    return { items, total };
  }

  async findFactoryNumberReservationById(id: number) {
    return this.prisma.factoryNumberReservation.findUnique({
      where: { id },
      include: { material: true, stockScope: true, workshop: true },
    });
  }

  async releaseFactoryNumberReservations(
    params: {
      businessDocumentType: string;
      businessDocumentId: number;
      businessDocumentLineId?: number;
      updatedBy?: string;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    return db.factoryNumberReservation.updateMany({
      where: {
        businessDocumentType: params.businessDocumentType,
        businessDocumentId: params.businessDocumentId,
        businessDocumentLineId: params.businessDocumentLineId,
        status: FactoryNumberReservationStatus.RESERVED,
      },
      data: {
        status: FactoryNumberReservationStatus.RELEASED,
        releasedAt: new Date(),
        updatedBy: params.updatedBy,
      },
    });
  }
}
