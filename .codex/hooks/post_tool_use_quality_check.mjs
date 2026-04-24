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

const trackedChanges = git(
  ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"],
  repoRoot,
);
const untrackedChanges = git(
  [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    "src/modules",
    "src/shared",
  ],
  repoRoot,
);

const changedFiles = new Set(
  `${trackedChanges}\n${untrackedChanges}`
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter((file) => file.endsWith(".ts"))
    .filter(
      (file) =>
        (file.startsWith("src/modules/") || file.startsWith("src/shared/")) &&
        !file.includes("/generated/"),
    ),
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
