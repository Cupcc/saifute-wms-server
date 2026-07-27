<template>
  <el-table ref="tableRef" v-bind="$attrs" :height="resolvedHeight">
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
  getOrderedTableColumns,
  getTableColumnId,
  reorderVisibleTableColumns,
} from "@/utils/tableColumnPreferences";

const props = defineProps({
  columnConfig: {
    type: Array,
    default: undefined,
  },
});

const attrs = useAttrs();
const tableRef = ref(null);
const tableHeight = ref(400);
const minHeight = 150;
const draggableHeaderClass = "adaptive-table__draggable-header";
let headerSortable;
let columnSyncFrame;

const hasCustomHeight = computed(
  () =>
    attrs.height !== undefined ||
    attrs["max-height"] !== undefined ||
    attrs.maxHeight !== undefined,
);
const resolvedHeight = computed(() =>
  hasCustomHeight.value ? undefined : tableHeight.value,
);
const columnConfigSignature = computed(() =>
  JSON.stringify(
    (props.columnConfig ?? []).map((column, index) => ({
      id: getTableColumnId(column, index),
      order: column.order,
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
  let current = tableElement?.nextElementSibling ?? null;

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
  if (hasCustomHeight.value) {
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
  if (hasCustomHeight.value) {
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

function mapRuntimeColumnsToConfig(runtimeColumns) {
  const configQueuesByLabel = new Map();

  for (const config of props.columnConfig ?? []) {
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
  if (!props.columnConfig?.length) {
    return;
  }

  const runtimeColumns = getRuntimeColumns();
  const configByRuntimeColumnId = mapRuntimeColumnsToConfig(runtimeColumns);
  const orderByConfigId = new Map(
    getOrderedTableColumns(props.columnConfig).map((config, index) => [
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
    props.columnConfig,
    getVisibleConfigOrderFromHeader(headerRow),
  );
  scheduleColumnOrderSync();
}

function initializeHeaderSortable() {
  if (!props.columnConfig?.length) {
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
  applyConfiguredColumnOrder();
  initializeHeaderSortable();
}

function scheduleColumnOrderSync() {
  if (!props.columnConfig?.length) {
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
  tableRef,
  refreshHeight: scheduleTableHeightCalculation,
});
</script>

<style lang="scss" scoped>
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
