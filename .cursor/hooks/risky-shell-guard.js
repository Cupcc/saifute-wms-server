const { readFileSync } = require("node:fs");

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function deny(userMessage, agentMessage) {
  process.stdout.write(
    `${JSON.stringify({
      continue: true,
      permission: "deny",
      user_message: userMessage,
      agent_message: agentMessage,
    })}\n`,
  );
}

function ask(userMessage, agentMessage) {
  process.stdout.write(
    `${JSON.stringify({
      continue: true,
      permission: "ask",
      user_message: userMessage,
      agent_message: agentMessage,
    })}\n`,
  );
}

function allow() {
  process.stdout.write(
    `${JSON.stringify({
      continue: true,
      permission: "allow",
    })}\n`,
  );
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    allow();
    return;
  }

  const payload = JSON.parse(raw);
  const command = String(payload.command || "").trim();
  const normalized = command.toLowerCase();

  const denyPatterns = [
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+checkout\s+--\b/,
    /\brm\s+-rf\b/,
  ];

  if (denyPatterns.some((pattern) => pattern.test(normalized))) {
    deny(
      `已阻止高风险命令：${command}`,
      "该命令可能造成不可逆的数据或代码删除。请改用更安全的方式，或由用户明确确认后再执行。",
    );
    return;
  }

  const askPatterns = [
    /\bprisma\s+migrate\s+reset\b/,
    /\bprisma\s+db\s+push\b/,
    /\bdocker(?:-compose|\s+compose)\s+down\s+-v\b/,
    /\bpnpm\s+add\b/,
    /\bpnpm\s+remove\b/,
    /\bpnpm\s+up\b/,
    /\bnpm\s+install\b/,
    /\bnpm\s+uninstall\b/,
    /\bnpm\s+update\b/,
  ];

  if (askPatterns.some((pattern) => pattern.test(normalized))) {
    ask(
      `该命令需要确认：${command}`,
      "该命令会修改依赖、数据库结构或容器卷，执行前请确认目标和影响范围。",
    );
    return;
  }

  allow();
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  allow();
}
