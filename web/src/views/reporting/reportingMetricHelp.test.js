import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  inventoryMetricHelp,
  monthlyMetricHelp,
  trendMetricHelp,
} from "./reportingMetricHelp";
import {
  REPORTING_COLUMN_WIDTHS,
  resolveReportingColumnWidth,
} from "./reportingColumnLayout";

const reportingRoot = import.meta.dir;
const derivedColumnPropsByView = {
  "inventory-summary/index.vue": ["quantityOnHand", "inventoryValue"],
  "material-category-summary/index.vue": [
    "materialCount",
    "inventoryRecordCount",
    "lowStockCount",
    "normalStockCount",
    "aboveMaxStockCount",
    "unconfiguredStockCount",
    "totalInventoryValue",
  ],
  "trends/index.vue": ["date", "documentCount", "totalAmount"],
  "monthly-reporting/index.vue": [
    "documentCount",
    "lineCount",
    "inventoryCostInAmount",
    "inventoryCostOutAmount",
    "inventoryCostNetChangeAmount",
    "pickCostAmount",
    "returnCostAmount",
    "scrapCostAmount",
    "netConsumptionCostAmount",
    "salesOutboundCostAmount",
    "salesReturnCostAmount",
    "netSalesAmount",
    "netCostAmount",
    "salesGrossProfitAmount",
    "estimatedGrossProfitAmount",
    "handoffInCostAmount",
    "attributedInventoryCostNetChangeAmount",
    "openingQuantity",
    "openingCostAmount",
    "inventoryNetChangeQuantity",
    "closingQuantity",
    "closingCostAmount",
    "inQuantity",
    "outQuantity",
    "purchaseNetInboundAmount",
    "workshopPickCostAmount",
    "workshopReturnCostAmount",
    "workshopScrapCostAmount",
    "workshopNetConsumptionQuantity",
    "workshopNetConsumptionCostAmount",
    "netSalesQuantity",
    "netSalesCostAmount",
    "cost",
    "unitPrice",
    "amount",
  ],
};
const derivedColumnLabelsByView = {
  "inventory-summary/index.vue": ["状态"],
  "trends/index.vue": ["类型"],
};

function collectStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  return Object.values(value).flatMap(collectStrings);
}

function collectOpeningTags(source, componentName) {
  return [
    ...source.matchAll(
      new RegExp(`<${componentName}(?=[\\s>])[\\s\\S]*?>`, "g"),
    ),
  ].map((match) => match[0]);
}

describe("reporting derived metric explanations", () => {
  it("uses one shared width catalog for every reporting table column", () => {
    const violations = [];

    for (const relativePath of Object.keys(derivedColumnPropsByView)) {
      const source = fs.readFileSync(path.join(reportingRoot, relativePath), "utf8");
      const standardTags = collectOpeningTags(source, "reporting-column");
      const metricTags = collectOpeningTags(source, "reporting-metric-column");
      const rawTags = collectOpeningTags(source, "el-table-column");

      if (rawTags.length > 0) {
        violations.push(`${relativePath}: 仍存在绕过统一列宽的表格列`);
      }

      for (const tag of [...standardTags, ...metricTags]) {
        const label = tag.match(/\slabel="([^"]+)"/)?.[1];
        if (!label || !Object.hasOwn(REPORTING_COLUMN_WIDTHS, label)) {
          violations.push(`${relativePath}: ${label || "未知表头"} 未配置统一列宽`);
        }
        if (/\s(?:min-)?width=/.test(tag)) {
          violations.push(`${relativePath}: ${label || "未知表头"} 仍在页面单独设置列宽`);
        }
      }
    }

    expect(REPORTING_COLUMN_WIDTHS.领域).toBe(120);
    expect(REPORTING_COLUMN_WIDTHS.业务单据数).toBeGreaterThanOrEqual(100);
    expect(resolveReportingColumnWidth("领域", 140)).toBe(120);
    expect(resolveReportingColumnWidth("业务单据数", 80)).toBe(120);
    expect(Object.hasOwn(REPORTING_COLUMN_WIDTHS, "总数量")).toBe(false);
    expect(Object.hasOwn(REPORTING_COLUMN_WIDTHS, "净生产数量")).toBe(false);
    expect(violations).toEqual([]);
  });

  it("keeps ordinary and explained headers on one line", () => {
    const ordinaryColumn = fs.readFileSync(
      path.join(reportingRoot, "components/ReportingColumn.vue"),
      "utf8",
    );
    const metricColumn = fs.readFileSync(
      path.join(reportingRoot, "components/ReportingMetricColumn.vue"),
      "utf8",
    );
    const metricLabel = fs.readFileSync(
      path.join(reportingRoot, "components/ReportingMetricLabel.vue"),
      "utf8",
    );

    expect(ordinaryColumn).toContain("white-space: nowrap");
    expect(metricColumn).toContain("white-space: nowrap");
    expect(metricLabel).toContain("white-space: nowrap");
    expect(ordinaryColumn).toContain(':width="resolvedWidth"');
    expect(metricColumn).toContain(':width="resolvedWidth"');
  });

  it("keeps direct inbound metrics free of tooltip explanations", () => {
    const monthlySource = fs.readFileSync(
      path.join(reportingRoot, "monthly-reporting/index.vue"),
      "utf8",
    );
    const homeSource = fs.readFileSync(
      path.join(reportingRoot, "home/index.vue"),
      "utf8",
    );

    for (const prop of [
      "acceptanceInboundAmount",
      "productionReceiptAmount",
      "supplierReturnAmount",
    ]) {
      expect(monthlySource).not.toMatch(
        new RegExp(`<reporting-metric-column[^>]*\\bprop="${prop}"`),
      );
    }
    expect(monthlySource).toContain(
      '<reporting-column prop="productionReceiptAmount" label="生产入库计价金额" />',
    );
    expect(homeSource).not.toContain("全部有效生产入库行的 WMS 入库计价金额");
    expect(JSON.stringify(monthlyMetricHelp)).not.toContain("完整制造成本");
  });

  it("keeps every explanation substantive", () => {
    const descriptions = collectStrings({
      inventoryMetricHelp,
      monthlyMetricHelp,
      trendMetricHelp,
    });

    expect(descriptions.length).toBeGreaterThan(50);
    expect(
      descriptions.every((description) => description.trim().length >= 14),
    ).toBe(true);
  });

  it("renders every declared derived column with the explanation component", () => {
    const violations = [];

    for (const [relativePath, derivedProps] of Object.entries(
      derivedColumnPropsByView,
    )) {
      const source = fs.readFileSync(path.join(reportingRoot, relativePath), "utf8");
      const metricTags = collectOpeningTags(source, "reporting-metric-column");
      const rawColumnTags = collectOpeningTags(source, "el-table-column");

      for (const tag of metricTags) {
        if (!/\slabel="[^"]+"/.test(tag) || !/\s:content="[^"]+"/.test(tag)) {
          violations.push(`${relativePath}: 派生列缺少标签或说明`);
        }
      }

      const actualMetricProps = new Set(
        metricTags
          .map((tag) => tag.match(/\sprop="([^"]+)"/)?.[1])
          .filter(Boolean),
      );
      for (const prop of actualMetricProps) {
        if (!derivedProps.includes(prop)) {
          violations.push(`${relativePath}: ${prop} 未登记为派生列`);
        }
      }

      for (const prop of derivedProps) {
        const propPattern = new RegExp(`\\sprop="${prop}"`);
        if (!metricTags.some((tag) => propPattern.test(tag))) {
          violations.push(`${relativePath}: ${prop} 未使用说明列`);
        }
        if (rawColumnTags.some((tag) => propPattern.test(tag))) {
          violations.push(`${relativePath}: ${prop} 仍存在无说明的原始表头`);
        }
      }

      for (const label of derivedColumnLabelsByView[relativePath] ?? []) {
        const labelPattern = new RegExp(`\\slabel="${label}"`);
        if (!metricTags.some((tag) => labelPattern.test(tag))) {
          violations.push(`${relativePath}: ${label} 未使用说明列`);
        }
        if (rawColumnTags.some((tag) => labelPattern.test(tag))) {
          violations.push(`${relativePath}: ${label} 仍存在无说明的原始表头`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("explains every reporting summary card label", () => {
    const viewPaths = [
      "inventory-summary/index.vue",
      "material-category-summary/index.vue",
      "trends/index.vue",
      "monthly-reporting/index.vue",
    ];
    const unexplainedLabels = [];

    for (const relativePath of viewPaths) {
      const source = fs.readFileSync(path.join(reportingRoot, relativePath), "utf8");
      if (/<div class="stat-label">\s*[^<\s]/.test(source)) {
        unexplainedLabels.push(relativePath);
      }
    }

    expect(unexplainedLabels).toEqual([]);
  });
});
