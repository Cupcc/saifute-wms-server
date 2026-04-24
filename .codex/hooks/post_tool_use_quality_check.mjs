#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function readStdin() {
  let input = "";
  process.stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
  });
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function normalizePatchPath(filePath) {
  return filePath.trim().replace(/^['"]|['"]$/g, "");
}

function extractPatchFiles(command) {
  if (!command) return [];

  const files = [];
  for (const line of command.split(/\r?\n/)) {
    const match = line.match(
      /^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/,
    );
    const filePath = match?.[1] || match?.[2];
    if (filePath) {
      files.push(normalizePatchPath(filePath));
    }
  }

  return files;
}

function isTargetFile(file) {
  return (
    file.endsWith(".ts") &&
    (file.startsWith("src/modules/") || file.startsWith("src/shared/")) &&
    !file.includes("/generated/")
  );
}

const payloadText = await readStdin();
const payload = payloadText ? JSON.parse(payloadText) : {};
const cwd = payload.cwd || process.cwd();

let repoRoot;
try {
  repoRoot = git(["rev-parse", "--show-toplevel"], cwd);
} catch {
  process.exit(0);
}

const qualityScript = path.join(repoRoot, "scripts/check-quality-hooks.mjs");
if (!existsSync(qualityScript)) {
  process.exit(0);
}

const changedFiles = new Set(
  extractPatchFiles(payload.tool_input?.command)
    .map((file) => file.trim())
    .filter(Boolean)
    .filter(isTargetFile),
);

if (changedFiles.size === 0) {
  process.exit(0);
}

const failures = [];
for (const file of [...changedFiles].sort()) {
  const result = spawnSync("bun", [qualityScript, path.join(repoRoot, file)], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failures.push(
      [`[codex-quality-hook] ${file}`, result.stderr, result.stdout]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(2);
}
