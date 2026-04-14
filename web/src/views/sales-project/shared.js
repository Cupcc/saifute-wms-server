export function buildSalesProjectDetailPath(projectId) {
  return `/sales/project/detail/${projectId}`;
}

export function toDateInputValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

export function formatDate(value) {
  return toDateInputValue(value) || "-";
}

export function formatNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

export function toInputString(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  return String(value);
}

export function buildSalesProjectSummaryCards(summary = {}) {
  return [
    { label: "目标数量", value: formatNumber(summary.totalTargetQty) },
    {
      label: "目标金额",
      value: formatAmount(summary.totalTargetAmount),
    },
    {
      label: "当前库存",
      value: formatNumber(summary.totalCurrentInventoryQty),
    },
    { label: "累计出库", value: formatNumber(summary.totalOutboundQty) },
    { label: "累计退货", value: formatNumber(summary.totalReturnQty) },
    {
      label: "净发货",
      value: formatNumber(summary.totalNetShipmentQty),
    },
    {
      label: "净发货金额",
      value: formatAmount(summary.totalNetShipmentAmount),
    },
    {
      label: "净发货成本",
      value: formatAmount(summary.totalNetShipmentCostAmount),
    },
    {
      label: "待供货",
      value: formatNumber(summary.totalPendingSupplyQty),
    },
  ];
}
