const TABLE_COLUMN_PREFERENCE_VERSION = 1;
const TABLE_COLUMN_STORAGE_PREFIX = "saifute:table-columns";
const NON_CONFIGURABLE_RUNTIME_COLUMN_TYPES = new Set([
  "selection",
  "index",
  "expand",
]);
const NON_CONFIGURABLE_RUNTIME_COLUMN_LABELS = new Set(["操作"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isFiniteOrder(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function getTableColumnId(column, fallbackIndex = 0) {
  const explicitId = normalizeText(column?.preferenceKey ?? column?.prop);
  if (explicitId) {
    return `field:${explicitId}`;
  }

  const label = normalizeText(column?.label);
  if (label) {
    return `label:${label}`;
  }

  return `key:${String(column?.key ?? fallbackIndex)}`;
}

export function getOrderedTableColumns(columns = []) {
  return columns
    .map((column, index) => ({
      column,
      index,
      order: isFiniteOrder(column?.order) ? column.order : index,
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ column }) => column);
}

export function isAutoConfigurableTableColumn(column) {
  const label = normalizeText(column?.label);
  const type = normalizeText(column?.type).toLowerCase();
  const fixed = column?.fixed;

  return Boolean(
    label &&
      !NON_CONFIGURABLE_RUNTIME_COLUMN_TYPES.has(type) &&
      !NON_CONFIGURABLE_RUNTIME_COLUMN_LABELS.has(label) &&
      fixed !== true &&
      fixed !== "left" &&
      fixed !== "right",
  );
}

export function isRuntimeTableColumnDeclared(column) {
  if (typeof column?.getColumnIndex !== "function") {
    return true;
  }

  try {
    return column.getColumnIndex() >= 0;
  } catch {
    return false;
  }
}

export function createAutoTableColumnConfig(runtimeColumns = []) {
  const occurrencesByIdentity = new Map();

  return runtimeColumns.flatMap((runtimeColumn, index) => {
    if (!isAutoConfigurableTableColumn(runtimeColumn)) {
      return [];
    }

    const label = normalizeText(runtimeColumn.label);
    const prop = normalizeText(runtimeColumn.property ?? runtimeColumn.prop);
    const identity = prop ? `property:${prop}` : `label:${label}`;
    const occurrence = (occurrencesByIdentity.get(identity) ?? 0) + 1;
    occurrencesByIdentity.set(identity, occurrence);
    const preferenceKey = `auto:${identity}:${occurrence}`;

    return [
      {
        key: preferenceKey,
        preferenceKey,
        ...(prop ? { prop } : {}),
        label,
        runtimeColumnId: String(runtimeColumn.id ?? `column-${index}`),
        defaultVisible: true,
        visible: true,
      },
    ];
  });
}

export function mergeAutoTableColumnConfig(
  currentColumns = [],
  discoveredColumns = [],
) {
  const currentById = new Map(
    currentColumns.map((column, index) => [
      getTableColumnId(column, index),
      column,
    ]),
  );
  const mergedColumns = discoveredColumns.map((column, index) => {
    const current = currentById.get(getTableColumnId(column, index));
    return {
      ...column,
      visible: current?.visible ?? column.visible,
      order: isFiniteOrder(current?.order) ? current.order : index,
    };
  });

  setTableColumnOrder(
    mergedColumns,
    getOrderedTableColumns(currentColumns).map((column, index) =>
      getTableColumnId(column, index),
    ),
  );
  return mergedColumns;
}

export function getAutoManagedRuntimeColumns(
  runtimeColumns = [],
  columnConfig = [],
) {
  const runtimeColumnById = new Map(
    runtimeColumns.map((column) => [String(column.id), column]),
  );
  const configByRuntimeColumnId = new Map(
    columnConfig.map((column) => [String(column.runtimeColumnId), column]),
  );
  const orderedVisibleRuntimeColumns = getOrderedTableColumns(columnConfig)
    .filter((column) => column.visible !== false)
    .map((column) => runtimeColumnById.get(String(column.runtimeColumnId)))
    .filter(Boolean);
  let visibleColumnIndex = 0;

  return runtimeColumns.flatMap((runtimeColumn) => {
    const config = configByRuntimeColumnId.get(String(runtimeColumn.id));
    if (!config) {
      return [runtimeColumn];
    }
    if (config.visible === false) {
      return [];
    }

    const orderedRuntimeColumn =
      orderedVisibleRuntimeColumns[visibleColumnIndex++];
    return orderedRuntimeColumn ? [orderedRuntimeColumn] : [];
  });
}

export function normalizeTableColumnOrder(columns = []) {
  getOrderedTableColumns(columns).forEach((column, order) => {
    column.order = order;
  });
  return columns;
}

export function captureTableColumnDefaults(columns = []) {
  return columns.map((column, index) => ({
    id: getTableColumnId(column, index),
    visible:
      typeof column.defaultVisible === "boolean"
        ? column.defaultVisible
        : column.visible !== false,
  }));
}

export function setTableColumnOrder(columns = [], orderedIds = []) {
  const currentColumns = getOrderedTableColumns(columns);
  const columnsById = new Map(
    currentColumns.map((column, index) => [
      getTableColumnId(column, index),
      column,
    ]),
  );
  const seenIds = new Set();
  const reorderedColumns = [];

  for (const id of orderedIds) {
    const column = columnsById.get(id);
    if (!column || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    reorderedColumns.push(column);
  }

  currentColumns.forEach((column, index) => {
    const id = getTableColumnId(column, index);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      reorderedColumns.push(column);
    }
  });

  reorderedColumns.forEach((column, order) => {
    column.order = order;
  });
  return columns;
}

export function reorderVisibleTableColumns(columns = [], visibleIds = []) {
  const orderedColumns = getOrderedTableColumns(columns);
  const visibleColumns = orderedColumns.filter(
    (column) => column.visible !== false,
  );
  const visibleColumnsById = new Map(
    visibleColumns.map((column, index) => [
      getTableColumnId(column, index),
      column,
    ]),
  );
  const seenIds = new Set();
  const reorderedVisibleColumns = [];

  for (const id of visibleIds) {
    const column = visibleColumnsById.get(id);
    if (!column || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    reorderedVisibleColumns.push(column);
  }

  visibleColumns.forEach((column, index) => {
    const id = getTableColumnId(column, index);
    if (!seenIds.has(id)) {
      reorderedVisibleColumns.push(column);
    }
  });

  let visibleIndex = 0;
  const mergedColumns = orderedColumns.map((column) =>
    column.visible === false
      ? column
      : (reorderedVisibleColumns[visibleIndex++] ?? column),
  );

  mergedColumns.forEach((column, order) => {
    column.order = order;
  });
  return columns;
}

export function createTableColumnPreference(columns = []) {
  return {
    version: TABLE_COLUMN_PREFERENCE_VERSION,
    columns: getOrderedTableColumns(columns).map((column, index) => ({
      id: getTableColumnId(column, index),
      visible: column.visible !== false,
    })),
  };
}

export function applyTableColumnPreference(columns = [], preference) {
  normalizeTableColumnOrder(columns);
  if (
    preference?.version !== TABLE_COLUMN_PREFERENCE_VERSION ||
    !Array.isArray(preference.columns)
  ) {
    return false;
  }

  const columnsById = new Map(
    columns.map((column, index) => [getTableColumnId(column, index), column]),
  );
  const savedIds = [];

  for (const savedColumn of preference.columns) {
    const column = columnsById.get(savedColumn?.id);
    if (!column || savedIds.includes(savedColumn.id)) {
      continue;
    }
    if (typeof savedColumn.visible === "boolean") {
      column.visible = savedColumn.visible;
    }
    savedIds.push(savedColumn.id);
  }

  setTableColumnOrder(columns, savedIds);
  return true;
}

export function restoreTableColumnDefaults(columns = [], defaults = []) {
  const defaultsById = new Map(defaults.map((column) => [column.id, column]));

  columns.forEach((column, index) => {
    const savedDefault = defaultsById.get(getTableColumnId(column, index));
    if (savedDefault) {
      column.visible = savedDefault.visible;
    }
  });
  setTableColumnOrder(
    columns,
    defaults.map((column) => column.id),
  );
  return columns;
}

export function getTableColumnPreferenceStorageKey(userId, tableKey) {
  const normalizedUserId = normalizeText(String(userId ?? ""));
  const normalizedTableKey = normalizeText(String(tableKey ?? ""));
  if (!normalizedUserId || !normalizedTableKey) {
    return "";
  }
  return `${TABLE_COLUMN_STORAGE_PREFIX}:v${TABLE_COLUMN_PREFERENCE_VERSION}:${encodeURIComponent(normalizedUserId)}:${encodeURIComponent(normalizedTableKey)}`;
}

export function loadTableColumnPreference(storageKey, storage) {
  if (!storageKey) {
    return null;
  }
  try {
    const targetStorage = storage ?? globalThis.localStorage;
    const rawValue = targetStorage?.getItem(storageKey);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

export function saveTableColumnPreference(storageKey, preference, storage) {
  if (!storageKey) {
    return false;
  }
  try {
    const targetStorage = storage ?? globalThis.localStorage;
    targetStorage?.setItem(storageKey, JSON.stringify(preference));
    return Boolean(targetStorage);
  } catch {
    return false;
  }
}

export function removeTableColumnPreference(storageKey, storage) {
  if (!storageKey) {
    return false;
  }
  try {
    const targetStorage = storage ?? globalThis.localStorage;
    targetStorage?.removeItem(storageKey);
    return Boolean(targetStorage);
  } catch {
    return false;
  }
}
