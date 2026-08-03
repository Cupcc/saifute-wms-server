import { describe, expect, it } from "bun:test";
import {
  createPreferenceStorageKey,
  loadJsonPreference,
  removeJsonPreference,
  saveJsonPreference,
} from "./preferenceStorage";

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

describe("preferenceStorage", () => {
  it("builds encoded keys only when every scope part exists", () => {
    expect(
      createPreferenceStorageKey("table-columns", 1, 7, "/stock/log?a=1"),
    ).toBe("saifute:table-columns:v1:7:%2Fstock%2Flog%3Fa%3D1");
    expect(createPreferenceStorageKey("table-columns", 1, "", "/stock/log"))
      .toBe("");
  });

  it("safely saves, loads, and removes JSON preferences", () => {
    const storage = createMemoryStorage();
    const storageKey = "preference-key";
    const preference = { version: 1, value: false };

    expect(saveJsonPreference(storageKey, preference, storage)).toBe(true);
    expect(loadJsonPreference(storageKey, storage)).toEqual(preference);
    expect(removeJsonPreference(storageKey, storage)).toBe(true);
    expect(loadJsonPreference(storageKey, storage)).toBeNull();
  });

  it("fails closed for unreadable data or unavailable scopes", () => {
    const storage = createMemoryStorage();
    storage.setItem("broken", "not-json");

    expect(loadJsonPreference("broken", storage)).toBeNull();
    expect(loadJsonPreference("", storage)).toBeNull();
    expect(saveJsonPreference("", {}, storage)).toBe(false);
    expect(removeJsonPreference("", storage)).toBe(false);
  });
});
