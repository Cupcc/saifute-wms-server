import { describe, expect, it } from "bun:test";
import {
  applyTableColumnPreference,
  captureTableColumnDefaults,
  createTableColumnPreference,
  getOrderedTableColumns,
  getTableColumnId,
  getTableColumnPreferenceStorageKey,
  loadTableColumnPreference,
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
});
