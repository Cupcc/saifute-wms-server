export const SALES_PROJECT_CODE_PREFIX = "XMBH";
export const RD_PROJECT_CODE_PREFIX = "YFXMBH";

export function generateProjectCode(
  sequenceId,
  prefix = SALES_PROJECT_CODE_PREFIX,
) {
  const normalizedId = Number(sequenceId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return "";
  }
  return `${prefix}-${normalizedId}`;
}

export function generateSalesProjectCode(sequenceId) {
  return generateProjectCode(sequenceId, SALES_PROJECT_CODE_PREFIX);
}

export function generateRdProjectCode(sequenceId) {
  return generateProjectCode(sequenceId, RD_PROJECT_CODE_PREFIX);
}
