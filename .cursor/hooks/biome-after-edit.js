const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function isBiomeTarget(filePath) {
  const normalized = filePath.replace(/\\/g, "/");

  if (
    normalized.includes("/node_modules/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/.cursor/")
  ) {
    return false;
  }

  return /\.(cjs|cts|js|json|jsx|mjs|mts|ts|tsx)$/i.test(normalized);
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    process.stdout.write("{}\n");
    return;
  }

  const payload = JSON.parse(raw);
  const filePath = payload.file_path;
  if (!filePath || !isBiomeTarget(filePath)) {
    process.stdout.write("{}\n");
    return;
  }

  const projectDir = process.env.CURSOR_PROJECT_DIR || process.cwd();
  const relativePath = path.relative(projectDir, filePath);
  if (relativePath.startsWith("..")) {
    process.stdout.write("{}\n");
    return;
  }

  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "biome", "check", relativePath, "--write"],
    {
      cwd: projectDir,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
  }

  process.stdout.write("{}\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.stdout.write("{}\n");
}
