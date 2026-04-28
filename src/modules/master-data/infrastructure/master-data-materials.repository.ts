import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

export class MasterDataMaterialsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMaterialCategories(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.MaterialCategoryWhereInput["status"];
  }) {
    const where: Prisma.MaterialCategoryWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { categoryCode: { contains: params.keyword } },
        { categoryName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.materialCategory.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ sortOrder: "asc" }, { categoryCode: "asc" }],
      }),
      this.prisma.materialCategory.count({ where }),
    ]);

    return { items, total };
  }

  async findMaterialCategoryById(id: number) {
    return this.prisma.materialCategory.findUnique({
      where: { id },
    });
  }

  async findMaterialCategoryByCode(categoryCode: string) {
    return this.prisma.materialCategory.findUnique({
      where: { categoryCode },
    });
  }

  async createMaterialCategory(
    data: Pick<
      Prisma.MaterialCategoryUncheckedCreateInput,
      "categoryCode" | "categoryName" | "sortOrder"
    >,
    createdBy?: string,
  ) {
    return this.prisma.materialCategory.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateMaterialCategory(
    id: number,
    data: Prisma.MaterialCategoryUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.materialCategory.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async countActiveMaterialsByCategory(categoryId: number) {
    return this.prisma.material.count({
      where: { categoryId, status: "ACTIVE" },
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
        { specModel: { contains: params.keyword } },
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

  async createAutoMaterial(
    data: Pick<
      Prisma.MaterialUncheckedCreateInput,
      | "materialCode"
      | "materialName"
      | "unitCode"
      | "specModel"
      | "categoryId"
      | "sourceDocumentType"
      | "sourceDocumentId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.material.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
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

  async countPositiveInventoryBalanceRows(materialId: number): Promise<number> {
    return this.prisma.inventoryBalance.count({
      where: { materialId, quantityOnHand: { gt: 0 } },
    });
  }

  async countEffectiveDocumentReferences(materialId: number): Promise<number> {
    const [
      stockIn,
      customerStock,
      workshopMaterial,
      rdProject,
      rdHandoff,
      rdProcurement,
      rdStocktake,
    ] = await Promise.all([
      this.prisma.stockInOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.salesStockOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.workshopMaterialOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdProjectMaterialLine.count({
        where: { materialId, rdProject: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdHandoffOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdProcurementRequestLine.count({
        where: { materialId, request: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdStocktakeOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
    ]);

    return (
      stockIn +
      customerStock +
      workshopMaterial +
      rdProject +
      rdHandoff +
      rdProcurement +
      rdStocktake
    );
  }
}
