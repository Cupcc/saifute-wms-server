import type { MigrationConnectionLike } from "../db";
import { BusinessDocumentType } from "../shared/business-document-type";
import type { InventoryEvent, InventoryReplayCoverageGap } from "./types";

interface StockScopeIds {
  MAIN: number;
  RD_SUB: number;
}

interface DocumentLineRow {
  orderId: number;
  documentNo: string;
  orderType: string;
  bizDate: string;
  stockScopeId: number | null;
  workshopId: number | null;
  workshopName: string | null;
  lineId: number;
  materialId: number;
  quantity: string;
  unitCost: string | null;
  costAmount: string | null;
  selectedUnitCost: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceDocumentLineId: number | null;
  orderRemark?: string | null;
  lineRemark?: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

const DIRECTION_PRIORITY_IN = 0;
const DIRECTION_PRIORITY_OUT = 1;
const STOCK_IN_DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
const SALES_STOCK_DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;
const WORKSHOP_MATERIAL_DOCUMENT_TYPE =
  BusinessDocumentType.WorkshopMaterialOrder;
const RD_PROJECT_DOCUMENT_TYPE = BusinessDocumentType.RdProject;
const RD_PROJECT_ACTION_DOCUMENT_TYPE =
  BusinessDocumentType.RdProjectMaterialAction;
const RD_HANDOFF_DOCUMENT_TYPE = BusinessDocumentType.RdHandoffOrder;
const RD_STOCKTAKE_DOCUMENT_TYPE = BusinessDocumentType.RdStocktakeOrder;
const PRICE_CORRECTION_DOCUMENT_TYPE =
  BusinessDocumentType.StockInPriceCorrectionOrder;

function toDateString(value: string | null): string {
  if (!value) return "1970-01-01";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] ?? "1970-01-01";
}

function toDateTimeString(value: string | null): string {
  if (!value) return "1970-01-01 00:00:00";
  const text = String(value);
  return text.length >= 19 ? text.slice(0, 19) : text;
}

function toNullableString(
  value: string | number | null | undefined,
): string | null {
  if (value === null || typeof value === "undefined") return null;
  return String(value);
}

function combineRemarks(
  ...values: Array<string | null | undefined>
): string | null {
  const remarks = values
    .map((value) => toNullableString(value)?.trim() ?? "")
    .filter((value) => value.length > 0);
  return remarks.length > 0 ? remarks.join(" | ") : null;
}

function toPositiveDecimalString(value: string | number | null): string {
  const text = String(value ?? "0");
  return text.startsWith("-") ? text.slice(1) : text;
}

function isNegativeDecimal(value: string | number | null): boolean {
  return String(value ?? "0")
    .trim()
    .startsWith("-");
}

function resolveStockScopeId(
  row: Pick<DocumentLineRow, "stockScopeId" | "workshopName">,
  stockScopeIds: StockScopeIds,
): number {
  if (typeof row.stockScopeId === "number" && row.stockScopeId > 0) {
    return row.stockScopeId;
  }

  if (row.workshopName === "研发小仓") {
    return stockScopeIds.RD_SUB;
  }

  return stockScopeIds.MAIN;
}

async function readStockScopeIds(
  connection: MigrationConnectionLike,
): Promise<StockScopeIds> {
  const rows = await connection.query<
    Array<{ id: number; scopeCode: "MAIN" | "RD_SUB" }>
  >(
    `
      SELECT id, scope_code AS scopeCode
      FROM stock_scope
      WHERE scope_code IN ('MAIN', 'RD_SUB')
    `,
  );

  const byCode = new Map(rows.map((row) => [row.scopeCode, row.id]));
  const main = byCode.get("MAIN");
  const rdSub = byCode.get("RD_SUB");

  if (!main || !rdSub) {
    throw new Error("stock_scope must contain MAIN and RD_SUB before replay.");
  }

  return { MAIN: main, RD_SUB: rdSub };
}

async function readStockInEvents(
  connection: MigrationConnectionLike,
  stockScopeIds: StockScopeIds,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      o.id AS orderId,
      o.document_no AS documentNo,
      o.order_type AS orderType,
      DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
      o.stock_scope_id AS stockScopeId,
      o.workshop_id AS workshopId,
      w.workshop_name AS workshopName,
      l.id AS lineId,
      l.material_id AS materialId,
      l.quantity,
      l.unit_price AS unitCost,
      l.amount AS costAmount,
      NULL AS selectedUnitCost,
      NULL AS sourceDocumentType,
      NULL AS sourceDocumentId,
      NULL AS sourceDocumentLineId,
      o.created_by AS createdBy,
      o.created_at AS createdAt
    FROM stock_in_order o
    JOIN stock_in_order_line l ON l.order_id = o.id
    LEFT JOIN workshop w ON w.id = o.workshop_id
    WHERE o.lifecycle_status = 'EFFECTIVE'
      AND o.inventory_effect_status = 'POSTED'
    ORDER BY o.biz_date ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => {
    const isReversal = isNegativeDecimal(row.quantity);

    return {
      bizDate: toDateString(row.bizDate),
      direction: isReversal ? ("OUT" as const) : ("IN" as const),
      operationType: isReversal
        ? ("REVERSAL_OUT" as const)
        : row.orderType === "PRODUCTION_RECEIPT"
          ? ("PRODUCTION_RECEIPT_IN" as const)
          : ("ACCEPTANCE_IN" as const),
      businessModule: "inbound",
      businessDocumentType: STOCK_IN_DOCUMENT_TYPE,
      businessDocumentId: row.orderId,
      businessDocumentNumber: row.documentNo,
      businessDocumentLineId: row.lineId,
      materialId: row.materialId,
      stockScopeId: resolveStockScopeId(row, stockScopeIds),
      workshopId: row.workshopId,
      changeQty: toPositiveDecimalString(row.quantity),
      unitCost: toNullableString(row.unitCost),
      costAmount: toNullableString(row.costAmount),
      selectedUnitCost: isReversal ? toNullableString(row.unitCost) : null,
      sourceDocumentType: null,
      sourceDocumentId: null,
      sourceDocumentLineId: null,
      transferInStockScopeId: null,
      transferInWorkshopId: null,
      idempotencyKey: `${STOCK_IN_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
      operatorId: row.createdBy,
      occurredAt: toDateTimeString(row.createdAt),
      sortPriority: isReversal ? DIRECTION_PRIORITY_OUT : DIRECTION_PRIORITY_IN,
    };
  });
}

async function readCustomerEvents(
  connection: MigrationConnectionLike,
  stockScopeIds: StockScopeIds,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      o.id AS orderId,
      o.document_no AS documentNo,
      o.order_type AS orderType,
      DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
      o.stock_scope_id AS stockScopeId,
      o.workshop_id AS workshopId,
      w.workshop_name AS workshopName,
      l.id AS lineId,
      l.material_id AS materialId,
      l.quantity,
      COALESCE(l.cost_unit_price, l.selected_unit_cost) AS unitCost,
      l.cost_amount AS costAmount,
      l.selected_unit_cost AS selectedUnitCost,
      l.source_document_type AS sourceDocumentType,
      l.source_document_id AS sourceDocumentId,
      l.source_document_line_id AS sourceDocumentLineId,
      o.remark AS orderRemark,
      l.remark AS lineRemark,
      o.created_by AS createdBy,
      o.created_at AS createdAt
    FROM sales_stock_order o
    JOIN sales_stock_order_line l ON l.order_id = o.id
    LEFT JOIN workshop w ON w.id = o.workshop_id
    WHERE o.lifecycle_status = 'EFFECTIVE'
      AND o.inventory_effect_status = 'POSTED'
    ORDER BY o.biz_date ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => {
    const isSalesReturn = row.orderType === "SALES_RETURN";
    return {
      bizDate: toDateString(row.bizDate),
      direction: isSalesReturn ? ("IN" as const) : ("OUT" as const),
      operationType: isSalesReturn
        ? ("SALES_RETURN_IN" as const)
        : ("OUTBOUND_OUT" as const),
      businessModule: "sales",
      businessDocumentType: SALES_STOCK_DOCUMENT_TYPE,
      businessDocumentId: row.orderId,
      businessDocumentNumber: row.documentNo,
      businessDocumentLineId: row.lineId,
      materialId: row.materialId,
      stockScopeId: resolveStockScopeId(row, stockScopeIds),
      workshopId: row.workshopId,
      changeQty: String(row.quantity),
      unitCost: toNullableString(row.unitCost),
      costAmount: toNullableString(row.costAmount),
      selectedUnitCost: isSalesReturn
        ? null
        : toNullableString(row.selectedUnitCost),
      sourceDocumentType: toNullableString(row.sourceDocumentType),
      sourceDocumentId: row.sourceDocumentId,
      sourceDocumentLineId: row.sourceDocumentLineId,
      transferInStockScopeId: null,
      transferInWorkshopId: null,
      remark: combineRemarks(row.orderRemark, row.lineRemark),
      idempotencyKey: `${SALES_STOCK_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
      operatorId: row.createdBy,
      occurredAt: toDateTimeString(row.createdAt),
      sortPriority: isSalesReturn
        ? DIRECTION_PRIORITY_IN
        : DIRECTION_PRIORITY_OUT,
    };
  });
}

async function readWorkshopEvents(
  connection: MigrationConnectionLike,
  stockScopeIds: StockScopeIds,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      o.id AS orderId,
      o.document_no AS documentNo,
      o.order_type AS orderType,
      DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
      o.stock_scope_id AS stockScopeId,
      o.workshop_id AS workshopId,
      w.workshop_name AS workshopName,
      l.id AS lineId,
      l.material_id AS materialId,
      l.quantity,
      COALESCE(l.cost_unit_price, l.unit_price) AS unitCost,
      COALESCE(l.cost_amount, l.amount) AS costAmount,
      NULL AS selectedUnitCost,
      l.source_document_type AS sourceDocumentType,
      l.source_document_id AS sourceDocumentId,
      l.source_document_line_id AS sourceDocumentLineId,
      o.remark AS orderRemark,
      l.remark AS lineRemark,
      o.created_by AS createdBy,
      o.created_at AS createdAt
    FROM workshop_material_order o
    JOIN workshop_material_order_line l ON l.order_id = o.id
    LEFT JOIN workshop w ON w.id = o.workshop_id
    WHERE o.lifecycle_status = 'EFFECTIVE'
      AND o.inventory_effect_status = 'POSTED'
    ORDER BY o.biz_date ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => {
    const isReturn = row.orderType === "RETURN";
    const operationType =
      row.orderType === "PICK"
        ? ("PICK_OUT" as const)
        : row.orderType === "SCRAP"
          ? ("SCRAP_OUT" as const)
          : ("RETURN_IN" as const);

    return {
      bizDate: toDateString(row.bizDate),
      direction: isReturn ? ("IN" as const) : ("OUT" as const),
      operationType,
      businessModule: "workshop-material",
      businessDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
      businessDocumentId: row.orderId,
      businessDocumentNumber: row.documentNo,
      businessDocumentLineId: row.lineId,
      materialId: row.materialId,
      stockScopeId: resolveStockScopeId(row, stockScopeIds),
      workshopId: row.workshopId,
      changeQty: String(row.quantity),
      unitCost: toNullableString(row.unitCost),
      costAmount: toNullableString(row.costAmount),
      selectedUnitCost: null,
      sourceDocumentType: toNullableString(row.sourceDocumentType),
      sourceDocumentId: row.sourceDocumentId,
      sourceDocumentLineId: row.sourceDocumentLineId,
      transferInStockScopeId: null,
      transferInWorkshopId: null,
      remark: combineRemarks(row.orderRemark, row.lineRemark),
      idempotencyKey: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
      operatorId: row.createdBy,
      occurredAt: toDateTimeString(row.createdAt),
      sortPriority: isReturn ? DIRECTION_PRIORITY_IN : DIRECTION_PRIORITY_OUT,
    };
  });
}

async function readProjectEvents(
  connection: MigrationConnectionLike,
  stockScopeIds: StockScopeIds,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      p.id AS orderId,
      p.project_code AS documentNo,
      'RD_PROJECT' AS orderType,
      DATE_FORMAT(p.biz_date, '%Y-%m-%d') AS bizDate,
      p.stock_scope_id AS stockScopeId,
      p.workshop_id AS workshopId,
      w.workshop_name AS workshopName,
      l.id AS lineId,
      l.material_id AS materialId,
      l.quantity,
      COALESCE(l.cost_unit_price, l.unit_price) AS unitCost,
      COALESCE(l.cost_amount, l.amount) AS costAmount,
      NULL AS selectedUnitCost,
      NULL AS sourceDocumentType,
      NULL AS sourceDocumentId,
      NULL AS sourceDocumentLineId,
      p.created_by AS createdBy,
      p.created_at AS createdAt
    FROM rd_project p
    JOIN rd_project_material_line l ON l.project_id = p.id
    LEFT JOIN workshop w ON w.id = p.workshop_id
    WHERE p.lifecycle_status = 'EFFECTIVE'
      AND p.inventory_effect_status = 'POSTED'
    ORDER BY p.biz_date ASC, p.id ASC, l.id ASC
  `);

  return rows.map((row) => ({
    bizDate: toDateString(row.bizDate),
    direction: "OUT" as const,
    operationType: "RD_PROJECT_OUT" as const,
    businessModule: "rd-project",
    businessDocumentType: RD_PROJECT_DOCUMENT_TYPE,
    businessDocumentId: row.orderId,
    businessDocumentNumber: row.documentNo,
    businessDocumentLineId: row.lineId,
    materialId: row.materialId,
    stockScopeId: resolveStockScopeId(row, stockScopeIds),
    workshopId: row.workshopId,
    changeQty: String(row.quantity),
    unitCost: toNullableString(row.unitCost),
    costAmount: toNullableString(row.costAmount),
    selectedUnitCost: null,
    sourceDocumentType: null,
    sourceDocumentId: null,
    sourceDocumentLineId: null,
    transferInStockScopeId: null,
    transferInWorkshopId: null,
    idempotencyKey: `${RD_PROJECT_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
    operatorId: row.createdBy,
    occurredAt: toDateTimeString(row.createdAt),
    sortPriority: DIRECTION_PRIORITY_OUT,
  }));
}

async function readProjectActionEvents(
  connection: MigrationConnectionLike,
  stockScopeIds: StockScopeIds,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      a.id AS orderId,
      a.document_no AS documentNo,
      a.action_type AS orderType,
      DATE_FORMAT(a.biz_date, '%Y-%m-%d') AS bizDate,
      a.stock_scope_id AS stockScopeId,
      a.workshop_id AS workshopId,
      w.workshop_name AS workshopName,
      l.id AS lineId,
      l.material_id AS materialId,
      l.quantity,
      COALESCE(l.cost_unit_price, l.unit_price) AS unitCost,
      COALESCE(l.cost_amount, l.amount) AS costAmount,
      NULL AS selectedUnitCost,
      l.source_document_type AS sourceDocumentType,
      l.source_document_id AS sourceDocumentId,
      l.source_document_line_id AS sourceDocumentLineId,
      a.created_by AS createdBy,
      a.created_at AS createdAt
    FROM rd_project_material_action a
    JOIN rd_project_material_action_line l ON l.action_id = a.id
    LEFT JOIN workshop w ON w.id = a.workshop_id
    WHERE a.lifecycle_status = 'EFFECTIVE'
      AND a.inventory_effect_status = 'POSTED'
    ORDER BY a.biz_date ASC, a.id ASC, l.id ASC
  `);

  return rows.map((row) => {
    const isReturn = row.orderType === "RETURN";
    const operationType =
      row.orderType === "PICK"
        ? ("RD_PROJECT_OUT" as const)
        : row.orderType === "SCRAP"
          ? ("SCRAP_OUT" as const)
          : ("RETURN_IN" as const);

    return {
      bizDate: toDateString(row.bizDate),
      direction: isReturn ? ("IN" as const) : ("OUT" as const),
      operationType,
      businessModule: "rd-project",
      businessDocumentType: RD_PROJECT_ACTION_DOCUMENT_TYPE,
      businessDocumentId: row.orderId,
      businessDocumentNumber: row.documentNo,
      businessDocumentLineId: row.lineId,
      materialId: row.materialId,
      stockScopeId: resolveStockScopeId(row, stockScopeIds),
      workshopId: row.workshopId,
      changeQty: String(row.quantity),
      unitCost: toNullableString(row.unitCost),
      costAmount: toNullableString(row.costAmount),
      selectedUnitCost: null,
      sourceDocumentType: toNullableString(row.sourceDocumentType),
      sourceDocumentId: row.sourceDocumentId,
      sourceDocumentLineId: row.sourceDocumentLineId,
      transferInStockScopeId: null,
      transferInWorkshopId: null,
      idempotencyKey: `${RD_PROJECT_ACTION_DOCUMENT_TYPE}:${row.orderId}:line:${row.lineId}`,
      operatorId: row.createdBy,
      occurredAt: toDateTimeString(row.createdAt),
      sortPriority: isReturn ? DIRECTION_PRIORITY_IN : DIRECTION_PRIORITY_OUT,
    };
  });
}

async function readRdHandoffEvents(
  connection: MigrationConnectionLike,
  stockScopeIds: StockScopeIds,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<
    Array<
      DocumentLineRow & {
        transferInStockScopeId: number | null;
        transferInWorkshopId: number | null;
      }
    >
  >(`
    SELECT
      o.id AS orderId,
      o.document_no AS documentNo,
      'RD_HANDOFF' AS orderType,
      DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
      o.source_stock_scope_id AS stockScopeId,
      o.source_workshop_id AS workshopId,
      source_workshop.workshop_name AS workshopName,
      o.target_stock_scope_id AS transferInStockScopeId,
      o.target_workshop_id AS transferInWorkshopId,
      l.id AS lineId,
      l.material_id AS materialId,
      l.quantity,
      l.cost_unit_price AS unitCost,
      l.cost_amount AS costAmount,
      NULL AS selectedUnitCost,
      l.source_document_type AS sourceDocumentType,
      l.source_document_id AS sourceDocumentId,
      l.source_document_line_id AS sourceDocumentLineId,
      o.created_by AS createdBy,
      o.created_at AS createdAt
    FROM rd_handoff_order o
    JOIN rd_handoff_order_line l ON l.order_id = o.id
    LEFT JOIN workshop source_workshop ON source_workshop.id = o.source_workshop_id
    WHERE o.lifecycle_status = 'EFFECTIVE'
      AND o.inventory_effect_status = 'POSTED'
    ORDER BY o.biz_date ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => ({
    bizDate: toDateString(row.bizDate),
    direction: "OUT" as const,
    operationType: "RD_HANDOFF_OUT" as const,
    businessModule: "rd-subwarehouse",
    businessDocumentType: RD_HANDOFF_DOCUMENT_TYPE,
    businessDocumentId: row.orderId,
    businessDocumentNumber: row.documentNo,
    businessDocumentLineId: row.lineId,
    materialId: row.materialId,
    stockScopeId: resolveStockScopeId(row, stockScopeIds),
    workshopId: row.workshopId,
    changeQty: String(row.quantity),
    unitCost: toNullableString(row.unitCost),
    costAmount: toNullableString(row.costAmount),
    selectedUnitCost: null,
    sourceDocumentType: toNullableString(row.sourceDocumentType),
    sourceDocumentId: row.sourceDocumentId,
    sourceDocumentLineId: row.sourceDocumentLineId,
    transferInStockScopeId: row.transferInStockScopeId ?? stockScopeIds.RD_SUB,
    transferInWorkshopId: row.transferInWorkshopId,
    idempotencyKey: `${RD_HANDOFF_DOCUMENT_TYPE}:${row.orderId}:out:${row.lineId}`,
    operatorId: row.createdBy,
    occurredAt: toDateTimeString(row.createdAt),
    sortPriority: DIRECTION_PRIORITY_OUT,
  }));
}

async function readRdStocktakeEvents(
  connection: MigrationConnectionLike,
  stockScopeIds: StockScopeIds,
): Promise<InventoryEvent[]> {
  const rows = await connection.query<DocumentLineRow[]>(`
    SELECT
      o.id AS orderId,
      o.document_no AS documentNo,
      'RD_STOCKTAKE' AS orderType,
      DATE_FORMAT(o.biz_date, '%Y-%m-%d') AS bizDate,
      o.stock_scope_id AS stockScopeId,
      o.workshop_id AS workshopId,
      w.workshop_name AS workshopName,
      l.id AS lineId,
      l.material_id AS materialId,
      l.adjustment_qty AS quantity,
      NULL AS unitCost,
      NULL AS costAmount,
      NULL AS selectedUnitCost,
      NULL AS sourceDocumentType,
      NULL AS sourceDocumentId,
      NULL AS sourceDocumentLineId,
      o.created_by AS createdBy,
      o.created_at AS createdAt
    FROM rd_stocktake_order o
    JOIN rd_stocktake_order_line l ON l.order_id = o.id
    LEFT JOIN workshop w ON w.id = o.workshop_id
    WHERE o.lifecycle_status = 'EFFECTIVE'
      AND o.inventory_effect_status = 'POSTED'
      AND l.adjustment_qty <> 0
    ORDER BY o.biz_date ASC, o.id ASC, l.id ASC
  `);

  return rows.map((row) => {
    const direction = isNegativeDecimal(row.quantity)
      ? ("OUT" as const)
      : ("IN" as const);
    return {
      bizDate: toDateString(row.bizDate),
      direction,
      operationType:
        direction === "IN"
          ? ("RD_STOCKTAKE_IN" as const)
          : ("RD_STOCKTAKE_OUT" as const),
      businessModule: "rd-subwarehouse",
      businessDocumentType: RD_STOCKTAKE_DOCUMENT_TYPE,
      businessDocumentId: row.orderId,
      businessDocumentNumber: row.documentNo,
      businessDocumentLineId: row.lineId,
      materialId: row.materialId,
      stockScopeId: resolveStockScopeId(row, stockScopeIds),
      workshopId: row.workshopId,
      changeQty: toPositiveDecimalString(row.quantity),
      unitCost: null,
      costAmount: null,
      selectedUnitCost: null,
      sourceDocumentType: null,
      sourceDocumentId: null,
      sourceDocumentLineId: null,
      transferInStockScopeId: null,
      transferInWorkshopId: null,
      idempotencyKey: `${RD_STOCKTAKE_DOCUMENT_TYPE}:${row.orderId}:${direction === "IN" ? "in" : "out"}:${row.lineId}`,
      operatorId: row.createdBy,
      occurredAt: toDateTimeString(row.createdAt),
      sortPriority:
        direction === "IN" ? DIRECTION_PRIORITY_IN : DIRECTION_PRIORITY_OUT,
    };
  });
}

async function readCoverageGaps(
  connection: MigrationConnectionLike,
): Promise<InventoryReplayCoverageGap[]> {
  const rows = await connection.query<
    Array<{ family: string; effectiveRows: number }>
  >(
    `
      SELECT ? AS family, COUNT(*) AS effectiveRows
      FROM stock_in_price_correction_order o
      JOIN stock_in_price_correction_order_line l ON l.order_id = o.id
      WHERE o.lifecycle_status = 'EFFECTIVE'
        AND o.inventory_effect_status = 'POSTED'
    `,
    [PRICE_CORRECTION_DOCUMENT_TYPE],
  );

  return rows
    .filter((row) => Number(row.effectiveRows) > 0)
    .map((row) => ({
      family: row.family,
      effectiveRows: Number(row.effectiveRows),
      reason:
        "price correction replay needs source-log remapping and is intentionally blocked until implemented.",
    }));
}

export async function readInventoryReplayInput(
  connection: MigrationConnectionLike,
): Promise<{
  events: InventoryEvent[];
  coverageGaps: InventoryReplayCoverageGap[];
}> {
  const stockScopeIds = await readStockScopeIds(connection);
  const [
    stockIn,
    customer,
    workshop,
    project,
    projectAction,
    rdHandoff,
    rdStocktake,
    coverageGaps,
  ] = await Promise.all([
    readStockInEvents(connection, stockScopeIds),
    readCustomerEvents(connection, stockScopeIds),
    readWorkshopEvents(connection, stockScopeIds),
    readProjectEvents(connection, stockScopeIds),
    readProjectActionEvents(connection, stockScopeIds),
    readRdHandoffEvents(connection, stockScopeIds),
    readRdStocktakeEvents(connection, stockScopeIds),
    readCoverageGaps(connection),
  ]);

  return {
    events: [
      ...stockIn,
      ...customer,
      ...workshop,
      ...project,
      ...projectAction,
      ...rdHandoff,
      ...rdStocktake,
    ],
    coverageGaps,
  };
}

export async function readAllInventoryEvents(
  connection: MigrationConnectionLike,
): Promise<InventoryEvent[]> {
  const input = await readInventoryReplayInput(connection);
  return input.events;
}
