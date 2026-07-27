<template>
  <div
    v-if="autoColumns"
    class="adaptive-table__auto-shell"
    :style="autoShellStyle"
  >
    <div
      v-if="generatedColumns.length"
      class="adaptive-table__column-toolbar"
    >
      <right-toolbar
        :search="false"
        :show-refresh="false"
        :columns="generatedColumns"
        :table-key="tableKey"
        :gutter="0"
      />
    </div>
    <el-table
      ref="tableRef"
      v-bind="tableAttrs"
      :height="resolvedHeight"
      :max-height="resolvedMaxHeight"
    >
      <slot></slot>
    </el-table>
  </div>
  <el-table
    v-else
    ref="tableRef"
    v-bind="tableAttrs"
    :height="resolvedHeight"
    :max-height="resolvedMaxHeight"
  >
    <slot></slot>
  </el-table>
</template>

<script setup>
import Sortable from "sortablejs";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  useAttrs,
  watch,
} from "vue";
import {
  createAutoTableColumnConfig,
  getAutoManagedRuntimeColumns,
  getOrderedTableColumns,
  getTableColumnId,
  isRuntimeTableColumnDeclared,
  mergeAutoTableColumnConfig,
  reorderVisibleTableColumns,
} from "@/utils/tableColumnPreferences";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  columnConfig: {
    type: Array,
    default: undefined,
  },
  autoColumns: {
    type: Boolean,
    default: false,
  },
  tableKey: {
    type: String,
    default: "",
  },
  fitViewport: {
    type: Boolean,
    default: true,
  },
});

const attrs = useAttrs();
const tableRef = ref(null);
const tableHeight = ref(400);
const generatedColumns = ref([]);
const minHeight = 150;
const draggableHeaderClass = "adaptive-table__draggable-header";
let headerSortable;
let columnSyncFrame;
let autoRuntimeColumns = [];

const tableAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(
      ([key]) => !["height", "max-height", "maxHeight"].includes(key),
    ),
  ),
);
const requestedHeight = computed(() => attrs.height);
const resolvedMaxHeight = computed(
  () => attrs["max-height"] ?? attrs.maxHeight,
);
const autoShellStyle = computed(() => {
  if (requestedHeight.value === undefined) {
    return undefined;
  }
  return {
    height:
      typeof requestedHeight.value === "number"
        ? `${requestedHeight.value}px`
        : requestedHeight.value,
  };
});
const activeColumnConfig = computed(() =>
  props.autoColumns ? generatedColumns.value : props.columnConfig,
);

const hasCustomHeight = computed(
  () =>
    attrs.height !== undefined ||
    attrs["max-height"] !== undefined ||
    attrs.maxHeight !== undefined,
);
const shouldCalculateHeight = computed(
  () => props.fitViewport && !hasCustomHeight.value,
);
const resolvedHeight = computed(
  () =>
    requestedHeight.value ??
    (shouldCalculateHeight.value ? tableHeight.value : undefined),
);
const columnConfigSignature = computed(() =>
  JSON.stringify(
    (activeColumnConfig.value ?? []).map((column, index) => ({
      id: getTableColumnId(column, index),
      order: column.order,
      runtimeColumnId: column.runtimeColumnId,
      visible: column.visible !== false,
    })),
  ),
);

function getElementHeightWithMargin(element) {
  if (!element) {
    return 0;
  }

  const style = window.getComputedStyle(element);
  const marginTop = Number.parseFloat(style.marginTop) || 0;
  const marginBottom = Number.parseFloat(style.marginBottom) || 0;

  return element.offsetHeight + marginTop + marginBottom;
}

function findPaginationElement(tableElement) {
  const tableContainer =
    tableElement?.closest(".adaptive-table__auto-shell") ?? tableElement;
  let current = tableContainer?.nextElementSibling ?? null;

  while (current) {
    if (current.classList?.contains("pagination-container")) {
      return current;
    }
    current = current.nextElementSibling;
  }

  return null;
}

/** 计算表格高度 */
function calculateTableHeight() {
  if (!shouldCalculateHeight.value) {
    return;
  }

  const tableElement = tableRef.value?.$el;
  if (!tableElement) {
    return;
  }

  const container = tableElement.closest(".app-container");
  const footer = document.querySelector(".copyright");
  const pagination = findPaginationElement(tableElement);
  const tableTop = tableElement.getBoundingClientRect().top;
  const footerHeight = footer?.offsetHeight ?? 0;
  const paginationHeight = getElementHeightWithMargin(pagination);
  const containerPaddingBottom = container
    ? Number.parseFloat(window.getComputedStyle(container).paddingBottom) || 0
    : 0;
  const calculatedHeight =
    window.innerHeight -
    tableTop -
    paginationHeight -
    footerHeight -
    containerPaddingBottom;

  tableHeight.value = Math.max(Math.floor(calculatedHeight), minHeight);
}

function scheduleTableHeightCalculation() {
  if (!shouldCalculateHeight.value) {
    return;
  }

  nextTick(() => {
    window.requestAnimationFrame(() => {
      calculateTableHeight();
    });
  });
}

function normalizeColumnLabel(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getRuntimeColumns() {
  return tableRef.value?.store?.states?._columns?.value ?? [];
}

function syncAutoColumnConfig() {
  if (!props.autoColumns) {
    return;
  }

  const runtimeColumns = getRuntimeColumns();
  autoRuntimeColumns = autoRuntimeColumns.filter(
    isRuntimeTableColumnDeclared,
  );

  const knownRuntimeColumnIds = new Set(
    autoRuntimeColumns.map((column) => String(column.id)),
  );
  for (const runtimeColumn of runtimeColumns) {
    if (!knownRuntimeColumnIds.has(String(runtimeColumn.id))) {
      autoRuntimeColumns.push(runtimeColumn);
      knownRuntimeColumnIds.add(String(runtimeColumn.id));
    }
  }

  const discoveredColumns = createAutoTableColumnConfig(autoRuntimeColumns);
  const currentStructure = generatedColumns.value
    .map(
      (column, index) =>
        `${getTableColumnId(column, index)}:${column.runtimeColumnId}:${column.label}`,
    )
    .join("\u001f");
  const discoveredStructure = discoveredColumns
    .map(
      (column, index) =>
        `${getTableColumnId(column, index)}:${column.runtimeColumnId}:${column.label}`,
    )
    .join("\u001f");

  if (currentStructure !== discoveredStructure) {
    generatedColumns.value = mergeAutoTableColumnConfig(
      generatedColumns.value,
      discoveredColumns,
    );
  }
}

function mapRuntimeColumnsToConfig(runtimeColumns) {
  if (props.autoColumns) {
    const configByRuntimeColumnId = new Map(
      generatedColumns.value.map((config) => [
        String(config.runtimeColumnId),
        config,
      ]),
    );
    return new Map(
      runtimeColumns.flatMap((runtimeColumn) => {
        const config = configByRuntimeColumnId.get(String(runtimeColumn.id));
        return config ? [[runtimeColumn.id, config]] : [];
      }),
    );
  }

  const configQueuesByLabel = new Map();

  for (const config of activeColumnConfig.value ?? []) {
    if (config.visible === false) {
      continue;
    }
    const label = normalizeColumnLabel(config.label);
    if (!label) {
      continue;
    }
    const queue = configQueuesByLabel.get(label) ?? [];
    queue.push(config);
    configQueuesByLabel.set(label, queue);
  }

  const configByRuntimeColumnId = new Map();
  for (const runtimeColumn of runtimeColumns) {
    const label = normalizeColumnLabel(runtimeColumn.label);
    const queue = configQueuesByLabel.get(label);
    const config = queue?.shift();
    if (config) {
      configByRuntimeColumnId.set(runtimeColumn.id, config);
    }
  }
  return configByRuntimeColumnId;
}

function findHeaderRow() {
  const tableElement = tableRef.value?.$el;
  const rows = tableElement?.querySelectorAll(
    ".el-table__header-wrapper thead > tr",
  );
  if (rows?.length) {
    return rows[rows.length - 1];
  }

  return (
    tableElement?.querySelector(
      "thead.el-table__body-header > tr:last-child",
    ) ?? null
  );
}

function findHeaderCell(headerRow, runtimeColumnId) {
  return Array.from(headerRow?.children ?? []).find((cell) =>
    cell.classList.contains(runtimeColumnId),
  );
}

function applyConfiguredColumnOrder() {
  const columnConfig = activeColumnConfig.value;
  if (!columnConfig?.length) {
    return;
  }

  if (props.autoColumns) {
    const currentRuntimeColumns = getRuntimeColumns();
    const currentRuntimeColumnIds = new Set(
      currentRuntimeColumns.map((column) => String(column.id)),
    );
    const configuredRuntimeColumnIds = new Set(
      columnConfig.map((column) => String(column.runtimeColumnId)),
    );
    const availableRuntimeColumns = autoRuntimeColumns.filter(
      (column) =>
        configuredRuntimeColumnIds.has(String(column.id)) ||
        currentRuntimeColumnIds.has(String(column.id)),
    );
    const reorderedRuntimeColumns = getAutoManagedRuntimeColumns(
      availableRuntimeColumns,
      columnConfig,
    );
    const orderChanged =
      reorderedRuntimeColumns.length !== currentRuntimeColumns.length ||
      reorderedRuntimeColumns.some(
        (column, index) => column !== currentRuntimeColumns[index],
      );
    if (!orderChanged) {
      return;
    }

    const tableStore = tableRef.value?.store;
    tableStore.states._columns.value = reorderedRuntimeColumns;
    tableStore.updateColumns();
    tableRef.value?.doLayout?.();
    return;
  }

  const runtimeColumns = getRuntimeColumns();
  const configByRuntimeColumnId = mapRuntimeColumnsToConfig(runtimeColumns);
  const orderByConfigId = new Map(
    getOrderedTableColumns(columnConfig).map((config, index) => [
      getTableColumnId(config, index),
      index,
    ]),
  );
  const configurablePositions = [];
  const configurableRuntimeColumns = [];

  runtimeColumns.forEach((runtimeColumn, index) => {
    if (configByRuntimeColumnId.has(runtimeColumn.id)) {
      configurablePositions.push(index);
      configurableRuntimeColumns.push(runtimeColumn);
    }
  });

  configurableRuntimeColumns.sort((left, right) => {
    const leftConfig = configByRuntimeColumnId.get(left.id);
    const rightConfig = configByRuntimeColumnId.get(right.id);
    return (
      (orderByConfigId.get(getTableColumnId(leftConfig)) ?? 0) -
      (orderByConfigId.get(getTableColumnId(rightConfig)) ?? 0)
    );
  });

  const reorderedRuntimeColumns = runtimeColumns.slice();
  configurablePositions.forEach((position, index) => {
    reorderedRuntimeColumns[position] = configurableRuntimeColumns[index];
  });

  const orderChanged = reorderedRuntimeColumns.some(
    (column, index) => column !== runtimeColumns[index],
  );
  if (!orderChanged) {
    return;
  }

  const tableStore = tableRef.value?.store;
  tableStore.states._columns.value = reorderedRuntimeColumns;
  tableStore.updateColumns();
  tableRef.value?.doLayout?.();
}

function getVisibleConfigOrderFromHeader(headerRow) {
  const runtimeColumns = getRuntimeColumns();
  const configByRuntimeColumnId = mapRuntimeColumnsToConfig(runtimeColumns);
  const runtimeColumnById = new Map(
    runtimeColumns.map((column) => [column.id, column]),
  );
  const visibleConfigIds = [];

  for (const cell of Array.from(headerRow?.children ?? [])) {
    const runtimeColumnId = Array.from(cell.classList).find((className) =>
      runtimeColumnById.has(className),
    );
    const config = configByRuntimeColumnId.get(runtimeColumnId);
    if (config) {
      visibleConfigIds.push(getTableColumnId(config));
    }
  }
  return visibleConfigIds;
}

function handleHeaderDragEnd(headerRow) {
  reorderVisibleTableColumns(
    activeColumnConfig.value,
    getVisibleConfigOrderFromHeader(headerRow),
  );
  scheduleColumnOrderSync();
}

function initializeHeaderSortable() {
  if (!activeColumnConfig.value?.length) {
    headerSortable?.destroy();
    headerSortable = undefined;
    return;
  }

  const headerRow = findHeaderRow();
  if (!headerRow) {
    return;
  }

  const runtimeColumns = getRuntimeColumns();
  const configByRuntimeColumnId = mapRuntimeColumnsToConfig(runtimeColumns);
  for (const cell of Array.from(headerRow.children)) {
    cell.classList.remove(draggableHeaderClass);
    if (cell.title === "拖动调整列顺序") {
      cell.removeAttribute("title");
    }
  }

  let draggableColumnCount = 0;
  for (const runtimeColumn of runtimeColumns) {
    if (!configByRuntimeColumnId.has(runtimeColumn.id)) {
      continue;
    }
    const cell = findHeaderCell(headerRow, runtimeColumn.id);
    if (cell) {
      cell.classList.add(draggableHeaderClass);
      cell.title = "拖动调整列顺序";
      draggableColumnCount += 1;
    }
  }

  if (headerSortable?.el !== headerRow) {
    headerSortable?.destroy();
    headerSortable = Sortable.create(headerRow, {
      animation: 160,
      direction: "horizontal",
      draggable: `th.${draggableHeaderClass}`,
      ghostClass: "adaptive-table__draggable-header--ghost",
      onMove(event) {
        return event.related?.classList.contains(draggableHeaderClass) ?? false;
      },
      onEnd() {
        handleHeaderDragEnd(headerRow);
      },
    });
  }
  headerSortable.option("disabled", draggableColumnCount < 2);
}

function syncColumnOrderAndDragging() {
  syncAutoColumnConfig();
  applyConfiguredColumnOrder();
  initializeHeaderSortable();
}

function scheduleColumnOrderSync() {
  if (!props.autoColumns && !activeColumnConfig.value?.length) {
    return;
  }

  nextTick(() => {
    if (columnSyncFrame) {
      window.cancelAnimationFrame(columnSyncFrame);
    }
    columnSyncFrame = window.requestAnimationFrame(() => {
      columnSyncFrame = undefined;
      syncColumnOrderAndDragging();
    });
  });
}

onMounted(() => {
  scheduleTableHeightCalculation();
  scheduleColumnOrderSync();
  window.addEventListener("resize", scheduleTableHeightCalculation);
});

onUpdated(() => {
  scheduleTableHeightCalculation();
  scheduleColumnOrderSync();
});

watch(columnConfigSignature, scheduleColumnOrderSync, { flush: "post" });

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleTableHeightCalculation);
  headerSortable?.destroy();
  if (columnSyncFrame) {
    window.cancelAnimationFrame(columnSyncFrame);
  }
});

defineExpose({
  generatedColumns,
  tableRef,
  refreshHeight: scheduleTableHeightCalculation,
});
</script>

<style lang="scss" scoped>
.adaptive-table__auto-shell {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.adaptive-table__auto-shell > :deep(.el-table) {
  min-height: 0;
  flex: 1;
}

.adaptive-table__column-toolbar {
  display: flex;
  flex: none;
  justify-content: flex-end;
  min-height: 32px;
  margin-bottom: 8px;
}

.adaptive-table__column-toolbar :deep(.column-settings-trigger) {
  margin-left: 0;
}

:deep(th.adaptive-table__draggable-header) {
  cursor: grab;
  user-select: none;
}

:deep(th.adaptive-table__draggable-header:active) {
  cursor: grabbing;
}

:deep(th.adaptive-table__draggable-header--ghost) {
  background: var(--el-color-primary-light-9);
  opacity: 0.75;
}
</style>
