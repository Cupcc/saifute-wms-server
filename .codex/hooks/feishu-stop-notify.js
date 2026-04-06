#!/usr/bin/env node

const {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");

const DEFAULT_WEBHOOK_URL =
  "https://www.feishu.cn/flow/api/trigger-webhook/1a54408c02fef6b22f2c9fcfaa50a6da";
const PROJECT_DIR =
  process.env.CODEX_PROJECT_DIR || path.resolve(__dirname, "..", "..");
const LOG_PATH = path.join(PROJECT_DIR, "logs", "feishu-notify.log");
const STATE_DIR = path.join(PROJECT_DIR, ".codex", "hooks", "state");
const TURN_STATE_CURRENT_PATH = path.join(STATE_DIR, "current-turn.json");

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function cleanText(text, maxLength = 160) {
  const compact = String(text || "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function appendLog(entry) {
  ensureDir(path.dirname(LOG_PATH));
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function removeFile(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
}

function shortId(value, length = 6) {
  const text = String(value || "");
  if (!text) return "unknown";
  return text.slice(0, length);
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`);
  return parts.join("");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizePrompt(prompt) {
  const normalized = normalizeText(prompt);
  if (!normalized) return "收到新的任务请求";
  const maxLength = 80;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function sanitizeFileComponent(value) {
  const sanitized = String(value || "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "unknown";
}

function turnStatePath(turnId) {
  return path.join(STATE_DIR, `turn-${sanitizeFileComponent(turnId)}.json`);
}

function buildTurnState(payload, startedAtMs) {
  return {
    turnId: String(payload.turn_id || "unknown"),
    taskId: String(payload.session_id || "unknown"),
    startedAtMs,
    startedAtIso: new Date(startedAtMs).toISOString(),
    promptSummary: summarizePrompt(payload.prompt),
  };
}

function persistTurnState(payload) {
  const startedAtMs = Date.now();
  const state = buildTurnState(payload, startedAtMs);
  const filePath = turnStatePath(state.turnId);
  writeJson(filePath, state);
  writeJson(TURN_STATE_CURRENT_PATH, state);

  appendLog({
    ts: new Date().toISOString(),
    source: "codex-hook",
    hook_event_name: payload.hook_event_name,
    task_id: payload.session_id,
    turn_id: payload.turn_id,
    event: "turn_start",
    phase: "state_written",
    started_at_ms: startedAtMs,
    prompt_summary: state.promptSummary,
  });
}

function readTurnState(turnId) {
  if (turnId) {
    const state = readJson(turnStatePath(turnId));
    if (state) return state;
  }
  return readJson(TURN_STATE_CURRENT_PATH);
}

function cleanupTurnState(turnId) {
  if (turnId) removeFile(turnStatePath(turnId));
  const currentState = readJson(TURN_STATE_CURRENT_PATH);
  const currentTurnId = currentState ? String(currentState.turnId || "") : "";
  if (!turnId || currentTurnId === turnId) {
    removeFile(TURN_STATE_CURRENT_PATH);
  }
}

function buildMessage(payload, turnState) {
  const cwd = payload.cwd || "";
  const label = path.basename(cwd) || cwd || path.basename(PROJECT_DIR);
  const summary = cleanText(
    payload.last_assistant_message || "本轮已停止，请查看结果。",
  );
  const messageParts = [`Codex 已完成：${summary}`];

  if (turnState) {
    const startedAtMs = Number(turnState.startedAtMs || 0);
    if (startedAtMs > 0) {
      const durationMs = Date.now() - startedAtMs;
      messageParts.push(`本轮对话运行：${formatDuration(durationMs)}`);
    }
  }

  messageParts.push(`项目：${label}`);
  messageParts.push(`task_id：${shortId(payload.session_id || "unknown")}`);
  messageParts.push(`turn_id：${shortId(payload.turn_id || "unknown")}`);
  return messageParts.join("；");
}

async function sendFeishu(webhookUrl, event, msg, type) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, msg, type }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

function writeContinueAndExit(code = 0) {
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
  process.exitCode = code;
}

async function handleUserPromptSubmit(payload) {
  persistTurnState(payload);
  writeContinueAndExit(0);
}

async function handleStop(payload) {
  const event = "task_complete";
  const turnId = String(payload.turn_id || "");
  const turnState = readTurnState(turnId);
  const message = buildMessage(payload, turnState);
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;

  const logEntry = {
    ts: new Date().toISOString(),
    source: "codex-hook",
    hook_event_name: payload.hook_event_name,
    cwd: payload.cwd,
    task_id: payload.session_id,
    turn_id: payload.turn_id,
    event,
    type: "info",
    msg: message,
    phase: "send_attempt",
  };
  appendLog(logEntry);

  try {
    const response = await sendFeishu(webhookUrl, event, message, "info");
    if (response.code !== 0) {
      throw new Error(response.msg || "Feishu API error");
    }
    appendLog({
      ...logEntry,
      phase: "send_ok",
      feishu_msg: response.msg || "success",
    });
  } catch (error) {
    appendLog({
      ...logEntry,
      phase: "send_error",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    cleanupTurnState(turnId);
  }

  writeContinueAndExit(0);
}

async function main() {
  const raw = readStdin();
  const payload = raw.trim() ? JSON.parse(raw) : {};
  const hookEventName = String(payload.hook_event_name || "");

  if (hookEventName === "UserPromptSubmit") {
    await handleUserPromptSubmit(payload);
    return;
  }

  if (hookEventName === "Stop") {
    await handleStop(payload);
    return;
  }

  writeContinueAndExit(0);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  writeContinueAndExit(0);
});
