<template>
  <el-popover
    placement="bottom-end"
    :width="300"
    trigger="click"
    @show="initializeColumnListSortable"
  >
    <template #reference>
      <el-button
        class="column-settings-trigger"
        circle
        icon="Menu"
        aria-label="列设置"
        title="列设置"
      />
    </template>

    <div class="column-settings">
      <div class="column-settings__header">
        <div>
          <div class="column-settings__title">列设置</div>
          <div class="column-settings__hint">拖动表头或下方条目调整顺序</div>
        </div>
        <el-button link type="primary" @click="resetColumns">恢复默认</el-button>
      </div>

      <div class="column-settings__check-all">
        <el-checkbox
          :model-value="isChecked"
          :indeterminate="isIndeterminate"
          @change="toggleCheckAll"
        >
          显示全部列
        </el-checkbox>
      </div>

      <div ref="columnListRef" class="column-settings__list">
        <div
          v-for="item in orderedColumns"
          :key="getTableColumnId(item)"
          class="column-settings__item"
          :data-column-id="getTableColumnId(item)"
        >
          <span class="column-settings__drag-handle" title="拖动调整顺序">
            <el-icon><Rank /></el-icon>
          </span>
          <el-checkbox v-model="item.visible" class="column-settings__checkbox">
            {{ item.label }}
          </el-checkbox>
        </div>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import Sortable from "sortablejs";
import useUserStore from "@/store/modules/user";
import {
  applyTableColumnPreference,
  captureTableColumnDefaults,
  createTableColumnPreference,
  getOrderedTableColumns,
  getTableColumnId,
  getTableColumnPreferenceStorageKey,
  loadTableColumnPreference,
  normalizeTableColumnOrder,
  removeTableColumnPreference,
  restoreTableColumnDefaults,
  saveTableColumnPreference,
  setTableColumnOrder,
} from "@/utils/tableColumnPreferences";

const props = defineProps({
  columns: {
    type: Array,
    required: true,
  },
  tableKey: {
    type: String,
    default: "",
  },
});

const route = useRoute();
const userStore = useUserStore();
const columnListRef = ref(null);
const defaultsByStructure = new Map();
const lastSavedStateByScope = new Map();
let columnListSortable;

const orderedColumns = computed(() => getOrderedTableColumns(props.columns));
const isChecked = computed(
  () =>
    props.columns.length > 0 &&
    props.columns.every((column) => column.visible !== false),
);
const isIndeterminate = computed(
  () =>
    props.columns.some((column) => column.visible !== false) &&
    !isChecked.value,
);
const columnStructureSignature = computed(() =>
  props.columns
    .map((column, index) => getTableColumnId(column, index))
    .join("\u001f"),
);
const preferenceStorageKey = computed(() =>
  getTableColumnPreferenceStorageKey(
    userStore.id || userStore.name,
    props.tableKey || route.path,
  ),
);
const columnStateSignature = computed(() =>
  JSON.stringify(
    props.columns.map((column, index) => ({
      id: getTableColumnId(column, index),
      order: column.order,
      visible: column.visible !== false,
    })),
  ),
);

function rememberCurrentState(storageKey) {
  if (!storageKey || props.columns.length === 0) {
    return;
  }
  lastSavedStateByScope.set(
    storageKey,
    JSON.stringify(createTableColumnPreference(props.columns)),
  );
}

function initializeColumnPreferences() {
  if (props.columns.length === 0) {
    return;
  }

  const structureKey = columnStructureSignature.value;
  if (!defaultsByStructure.has(structureKey)) {
    defaultsByStructure.set(
      structureKey,
      captureTableColumnDefaults(props.columns),
    );
  }

  restoreTableColumnDefaults(
    props.columns,
    defaultsByStructure.get(structureKey),
  );
  normalizeTableColumnOrder(props.columns);

  const storageKey = preferenceStorageKey.value;
  if (storageKey) {
    applyTableColumnPreference(
      props.columns,
      loadTableColumnPreference(storageKey),
    );
    rememberCurrentState(storageKey);
  }
}

function persistColumnPreferences() {
  const storageKey = preferenceStorageKey.value;
  if (!storageKey || props.columns.length === 0) {
    return;
  }

  const preference = createTableColumnPreference(props.columns);
  const serializedPreference = JSON.stringify(preference);
  if (lastSavedStateByScope.get(storageKey) === serializedPreference) {
    return;
  }

  saveTableColumnPreference(storageKey, preference);
  lastSavedStateByScope.set(storageKey, serializedPreference);
}

function syncSortableList() {
  columnListSortable?.sort(
    orderedColumns.value.map((column, index) =>
      getTableColumnId(column, index),
    ),
  );
}

function initializeColumnListSortable() {
  nextTick(() => {
    if (!columnListRef.value) {
      return;
    }
    if (columnListSortable?.el === columnListRef.value) {
      syncSortableList();
      return;
    }

    columnListSortable?.destroy();
    columnListSortable = Sortable.create(columnListRef.value, {
      animation: 160,
      dataIdAttr: "data-column-id",
      ghostClass: "column-settings__item--ghost",
      handle: ".column-settings__drag-handle",
      onEnd() {
        setTableColumnOrder(props.columns, columnListSortable.toArray());
      },
    });
  });
}

function toggleCheckAll(visible) {
  props.columns.forEach((column) => {
    column.visible = visible;
  });
}

function resetColumns() {
  const defaults = defaultsByStructure.get(columnStructureSignature.value);
  if (!defaults) {
    return;
  }

  restoreTableColumnDefaults(props.columns, defaults);
  const storageKey = preferenceStorageKey.value;
  removeTableColumnPreference(storageKey);
  rememberCurrentState(storageKey);
  nextTick(syncSortableList);
}

watch(
  [preferenceStorageKey, columnStructureSignature],
  initializeColumnPreferences,
  { immediate: true },
);
watch(columnStateSignature, persistColumnPreferences, { flush: "post" });

onBeforeUnmount(() => {
  columnListSortable?.destroy();
});
</script>

<style lang="scss" scoped>
.column-settings__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
}

.column-settings__title {
  color: var(--el-text-color-primary);
  font-weight: 600;
  line-height: 24px;
}

.column-settings__hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}

.column-settings__check-all {
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.column-settings__list {
  max-height: 320px;
  overflow-y: auto;
  padding-top: 6px;
}

.column-settings__item {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--el-bg-color-overlay);
}

.column-settings__item:hover {
  background: var(--el-fill-color-light);
}

.column-settings__item--ghost {
  background: var(--el-color-primary-light-9);
  opacity: 0.7;
}

.column-settings__drag-handle {
  display: inline-flex;
  align-items: center;
  padding: 6px 8px 6px 2px;
  color: var(--el-text-color-placeholder);
  cursor: grab;
}

.column-settings__drag-handle:active {
  cursor: grabbing;
}

.column-settings__checkbox {
  flex: 1;
  margin-right: 0;
}
</style>
