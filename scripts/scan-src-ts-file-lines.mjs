#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_LINES = 1000;
const DEFAULT_ROOT_DIR = "src";
const DEFAULT_TOP_COUNT = 20;

function printHelp() {
  console.log(`Usage: node ./scripts/scan-src-ts-file-lines.mjs [options]

Options:
  --max-lines <number>      Maximum allowed lines per file. Default: ${DEFAULT_MAX_LINES}
  --root <path>             Root directory to scan. Default: ${DEFAULT_ROOT_DIR}
  --top <number>            Number of largest files to print. Default: ${DEFAULT_TOP_COUNT}
  --no-error                Always exit with code 0
  --skip-blank-lines        Ignore blank lines when counting
  --include-generated       Include files under src/generated
  --json                    Print JSON output
  --help                    Show this help message
`);
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} expects a positive integer.`);
  }

  return parsed;
}

function parseArgs(argv) {
  const options = {
    help: false,
    includeGenerated: false,
    json: false,
    maxLines: DEFAULT_MAX_LINES,
    noError: false,
    rootDir: DEFAULT_ROOT_DIR,
    skipBlankLines: false,
    topCount: DEFAULT_TOP_COUNT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help") {
      options.help = true;
      continue;
    }

    if (argument === "--skip-blank-lines") {
      options.skipBlankLines = true;
      continue;
    }

    if (argument === "--include-generated") {
      options.includeGenerated = true;
      continue;
    }

    if (argument === "--json") {
      options.json = true;
      continue;
    }

    if (argument === "--no-error") {
      options.noError = true;
      continue;
    }

    if (argument === "--max-lines" || argument.startsWith("--max-lines=")) {
      const value =
        argument === "--max-lines"
          ? argv[++index]
          : argument.slice("--max-lines=".length);
      options.maxLines = parsePositiveInteger(value, "--max-lines");
      continue;
    }

    if (argument === "--root" || argument.startsWith("--root=")) {
      const value =
        argument === "--root"
          ? argv[++index]
          : argument.slice("--root=".length);
      options.rootDir = value;
      continue;
    }

    if (argument === "--top" || argument.startsWith("--top=")) {
      const value =
        argument === "--top" ? argv[++index] : argument.slice("--top=".length);
      options.topCount = parsePositiveInteger(value, "--top");
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

async function walkDirectory(rootDir, includeGenerated) {
  const entries = await readdir(rootDir, {
    recursive: true,
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    const relativePath = path.join(entry.parentPath, entry.name);
    const normalizedPath = relativePath.split(path.sep).join("/");

    if (!includeGenerated && normalizedPath.startsWith("src/generated/")) {
      continue;
    }

    files.push(normalizedPath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function splitLines(content) {
  if (content.length === 0) {
    return [];
  }

  const normalizedContent = content.replaceAll("\r\n", "\n");
  const lines = normalizedContent.split("\n");

  if (normalizedContent.endsWith("\n")) {
    lines.pop();
  }

  return lines;
}

function countLines(content, skipBlankLines) {
  const lines = splitLines(content);

  if (!skipBlankLines) {
    return lines.length;
  }

  return lines.filter((line) => line.trim().length > 0).length;
}

async function collectFileStats(filePaths, skipBlankLines) {
  const stats = [];

  for (const filePath of filePaths) {
    const content = await readFile(filePath, "utf8");
    stats.push({
      filePath,
      lineCount: countLines(content, skipBlankLines),
    });
  }

  stats.sort((left, right) => {
    if (right.lineCount !== left.lineCount) {
      return right.lineCount - left.lineCount;
    }

    return left.filePath.localeCompare(right.filePath);
  });

  return stats;
}

function printTextReport({
  maxLines,
  rootDir,
  skipBlankLines,
  stats,
  topCount,
}) {
  const violations = stats.filter((stat) => stat.lineCount > maxLines);
  const largestFiles = stats.slice(0, topCount);

  console.log(`Scanned ${stats.length} TypeScript files under ${rootDir}`);
  console.log(
    `Threshold: ${maxLines} lines (${skipBlankLines ? "blank lines ignored" : "blank lines counted"})`,
  );
  console.log(`Violations: ${violations.length}`);

  if (violations.length > 0) {
    console.log("");
    console.log("Files above threshold:");

    for (const violation of violations) {
      console.log(
        `${String(violation.lineCount).padStart(5, " ")}  ${violation.filePath}`,
      );
    }
  }

  console.log("");
  console.log(`Top ${Math.min(largestFiles.length, topCount)} largest files:`);

  for (const stat of largestFiles) {
    console.log(`${String(stat.lineCount).padStart(5, " ")}  ${stat.filePath}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const filePaths = await walkDirectory(
    options.rootDir,
    options.includeGenerated,
  );
  const stats = await collectFileStats(filePaths, options.skipBlankLines);
  const violations = stats.filter((stat) => stat.lineCount > options.maxLines);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          maxLines: options.maxLines,
          rootDir: options.rootDir,
          scannedFileCount: stats.length,
          skipBlankLines: options.skipBlankLines,
          topFiles: stats.slice(0, options.topCount),
          violations,
        },
        null,
        2,
      ),
    );
  } else {
    printTextReport({
      maxLines: options.maxLines,
      rootDir: options.rootDir,
      skipBlankLines: options.skipBlankLines,
      stats,
      topCount: options.topCount,
    });
  }

  if (violations.length > 0 && !options.noError) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
