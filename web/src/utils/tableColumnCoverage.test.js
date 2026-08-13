import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const viewsRoot = path.join(repositoryRoot, "web/src/views");
const permissionStorePath = path.join(
  repositoryRoot,
  "web/src/store/modules/permission.js",
);
const auxiliaryRouteComponents = [
  "monitor/job/log",
  "system/dict/data",
  "system/role/authUser",
  "system/user/authRole",
];
const fixedSemanticTableFiles = {
  "monitor/cache/list.vue": "缓存名称与键名组成不可隐藏的主从选择器",
  "rd/procurement-requests/components/RdProcurementItemLinesEditor.vue":
    "采购品项行编辑器",
  "rd/projects/detail.vue": "研发项目详情、BOM 与动作行编辑工作流",
  "sales/components/SalesOrderDetailDialog.vue": "销售单据详情核对表",
  "sales/components/SalesOrderEditorDialog.vue": "销售单据行编辑器",
  "sales-project/components/SalesProjectAcceptanceOrderDetailDialog.vue":
    "项目验收单详情核对表",
  "sales-project/components/SalesProjectAcceptanceOrderDialog.vue":
    "项目验收单行编辑器",
  "sales-project/components/SalesProjectDetailPage.vue":
    "项目物料选择与销售草稿创建工作流",
};

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractStringArrayConstant(source, constantName) {
  const escapedName = constantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(
      `const\\s+${escapedName}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`,
    ),
  );
  if (!match) {
    throw new Error(`无法解析数组常量: ${constantName}`);
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function resolveViewComponent(component) {
  const basePath = path.join(viewsRoot, component);
  const candidates = [`${basePath}.vue`, path.join(basePath, "index.vue")];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(`无法解析路由组件: ${component}`);
  }
  return resolved;
}

function collectSupportedRouteComponents() {
  const permissionSource = readSource(permissionStorePath);
  const registryStart = permissionSource.indexOf(
    "const SUPPORTED_BACKEND_ROUTE_META",
  );
  const registryEnd = permissionSource.indexOf(
    "function collectBackendRoutes",
    registryStart,
  );
  const registrySource = permissionSource.slice(registryStart, registryEnd);

  return [
    ...new Set([
      ...[...registrySource.matchAll(/component:\s*"([^"]+)"/g)].map(
        (match) => match[1],
      ),
      ...auxiliaryRouteComponents,
    ]),
  ];
}

function resolveSingleComponentWrapper(filePath, source) {
  const template = source.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? "";
  const componentName = template.match(
    /^\s*<([A-Z][A-Za-z0-9]*)\b[\s\S]*\/>\s*$/,
  )?.[1];
  if (!componentName) {
    return null;
  }

  const escapedName = componentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const importPath = source.match(
    new RegExp(`import\\s+${escapedName}\\s+from\\s+["']([^"']+)["']`),
  )?.[1];
  if (!importPath?.startsWith(".")) {
    return null;
  }

  const resolvedPath = path.resolve(path.dirname(filePath), importPath);
  return fs.existsSync(resolvedPath) ? resolvedPath : null;
}

function hasDataTable(source) {
  return /<(?:el-table|adaptive-table)(?=[\s>])/.test(source);
}

function collectOpeningTags(source, componentName) {
  return [
    ...source.matchAll(
      new RegExp(`<${componentName}(?=[\\s>])[\\s\\S]*?>`, "g"),
    ),
  ].map((match) => match[0]);
}

function tagEnablesColumnPreferences(tag) {
  return /(?:^|\s)column-preferences(?:\s|=|\/>|>)/.test(tag);
}

function hasColumnPreferences(source) {
  return collectOpeningTags(source, "adaptive-table").some(
    tagEnablesColumnPreferences,
  );
}

function collectVueFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectVueFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".vue") ? [entryPath] : [];
  });
}

describe("route table column preference coverage", () => {
  it("keeps every standard reporting table in the supported route registry", () => {
    const supportedComponents = new Set(collectSupportedRouteComponents());
    const expectedReportingComponents = [
      "reporting/inventory-summary/index",
      "reporting/material-category-summary/index",
      "reporting/trends/index",
      "reporting/monthly-reporting/index",
    ];

    for (const component of expectedReportingComponents) {
      expect(supportedComponents.has(component)).toBe(true);
    }
  });

  it("covers every supported route component that directly renders a data table", () => {
    const uncovered = [];

    for (const component of collectSupportedRouteComponents()) {
      let filePath = resolveViewComponent(component);
      let source = readSource(filePath);
      if (!hasDataTable(source)) {
        const wrapperPath = resolveSingleComponentWrapper(filePath, source);
        if (wrapperPath) {
          filePath = wrapperPath;
          source = readSource(filePath);
        }
      }
      if (hasDataTable(source) && !hasColumnPreferences(source)) {
        uncovered.push(path.relative(repositoryRoot, filePath));
      }
    }

    expect(uncovered).toEqual([]);
  });

  it("keeps all reporting data tables independently configurable", () => {
    const monthlySource = readSource(
      resolveViewComponent("reporting/monthly-reporting/index"),
    );
    const preferenceTableTags = collectOpeningTags(
      monthlySource,
      "adaptive-table",
    ).filter(tagEnablesColumnPreferences);
    const tableKeys = preferenceTableTags
      .map((tag) => tag.match(/:table-key="([^"]+)"/)?.[1])
      .filter(Boolean);

    expect(preferenceTableTags).toHaveLength(10);
    expect(tableKeys).toHaveLength(preferenceTableTags.length);
    expect(new Set(tableKeys).size).toBe(10);
    expect(
      hasColumnPreferences(
        readSource(resolveViewComponent("reporting/inventory-summary/index")),
      ),
    ).toBe(true);
    expect(
      hasColumnPreferences(
        readSource(
          resolveViewComponent("reporting/material-category-summary/index"),
        ),
      ),
    ).toBe(true);
    expect(
      hasColumnPreferences(
        readSource(resolveViewComponent("reporting/trends/index")),
      ),
    ).toBe(true);
  });

  it("keeps material-category monthly reporting tables compact by default", () => {
    const monthlySource = readSource(
      resolveViewComponent("reporting/monthly-reporting/index"),
    );

    expect(monthlySource).toContain(
      ':default-hidden-columns="WORKSHOP_USAGE_DEFAULT_HIDDEN_COLUMNS"',
    );
    expect(monthlySource).toContain(
      ':default-hidden-columns="MATERIAL_CATEGORY_SUMMARY_DEFAULT_HIDDEN_COLUMNS"',
    );
    expect(monthlySource).toContain(
      ':default-hidden-columns="MATERIAL_SUMMARY_DEFAULT_HIDDEN_COLUMNS"',
    );
    expect(monthlySource).toContain(
      ':default-hidden-columns="MATERIAL_CATEGORY_DETAILS_DEFAULT_HIDDEN_COLUMNS"',
    );
    expect(
      extractStringArrayConstant(
        monthlySource,
        "MATERIAL_CATEGORY_SUMMARY_DEFAULT_HIDDEN_COLUMNS",
      ),
    ).toEqual([
      "acceptanceInboundAmount",
      "supplierReturnAmount",
      "purchaseNetInboundAmount",
      "productionReceiptAmount",
      "netSalesAmount",
      "netSalesCostAmount",
      "workshopNetConsumptionCostAmount",
    ]);
    expect(
      extractStringArrayConstant(
        monthlySource,
        "MATERIAL_SUMMARY_DEFAULT_HIDDEN_COLUMNS",
      ),
    ).not.toContain("inventoryCostNetChangeAmount");
    expect(monthlySource).toContain('label="变动金额"');
    expect(monthlySource).toContain('label: "变动金额"');
    expect(monthlySource).not.toContain("金额变动");
  });

  it("keeps every monthly reporting section independently collapsible", () => {
    const monthlySource = readSource(
      resolveViewComponent("reporting/monthly-reporting/index"),
    );
    const expectedSectionKeys = [
      "domainSummary",
      "documentTypeSummary",
      "businessSummary",
      "workshopUsageSummary",
      "categorySummary",
      "materialSummary",
      "details",
    ];
    const toggleSectionKeys = [
      ...monthlySource.matchAll(/@click="toggleSection\('([^']+)'\)"/g),
    ].map((match) => match[1]);

    expect(toggleSectionKeys).toEqual(expectedSectionKeys);
    for (const sectionKey of expectedSectionKeys) {
      expect(monthlySource).toContain(
        `:aria-expanded="sectionExpanded.${sectionKey}"`,
      );
      expect(monthlySource).toContain(
        `v-if="sectionExpanded.${sectionKey}"`,
      );
    }
    expect(monthlySource).toContain(
      "getSectionExpansionPreferenceStorageKey(",
    );
    expect(monthlySource).toContain("userStore.id || userStore.name");
    expect(monthlySource).toContain("saveSectionExpansionPreference(");
    expect(monthlySource).toContain("loadSectionExpansionPreference(");
    expect(monthlySource).toMatch(
      /watch\(\s*sectionExpansionPreferenceStorageKey,\s*restoreSectionExpansionPreferences,\s*\{ immediate: true \},\s*\)/,
    );
  });

  it("keeps every raw table-only view intentionally classified", () => {
    const rawTableOnlyFiles = collectVueFiles(viewsRoot)
      .filter((filePath) => {
        const source = readSource(filePath);
        return /<el-table(?=[\s>])/.test(source) &&
          !hasColumnPreferences(source);
      })
      .map((filePath) => path.relative(viewsRoot, filePath));
    const unclassified = rawTableOnlyFiles.filter(
      (filePath) => !Object.hasOwn(fixedSemanticTableFiles, filePath),
    );
    const staleClassifications = Object.keys(fixedSemanticTableFiles).filter(
      (filePath) => !rawTableOnlyFiles.includes(filePath),
    );

    expect({ unclassified, staleClassifications }).toEqual({
      unclassified: [],
      staleClassifications: [],
    });
  });

  it("forbids legacy page-level column preference contracts", () => {
    const violations = [];

    for (const filePath of collectVueFiles(viewsRoot)) {
      const source = readSource(filePath);
      const relativePath = path.relative(repositoryRoot, filePath);

      if (/\bauto-columns\b/.test(source)) {
        violations.push(`${relativePath}: auto-columns`);
      }
      if (/:column-config\s*=/.test(source)) {
        violations.push(`${relativePath}: column-config`);
      }
      if (
        collectOpeningTags(source, "right-toolbar").some((tag) =>
          /(?:^|\s):columns\s*=/.test(tag),
        )
      ) {
        violations.push(`${relativePath}: RightToolbar columns`);
      }
      if (
        /v-if\s*=\s*["'][^"']*\bcolumns\s*\[[^\]]+\]\s*\.visible/.test(
          source,
        )
      ) {
        violations.push(`${relativePath}: columns[index].visible`);
      }
    }

    expect(violations).toEqual([]);
  });
});
