#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * 发送飞书 webhook 通知（agent 停止时提示用户）
 * 用法:
 *   node scripts/notify-feishu.mjs [event] [msg] [type]
 *   node scripts/notify-feishu.mjs [event] [msg] [type] --duration-ms <ms>
 *   node scripts/notify-feishu.mjs [event] [msg] [type] --started-at-ms <epoch_ms>
 * 或:
 *   pnpm notify:feishu "事件" "消息内容" "消息类型"
 *
 * 规则：
 * - `task_complete` / `complete` 必须传入精确耗时（毫秒）或精确开始时间，或依赖 hooks 写入的任务级开始时间。
 *   完成事件会自动追加人类可读的耗时描述，例如 `本轮对话运行：47分钟50秒`。
 * - `subagent_complete` 必须通过 --duration-ms 或 --started-at-ms 显式传入子代理运行时长；
 *   缺少精确计时输入时脚本在发送 webhook 前终止。
 *   子代理完成事件会追加 `本次子代理运行：...`，不读取 session/task hook 状态。
 * - 其他事件不允许在消息中携带运行时间。
 *
 * 可通过环境变量 FEISHU_WEBHOOK_URL 覆盖默认 webhook 地址。
 *
 * 若会话状态或 --started-at-ms 误写入 Unix「秒」而非「毫秒」，数值约在 1e9～1e10，
 * 会被当作毫秒与 Date.now() 相减，从而出现「数十万小时」的异常时长；脚本会将小于 1e12 的正整数
 * 视为秒并乘以 1000 再参与计算（与 2020 年后的毫秒时间戳量级区分）。
 *
 * 审计：每次发送会向项目根下 logs/feishu-notify.log 追加一行 JSON（目录不存在会自动创建）。
 * 消息末尾会追加 task_id：FEISHU_NOTIFY_TASK_ID → current-task.json 的 generationId →
 *   current-task.json 的 conversationId → current-session.json 的 conversationId（无任务状态时的回退）。
 */
const DEFAULT_WEBHOOK_URL =
  "https://www.feishu.cn/flow/api/trigger-webhook/1a54408c02fef6b22f2c9fcfaa50a6da";
const SESSION_RUNTIME_STATE_DIR = ".cursor/hooks/state/agent-runtime";
const CURRENT_SESSION_RUNTIME_STATE_PATH = `${SESSION_RUNTIME_STATE_DIR}/current-session.json`;
const TASK_RUNTIME_STATE_PATH = `${SESSION_RUNTIME_STATE_DIR}/current-task.json`;
/** 小于该值视为 Unix 秒（毫秒时间戳自约 2001-09 起 ≥ 1e12，与秒的 1e9～1e10 量级区分） */
const EPOCH_MS_MIN_THRESHOLD = 1_000_000_000_000;

function parseArgs(argv) {
  const positionals = [];
  let durationMs;
  let startedAtMs;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--duration-ms") {
      durationMs = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--duration-ms=")) {
      durationMs = arg.slice("--duration-ms=".length);
      continue;
    }

    if (arg === "--started-at-ms") {
      startedAtMs = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--started-at-ms=")) {
      startedAtMs = arg.slice("--started-at-ms=".length);
      continue;
    }

    positionals.push(arg);
  }

  return { positionals, durationMs, startedAtMs };
}

function isCompletionEvent(event) {
  return event === "task_complete" || event === "complete";
}

function isSubagentCompletionEvent(event) {
  return event === "subagent_complete";
}

function hasRuntimeInMessage(message) {
  return /(运行时间|本次运行耗时|本次任务运行|本轮对话运行|本次子代理运行)\s*[:：]/u.test(
    message,
  );
}

function parsePositiveInteger(value, flagName) {
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/u.test(String(value))) {
    throw new Error(`${flagName} 必须是非负整数毫秒值`);
  }

  return Number(value);
}

/**
 * 将「可能是 Unix 秒」的 epoch 规范为毫秒。误把秒写入 startedAtMs 会导致数十万小时的虚假时长。
 */
function normalizeEpochMs(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value > 0 && value < EPOCH_MS_MIN_THRESHOLD) {
    return value * 1000;
  }

  return value;
}

function readOptionalSessionConversationId(projectDir) {
  const sessionPath = path.join(projectDir, CURRENT_SESSION_RUNTIME_STATE_PATH);

  if (!existsSync(sessionPath)) {
    return "";
  }

  try {
    const parsed = JSON.parse(readFileSync(sessionPath, "utf8"));
    return typeof parsed.conversationId === "string"
      ? parsed.conversationId.trim()
      : "";
  } catch {
    return "";
  }
}

function readOptionalTaskId(projectDir) {
  const fromEnv =
    typeof process.env.FEISHU_NOTIFY_TASK_ID === "string"
      ? process.env.FEISHU_NOTIFY_TASK_ID.trim()
      : "";

  if (fromEnv) {
    return fromEnv;
  }

  const taskStatePath = path.join(projectDir, TASK_RUNTIME_STATE_PATH);

  if (existsSync(taskStatePath)) {
    try {
      const parsed = JSON.parse(readFileSync(taskStatePath, "utf8"));
      const generationId =
        typeof parsed.generationId === "string"
          ? parsed.generationId.trim()
          : "";

      if (generationId) {
        return generationId;
      }

      const conversationId =
        typeof parsed.conversationId === "string"
          ? parsed.conversationId.trim()
          : "";

      if (conversationId) {
        return conversationId;
      }
    } catch {
      /* fall through to session fallback */
    }
  }

  return readOptionalSessionConversationId(projectDir);
}

function appendTaskIdSuffix(message, taskId) {
  if (!taskId) {
    return message;
  }

  return `${message}；task_id：${taskId}`;
}

function appendFeishuAuditLog(projectDir, record) {
  const logDir = path.join(projectDir, "logs");
  const logPath = path.join(logDir, "feishu-notify.log");

  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(
      logPath,
      `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`,
      "utf8",
    );
  } catch (error) {
    console.error(
      "Feishu audit log failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours}小时`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}分钟`);
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}秒`);
  }

  return parts.join("");
}

function injectRuntime(message, runtimeText, label = "本轮对话运行") {
  const nextStepPattern = /([；;]\s*下一步计划\s*[:：])/u;
  const match = nextStepPattern.exec(message);

  if (!match || match.index === undefined) {
    return `${message}；${label}：${runtimeText}`;
  }

  return `${message.slice(0, match.index)}；${label}：${runtimeText}${message.slice(match.index)}`;
}

function readCanonicalTaskStartedAtMs(projectDir) {
  const taskStatePath = path.join(projectDir, TASK_RUNTIME_STATE_PATH);

  if (!existsSync(taskStatePath)) {
    throw new Error(
      `缺少任务级运行时状态 ${TASK_RUNTIME_STATE_PATH}，无法计算本轮对话运行时间。请修复 task-start hook，或显式传入 --started-at-ms / --duration-ms。`,
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(readFileSync(taskStatePath, "utf8"));
  } catch (error) {
    throw new Error(
      `读取任务级运行时状态 ${TASK_RUNTIME_STATE_PATH} 失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const stateKind =
    typeof parsed.stateKind === "string" ? parsed.stateKind.trim() : "";

  if (stateKind && stateKind !== "task") {
    throw new Error(
      `${TASK_RUNTIME_STATE_PATH} 不是合法的任务级运行时状态（stateKind=${stateKind}）。请修复 task-start hook，或显式传入 --started-at-ms / --duration-ms。`,
    );
  }

  try {
    const rawStartedAtMs = parsePositiveInteger(
      parsed.startedAtMs,
      `${TASK_RUNTIME_STATE_PATH}.startedAtMs`,
    );

    if (rawStartedAtMs === undefined) {
      throw new Error("missing");
    }

    return normalizeEpochMs(rawStartedAtMs);
  } catch {
    throw new Error(
      `任务级运行时状态 ${TASK_RUNTIME_STATE_PATH} 缺少合法的 startedAtMs，无法计算本轮对话运行时间。请修复 task-start hook，或显式传入 --started-at-ms / --duration-ms。`,
    );
  }
}

const {
  positionals,
  durationMs: durationArg,
  startedAtMs: startedAtArg,
} = parseArgs(process.argv);
const projectDir = process.env.CURSOR_PROJECT_DIR || process.cwd();
const url = process.env.FEISHU_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
const event = positionals[0] || "agent_stop";
const rawMsg = positionals[1] || "Agent 已停止，请查看结果。";
const type = positionals[2] || "info";

const durationMs = parsePositiveInteger(durationArg, "--duration-ms");
let explicitStartedAtMs = parsePositiveInteger(startedAtArg, "--started-at-ms");

if (explicitStartedAtMs !== undefined) {
  explicitStartedAtMs = normalizeEpochMs(explicitStartedAtMs);
}

if (durationMs !== undefined && explicitStartedAtMs !== undefined) {
  throw new Error("不能同时传入 --duration-ms 和 --started-at-ms");
}

let msg = rawMsg;

if (isCompletionEvent(event)) {
  if (hasRuntimeInMessage(rawMsg)) {
    throw new Error(
      "完成事件的消息内容不能手写运行时间，请通过 --duration-ms、--started-at-ms 或 hooks 自动计时",
    );
  }

  const exactDurationMs =
    durationMs ??
    (explicitStartedAtMs !== undefined
      ? Math.max(0, Date.now() - explicitStartedAtMs)
      : Math.max(0, Date.now() - readCanonicalTaskStartedAtMs(projectDir)));

  msg = injectRuntime(rawMsg, formatDuration(exactDurationMs), "本轮对话运行");
} else if (isSubagentCompletionEvent(event)) {
  if (hasRuntimeInMessage(rawMsg)) {
    throw new Error(
      "子代理完成事件的消息内容不能手写运行时间，请通过 --duration-ms 或 --started-at-ms 传入精确子代理运行时长",
    );
  }

  if (durationMs === undefined && explicitStartedAtMs === undefined) {
    throw new Error(
      "subagent_complete 必须通过 --duration-ms 或 --started-at-ms 传入精确子代理运行时长，不允许自动从 session/task 状态推断",
    );
  }

  const exactDurationMs =
    durationMs ?? Math.max(0, Date.now() - (explicitStartedAtMs ?? 0));

  msg = injectRuntime(
    rawMsg,
    formatDuration(exactDurationMs),
    "本次子代理运行",
  );
} else if (hasRuntimeInMessage(rawMsg)) {
  throw new Error("非完成事件的消息内容不应包含运行时间");
}

const taskId = readOptionalTaskId(projectDir);
msg = appendTaskIdSuffix(msg, taskId);

const body = JSON.stringify({ event, msg, type });

appendFeishuAuditLog(projectDir, {
  event,
  type,
  task_id: taskId || null,
  msg,
  phase: "send_attempt",
});

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
})
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  })
  .then((data) => {
    if (data.code !== 0) throw new Error(data.msg || "Feishu API error");
    console.log("Feishu notify OK:", data.msg || "success");
    appendFeishuAuditLog(projectDir, {
      event,
      type,
      task_id: taskId || null,
      msg,
      phase: "send_ok",
      feishu_msg: data.msg || "success",
    });
  })
  .catch((err) => {
    console.error("Feishu notify failed:", err.message);
    appendFeishuAuditLog(projectDir, {
      event,
      type,
      task_id: taskId || null,
      msg,
      phase: "send_error",
      error: err.message,
    });
    process.exit(1);
  });
