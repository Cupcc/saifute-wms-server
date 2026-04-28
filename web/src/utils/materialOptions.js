function firstPresentValue(...values) {
  return (
    values.find(
      (value) => value !== null && typeof value !== "undefined" && value !== "",
    ) ?? ""
  );
}

export function normalizeMaterialOption(material = {}) {
  const materialId = firstPresentValue(material.materialId, material.id);
  if (!materialId) {
    return null;
  }

  return {
    materialId,
    materialCode: firstPresentValue(material.materialCode),
    materialName: firstPresentValue(material.materialName),
    specification: firstPresentValue(material.specification, material.specModel),
    unit: firstPresentValue(material.unit, material.unitCode),
    currentQty: material.currentQty,
  };
}

// Document lines store historical material snapshots; prefer those over current master data.
export function materialOptionFromDocumentSnapshot(detail = {}) {
  const material =
    detail.material && typeof detail.material === "object" ? detail.material : {};
  const materialId = firstPresentValue(
    detail.materialId,
    material.materialId,
    material.id,
  );
  if (!materialId) {
    return null;
  }

  return {
    materialId,
    materialCode: firstPresentValue(
      detail.materialCodeSnapshot,
      detail.materialCode,
      material.materialCode,
    ),
    materialName: firstPresentValue(
      detail.materialNameSnapshot,
      detail.materialName,
      material.materialName,
    ),
    specification: firstPresentValue(
      detail.materialSpecSnapshot,
      detail.specification,
      detail.specModel,
      material.specification,
      material.specModel,
    ),
    unit: firstPresentValue(
      detail.unitCodeSnapshot,
      detail.unit,
      detail.unitCode,
      material.unit,
      material.unitCode,
    ),
    currentQty:
      typeof material.currentQty !== "undefined"
        ? material.currentQty
        : detail.currentQty,
  };
}

function mergeMaterialOption(current = {}, next) {
  return {
    ...current,
    materialId: next.materialId,
    materialCode: firstPresentValue(next.materialCode, current.materialCode),
    materialName: firstPresentValue(next.materialName, current.materialName),
    specification: firstPresentValue(
      next.specification,
      current.specification,
    ),
    unit: firstPresentValue(next.unit, current.unit),
    currentQty:
      typeof next.currentQty !== "undefined"
        ? next.currentQty
        : current.currentQty,
  };
}

function materialOptionKey(option) {
  return String(option.materialId);
}

export function materialOptionsFromDocumentSnapshots(details = []) {
  return details.map(materialOptionFromDocumentSnapshot).filter(Boolean);
}

export function mergeMaterialOptions(currentOptions = [], nextOptions = []) {
  const materialMap = new Map();

  for (const option of currentOptions) {
    const normalized = normalizeMaterialOption(option);
    if (normalized) {
      materialMap.set(materialOptionKey(normalized), normalized);
    }
  }

  for (const option of nextOptions) {
    const normalized = normalizeMaterialOption(option);
    if (!normalized) {
      continue;
    }
    const key = materialOptionKey(normalized);
    materialMap.set(
      key,
      mergeMaterialOption(materialMap.get(key), normalized),
    );
  }

  return [...materialMap.values()];
}
