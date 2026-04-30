import request from "@/utils/request";
import { download } from "@/utils/request";

export function getReportingHome(params = {}) {
  return request({
    url: "/api/reporting/home",
    method: "get",
    params,
  });
}

export function getInventorySummary(params = {}) {
  return request({
    url: "/api/reporting/inventory-summary",
    method: "get",
    params,
  });
}

export function getMaterialCategorySummary(params = {}) {
  return request({
    url: "/api/reporting/material-category-summary",
    method: "get",
    params,
  });
}

export function getTrendSeries(params = {}) {
  return request({
    url: "/api/reporting/trends",
    method: "get",
    params,
  });
}

export function getMonthlyReportingSummary(params = {}) {
  return request({
    url: "/api/reporting/monthly-reporting",
    method: "get",
    params,
  });
}

export function getMonthlyReportingDetails(params = {}) {
  return request({
    url: "/api/reporting/monthly-reporting/details",
    method: "get",
    params,
  });
}

export function exportMonthlyReporting(data = {}) {
  const fileName =
    data.viewMode === "MATERIAL_CATEGORY"
      ? `monthly_reporting_material_category_${data.yearMonth || new Date().toISOString().slice(0, 7)}.xls`
      : `monthly_reporting_${data.yearMonth || new Date().toISOString().slice(0, 7)}.xls`;
  return download("/api/reporting/monthly-reporting/export", data, fileName);
}
