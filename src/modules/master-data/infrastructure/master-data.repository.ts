import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

const CANONICAL_WORKSHOPS: Prisma.WorkshopCreateManyInput[] = [
  {
    workshopCode: "MAIN",
    workshopName: "主仓",
    status: "ACTIVE",
    createdBy: "system-bootstrap",
    updatedBy: "system-bootstrap",
  },
  {
    workshopCode: "RD",
    workshopName: "研发小仓",
    status: "ACTIVE",
    createdBy: "system-bootstrap",
    updatedBy: "system-bootstrap",
  },
];

const CANONICAL_STOCK_SCOPES: Prisma.StockScopeCreateManyInput[] = [
  {
    scopeCode: "MAIN",
    scopeName: "主仓",
    status: "ACTIVE",
    createdBy: "system-bootstrap",
    updatedBy: "system-bootstrap",
  },
  {
    scopeCode: "RD_SUB",
    scopeName: "研发小仓",
    status: "ACTIVE",
    createdBy: "system-bootstrap",
    updatedBy: "system-bootstrap",
  },
];

@Injectable()
export class MasterDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCanonicalWorkshops() {
    await this.prisma.workshop.createMany({
      data: CANONICAL_WORKSHOPS,
      skipDuplicates: true,
    });
  }

  async ensureCanonicalStockScopes() {
    await this.prisma.stockScope.createMany({
      data: CANONICAL_STOCK_SCOPES,
      skipDuplicates: true,
    });
  }

  async findMaterials(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.MaterialWhereInput["status"];
  }) {
    const where: Prisma.MaterialWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { materialCode: { contains: params.keyword } },
        { materialName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { materialCode: "asc" },
        include: { category: true },
      }),
      this.prisma.material.count({ where }),
    ]);

    return { items, total };
  }

  async findMaterialById(id: number) {
    return this.prisma.material.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  async findWorkshopById(id: number) {
    return this.prisma.workshop.findUnique({
      where: { id },
    });
  }

  async findWorkshopByCode(workshopCode: string) {
    return this.prisma.workshop.findUnique({
      where: { workshopCode },
    });
  }

  async findWorkshopByName(workshopName: string) {
    return this.prisma.workshop.findFirst({
      where: {
        workshopName: {
          contains: workshopName,
        },
      },
      orderBy: {
        id: "asc",
      },
    });
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

  async findSupplierById(id: number) {
    return this.prisma.supplier.findUnique({
      where: { id },
    });
  }

  async findCustomerById(id: number) {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  async findPersonnelById(id: number) {
    return this.prisma.personnel.findUnique({
      where: { id },
    });
  }

  async findMaterialByCode(materialCode: string) {
    return this.prisma.material.findUnique({
      where: { materialCode },
    });
  }

  async createMaterial(
    data: Prisma.MaterialUncheckedCreateInput,
    createdBy?: string,
  ) {
    return this.prisma.material.create({
      data: {
        ...data,
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateMaterial(
    id: number,
    data: Prisma.MaterialUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.material.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async findCustomers(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.CustomerWhereInput["status"];
  }) {
    const where: Prisma.CustomerWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { customerCode: { contains: params.keyword } },
        { customerName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { customerCode: "asc" },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total };
  }

  async findSuppliers(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.SupplierWhereInput["status"];
  }) {
    const where: Prisma.SupplierWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { supplierCode: { contains: params.keyword } },
        { supplierName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { supplierCode: "asc" },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, total };
  }

  async findPersonnel(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.PersonnelWhereInput["status"];
  }) {
    const where: Prisma.PersonnelWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { personnelCode: { contains: params.keyword } },
        { personnelName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.personnel.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { personnelCode: "asc" },
      }),
      this.prisma.personnel.count({ where }),
    ]);

    return { items, total };
  }

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
        { workshopCode: { contains: params.keyword } },
        { workshopName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.workshop.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { workshopCode: "asc" },
      }),
      this.prisma.workshop.count({ where }),
    ]);

    return { items, total };
  }
}
