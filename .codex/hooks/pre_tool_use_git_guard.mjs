#!/usr/bin/env node

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

function shellCommandFromToolInput(toolInput = {}) {
  const command = toolInput.cmd ?? toolInput.command ?? "";
  return Array.isArray(command) ? command.join(" ") : String(command);
}

function normalizeCommand(command) {
  return command
    .replace(/\\\s*\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMainSyncMerge(command) {
  return /(^|[;&|]\s*)git\s+merge\s+(?:--no-ff\s+)?(?:origin\/main|main)(?:\s|$)/.test(
    command,
  );
}

function isNonRebasePullFromMain(command) {
  if (!/(^|[;&|]\s*)git\s+pull(?:\s|$)/.test(command)) {
    return false;
  }

  if (/\bgit\s+pull\b[^;&|]*\s--rebase(?:=true)?(?:\s|$)/.test(command)) {
    return false;
  }

  return /\bgit\s+pull\b[^;&|]*(?:origin\s+main|origin\/main|\bmain\b)/.test(
    command,
  );
}

const payloadText = await readStdin();
const payload = payloadText ? JSON.parse(payloadText) : {};
const command = normalizeCommand(shellCommandFromToolInput(payload.tool_input));

if (!command) {
  process.exit(0);
}

if (isMainSyncMerge(command) || isNonRebasePullFromMain(command)) {
  console.error(`[codex-git-guard] Blocked a main sync command that would create merge history.

This repository keeps main linear. Read CONTRIBUTING.md before PR, sync,
merge, rebase, or push operations targeting main.

Use the documented flow instead:
  git fetch origin
  git rebase origin/main
  git push --force-with-lease
`);
  process.exit(2);
}
