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

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
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

function hasColumnPreferences(source) {
  return [...source.matchAll(/<adaptive-table(?=[\s>])([\s\S]*?)>/g)].some(
    (match) =>
      /(?:^|\s)auto-columns(?:\s|>|$)/.test(match[1]) ||
      /:column-config=/.test(match[1]),
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
    const autoTableTags = [
      ...monthlySource.matchAll(/<adaptive-table(?=[\s>])([\s\S]*?)>/g),
    ].filter((match) => /(?:^|\s)auto-columns(?:\s|>|$)/.test(match[1]));
    const tableKeys = autoTableTags
      .map((match) => match[1].match(/:table-key="([^"]+)"/)?.[1])
      .filter(Boolean);

    expect(autoTableTags).toHaveLength(10);
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
  });

  it("keeps every explicit toolbar column contract connected to AdaptiveTable", () => {
    const disconnected = collectVueFiles(viewsRoot)
      .filter((filePath) => {
        const source = readSource(filePath);
        return /<right-toolbar[\s\S]{0,500}:columns=/.test(source) &&
          !/:column-config=/.test(source);
      })
      .map((filePath) => path.relative(repositoryRoot, filePath));

    expect(disconnected).toEqual([]);
  });
});
