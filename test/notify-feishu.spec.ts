import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const repoRoot = join(__dirname, "..");
const notifyScript = join(repoRoot, "scripts", "notify-feishu.mjs");
const sessionHookScript = join(
  repoRoot,
  ".cursor",
  "hooks",
  "session-start-runtime.js",
);
const taskHookScript = join(
  repoRoot,
  ".cursor",
  "hooks",
  "task-start-notify.js",
);

function createTempProjectDir() {
  return mkdtempSync(join(tmpdir(), "notify-feishu-"));
}

function getRuntimeStateDir(projectDir: string) {
  return join(projectDir, ".cursor", "hooks", "state", "agent-runtime");
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runNode(
  scriptPath: string,
  args: string[],
  options?: {
    projectDir?: string;
    stdin?: string;
    env?: Record<string, string>;
  },
) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CURSOR_PROJECT_DIR: options?.projectDir ?? repoRoot,
      ...options?.env,
    },
    encoding: "utf8",
    input: options?.stdin,
  });
}

async function runNodeAsync(
  scriptPath: string,
  args: string[],
  options?: {
    projectDir?: string;
    stdin?: string;
    env?: Record<string, string>;
  },
) {
  return new Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        CURSOR_PROJECT_DIR: options?.projectDir ?? repoRoot,
        ...options?.env,
      },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });

    if (options?.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

async function withWebhookServer<T>(
  callback: (context: {
    url: string;
    getRequests(): Array<{ body: string }>;
  }) => Promise<T>,
) {
  const requests: Array<{ body: string }> = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      requests.push({ body });
      res.writeHead(200, {
        "Content-Type": "application/json",
        Connection: "close",
      });
      res.end(JSON.stringify({ code: 0, msg: "ok" }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port =
    address && typeof address === "object" ? address.port : undefined;

  if (!port) {
    throw new Error("Failed to allocate webhook test port.");
  }

  try {
    return await callback({
      url: `http://127.0.0.1:${port}`,
      getRequests: () => requests,
    });
  } finally {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe("feishu runtime summary hooks", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProjectDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("sessionStart writes canonical session runtime state", () => {
    const result = runNode(sessionHookScript, [], {
      projectDir,
      stdin: JSON.stringify({
        conversation_id: "conv-1",
        session_id: "sess-1",
        composer_mode: "agent",
      }),
    });

    expect(result.status).toBe(0);

    const sessionState = JSON.parse(
      readFileSync(
        join(getRuntimeStateDir(projectDir), "current-session.json"),
        "utf8",
      ),
    ) as {
      conversationId: string;
      sessionId: string;
      stateKind: string;
    };

    expect(sessionState.conversationId).toBe("conv-1");
    expect(sessionState.sessionId).toBe("sess-1");
    expect(sessionState.stateKind).toBe("session");
    expect(() =>
      readFileSync(
        join(getRuntimeStateDir(projectDir), "session-conv-1.json"),
        "utf8",
      ),
    ).not.toThrow();
  });

  it("task-start-notify writes only task-scoped runtime state", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const result = await runNodeAsync(taskHookScript, [], {
        projectDir,
        env: { FEISHU_WEBHOOK_URL: url },
        stdin: JSON.stringify({
          conversation_id: "conv-2",
          generation_id: "gen-2",
          prompt: "请继续处理本次任务",
        }),
      });

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const webhookPayload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        msg?: string;
      };
      expect(webhookPayload.msg).toContain("task_id：gen-2");

      const taskStatePath = join(
        getRuntimeStateDir(projectDir),
        "current-task.json",
      );
      const sessionStatePath = join(
        getRuntimeStateDir(projectDir),
        "current-session.json",
      );
      const taskState = JSON.parse(readFileSync(taskStatePath, "utf8")) as {
        stateKind: string;
      };

      expect(taskState.stateKind).toBe("task");
      expect(() => readFileSync(sessionStatePath, "utf8")).toThrow();
    });
  });

  it("task_complete uses current task runtime even when session runtime is longer", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      const now = Date.now();

      writeJson(join(stateDir, "current-session.json"), {
        conversationId: "conv-3",
        sessionId: "sess-3",
        startedAtMs: now - 7_200_000,
        startedAtIso: new Date(now - 7_200_000).toISOString(),
        stateKind: "session",
      });
      writeJson(join(stateDir, "session-conv-3.json"), {
        conversationId: "conv-3",
        sessionId: "sess-3",
        startedAtMs: now - 7_200_000,
        startedAtIso: new Date(now - 7_200_000).toISOString(),
        stateKind: "session",
      });
      writeJson(join(stateDir, "current-task.json"), {
        conversationId: "conv-3",
        generationId: "gen-3",
        startedAtMs: now - 600_000,
        startedAtIso: new Date(now - 600_000).toISOString(),
        promptSummary: "最后一步",
        stateKind: "task",
      });

      const result = await runNodeAsync(
        notifyScript,
        ["task_complete", "任务已结束；下一步计划：请查看总结。", "success"],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        msg?: string;
      };

      expect(payload.msg).toContain("任务已结束");
      expect(payload.msg).toContain("本轮对话运行：10分钟");
      expect(payload.msg).not.toContain("2小时");
      expect(payload.msg).toContain("task_id：gen-3");

      const logPath = join(projectDir, "logs", "feishu-notify.log");
      const logLines = readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);
      expect(logLines.length).toBeGreaterThanOrEqual(2);
      const okLine = JSON.parse(logLines[logLines.length - 1] ?? "{}") as {
        phase?: string;
        task_id?: string | null;
      };
      expect(okLine.phase).toBe("send_ok");
      expect(okLine.task_id).toBe("gen-3");
    });
  });

  it("complete alias uses current task runtime", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      const now = Date.now();

      writeJson(join(stateDir, "current-task.json"), {
        conversationId: "conv-complete",
        generationId: "gen-complete",
        startedAtMs: now - 180_000,
        startedAtIso: new Date(now - 180_000).toISOString(),
        promptSummary: "complete alias",
        stateKind: "task",
      });

      const result = await runNodeAsync(
        notifyScript,
        ["complete", "任务已结束；下一步计划：请查看总结。", "success"],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        event?: string;
        msg?: string;
      };

      expect(payload.event).toBe("complete");
      expect(payload.msg).toContain("本轮对话运行：3分钟");
      expect(payload.msg).toContain("task_id：gen-complete");
    });
  });

  it("task_complete treats task startedAtMs stored as Unix seconds as milliseconds", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      const nowSec = Math.floor(Date.now() / 1000);
      const startedSec = nowSec - 7_200;

      writeJson(join(stateDir, "current-task.json"), {
        conversationId: "conv-sec",
        generationId: "gen-sec",
        startedAtMs: startedSec,
        startedAtIso: new Date(startedSec * 1000).toISOString(),
        promptSummary: "测秒级时间戳",
        stateKind: "task",
      });

      const result = await runNodeAsync(
        notifyScript,
        ["task_complete", "任务已结束；下一步计划：请查看总结。", "success"],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        msg?: string;
      };

      expect(payload.msg).toContain("本轮对话运行：2小时");
      expect(payload.msg).not.toMatch(/[0-9]{3,}小时/);
    });
  });

  it("task_complete fails explicitly when only session runtime state exists", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      const now = Date.now();

      writeJson(join(stateDir, "current-session.json"), {
        conversationId: "conv-4",
        sessionId: "sess-4",
        startedAtMs: now - 7_200_000,
        startedAtIso: new Date(now - 7_200_000).toISOString(),
        stateKind: "session",
      });
      writeJson(join(stateDir, "session-conv-4.json"), {
        conversationId: "conv-4",
        sessionId: "sess-4",
        startedAtMs: now - 7_200_000,
        startedAtIso: new Date(now - 7_200_000).toISOString(),
        stateKind: "session",
      });

      const result = await runNodeAsync(
        notifyScript,
        ["task_complete", "任务已结束；下一步计划：请查看总结。", "success"],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("缺少任务级运行时状态");
      expect(getRequests()).toHaveLength(0);
    });
  });

  it("task_complete fails explicitly when task runtime state is malformed", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        join(stateDir, "current-task.json"),
        '{"conversationId":"conv-5","generationId":"gen-5","startedAtMs":"broken","stateKind":"task"}\n',
        "utf8",
      );

      const result = await runNodeAsync(
        notifyScript,
        ["task_complete", "任务已结束；下一步计划：请查看总结。", "success"],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("缺少合法的 startedAtMs");
      expect(getRequests()).toHaveLength(0);
    });
  });

  it("uses current-session conversationId as task_id when current-task.json is absent", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      writeJson(join(stateDir, "current-session.json"), {
        conversationId: "conv-session-fallback",
        sessionId: "sess-fb",
        startedAtMs: Date.now(),
        stateKind: "session",
      });

      const result = await runNodeAsync(
        notifyScript,
        ["phase_complete", "阶段结束；下一步计划：继续。", "info"],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        msg?: string;
      };

      expect(payload.msg).toContain("task_id：conv-session-fallback");
    });
  });

  it("subagent_complete appends subagent runtime when --duration-ms is provided", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const result = await runNodeAsync(
        notifyScript,
        [
          "subagent_complete",
          "coder 子代理已完成实现；下一步计划：继续 review。",
          "info",
          "--duration-ms",
          "180000",
        ],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        msg?: string;
      };

      expect(payload.msg).toContain("coder 子代理已完成实现");
      expect(payload.msg).toContain("本次子代理运行：3分钟");
      expect(payload.msg).not.toContain("本次任务运行");
      expect(payload.msg).not.toContain("本轮对话运行");
    });
  });

  it("subagent_complete appends subagent runtime when --started-at-ms is provided", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const startedAtMs = Date.now() - 65_000;

      const result = await runNodeAsync(
        notifyScript,
        [
          "subagent_complete",
          "planner 子代理已完成规划；下一步计划：交给 coder 实施。",
          "info",
          "--started-at-ms",
          String(startedAtMs),
        ],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        msg?: string;
      };

      expect(payload.msg).toContain("planner 子代理已完成规划");
      expect(payload.msg).toContain("本次子代理运行：");
      expect(payload.msg).not.toContain("本次任务运行");
      expect(payload.msg).not.toContain("本轮对话运行");
    });
  });

  it("subagent_complete fails before webhook send when no explicit timing is provided", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const result = await runNodeAsync(
        notifyScript,
        [
          "subagent_complete",
          "code-reviewer 子代理已完成审查；下一步计划：处理 findings。",
          "info",
        ],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("--duration-ms");
      expect(result.stderr).toContain("--started-at-ms");
      expect(getRequests()).toHaveLength(0);
    });
  });

  it("subagent_complete still rejects implicit timing even when task and session state exist", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      const now = Date.now();

      writeJson(join(stateDir, "current-task.json"), {
        conversationId: "conv-sub",
        generationId: "gen-sub",
        startedAtMs: now - 120_000,
        startedAtIso: new Date(now - 120_000).toISOString(),
        promptSummary: "subagent regression",
        stateKind: "task",
      });
      writeJson(join(stateDir, "current-session.json"), {
        conversationId: "conv-sub",
        sessionId: "sess-sub",
        startedAtMs: now - 3_600_000,
        startedAtIso: new Date(now - 3_600_000).toISOString(),
        stateKind: "session",
      });

      const result = await runNodeAsync(
        notifyScript,
        [
          "subagent_complete",
          "code-reviewer 子代理已完成审查；下一步计划：处理 findings。",
          "info",
        ],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "subagent_complete 必须通过 --duration-ms 或 --started-at-ms",
      );
      expect(getRequests()).toHaveLength(0);
    });
  });

  it("subagent_complete fails before webhook send when runtime is handwritten in msg", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const result = await runNodeAsync(
        notifyScript,
        [
          "subagent_complete",
          "子代理完成；本次子代理运行：5分钟；下一步计划：继续。",
          "info",
          "--duration-ms",
          "300000",
        ],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("手写运行时间");
      expect(getRequests()).toHaveLength(0);
    });
  });

  it("task_complete ignores current-session mismatch and still uses current task runtime", async () => {
    await withWebhookServer(async ({ url, getRequests }) => {
      const stateDir = getRuntimeStateDir(projectDir);
      const now = Date.now();

      writeJson(join(stateDir, "current-task.json"), {
        conversationId: "conv-6",
        generationId: "gen-6",
        startedAtMs: now - 60_000,
        startedAtIso: new Date(now - 60_000).toISOString(),
        promptSummary: "最后一步",
        stateKind: "task",
      });
      writeJson(join(stateDir, "current-session.json"), {
        conversationId: "conv-other",
        sessionId: "sess-other",
        startedAtMs: now - 10_000,
        startedAtIso: new Date(now - 10_000).toISOString(),
        stateKind: "session",
      });

      const result = await runNodeAsync(
        notifyScript,
        ["task_complete", "任务已结束；下一步计划：请查看总结。", "success"],
        {
          projectDir,
          env: { FEISHU_WEBHOOK_URL: url },
        },
      );

      expect(result.status).toBe(0);
      expect(getRequests()).toHaveLength(1);

      const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
        msg?: string;
      };
      expect(payload.msg).toContain("本轮对话运行：1分钟");
      expect(payload.msg).toContain("task_id：gen-6");
      expect(payload.msg).not.toContain("10秒");
    });
  });
});
