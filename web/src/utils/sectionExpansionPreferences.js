import {
  createPreferenceStorageKey,
  loadJsonPreference,
  saveJsonPreference,
} from "./preferenceStorage";

const SECTION_EXPANSION_PREFERENCE_VERSION = 1;
const SECTION_EXPANSION_PREFERENCE_NAMESPACE = "section-expansion";

export function createSectionExpansionPreference(sectionExpanded = {}) {
  return {
    version: SECTION_EXPANSION_PREFERENCE_VERSION,
    sections: Object.fromEntries(
      Object.entries(sectionExpanded).filter(
        ([, expanded]) => typeof expanded === "boolean",
      ),
    ),
  };
}

export function applySectionExpansionPreference(defaults = {}, preference) {
  const sectionExpanded = { ...defaults };
  if (
    preference?.version !== SECTION_EXPANSION_PREFERENCE_VERSION ||
    !preference.sections ||
    typeof preference.sections !== "object" ||
    Array.isArray(preference.sections)
  ) {
    return sectionExpanded;
  }

  for (const [sectionKey, expanded] of Object.entries(preference.sections)) {
    if (
      Object.hasOwn(sectionExpanded, sectionKey) &&
      typeof expanded === "boolean"
    ) {
      sectionExpanded[sectionKey] = expanded;
    }
  }

  return sectionExpanded;
}

export function getSectionExpansionPreferenceStorageKey(userId, pageKey) {
  return createPreferenceStorageKey(
    SECTION_EXPANSION_PREFERENCE_NAMESPACE,
    SECTION_EXPANSION_PREFERENCE_VERSION,
    userId,
    pageKey,
  );
}

export function loadSectionExpansionPreference(storageKey, storage) {
  return loadJsonPreference(storageKey, storage);
}

export function saveSectionExpansionPreference(
  storageKey,
  preference,
  storage,
) {
  return saveJsonPreference(storageKey, preference, storage);
}
