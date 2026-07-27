<template>
  <div class="top-right-btn" :style="style">
    <el-row>
      <el-tooltip
        v-if="search"
        class="item"
        effect="dark"
        :content="showSearch ? '隐藏搜索' : '显示搜索'"
        placement="top"
      >
        <el-button circle icon="Search" @click="toggleSearch" />
      </el-tooltip>
      <el-tooltip
        v-if="showRefresh"
        class="item"
        effect="dark"
        content="刷新"
        placement="top"
      >
        <el-button circle icon="Refresh" @click="refresh" />
      </el-tooltip>

      <el-tooltip
        v-if="hasColumns && showColumnsType === 'transfer'"
        class="item"
        effect="dark"
        content="显隐列"
        placement="top"
      >
        <el-button circle icon="Menu" @click="showColumn" />
      </el-tooltip>

      <el-popover
        v-if="hasColumns && showColumnsType === 'checkbox'"
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
              <el-checkbox
                v-model="item.visible"
                class="column-settings__checkbox"
                @change="checkboxChange($event, item)"
              >
                {{ item.label }}
              </el-checkbox>
            </div>
          </div>
        </div>
      </el-popover>
    </el-row>

    <el-dialog :title="title" v-model="open" append-to-body>
      <el-transfer
        :titles="['显示', '隐藏']"
        v-model="value"
        :data="columns"
        @change="dataChange"
      />
    </el-dialog>
  </div>
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
  /* 是否显示检索条件 */
  showSearch: {
    type: Boolean,
    default: true,
  },
  /* 显隐列信息 */
  columns: {
    type: Array,
    default: undefined,
  },
  /* 自定义偏好隔离键；默认使用当前路由 */
  tableKey: {
    type: String,
    default: "",
  },
  /* 是否显示检索图标 */
  search: {
    type: Boolean,
    default: true,
  },
  /* 是否显示刷新图标 */
  showRefresh: {
    type: Boolean,
    default: true,
  },
  /* 显隐列类型（transfer穿梭框、checkbox复选框） */
  showColumnsType: {
    type: String,
    default: "checkbox",
  },
  /* 右外边距 */
  gutter: {
    type: Number,
    default: 10,
  },
});

const emits = defineEmits(["update:showSearch", "queryTable"]);
const route = useRoute();
const userStore = useUserStore();
const columnListRef = ref(null);
const value = ref([]);
const title = ref("显示/隐藏");
const open = ref(false);
const defaultsByStructure = new Map();
const lastSavedStateByScope = new Map();
let columnListSortable;

const hasColumns = computed(() => (props.columns?.length ?? 0) > 0);
const orderedColumns = computed(() => getOrderedTableColumns(props.columns));
const style = computed(() => {
  const ret = {};
  if (props.gutter) {
    ret.marginRight = `${props.gutter / 2}px`;
  }
  return ret;
});
const isChecked = computed(
  () => hasColumns.value && props.columns.every((column) => column.visible),
);
const isIndeterminate = computed(
  () =>
    hasColumns.value &&
    props.columns.some((column) => column.visible) &&
    !isChecked.value,
);
const columnStructureSignature = computed(() =>
  (props.columns ?? [])
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
    (props.columns ?? []).map((column, index) => ({
      id: getTableColumnId(column, index),
      order: column.order,
      visible: column.visible !== false,
    })),
  ),
);

function syncTransferValue() {
  value.value = (props.columns ?? [])
    .filter((column) => column.visible === false)
    .map((column) => column.key);
}

function rememberCurrentState(storageKey) {
  if (!storageKey || !hasColumns.value) {
    return;
  }
  lastSavedStateByScope.set(
    storageKey,
    JSON.stringify(createTableColumnPreference(props.columns)),
  );
}

function initializeColumnPreferences() {
  if (!hasColumns.value) {
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
  syncTransferValue();
}

function persistColumnPreferences() {
  const storageKey = preferenceStorageKey.value;
  if (!storageKey || !hasColumns.value) {
    return;
  }

  const preference = createTableColumnPreference(props.columns);
  const serializedPreference = JSON.stringify(preference);
  if (lastSavedStateByScope.get(storageKey) === serializedPreference) {
    return;
  }

  saveTableColumnPreference(storageKey, preference);
  lastSavedStateByScope.set(storageKey, serializedPreference);
  syncTransferValue();
}

function syncSortableList() {
  if (!columnListSortable) {
    return;
  }
  columnListSortable.sort(
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

function toggleSearch() {
  emits("update:showSearch", !props.showSearch);
}

function refresh() {
  emits("queryTable");
}

function dataChange(hiddenColumnKeys) {
  props.columns.forEach((column) => {
    column.visible = !hiddenColumnKeys.includes(column.key);
  });
}

function showColumn() {
  syncTransferValue();
  open.value = true;
}

function checkboxChange(visible, column) {
  column.visible = visible;
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
  syncTransferValue();
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
:deep(.el-transfer__button) {
  border-radius: 50%;
  display: block;
  margin-left: 0;
}

:deep(.el-transfer__button:first-child) {
  margin-bottom: 10px;
}

.column-settings-trigger {
  margin-left: 12px;
}

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
