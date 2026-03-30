import { Injectable } from "@nestjs/common";
import {
  FactoryNumberReservationStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type InventoryDbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBalances(params: {
    materialId?: number;
    workshopIds?: number[];
    limit: number;
    offset: number;
  }) {
    const where: Prisma.InventoryBalanceWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.workshopIds?.length === 1) {
      where.workshopId = params.workshopIds[0];
    } else if (params.workshopIds?.length) {
      where.workshopId = { in: params.workshopIds };
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        include: { material: true, workshop: true },
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);

    return { items, total };
  }

  async findBalanceByMaterialAndWorkshop(
    materialId: number,
    workshopId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventoryBalance.findUnique({
      where: {
        materialId_workshopId: {
          materialId,
          workshopId,
        },
      },
    });
  }

  async findLogs(params: {
    materialId?: number;
    workshopIds?: number[];
    businessDocumentId?: number;
    businessDocumentType?: string;
    businessDocumentNumber?: string;
    operationType?: string;
    occurredAtFrom?: Date;
    occurredAtTo?: Date;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.InventoryLogWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.workshopIds?.length === 1) {
      where.workshopId = params.workshopIds[0];
    } else if (params.workshopIds?.length) {
      where.workshopId = { in: params.workshopIds };
    }
    if (params.businessDocumentId)
      where.businessDocumentId = params.businessDocumentId;
    if (params.businessDocumentType)
      where.businessDocumentType = params.businessDocumentType;
    if (params.businessDocumentNumber) {
      where.businessDocumentNumber = {
        contains: params.businessDocumentNumber,
      };
    }
    if (params.operationType) {
      where.operationType =
        params.operationType as Prisma.EnumInventoryOperationTypeFilter;
    }
    if (params.occurredAtFrom || params.occurredAtTo) {
      where.occurredAt = {};
      if (params.occurredAtFrom) {
        where.occurredAt.gte = params.occurredAtFrom;
      }
      if (params.occurredAtTo) {
        where.occurredAt.lte = params.occurredAtTo;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryLog.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { occurredAt: "desc" },
        include: { material: true, workshop: true },
      }),
      this.prisma.inventoryLog.count({ where }),
    ]);

    return { items, total };
  }

  async findSourceUsages(
    params: {
      materialId?: number;
      consumerDocumentType?: string;
      consumerDocumentId?: number;
      limit: number;
      offset: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const where: Prisma.InventorySourceUsageWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.consumerDocumentType)
      where.consumerDocumentType = params.consumerDocumentType;
    if (params.consumerDocumentId)
      where.consumerDocumentId = params.consumerDocumentId;

    const [items, total] = await Promise.all([
      db.inventorySourceUsage.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        include: { material: true, sourceLog: true },
      }),
      db.inventorySourceUsage.count({ where }),
    ]);

    return { items, total };
  }

  async lockSourceLog(
    sourceLogId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    await db.$queryRaw`
      SELECT id
      FROM inventory_log
      WHERE id = ${sourceLogId}
      FOR UPDATE
    `;
  }

  async findLogByIdempotencyKey(
    idempotencyKey: string,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventoryLog.findUnique({
      where: { idempotencyKey },
    });
  }

  async findLogById(id: number, db: InventoryDbClient = this.prisma) {
    return db.inventoryLog.findUnique({
      where: { id },
      include: { balance: true },
    });
  }

  async findReversalLogBySourceLogId(
    sourceLogId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventoryLog.findUnique({
      where: { reversalOfLogId: sourceLogId },
    });
  }

  async findOriginalLogsByBusinessDocument(
    params: {
      businessDocumentType: string;
      businessDocumentId: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    const [originalLogs, reversalLogs] = await Promise.all([
      db.inventoryLog.findMany({
        where: {
          businessDocumentType: params.businessDocumentType,
          businessDocumentId: params.businessDocumentId,
          reversalOfLogId: null,
        },
        orderBy: { occurredAt: "asc" },
      }),
      db.inventoryLog.findMany({
        where: {
          businessDocumentType: params.businessDocumentType,
          businessDocumentId: params.businessDocumentId,
          reversalOfLogId: { not: null },
        },
        select: { reversalOfLogId: true },
      }),
    ]);

    const reversedLogIds = new Set(
      reversalLogs
        .map((log) => log.reversalOfLogId)
        .filter((logId): logId is number => logId !== null),
    );

    return originalLogs.filter((log) => !reversedLogIds.has(log.id));
  }

  async findSourceUsage(
    params: {
      sourceLogId: number;
      consumerDocumentType: string;
      consumerDocumentId: number;
      consumerLineId: number;
    },
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.findFirst({
      where: {
        sourceLogId: params.sourceLogId,
        consumerDocumentType: params.consumerDocumentType,
        consumerDocumentId: params.consumerDocumentId,
        consumerLineId: params.consumerLineId,
      },
    });
  }

  async getSourceUsageTotals(
    sourceLogId: number,
    db: InventoryDbClient = this.prisma,
  ) {
    const usages = await db.inventorySourceUsage.findMany({
      where: { sourceLogId },
      select: { allocatedQty: true, releasedQty: true },
    });

    return usages.reduce(
      (totals, usage) => ({
        allocatedQty: totals.allocatedQty.add(usage.allocatedQty),
        releasedQty: totals.releasedQty.add(usage.releasedQty),
      }),
      {
        allocatedQty: new Prisma.Decimal(0),
        releasedQty: new Prisma.Decimal(0),
      },
    );
  }

  async createSourceUsage(
    data: Prisma.InventorySourceUsageUncheckedCreateInput,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.create({ data });
  }

  async updateSourceUsage(
    id: number,
    data: Prisma.InventorySourceUsageUncheckedUpdateInput,
    db: InventoryDbClient = this.prisma,
  ) {
    return db.inventorySourceUsage.update({
      where: { id },
      data,
    });
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
    workshopIds?: number[];
    businessDocumentType?: string;
    businessDocumentLineId?: number;
    startNumber?: string;
    endNumber?: string;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.FactoryNumberReservationWhereInput = {};
    if (params.workshopIds?.length === 1) {
      where.workshopId = params.workshopIds[0];
    } else if (params.workshopIds?.length) {
      where.workshopId = { in: params.workshopIds };
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
        include: { material: true, workshop: true },
        orderBy: { id: "desc" },
      }),
      this.prisma.factoryNumberReservation.count({ where }),
    ]);

    return { items, total };
  }

  async findFactoryNumberReservationById(id: number) {
    return this.prisma.factoryNumberReservation.findUnique({
      where: { id },
      include: { material: true, workshop: true },
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
