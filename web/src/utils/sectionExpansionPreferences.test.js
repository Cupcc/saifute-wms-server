import { describe, expect, it } from "bun:test";
import {
  applySectionExpansionPreference,
  createSectionExpansionPreference,
  getSectionExpansionPreferenceStorageKey,
  loadSectionExpansionPreference,
  saveSectionExpansionPreference,
} from "./sectionExpansionPreferences";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("sectionExpansionPreferences", () => {
  it("restores collapsed sections while preserving defaults for new sections", () => {
    const preference = createSectionExpansionPreference({
      domainSummary: false,
      details: true,
    });

    expect(
      applySectionExpansionPreference(
        {
          domainSummary: true,
          details: true,
          newSummary: true,
        },
        preference,
      ),
    ).toEqual({
      domainSummary: false,
      details: true,
      newSummary: true,
    });
  });

  it("ignores unknown sections and invalid persisted values", () => {
    expect(
      applySectionExpansionPreference(
        { domainSummary: true, details: true },
        {
          version: 1,
          sections: {
            domainSummary: false,
            details: "collapsed",
            removedSummary: false,
          },
        },
      ),
    ).toEqual({ domainSummary: false, details: true });
  });

  it("isolates preferences by user and reporting route", () => {
    const storage = createMemoryStorage();
    const domainKey = getSectionExpansionPreferenceStorageKey(
      7,
      "/reporting/monthly-reporting",
    );
    const categoryKey = getSectionExpansionPreferenceStorageKey(
      7,
      "/reporting/monthly-reporting-material-category",
    );
    const otherUserKey = getSectionExpansionPreferenceStorageKey(
      8,
      "/reporting/monthly-reporting",
    );
    const preference = createSectionExpansionPreference({
      domainSummary: false,
    });

    expect(saveSectionExpansionPreference(domainKey, preference, storage)).toBe(
      true,
    );
    expect(loadSectionExpansionPreference(domainKey, storage)).toEqual(
      preference,
    );
    expect(loadSectionExpansionPreference(categoryKey, storage)).toBeNull();
    expect(loadSectionExpansionPreference(otherUserKey, storage)).toBeNull();
  });

  it("falls back safely when persisted JSON is unreadable", () => {
    const storage = createMemoryStorage();
    const storageKey = getSectionExpansionPreferenceStorageKey(
      7,
      "/reporting/monthly-reporting",
    );
    storage.setItem(storageKey, "not-json");

    expect(loadSectionExpansionPreference(storageKey, storage)).toBeNull();
    expect(
      applySectionExpansionPreference(
        { domainSummary: true },
        loadSectionExpansionPreference(storageKey, storage),
      ),
    ).toEqual({ domainSummary: true });
  });
});
