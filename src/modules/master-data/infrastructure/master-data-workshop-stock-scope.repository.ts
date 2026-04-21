import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

const WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE = {
  defaultHandlerPersonnel: {
    select: {
      id: true,
      personnelName: true,
    },
  },
} as const satisfies Prisma.WorkshopInclude;

export class MasterDataWorkshopStockScopeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findWorkshops(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.WorkshopWhereInput["status"];
  }) {
    const where: Prisma.WorkshopWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { workshopName: { contains: params.keyword } },
        {
          defaultHandlerPersonnel: {
            is: {
              personnelName: {
                contains: params.keyword,
              },
            },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.workshop.findMany({
        where,
        include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ workshopName: "asc" }, { id: "asc" }],
      }),
      this.prisma.workshop.count({ where }),
    ]);

    return { items, total };
  }

  async findWorkshopById(id: number) {
    return this.prisma.workshop.findUnique({
      where: { id },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
    });
  }

  async findWorkshopByName(workshopName: string) {
    return this.prisma.workshop.findFirst({
      where: {
        workshopName,
      },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
      orderBy: {
        id: "asc",
      },
    });
  }

  async createWorkshop(
    data: Pick<
      Prisma.WorkshopUncheckedCreateInput,
      "defaultHandlerPersonnelId" | "workshopName"
    >,
    createdBy?: string,
  ) {
    return this.prisma.workshop.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
    });
  }

  async updateWorkshop(
    id: number,
    data: Prisma.WorkshopUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.workshop.update({
      where: { id },
      data: { ...data, updatedBy },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
    });
  }

  async findStockScopes(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.StockScopeWhereInput["status"];
  }) {
    const where: Prisma.StockScopeWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { scopeCode: { contains: params.keyword } },
        { scopeName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.stockScope.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { scopeCode: "asc" },
      }),
      this.prisma.stockScope.count({ where }),
    ]);

    return { items, total };
  }

  async findStockScopeById(id: number) {
    return this.prisma.stockScope.findUnique({
      where: { id },
    });
  }

  async findStockScopeByCode(scopeCode: string) {
    return this.prisma.stockScope.findUnique({
      where: { scopeCode },
    });
  }

  async createStockScope(
    data: Pick<
      Prisma.StockScopeUncheckedCreateInput,
      "scopeCode" | "scopeName"
    >,
    createdBy?: string,
  ) {
    return this.prisma.stockScope.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateStockScope(
    id: number,
    data: Prisma.StockScopeUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.stockScope.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async countPositiveStockScopeBalanceRows(
    stockScopeId: number,
  ): Promise<number> {
    return this.prisma.inventoryBalance.count({
      where: { stockScopeId, quantityOnHand: { gt: 0 } },
    });
  }
}
