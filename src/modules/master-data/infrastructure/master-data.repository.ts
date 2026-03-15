import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

@Injectable()
export class MasterDataRepository {
  constructor(private readonly prisma: PrismaService) {}

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
