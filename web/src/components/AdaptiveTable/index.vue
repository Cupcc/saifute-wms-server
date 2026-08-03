<template>
  <div
    v-if="columnPreferences"
    class="adaptive-table__preference-shell"
    :style="preferenceShellStyle"
  >
    <div
      v-if="preferenceColumns.length"
      class="adaptive-table__column-toolbar"
    >
      <column-settings
        :columns="preferenceColumns"
        :table-key="tableKey"
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
import ColumnSettings from "./ColumnSettings.vue";
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
  createRuntimeTableColumnPreferences,
  getPreferenceManagedRuntimeColumns,
  getTableColumnId,
  isRuntimeTableColumnDeclared,
  mergeRuntimeTableColumnPreferences,
  reorderVisibleTableColumns,
} from "@/utils/tableColumnPreferences";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  columnPreferences: {
    type: Boolean,
    default: false,
  },
  defaultHiddenColumns: {
    type: Array,
    default: () => [],
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
const preferenceColumns = ref([]);
const minHeight = 150;
const minColumnWidth = 40;
const draggableHeaderClass = "adaptive-table__draggable-header";
const columnResizeHandleClass = "adaptive-table__column-resize-handle";
let headerSortable;
let columnSyncFrame;
let columnResizeFrame;
let activeColumnResizeCleanup;
let declaredRuntimeColumns = [];

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
const preferenceShellStyle = computed(() => {
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
const preferenceSignature = computed(() =>
  JSON.stringify(
    preferenceColumns.value.map((column, index) => ({
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
    tableElement?.closest(".adaptive-table__preference-shell") ??
    tableElement;
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

function getRuntimeColumns() {
  return tableRef.value?.store?.states?._columns?.value ?? [];
}

function syncPreferenceColumns() {
  if (!props.columnPreferences) {
    return;
  }

  const runtimeColumns = getRuntimeColumns();
  declaredRuntimeColumns = declaredRuntimeColumns.filter(
    isRuntimeTableColumnDeclared,
  );

  const knownRuntimeColumnIds = new Set(
    declaredRuntimeColumns.map((column) => String(column.id)),
  );
  for (const runtimeColumn of runtimeColumns) {
    if (!knownRuntimeColumnIds.has(String(runtimeColumn.id))) {
      declaredRuntimeColumns.push(runtimeColumn);
      knownRuntimeColumnIds.add(String(runtimeColumn.id));
    }
  }

  const discoveredColumns = createRuntimeTableColumnPreferences(
    declaredRuntimeColumns,
    props.defaultHiddenColumns,
  );
  const currentStructure = preferenceColumns.value
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
    preferenceColumns.value = mergeRuntimeTableColumnPreferences(
      preferenceColumns.value,
      discoveredColumns,
    );
  }
}

function mapRuntimeColumnsToPreferences(runtimeColumns) {
  const preferenceByRuntimeColumnId = new Map(
    preferenceColumns.value.map((preference) => [
      String(preference.runtimeColumnId),
      preference,
    ]),
  );
  return new Map(
    runtimeColumns.flatMap((runtimeColumn) => {
      const preference = preferenceByRuntimeColumnId.get(
        String(runtimeColumn.id),
      );
      return preference ? [[runtimeColumn.id, preference]] : [];
    }),
  );
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

function notifyHeaderDragEnd(newWidth, oldWidth, column, event) {
  const listener = attrs.onHeaderDragend;
  const listeners = Array.isArray(listener) ? listener : [listener];

  for (const currentListener of listeners) {
    currentListener?.(newWidth, oldWidth, column, event);
  }
}

function scheduleColumnResizeLayout(column, width, handle) {
  columnResizeFrame && window.cancelAnimationFrame(columnResizeFrame);
  columnResizeFrame = window.requestAnimationFrame(() => {
    columnResizeFrame = undefined;
    column.width = width;
    column.realWidth = width;
    handle.setAttribute("aria-valuenow", String(width));
    tableRef.value?.store?.scheduleLayout?.(false, true);
  });
}

function startColumnResize(event, column, cell, handle) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  activeColumnResizeCleanup?.();

  const startX = event.clientX;
  const oldWidth = Math.round(cell.getBoundingClientRect().width);
  let nextWidth = oldWidth;
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;

  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  cell.classList.add("adaptive-table__column-resizing");

  function handlePointerMove(moveEvent) {
    nextWidth = Math.max(
      minColumnWidth,
      Math.round(oldWidth + moveEvent.clientX - startX),
    );
    scheduleColumnResizeLayout(column, nextWidth, handle);
  }

  function cleanup() {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", finishColumnResize);
    window.removeEventListener("pointercancel", finishColumnResize);
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    cell.classList.remove("adaptive-table__column-resizing");
    if (activeColumnResizeCleanup === cleanup) {
      activeColumnResizeCleanup = undefined;
    }
  }

  function finishColumnResize(endEvent) {
    if (columnResizeFrame) {
      window.cancelAnimationFrame(columnResizeFrame);
      columnResizeFrame = undefined;
      column.width = nextWidth;
      column.realWidth = nextWidth;
    }
    cleanup();
    tableRef.value?.doLayout?.();
    if (nextWidth !== oldWidth) {
      notifyHeaderDragEnd(nextWidth, oldWidth, column, endEvent);
    }
  }

  activeColumnResizeCleanup = cleanup;
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", finishColumnResize);
  window.addEventListener("pointercancel", finishColumnResize);
}

function initializeColumnResizeHandles(headerRow, runtimeColumns) {
  const activeHandles = new Set();

  for (const column of runtimeColumns) {
    if (column.resizable === false || column.children?.length) {
      continue;
    }

    const cell = findHeaderCell(headerRow, column.id);
    if (!cell) {
      continue;
    }

    const columnId = String(column.id);
    let handle = cell.querySelector(`:scope > .${columnResizeHandleClass}`);
    if (handle?.dataset.columnId !== columnId) {
      handle?.remove();
      handle = undefined;
    }
    if (!handle) {
      handle = document.createElement("span");
      handle.className = columnResizeHandleClass;
      handle.dataset.columnId = columnId;
      handle.title = "拖动竖线调整列宽";
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute("aria-label", `调整${column.label || "此列"}列宽`);
      handle.setAttribute("aria-valuemin", String(minColumnWidth));
      handle.addEventListener("pointerdown", (resizeEvent) => {
        startColumnResize(resizeEvent, column, cell, handle);
      });
      cell.append(handle);
    }
    handle.setAttribute(
      "aria-valuenow",
      String(Math.round(cell.getBoundingClientRect().width)),
    );
    activeHandles.add(handle);
  }

  for (const handle of headerRow.querySelectorAll(
    `.${columnResizeHandleClass}`,
  )) {
    if (!activeHandles.has(handle)) {
      handle.remove();
    }
  }
}

function applyPreferenceColumnState() {
  if (preferenceColumns.value.length === 0) {
    return;
  }

  const currentRuntimeColumns = getRuntimeColumns();
  const currentRuntimeColumnIds = new Set(
    currentRuntimeColumns.map((column) => String(column.id)),
  );
  const preferenceRuntimeColumnIds = new Set(
    preferenceColumns.value.map((column) => String(column.runtimeColumnId)),
  );
  const availableRuntimeColumns = declaredRuntimeColumns.filter(
    (column) =>
      preferenceRuntimeColumnIds.has(String(column.id)) ||
      currentRuntimeColumnIds.has(String(column.id)),
  );
  const nextRuntimeColumns = getPreferenceManagedRuntimeColumns(
    availableRuntimeColumns,
    preferenceColumns.value,
  );
  const stateChanged =
    nextRuntimeColumns.length !== currentRuntimeColumns.length ||
    nextRuntimeColumns.some(
      (column, index) => column !== currentRuntimeColumns[index],
    );
  if (!stateChanged) {
    return;
  }

  const tableStore = tableRef.value?.store;
  const runtimeColumnState = tableStore?.states?._columns;
  if (!runtimeColumnState || typeof tableStore.updateColumns !== "function") {
    return;
  }

  runtimeColumnState.value = nextRuntimeColumns;
  tableStore.updateColumns();
  tableRef.value?.doLayout?.();
}

function getVisiblePreferenceOrderFromHeader(headerRow) {
  const runtimeColumns = getRuntimeColumns();
  const preferenceByRuntimeColumnId =
    mapRuntimeColumnsToPreferences(runtimeColumns);
  const runtimeColumnById = new Map(
    runtimeColumns.map((column) => [column.id, column]),
  );
  const visiblePreferenceIds = [];

  for (const cell of Array.from(headerRow?.children ?? [])) {
    const runtimeColumnId = Array.from(cell.classList).find((className) =>
      runtimeColumnById.has(className),
    );
    const preference = preferenceByRuntimeColumnId.get(runtimeColumnId);
    if (preference) {
      visiblePreferenceIds.push(getTableColumnId(preference));
    }
  }
  return visiblePreferenceIds;
}

function handleHeaderDragEnd(headerRow) {
  reorderVisibleTableColumns(
    preferenceColumns.value,
    getVisiblePreferenceOrderFromHeader(headerRow),
  );
  scheduleColumnOrderSync();
}

function initializeHeaderSortable() {
  if (preferenceColumns.value.length === 0) {
    headerSortable?.destroy();
    headerSortable = undefined;
    return;
  }

  const headerRow = findHeaderRow();
  if (!headerRow) {
    return;
  }

  const runtimeColumns = getRuntimeColumns();
  initializeColumnResizeHandles(headerRow, runtimeColumns);
  const preferenceByRuntimeColumnId =
    mapRuntimeColumnsToPreferences(runtimeColumns);
  for (const cell of Array.from(headerRow.children)) {
    cell.classList.remove(draggableHeaderClass);
    if (cell.title === "拖动调整列顺序") {
      cell.removeAttribute("title");
    }
  }

  let draggableColumnCount = 0;
  for (const runtimeColumn of runtimeColumns) {
    if (!preferenceByRuntimeColumnId.has(runtimeColumn.id)) {
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
      filter: `.${columnResizeHandleClass}`,
      preventOnFilter: false,
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

function syncColumnPreferences() {
  syncPreferenceColumns();
  applyPreferenceColumnState();
  initializeHeaderSortable();
}

function scheduleColumnOrderSync() {
  if (!props.columnPreferences) {
    return;
  }

  nextTick(() => {
    if (columnSyncFrame) {
      window.cancelAnimationFrame(columnSyncFrame);
    }
    columnSyncFrame = window.requestAnimationFrame(() => {
      columnSyncFrame = undefined;
      syncColumnPreferences();
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

watch(preferenceSignature, scheduleColumnOrderSync, { flush: "post" });

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleTableHeightCalculation);
  headerSortable?.destroy();
  activeColumnResizeCleanup?.();
  if (columnSyncFrame) {
    window.cancelAnimationFrame(columnSyncFrame);
  }
  if (columnResizeFrame) {
    window.cancelAnimationFrame(columnResizeFrame);
  }
});

defineExpose({
  tableRef,
  refreshHeight: scheduleTableHeightCalculation,
});
</script>

<style lang="scss" scoped>
.adaptive-table__preference-shell {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.adaptive-table__preference-shell > :deep(.el-table) {
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

:deep(.adaptive-table__column-resize-handle) {
  position: absolute;
  z-index: calc(var(--el-table-index) + 3);
  top: 0;
  right: 0;
  width: 12px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}

:deep(.adaptive-table__column-resize-handle::after) {
  position: absolute;
  top: 20%;
  right: 0;
  bottom: 20%;
  width: 1px;
  background: var(--el-border-color);
  content: "";
  transition:
    width var(--el-transition-duration-fast),
    background-color var(--el-transition-duration-fast);
}

:deep(.adaptive-table__column-resize-handle:hover::after),
:deep(
  th.adaptive-table__column-resizing
    > .adaptive-table__column-resize-handle::after
) {
  width: 2px;
  background: var(--el-color-primary);
}
</style>
