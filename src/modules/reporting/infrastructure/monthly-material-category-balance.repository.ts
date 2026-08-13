import { Injectable } from "@nestjs/common";
import { Prisma, StockDirection } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import type { MonthlyMaterialCategoryBalanceSnapshot } from "../application/monthly-reporting.shared";

interface RawMonthlyMaterialCategoryBalanceSnapshot {
  materialId: number;
  materialCode: string;
  materialName: string;
  materialSpec: string | null;
  unitCode: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string | null;
  openingQuantity: Prisma.Decimal | string | number | null;
  openingAmount: Prisma.Decimal | string | number | null;
  inboundAmount: Prisma.Decimal | string | number | null;
  outboundAmount: Prisma.Decimal | string | number | null;
  closingQuantity: Prisma.Decimal | string | number | null;
  closingAmount: Prisma.Decimal | string | number | null;
}

@Injectable()
export class MonthlyMaterialCategoryBalanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMonthlyMaterialCategoryBalanceSnapshots(params: {
    start: Date;
    end: Date;
    stockScope?: StockScopeCode;
  }): Promise<MonthlyMaterialCategoryBalanceSnapshot[]> {
    const rows = await this.prisma.$queryRaw<
      RawMonthlyMaterialCategoryBalanceSnapshot[]
    >(Prisma.sql`
      SELECT
        material.id AS materialId,
        material.material_code AS materialCode,
        material.material_name AS materialName,
        material.spec_model AS materialSpec,
        material.unit_code AS unitCode,
        material_category.id AS categoryId,
        material_category.category_code AS categoryCode,
        COALESCE(material_category.category_name, '未分类') AS categoryName,
        SUM(
          CASE
            WHEN inventory_log.biz_date < ${params.start}
            THEN ${this.signedQuantitySql()}
            ELSE 0
          END
        ) AS openingQuantity,
        SUM(
          CASE
            WHEN inventory_log.biz_date < ${params.start}
            THEN ${this.signedAmountSql()}
            ELSE 0
          END
        ) AS openingAmount,
        SUM(
          CASE
            WHEN inventory_log.biz_date >= ${params.start}
              AND inventory_log.direction = ${StockDirection.IN}
            THEN COALESCE(inventory_log.cost_amount, 0)
            ELSE 0
          END
        ) AS inboundAmount,
        SUM(
          CASE
            WHEN inventory_log.biz_date >= ${params.start}
              AND inventory_log.direction = ${StockDirection.OUT}
            THEN COALESCE(inventory_log.cost_amount, 0)
            ELSE 0
          END
        ) AS outboundAmount,
        SUM(${this.signedQuantitySql()}) AS closingQuantity,
        SUM(${this.signedAmountSql()}) AS closingAmount
      FROM inventory_log
      INNER JOIN material ON material.id = inventory_log.material_id
      LEFT JOIN material_category ON material_category.id = material.category_id
      LEFT JOIN stock_scope ON stock_scope.id = inventory_log.stock_scope_id
      WHERE inventory_log.biz_date <= ${params.end}
        ${this.buildStockScopeSql(params.stockScope)}
      GROUP BY
        material.id,
        material.material_code,
        material.material_name,
        material.spec_model,
        material.unit_code,
        material_category.id,
        material_category.category_code,
        material_category.category_name
      HAVING openingQuantity <> 0
        OR openingAmount <> 0
        OR inboundAmount <> 0
        OR outboundAmount <> 0
        OR closingQuantity <> 0
        OR closingAmount <> 0
    `);

    return rows.map((row) => ({
      materialId: Number(row.materialId),
      materialCode: row.materialCode,
      materialName: row.materialName,
      materialSpec: row.materialSpec,
      unitCode: row.unitCode,
      categoryId: row.categoryId === null ? null : Number(row.categoryId),
      categoryCode: row.categoryCode,
      categoryName: row.categoryName?.trim() || "未分类",
      openingQuantity: new Prisma.Decimal(row.openingQuantity ?? 0),
      openingAmount: new Prisma.Decimal(row.openingAmount ?? 0),
      inboundAmount: new Prisma.Decimal(row.inboundAmount ?? 0),
      outboundAmount: new Prisma.Decimal(row.outboundAmount ?? 0),
      closingQuantity: new Prisma.Decimal(row.closingQuantity ?? 0),
      closingAmount: new Prisma.Decimal(row.closingAmount ?? 0),
    }));
  }

  private buildStockScopeSql(stockScope?: StockScopeCode) {
    if (!stockScope) {
      return Prisma.empty;
    }

    if (stockScope === "MAIN") {
      return Prisma.sql`AND (stock_scope.scope_code = ${stockScope} OR inventory_log.stock_scope_id IS NULL)`;
    }

    return Prisma.sql`AND stock_scope.scope_code = ${stockScope}`;
  }

  private signedQuantitySql() {
    return Prisma.sql`
      CASE
        WHEN inventory_log.direction = ${StockDirection.IN}
        THEN inventory_log.change_qty
        ELSE -inventory_log.change_qty
      END
    `;
  }

  private signedAmountSql() {
    return Prisma.sql`
      CASE
        WHEN inventory_log.direction = ${StockDirection.IN}
        THEN COALESCE(inventory_log.cost_amount, 0)
        ELSE -COALESCE(inventory_log.cost_amount, 0)
      END
    `;
  }
}
