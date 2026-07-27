import { describe, expect, it } from "bun:test";
import {
  applyTableColumnPreference,
  captureTableColumnDefaults,
  createAutoTableColumnConfig,
  createTableColumnPreference,
  getAutoManagedRuntimeColumns,
  getOrderedTableColumns,
  getTableColumnId,
  getTableColumnPreferenceStorageKey,
  isAutoConfigurableTableColumn,
  isRuntimeTableColumnDeclared,
  loadTableColumnPreference,
  mergeAutoTableColumnConfig,
  removeTableColumnPreference,
  reorderVisibleTableColumns,
  restoreTableColumnDefaults,
  saveTableColumnPreference,
  setTableColumnOrder,
} from "./tableColumnPreferences";

function createColumns() {
  return [
    { key: 0, label: "编码", visible: true },
    { key: 1, label: "名称", visible: true },
    { key: 2, label: "备注", visible: false },
  ];
}

function orderedLabels(columns) {
  return getOrderedTableColumns(columns).map((column) => column.label);
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("tableColumnPreferences", () => {
  it("uses semantic fields or labels instead of numeric display positions", () => {
    expect(
      getTableColumnId({ key: 0, prop: "materialCode", label: "编码" }),
    ).toBe("field:materialCode");
    expect(getTableColumnId({ key: 0, label: "编码" })).toBe("label:编码");
  });

  it("serializes order and merges a saved preference with newly added columns", () => {
    const original = createColumns();
    setTableColumnOrder(original, ["label:名称", "label:编码", "label:备注"]);
    original[0].visible = false;
    const preference = createTableColumnPreference(original);

    const evolved = [
      { key: 0, label: "编码", visible: true },
      { key: 1, label: "名称", visible: true },
      { key: 2, label: "备注", visible: false },
      { key: 3, label: "新增列", visible: false },
    ];

    expect(applyTableColumnPreference(evolved, preference)).toBe(true);
    expect(orderedLabels(evolved)).toEqual(["名称", "编码", "备注", "新增列"]);
    expect(evolved.find((column) => column.label === "编码")?.visible).toBe(
      false,
    );
    expect(evolved.find((column) => column.label === "新增列")?.visible).toBe(
      false,
    );
  });

  it("reorders visible columns without displacing a hidden column slot", () => {
    const columns = createColumns();
    setTableColumnOrder(columns, ["label:编码", "label:备注", "label:名称"]);

    reorderVisibleTableColumns(columns, ["label:名称", "label:编码"]);

    expect(orderedLabels(columns)).toEqual(["名称", "备注", "编码"]);
  });

  it("restores both the original order and default visibility", () => {
    const columns = createColumns();
    const defaults = captureTableColumnDefaults(columns);
    setTableColumnOrder(columns, ["label:备注", "label:名称", "label:编码"]);
    columns.forEach((column) => {
      column.visible = true;
    });

    restoreTableColumnDefaults(columns, defaults);

    expect(orderedLabels(columns)).toEqual(["编码", "名称", "备注"]);
    expect(columns.find((column) => column.label === "备注")?.visible).toBe(
      false,
    );
  });

  it("isolates storage keys and tolerates unreadable persisted data", () => {
    const storage = createMemoryStorage();
    const firstKey = getTableColumnPreferenceStorageKey(7, "/stock/inventory");
    const secondKey = getTableColumnPreferenceStorageKey(8, "/stock/inventory");
    const preference = createTableColumnPreference(createColumns());

    expect(firstKey).not.toBe(secondKey);
    expect(saveTableColumnPreference(firstKey, preference, storage)).toBe(true);
    expect(loadTableColumnPreference(firstKey, storage)).toEqual(preference);
    expect(loadTableColumnPreference(secondKey, storage)).toBeNull();

    storage.setItem(firstKey, "not-json");
    expect(loadTableColumnPreference(firstKey, storage)).toBeNull();
    expect(removeTableColumnPreference(firstKey, storage)).toBe(true);
    expect(storage.getItem(firstKey)).toBeNull();
  });

  it("derives stable automatic columns while excluding fixed utility columns", () => {
    const runtimeColumns = [
      { id: "selection", type: "selection" },
      { id: "code", type: "default", property: "code", label: "编码" },
      { id: "name", type: "default", property: "name", label: "名称" },
      { id: "operation", type: "default", label: "操作", fixed: "right" },
    ];

    expect(isAutoConfigurableTableColumn(runtimeColumns[0])).toBe(false);
    expect(isAutoConfigurableTableColumn(runtimeColumns[1])).toBe(true);
    expect(isAutoConfigurableTableColumn(runtimeColumns[3])).toBe(false);
    expect(createAutoTableColumnConfig(runtimeColumns)).toEqual([
      {
        key: "auto:property:code:1",
        preferenceKey: "auto:property:code:1",
        prop: "code",
        label: "编码",
        runtimeColumnId: "code",
        defaultVisible: true,
        visible: true,
      },
      {
        key: "auto:property:name:1",
        preferenceKey: "auto:property:name:1",
        prop: "name",
        label: "名称",
        runtimeColumnId: "name",
        defaultVisible: true,
        visible: true,
      },
    ]);
  });

  it("distinguishes mounted hidden columns from conditionally removed columns", () => {
    expect(isRuntimeTableColumnDeclared({ getColumnIndex: () => 2 })).toBe(
      true,
    );
    expect(isRuntimeTableColumnDeclared({ getColumnIndex: () => -1 })).toBe(
      false,
    );
    expect(
      isRuntimeTableColumnDeclared({
        getColumnIndex() {
          throw new Error("column was unmounted");
        },
      }),
    ).toBe(false);
    expect(isRuntimeTableColumnDeclared({})).toBe(true);
  });

  it("preserves automatic column preferences as runtime columns evolve", () => {
    const original = createAutoTableColumnConfig([
      { id: "code-v1", property: "code", label: "编码" },
      { id: "name-v1", property: "name", label: "名称" },
    ]);
    original[0].visible = false;
    setTableColumnOrder(original, [
      "field:auto:property:name:1",
      "field:auto:property:code:1",
    ]);

    const evolved = createAutoTableColumnConfig([
      { id: "code-v2", property: "code", label: "编码" },
      { id: "name-v2", property: "name", label: "名称" },
      { id: "remark-v2", property: "remark", label: "备注" },
    ]);
    const merged = mergeAutoTableColumnConfig(original, evolved);

    expect(orderedLabels(merged)).toEqual(["名称", "编码", "备注"]);
    expect(merged.find((column) => column.prop === "code")?.visible).toBe(
      false,
    );
    expect(
      merged.find((column) => column.prop === "code")?.runtimeColumnId,
    ).toBe("code-v2");
  });

  it("keeps discovered visibility as the automatic reset default", () => {
    const columns = createAutoTableColumnConfig([
      { id: "code", property: "code", label: "编码" },
      { id: "name", property: "name", label: "名称" },
    ]);
    columns[0].visible = false;

    const defaults = captureTableColumnDefaults(columns);
    restoreTableColumnDefaults(columns, defaults);

    expect(columns.map((column) => column.visible)).toEqual([true, true]);
  });

  it("reorders and hides managed runtime columns without moving utility columns", () => {
    const runtimeColumns = [
      { id: "selection", type: "selection" },
      { id: "code", property: "code", label: "编码" },
      { id: "name", property: "name", label: "名称" },
      { id: "operation", label: "操作", fixed: "right" },
    ];
    const columns = createAutoTableColumnConfig(runtimeColumns);
    setTableColumnOrder(columns, [
      "field:auto:property:name:1",
      "field:auto:property:code:1",
    ]);
    columns.find((column) => column.prop === "code").visible = false;

    expect(
      getAutoManagedRuntimeColumns(runtimeColumns, columns).map(
        (column) => column.id,
      ),
    ).toEqual(["selection", "name", "operation"]);
  });
});
