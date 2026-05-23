import { Prisma } from "../../../../generated/prisma/client";
import {
  buildSqlWhere,
  naturalCodeOrderBySql,
  orderByIds,
} from "../../../shared/prisma/natural-code-ordering";
import { PrismaService } from "../../../shared/prisma/prisma.service";

export type FindInventoryBalancesParams = {
  materialId?: number;
  stockScopeIds?: number[];
  keyword?: string;
  categoryIds?: number[];
  limit: number;
  offset: number;
};

function splitSearchTokens(keyword?: string): string[] {
  return (keyword ?? "")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export class InventoryBalanceQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBalances(params: FindInventoryBalancesParams) {
    const where = this.buildInventoryBalanceWhere(params);
    const [sortedIdRows, total] = await Promise.all([
      this.findBalanceIdsByNaturalMaterialCode(params),
      this.prisma.inventoryBalance.count({ where }),
    ]);
    const sortedIds = sortedIdRows.map((row) => Number(row.id));
    if (sortedIds.length === 0) {
      return { items: [], total };
    }

    const items = await this.prisma.inventoryBalance.findMany({
      where: { id: { in: sortedIds } },
      include: { material: true, stockScope: true },
    });

    return { items: orderByIds(items, sortedIds), total };
  }

  private buildInventoryBalanceWhere(
    params: FindInventoryBalancesParams,
  ): Prisma.InventoryBalanceWhereInput {
    const where: Prisma.InventoryBalanceWhereInput = {};
    if (params.materialId) where.materialId = params.materialId;
    if (params.stockScopeIds?.length === 1) {
      where.stockScopeId = params.stockScopeIds[0];
    } else if (params.stockScopeIds?.length) {
      where.stockScopeId = { in: params.stockScopeIds };
    }
    const materialWhere = this.buildInventoryBalanceMaterialWhere(params);
    if (materialWhere) {
      where.material = materialWhere;
    }

    return where;
  }

  private buildInventoryBalanceMaterialWhere(params: {
    keyword?: string;
    categoryIds?: number[];
  }): Prisma.MaterialWhereInput | undefined {
    const materialWhere: Prisma.MaterialWhereInput = {};
    const keywordTokens = splitSearchTokens(params.keyword);
    if (keywordTokens.length > 0) {
      materialWhere.AND = keywordTokens.map((token) => ({
        OR: [
          { materialCode: { contains: token } },
          { materialName: { contains: token } },
          { specModel: { contains: token } },
        ],
      }));
    }
    if (params.categoryIds?.length === 1) {
      materialWhere.categoryId = params.categoryIds[0];
    } else if (params.categoryIds?.length) {
      materialWhere.categoryId = { in: params.categoryIds };
    }

    return Object.keys(materialWhere).length > 0 ? materialWhere : undefined;
  }

  private findBalanceIdsByNaturalMaterialCode(
    params: FindInventoryBalancesParams,
  ) {
    return this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT inventory_balance.id AS id
      FROM inventory_balance
      INNER JOIN material ON material.id = inventory_balance.material_id
      ${this.buildBalanceListWhereSql(params)}
      ORDER BY
        ${naturalCodeOrderBySql(
          Prisma.sql`material.material_code`,
          Prisma.sql`inventory_balance.stock_scope_id`,
        )},
        inventory_balance.id ASC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `);
  }

  private buildBalanceListWhereSql(
    params: FindInventoryBalancesParams,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (params.materialId) {
      conditions.push(
        Prisma.sql`inventory_balance.material_id = ${params.materialId}`,
      );
    }
    if (params.stockScopeIds?.length === 1) {
      conditions.push(
        Prisma.sql`inventory_balance.stock_scope_id = ${params.stockScopeIds[0]}`,
      );
    } else if (params.stockScopeIds?.length) {
      conditions.push(
        Prisma.sql`inventory_balance.stock_scope_id IN (${Prisma.join(params.stockScopeIds)})`,
      );
    }

    const keywordTokens = splitSearchTokens(params.keyword);
    for (const token of keywordTokens) {
      const keywordPattern = `%${token}%`;
      conditions.push(Prisma.sql`(
        material.material_code LIKE ${keywordPattern}
        OR material.material_name LIKE ${keywordPattern}
        OR material.spec_model LIKE ${keywordPattern}
      )`);
    }
    if (params.categoryIds?.length === 1) {
      conditions.push(
        Prisma.sql`material.category_id = ${params.categoryIds[0]}`,
      );
    } else if (params.categoryIds?.length) {
      conditions.push(
        Prisma.sql`material.category_id IN (${Prisma.join(params.categoryIds)})`,
      );
    }

    return buildSqlWhere(conditions);
  }
}
