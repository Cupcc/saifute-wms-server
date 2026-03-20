const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function toStatePayload(payload, startedAtMs) {
  const conversationId = String(
    payload.conversation_id || payload.session_id || "unknown-session",
  );

  return {
    conversationId,
    sessionId: String(payload.session_id || conversationId),
    startedAtMs,
    startedAtIso: new Date(startedAtMs).toISOString(),
    composerMode: payload.composer_mode || null,
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getStateDir(projectDir) {
  return path.join(projectDir, ".cursor", "hooks", "state", "agent-runtime");
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    process.stdout.write("{}\n");
    return;
  }

  const payload = JSON.parse(raw);
  const startedAtMs = Date.now();
  const state = {
    ...toStatePayload(payload, startedAtMs),
    stateKind: "session",
  };
  const projectDir = process.env.CURSOR_PROJECT_DIR || process.cwd();
  const stateDir = getStateDir(projectDir);

  mkdirSync(stateDir, { recursive: true });

  writeJson(path.join(stateDir, `session-${state.conversationId}.json`), state);
  writeJson(path.join(stateDir, "current-session.json"), state);

  process.stdout.write(
    `${JSON.stringify({
      env: {
        FEISHU_NOTIFY_STARTED_AT_MS: String(startedAtMs),
        FEISHU_NOTIFY_CONVERSATION_ID: state.conversationId,
      },
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.stdout.write("{}\n");
}
