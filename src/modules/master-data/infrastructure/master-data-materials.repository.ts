import { Prisma } from "../../../../generated/prisma/client";
import {
  buildSqlWhere,
  naturalCodeOrderBySql,
  orderByIds,
} from "../../../shared/prisma/natural-code-ordering";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type FindMaterialsParams = {
  keyword?: string;
  materialCode?: string;
  materialName?: string;
  specModel?: string;
  categoryId?: number;
  unitCode?: string;
  warningMinQty?: string;
  limit: number;
  offset: number;
  status?: Prisma.MaterialWhereInput["status"];
};

function splitSearchTokens(keyword?: string): string[] {
  return (keyword ?? "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

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

  async findMaterials(params: FindMaterialsParams) {
    const where: Prisma.MaterialWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    const keywordTokens = splitSearchTokens(params.keyword);
    if (keywordTokens.length > 0) {
      where.AND = keywordTokens.map((token) => ({
        OR: [
          { materialCode: { contains: token } },
          { materialName: { contains: token } },
          { specModel: { contains: token } },
        ],
      }));
    }
    if (params.materialCode) {
      where.materialCode = { contains: params.materialCode };
    }
    if (params.materialName) {
      where.materialName = { contains: params.materialName };
    }
    if (params.specModel) {
      where.specModel = { contains: params.specModel };
    }
    if (typeof params.categoryId === "number") {
      where.categoryId = params.categoryId;
    }
    if (params.unitCode) {
      where.unitCode = { contains: params.unitCode };
    }
    if (params.warningMinQty) {
      where.warningMinQty = new Prisma.Decimal(params.warningMinQty);
    }

    const [sortedIdRows, total] = await Promise.all([
      this.findMaterialIdsByNaturalCode(params),
      this.prisma.material.count({ where }),
    ]);
    const sortedIds = sortedIdRows.map((row) => Number(row.id));
    if (sortedIds.length === 0) {
      return { items: [], total };
    }

    const items = await this.prisma.material.findMany({
      where: { id: { in: sortedIds } },
      include: { category: true },
    });

    return { items: orderByIds(items, sortedIds), total };
  }

  private findMaterialIdsByNaturalCode(params: FindMaterialsParams) {
    return this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM material
      ${this.buildMaterialListWhereSql(params)}
      ORDER BY ${naturalCodeOrderBySql(Prisma.sql`material_code`)}
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `);
  }

  private buildMaterialListWhereSql(params: FindMaterialsParams): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (params.status) {
      conditions.push(Prisma.sql`status = ${params.status}`);
    }
    const keywordTokens = splitSearchTokens(params.keyword);
    for (const token of keywordTokens) {
      const keyword = `%${token}%`;
      conditions.push(Prisma.sql`(
        material_code LIKE ${keyword}
        OR material_name LIKE ${keyword}
        OR spec_model LIKE ${keyword}
      )`);
    }
    if (params.materialCode) {
      conditions.push(
        Prisma.sql`material_code LIKE ${`%${params.materialCode}%`}`,
      );
    }
    if (params.materialName) {
      conditions.push(
        Prisma.sql`material_name LIKE ${`%${params.materialName}%`}`,
      );
    }
    if (params.specModel) {
      conditions.push(Prisma.sql`spec_model LIKE ${`%${params.specModel}%`}`);
    }
    if (typeof params.categoryId === "number") {
      conditions.push(Prisma.sql`category_id = ${params.categoryId}`);
    }
    if (params.unitCode) {
      conditions.push(Prisma.sql`unit_code LIKE ${`%${params.unitCode}%`}`);
    }
    if (params.warningMinQty) {
      conditions.push(Prisma.sql`warning_min_qty = ${params.warningMinQty}`);
    }

    return buildSqlWhere(conditions);
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
