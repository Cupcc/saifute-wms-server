import type {
  AdmittedLineRow,
  AdmittedOrderRow,
  AdmittedStockInLineRow,
  PostAdmissionBaseline,
  UpstreamOutboundLineRow,
  UpstreamPickLineRow,
} from "./types";

export async function readPostAdmissionBaseline(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<PostAdmissionBaseline> {
  const salesReturnOrders = await connection.query<AdmittedOrderRow[]>(
    `
      SELECT
        id,
        documentNo,
        orderType,
        DATE_FORMAT(bizDate, '%Y-%m-%d') AS bizDate,
        workshopId,
        customerId,
        lifecycleStatus,
        auditStatusSnapshot,
        inventoryEffectStatus
      FROM customer_stock_order
      WHERE orderType = 'SALES_RETURN'
      ORDER BY bizDate ASC, documentNo ASC
    `,
  );

  const outboundOrders = await connection.query<AdmittedOrderRow[]>(
    `
      SELECT
        id,
        documentNo,
        orderType,
        DATE_FORMAT(bizDate, '%Y-%m-%d') AS bizDate,
        workshopId,
        customerId,
        lifecycleStatus,
        auditStatusSnapshot,
        inventoryEffectStatus
      FROM customer_stock_order
      WHERE orderType = 'OUTBOUND'
      ORDER BY bizDate ASC, documentNo ASC
    `,
  );

  const salesReturnLines = await readCustomerStockOrderLines(
    connection,
    "SALES_RETURN",
  );
  const outboundLines = await readOutboundLines(connection);

  const workshopReturnOrders = await connection.query<AdmittedOrderRow[]>(
    `
      SELECT
        id,
        documentNo,
        orderType,
        DATE_FORMAT(bizDate, '%Y-%m-%d') AS bizDate,
        workshopId,
        NULL AS customerId,
        lifecycleStatus,
        auditStatusSnapshot,
        inventoryEffectStatus
      FROM workshop_material_order
      WHERE orderType = 'RETURN'
      ORDER BY bizDate ASC, documentNo ASC
    `,
  );

  const pickOrders = await connection.query<AdmittedOrderRow[]>(
    `
      SELECT
        id,
        documentNo,
        orderType,
        DATE_FORMAT(bizDate, '%Y-%m-%d') AS bizDate,
        workshopId,
        NULL AS customerId,
        lifecycleStatus,
        auditStatusSnapshot,
        inventoryEffectStatus
      FROM workshop_material_order
      WHERE orderType = 'PICK'
      ORDER BY bizDate ASC, documentNo ASC
    `,
  );

  const workshopReturnLines = await readWorkshopMaterialOrderLines(
    connection,
    "RETURN",
  );
  const pickLines = await readPickLines(connection);

  const stockInOrders = await connection.query<AdmittedOrderRow[]>(
    `
      SELECT
        id,
        documentNo,
        orderType,
        DATE_FORMAT(bizDate, '%Y-%m-%d') AS bizDate,
        workshopId,
        NULL AS customerId,
        lifecycleStatus,
        auditStatusSnapshot,
        inventoryEffectStatus
      FROM stock_in_order
      ORDER BY bizDate ASC, documentNo ASC
    `,
  );

  const stockInLines = await readStockInLines(connection);

  return {
    salesReturnOrders: salesReturnOrders as AdmittedOrderRow[],
    salesReturnLines,
    workshopReturnOrders: workshopReturnOrders as AdmittedOrderRow[],
    workshopReturnLines,
    outboundLines,
    pickLines,
    stockInLines,
    outboundOrders: outboundOrders as AdmittedOrderRow[],
    pickOrders: pickOrders as AdmittedOrderRow[],
    stockInOrders: stockInOrders as AdmittedOrderRow[],
  };
}

async function readCustomerStockOrderLines(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  orderType: "SALES_RETURN" | "OUTBOUND",
): Promise<AdmittedLineRow[]> {
  return connection.query<AdmittedLineRow[]>(
    `
      SELECT
        line_row.id,
        line_row.orderId,
        line_row.lineNo,
        line_row.materialId,
        line_row.quantity,
        line_row.sourceDocumentType,
        line_row.sourceDocumentId,
        line_row.sourceDocumentLineId,
        order_row.documentNo,
        order_row.orderType,
        DATE_FORMAT(order_row.bizDate, '%Y-%m-%d') AS bizDate,
        order_row.workshopId,
        order_row.customerId,
        order_row.lifecycleStatus,
        order_row.inventoryEffectStatus
      FROM customer_stock_order_line line_row
      INNER JOIN customer_stock_order order_row
        ON order_row.id = line_row.orderId
      WHERE order_row.orderType = ?
      ORDER BY order_row.bizDate ASC, order_row.documentNo ASC, line_row.lineNo ASC
    `,
    [orderType],
  );
}

async function readOutboundLines(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<UpstreamOutboundLineRow[]> {
  return connection.query<UpstreamOutboundLineRow[]>(
    `
      SELECT
        line_row.id,
        line_row.orderId,
        line_row.lineNo,
        line_row.materialId,
        line_row.quantity,
        order_row.documentNo,
        DATE_FORMAT(order_row.bizDate, '%Y-%m-%d') AS bizDate,
        order_row.workshopId,
        order_row.customerId,
        order_row.lifecycleStatus,
        order_row.inventoryEffectStatus
      FROM customer_stock_order_line line_row
      INNER JOIN customer_stock_order order_row
        ON order_row.id = line_row.orderId
      WHERE order_row.orderType = 'OUTBOUND'
      ORDER BY order_row.bizDate ASC, order_row.documentNo ASC, line_row.lineNo ASC
    `,
  );
}

async function readWorkshopMaterialOrderLines(
  connection: {
    query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
  },
  orderType: "RETURN" | "PICK",
): Promise<AdmittedLineRow[]> {
  return connection.query<AdmittedLineRow[]>(
    `
      SELECT
        line_row.id,
        line_row.orderId,
        line_row.lineNo,
        line_row.materialId,
        line_row.quantity,
        line_row.sourceDocumentType,
        line_row.sourceDocumentId,
        line_row.sourceDocumentLineId,
        order_row.documentNo,
        order_row.orderType,
        DATE_FORMAT(order_row.bizDate, '%Y-%m-%d') AS bizDate,
        order_row.workshopId,
        NULL AS customerId,
        order_row.lifecycleStatus,
        order_row.inventoryEffectStatus
      FROM workshop_material_order_line line_row
      INNER JOIN workshop_material_order order_row
        ON order_row.id = line_row.orderId
      WHERE order_row.orderType = ?
      ORDER BY order_row.bizDate ASC, order_row.documentNo ASC, line_row.lineNo ASC
    `,
    [orderType],
  );
}

async function readPickLines(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<UpstreamPickLineRow[]> {
  return connection.query<UpstreamPickLineRow[]>(
    `
      SELECT
        line_row.id,
        line_row.orderId,
        line_row.lineNo,
        line_row.materialId,
        line_row.quantity,
        order_row.documentNo,
        DATE_FORMAT(order_row.bizDate, '%Y-%m-%d') AS bizDate,
        order_row.workshopId,
        order_row.lifecycleStatus,
        order_row.inventoryEffectStatus
      FROM workshop_material_order_line line_row
      INNER JOIN workshop_material_order order_row
        ON order_row.id = line_row.orderId
      WHERE order_row.orderType = 'PICK'
      ORDER BY order_row.bizDate ASC, order_row.documentNo ASC, line_row.lineNo ASC
    `,
  );
}

async function readStockInLines(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<AdmittedStockInLineRow[]> {
  return connection.query<AdmittedStockInLineRow[]>(
    `
      SELECT
        line_row.id,
        line_row.orderId,
        line_row.lineNo,
        line_row.materialId,
        line_row.quantity,
        order_row.documentNo,
        order_row.orderType,
        DATE_FORMAT(order_row.bizDate, '%Y-%m-%d') AS bizDate,
        order_row.workshopId,
        order_row.lifecycleStatus,
        order_row.inventoryEffectStatus
      FROM stock_in_order_line line_row
      INNER JOIN stock_in_order order_row
        ON order_row.id = line_row.orderId
      ORDER BY order_row.bizDate ASC, order_row.documentNo ASC, line_row.lineNo ASC
    `,
  );
}

export async function readSharedTableCounts(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<Record<string, number>> {
  const rows = await connection.query<
    Array<{ tableName: string; total: number }>
  >(
    `
      SELECT 'document_relation' AS tableName, COUNT(*) AS total FROM document_relation
      UNION ALL
      SELECT 'document_line_relation' AS tableName, COUNT(*) AS total FROM document_line_relation
      UNION ALL
      SELECT 'inventory_balance' AS tableName, COUNT(*) AS total FROM inventory_balance
      UNION ALL
      SELECT 'inventory_log' AS tableName, COUNT(*) AS total FROM inventory_log
      UNION ALL
      SELECT 'inventory_source_usage' AS tableName, COUNT(*) AS total FROM inventory_source_usage
      UNION ALL
      SELECT 'audit_document' AS tableName, COUNT(*) AS total FROM audit_document
      UNION ALL
      SELECT 'factory_number_reservation' AS tableName, COUNT(*) AS total FROM factory_number_reservation
    `,
  );

  return Object.fromEntries(
    rows.map((row) => [row.tableName, Number(row.total)] as const),
  );
}

export async function stagingSchemaExists(connection: {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<T>;
}): Promise<boolean> {
  const rows = await connection.query<Array<{ schemaName: string }>>(
    `
      SELECT schema_name AS schemaName
      FROM information_schema.schemata
      WHERE schema_name = 'migration_staging'
    `,
  );

  return rows.length > 0;
}
