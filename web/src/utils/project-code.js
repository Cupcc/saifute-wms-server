export function generateProjectCode(sequenceId, prefix = "XMBH") {
  const normalizedId = Number(sequenceId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return "";
  }
  return `${prefix}-${normalizedId}`;
}
