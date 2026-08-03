const STORAGE_PREFIX = "saifute";

function normalizeKeyPart(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

export function createPreferenceStorageKey(
  namespace,
  version,
  userId,
  scopeKey,
) {
  const normalizedNamespace = normalizeKeyPart(namespace);
  const normalizedVersion = normalizeKeyPart(version);
  const normalizedUserId = normalizeKeyPart(userId);
  const normalizedScopeKey = normalizeKeyPart(scopeKey);
  if (
    !normalizedNamespace ||
    !normalizedVersion ||
    !normalizedUserId ||
    !normalizedScopeKey
  ) {
    return "";
  }

  return `${STORAGE_PREFIX}:${normalizedNamespace}:v${normalizedVersion}:${encodeURIComponent(normalizedUserId)}:${encodeURIComponent(normalizedScopeKey)}`;
}

export function loadJsonPreference(storageKey, storage) {
  if (!storageKey) {
    return null;
  }

  try {
    const targetStorage = storage ?? globalThis.localStorage;
    const rawValue = targetStorage?.getItem(storageKey);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

export function saveJsonPreference(storageKey, preference, storage) {
  if (!storageKey) {
    return false;
  }

  try {
    const targetStorage = storage ?? globalThis.localStorage;
    targetStorage?.setItem(storageKey, JSON.stringify(preference));
    return Boolean(targetStorage);
  } catch {
    return false;
  }
}

export function removeJsonPreference(storageKey, storage) {
  if (!storageKey) {
    return false;
  }

  try {
    const targetStorage = storage ?? globalThis.localStorage;
    targetStorage?.removeItem(storageKey);
    return Boolean(targetStorage);
  } catch {
    return false;
  }
}
