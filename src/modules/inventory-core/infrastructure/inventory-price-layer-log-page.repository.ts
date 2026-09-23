import { Prisma } from "../../../../generated/prisma/client";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import type { FindInventoryLogsParams } from "./inventory-log-query.repository";

export type PriceLayerPageKey = {
  id: number;
  projectTargetId: number | null;
  unitCost: Prisma.Decimal | null;
};

export function inventoryPriceLayerRowKey(row: PriceLayerPageKey) {
  return `${row.id}:${row.projectTargetId ?? "none"}:${row.unitCost == null ? "unknown" : new Prisma.Decimal(row.unitCost).toString()}`;
}

/** Page price-layer rows before loading document/material metadata. */
export async function findInventoryPriceLayerLogPage(
  prisma: PrismaService,
  params: FindInventoryLogsParams,
) {
  const filters: Prisma.Sql[] = [];
  if (params.materialId != null)
    filters.push(Prisma.sql`l.material_id = ${params.materialId}`);
  if (params.stockScopeIds?.length)
    filters.push(
      Prisma.sql`l.stock_scope_id IN (${Prisma.join(params.stockScopeIds)})`,
    );
  if (params.workshopId != null)
    filters.push(Prisma.sql`l.workshop_id = ${params.workshopId}`);
  if (params.businessDocumentId != null)
    filters.push(
      Prisma.sql`l.business_document_id = ${params.businessDocumentId}`,
    );
  if (params.businessDocumentType)
    filters.push(
      Prisma.sql`l.business_document_type = ${params.businessDocumentType}`,
    );
  if (params.businessDocumentNumber)
    filters.push(
      Prisma.sql`INSTR(l.business_document_number, ${params.businessDocumentNumber}) > 0`,
    );
  if (params.operationType)
    filters.push(Prisma.sql`l.operation_type = ${params.operationType}`);
  if (params.bizDateFrom)
    filters.push(Prisma.sql`l.biz_date >= ${params.bizDateFrom}`);
  if (params.bizDateTo)
    filters.push(Prisma.sql`l.biz_date <= ${params.bizDateTo}`);
  const predicate = filters.length
    ? Prisma.join(filters, " AND ")
    : Prisma.sql`1 = 1`;
  const rows = Prisma.sql`
    WITH matching AS (SELECT l.id, l.unit_cost, l.project_target_id, l.reversal_of_log_id FROM inventory_log l WHERE ${predicate}),
    price_rows AS (
      SELECT l.id, s.project_target_id AS projectTargetId, a.unit_cost AS unitCost
      FROM matching l
      JOIN inventory_log_cost_allocation a ON a.inventory_log_id = l.id
      JOIN inventory_log s ON s.id = a.source_log_id
      GROUP BY l.id, s.project_target_id, a.unit_cost
      UNION ALL
      SELECT l.id, s.project_target_id AS projectTargetId, a.unit_cost AS unitCost
      FROM matching l
      JOIN inventory_log original ON original.id = l.reversal_of_log_id
      JOIN inventory_log_cost_allocation a ON a.inventory_log_id = original.id
      JOIN inventory_log s ON s.id = a.source_log_id
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_log_cost_allocation own
        WHERE own.inventory_log_id = l.id
      )
      GROUP BY l.id, s.project_target_id, a.unit_cost
      UNION ALL
      SELECT l.id, l.project_target_id AS projectTargetId, l.unit_cost AS unitCost
      FROM matching l
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_log_cost_allocation a
        WHERE a.inventory_log_id = l.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM inventory_log original
        JOIN inventory_log_cost_allocation a ON a.inventory_log_id = original.id
        WHERE original.id = l.reversal_of_log_id
      )
    )`;

  return prisma.runInTransaction(async (db) => {
    const [count] = await db.$queryRaw<
      { total: bigint }[]
    >`${rows} SELECT COUNT(*) AS total FROM price_rows`;
    const pageKeys = await db.$queryRaw<PriceLayerPageKey[]>`${rows}
      SELECT id, projectTargetId, unitCost FROM price_rows
      ORDER BY id DESC, projectTargetId ASC, unitCost ASC
      LIMIT ${params.limit} OFFSET ${params.offset}`;
    const items = pageKeys.length
      ? await db.inventoryLog.findMany({
          where: { id: { in: [...new Set(pageKeys.map((key) => key.id))] } },
          include: { material: true, stockScope: true, workshop: true },
          orderBy: { id: "desc" },
        })
      : [];
    return {
      items,
      total: Number(count?.total ?? 0),
      rowKeys: pageKeys.map(inventoryPriceLayerRowKey),
    };
  });
}
