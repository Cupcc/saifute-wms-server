#!/usr/bin/env bun

/**
 * Quality hook for Claude Code PostToolUse events.
 *
 * Triggered after Edit/Write operations, this script enforces
 * the code quality baseline defined in
 * `docs/architecture/40-code-quality-governance.md`.
 *
 * Checks:
 *   1. File line count ≤ 500
 *   2. application/ layer does not inject PrismaService (type-only Prisma imports are allowed per §2.3.1)
 *   3. Cross-module repository imports are flagged
 *
 * Exit codes:
 *   0 — clean, no violation
 *   1 — violation detected (stderr carries a clear, actionable message
 *       so Claude Code surfaces it to the agent)
 *
 * Usage:
 *   bun ./scripts/check-quality-hooks.mjs <absolute-or-relative-file-path>
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_LINES = 500;
const APPLICATION_LAYER_PATTERN = /\/modules\/[^/]+\/application\//;
const REPO_ROOT = process.cwd();

const targetArg = process.argv[2];

if (!targetArg) {
  // No file path provided — hook fired without a target.
  // Exit 0 to avoid blocking unrelated tool invocations.
  process.exit(0);
}

const absolutePath = path.isAbsolute(targetArg)
  ? targetArg
  : path.resolve(REPO_ROOT, targetArg);

// Only lint TypeScript sources under src/. Skip tests, configs, docs, etc.
if (!absolutePath.endsWith(".ts")) {
  process.exit(0);
}

const normalized = absolutePath.split(path.sep).join("/");
if (!normalized.includes("/src/")) {
  process.exit(0);
}

if (normalized.includes("/src/generated/")) {
  process.exit(0);
}

let fileStat;
try {
  fileStat = await stat(absolutePath);
} catch {
  // File removed — nothing to check.
  process.exit(0);
}

if (!fileStat.isFile()) {
  process.exit(0);
}

const content = await readFile(absolutePath, "utf8");
const lines = content.split(/\r?\n/);
const lineCount = lines.endsWith?.("\n") ? lines.length - 1 : lines.length;

const violations = [];

// ---- Check 1: line count ---------------------------------------------------
if (lineCount > MAX_LINES) {
  violations.push(
    `❌ File exceeds ${MAX_LINES} lines (currently ${lineCount}).\n` +
      `   → Split this file before adding more code.\n` +
      `   → Reference: docs/architecture/40-code-quality-governance.md §4\n` +
      `   → Positive example: src/modules/master-data/application/`,
  );
}

// ---- Check 2: PrismaService injection into application layer ----------------
// Only flags runtime dependency (PrismaService injection), NOT type-only imports
// like `import { Prisma } from ...` or Prisma-generated enums. See §2.3.1.
const isApplicationLayer = APPLICATION_LAYER_PATTERN.test(normalized);

if (isApplicationLayer) {
  const prismaServiceRegex = /PrismaService/;
  const hasPrismaService = prismaServiceRegex.test(content);

  if (hasPrismaService) {
    violations.push(
      `❌ Application layer must not inject PrismaService.\n` +
        `   → Move data access to infrastructure/ layer (repository).\n` +
        `   → Type-only Prisma imports (enums, input types, error classes) are allowed (§2.3.1).\n` +
        `   → Reference: docs/architecture/40-code-quality-governance.md §2`,
    );
  }
}

// ---- Check 3: cross-module repository injection ---------------------------
// Detect imports like: `import { XxxRepository } from "../../other-module/..."`
// or `from "src/modules/other-module/..."`.
const moduleMatch = normalized.match(/\/modules\/([^/]+)\//);
if (moduleMatch) {
  const currentModule = moduleMatch[1];
  const crossRepoImportRegex =
    /import\s+[^;]*?\b(\w+Repository)\b[^;]*?from\s+["']([^"']+)["']/g;

  for (const match of content.matchAll(crossRepoImportRegex)) {
    const [, symbolName, importPath] = match;
    // Resolve the import path relative to the current file to check
    // if it points at a different module's directory.
    if (importPath.startsWith(".")) {
      const resolvedImport = path
        .resolve(path.dirname(absolutePath), importPath)
        .split(path.sep)
        .join("/");
      const importedModuleMatch = resolvedImport.match(/\/modules\/([^/]+)\//);
      if (importedModuleMatch && importedModuleMatch[1] !== currentModule) {
        violations.push(
          `❌ Cross-module repository injection detected: ${symbolName} from ${importPath}\n` +
            `   → Current module \`${currentModule}\` imports repository from \`${importedModuleMatch[1]}\`.\n` +
            `   → Use the exported service of \`${importedModuleMatch[1]}\` instead.\n` +
            `   → Reference: docs/architecture/40-code-quality-governance.md §3`,
        );
      }
    }
  }
}

// ---- Report ---------------------------------------------------------------
if (violations.length === 0) {
  process.exit(0);
}

console.error(
  `\n[quality-hook] ${violations.length} violation(s) in ${path.relative(
    REPO_ROOT,
    absolutePath,
  )}:\n`,
);
for (const v of violations) {
  console.error(v);
  console.error("");
}
console.error(
  "Baseline: docs/architecture/40-code-quality-governance.md\n" +
    "Fix these before continuing. If this is legacy code being refactored in place, the\n" +
    "change must include the split/repair within the same PR.",
);

process.exit(1);
