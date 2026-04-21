import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");
const hookScript = join(
  repoRoot,
  "scripts",
  "claude-code-hooks",
  "feishu-lifecycle.mjs",
);

function createTempProjectDir() {
  return mkdtempSync(join(tmpdir(), "feishu-lifecycle-"));
}

function getStateDir(projectDir: string) {
  return join(projectDir, ".claude", "hooks", "state");
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

async function runHook(
  stdinPayload: Record<string, unknown>,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
  },
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const childEnv: Record<string, string | undefined> = { ...process.env };
    // Strip hook-sensitive vars the parent shell may inject (e.g. when
    // running under an active Claude Code session), so each test starts
    // from a known-clean state and only options.env controls hook inputs.
    delete childEnv.FEISHU_SESSION_STARTED_AT_MS;
    delete childEnv.FEISHU_WEBHOOK_URL;
    delete childEnv.FEISHU_SUBAGENT_MIN_DURATION_MS;
    delete childEnv.CLAUDE_ENV_FILE;

    const child = spawn(process.execPath, [hookScript], {
      cwd: options?.cwd ?? repoRoot,
      env: {
        ...childEnv,
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

    child.stdin.write(JSON.stringify(stdinPayload));
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

  if (!port) throw new Error("Failed to allocate test port.");

  try {
    return await callback({
      url: `http://127.0.0.1:${port}`,
      getRequests: () => requests,
    });
  } finally {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe("claude-code feishu-lifecycle hooks", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProjectDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe("SessionStart", () => {
    it("writes session state file with correct fields", async () => {
      const result = await runHook(
        {
          hook_event_name: "SessionStart",
          session_id: "sess-abc",
          source: "startup",
        },
        {
          cwd: projectDir,
          env: { FEISHU_WEBHOOK_URL: "http://localhost:1/fake" },
        },
      );

      expect(result.status).toBe(0);

      const statePath = join(getStateDir(projectDir), "session-current.json");
      expect(existsSync(statePath)).toBe(true);

      const state = readJson(statePath) as {
        sessionId: string;
        startedAtMs: number;
        startedAtIso: string;
        source: string;
      };

      expect(state.sessionId).toBe("sess-abc");
      expect(state.source).toBe("startup");
      expect(typeof state.startedAtMs).toBe("number");
      expect(state.startedAtMs).toBeGreaterThan(1_000_000_000_000);
      expect(state.startedAtIso).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it("writes audit log entry", async () => {
      await runHook(
        {
          hook_event_name: "SessionStart",
          session_id: "sess-log",
          source: "startup",
        },
        {
          cwd: projectDir,
          env: { FEISHU_WEBHOOK_URL: "http://localhost:1/fake" },
        },
      );

      const logPath = join(projectDir, "logs", "feishu-notify.log");
      expect(existsSync(logPath)).toBe(true);

      const lines = readFileSync(logPath, "utf8").trim().split("\n");
      const entry = JSON.parse(lines[0] ?? "{}") as {
        source: string;
        event: string;
        phase: string;
      };

      expect(entry.source).toBe("claude-code-hook");
      expect(entry.event).toBe("session_start");
      expect(entry.phase).toBe("state_written");
    });
  });

  describe("SessionEnd", () => {
    it("sends session_complete notification with correct duration", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        // Write session start state (simulating SessionStart fired 5 min ago)
        const fiveMinAgo = Date.now() - 300_000;
        const stateDir = getStateDir(projectDir);
        mkdirSync(stateDir, { recursive: true });
        writeJson(join(stateDir, "session-current.json"), {
          sessionId: "sess-end",
          startedAtMs: fiveMinAgo,
          startedAtIso: new Date(fiveMinAgo).toISOString(),
          source: "startup",
        });

        const result = await runHook(
          {
            hook_event_name: "SessionEnd",
            session_id: "sess-end",
            reason: "prompt_input_exit",
          },
          { cwd: projectDir, env: { FEISHU_WEBHOOK_URL: url } },
        );

        expect(result.status).toBe(0);
        expect(getRequests()).toHaveLength(1);

        const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
          event: string;
          msg: string;
          type: string;
        };

        expect(payload.event).toBe("session_complete");
        expect(payload.type).toBe("info");
        expect(payload.msg).toContain("会话结束（prompt_input_exit）");
        expect(payload.msg).toContain("本次会话运行：5分钟");
        expect(payload.msg).toContain("session_id：sess-end");
      });
    });

    it("uses FEISHU_SESSION_STARTED_AT_MS env var when state file is missing", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        const twoMinAgo = Date.now() - 120_000;

        const result = await runHook(
          {
            hook_event_name: "SessionEnd",
            session_id: "sess-env",
            reason: "logout",
          },
          {
            cwd: projectDir,
            env: {
              FEISHU_WEBHOOK_URL: url,
              FEISHU_SESSION_STARTED_AT_MS: String(twoMinAgo),
            },
          },
        );

        expect(result.status).toBe(0);
        expect(getRequests()).toHaveLength(1);

        const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
          msg: string;
        };

        expect(payload.msg).toContain("本次会话运行：2分钟");
      });
    });

    it("skips notification when no start time is available", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        const result = await runHook(
          {
            hook_event_name: "SessionEnd",
            session_id: "sess-none",
            reason: "clear",
          },
          { cwd: projectDir, env: { FEISHU_WEBHOOK_URL: url } },
        );

        expect(result.status).toBe(0);
        expect(result.stderr).toContain("No session start time");
        expect(getRequests()).toHaveLength(0);
      });
    });

    it("cleans up state file after notification", async () => {
      await withWebhookServer(async ({ url }) => {
        const stateDir = getStateDir(projectDir);
        mkdirSync(stateDir, { recursive: true });
        writeJson(join(stateDir, "session-current.json"), {
          sessionId: "sess-cleanup",
          startedAtMs: Date.now() - 60_000,
          source: "startup",
        });

        await runHook(
          {
            hook_event_name: "SessionEnd",
            session_id: "sess-cleanup",
            reason: "other",
          },
          { cwd: projectDir, env: { FEISHU_WEBHOOK_URL: url } },
        );

        expect(existsSync(join(stateDir, "session-current.json"))).toBe(false);
      });
    });
  });

  describe("SubagentStart", () => {
    it("writes agent state file keyed by agent_id", async () => {
      const result = await runHook(
        {
          hook_event_name: "SubagentStart",
          session_id: "s1",
          agent_id: "agent-001",
          agent_type: "Explore",
        },
        {
          cwd: projectDir,
          env: { FEISHU_WEBHOOK_URL: "http://localhost:1/fake" },
        },
      );

      expect(result.status).toBe(0);

      const statePath = join(getStateDir(projectDir), "agent-agent-001.json");
      expect(existsSync(statePath)).toBe(true);

      const state = readJson(statePath) as {
        agentId: string;
        agentType: string;
        startedAtMs: number;
      };

      expect(state.agentId).toBe("agent-001");
      expect(state.agentType).toBe("Explore");
      expect(state.startedAtMs).toBeGreaterThan(0);
    });
  });

  describe("SubagentStop", () => {
    it("sends subagent_complete notification with correct duration", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        const stateDir = getStateDir(projectDir);
        const threeMinAgo = Date.now() - 180_000;
        writeJson(join(stateDir, "agent-agent-002.json"), {
          agentId: "agent-002",
          agentType: "Plan",
          startedAtMs: threeMinAgo,
          startedAtIso: new Date(threeMinAgo).toISOString(),
        });

        const result = await runHook(
          {
            hook_event_name: "SubagentStop",
            session_id: "s1",
            agent_id: "agent-002",
            agent_type: "Plan",
            stop_hook_active: false,
          },
          { cwd: projectDir, env: { FEISHU_WEBHOOK_URL: url } },
        );

        expect(result.status).toBe(0);
        expect(getRequests()).toHaveLength(1);

        const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
          event: string;
          msg: string;
        };

        expect(payload.event).toBe("subagent_complete");
        expect(payload.msg).toContain("子代理完成（Plan）");
        expect(payload.msg).toContain("本次子代理运行：3分钟");
        expect(payload.msg).toContain("agent_id：agent-002");
      });
    });

    it("skips when stop_hook_active is true", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        const stateDir = getStateDir(projectDir);
        writeJson(join(stateDir, "agent-agent-003.json"), {
          agentId: "agent-003",
          agentType: "general-purpose",
          startedAtMs: Date.now() - 60_000,
        });

        await runHook(
          {
            hook_event_name: "SubagentStop",
            session_id: "s1",
            agent_id: "agent-003",
            agent_type: "general-purpose",
            stop_hook_active: true,
          },
          { cwd: projectDir, env: { FEISHU_WEBHOOK_URL: url } },
        );

        expect(getRequests()).toHaveLength(0);
      });
    });

    it("skips silently when no start state exists", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        const result = await runHook(
          {
            hook_event_name: "SubagentStop",
            session_id: "s1",
            agent_id: "agent-ghost",
            agent_type: "Explore",
            stop_hook_active: false,
          },
          { cwd: projectDir, env: { FEISHU_WEBHOOK_URL: url } },
        );

        expect(result.status).toBe(0);
        expect(getRequests()).toHaveLength(0);
      });
    });

    it("respects FEISHU_SUBAGENT_MIN_DURATION_MS threshold", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        const stateDir = getStateDir(projectDir);
        // Agent started 5 seconds ago (below 30s threshold)
        writeJson(join(stateDir, "agent-agent-short.json"), {
          agentId: "agent-short",
          agentType: "Explore",
          startedAtMs: Date.now() - 5_000,
        });

        await runHook(
          {
            hook_event_name: "SubagentStop",
            session_id: "s1",
            agent_id: "agent-short",
            agent_type: "Explore",
            stop_hook_active: false,
          },
          {
            cwd: projectDir,
            env: {
              FEISHU_WEBHOOK_URL: url,
              FEISHU_SUBAGENT_MIN_DURATION_MS: "30000",
            },
          },
        );

        // Should be skipped because 5s < 30s threshold
        expect(getRequests()).toHaveLength(0);
        // State file should be cleaned up
        expect(existsSync(join(stateDir, "agent-agent-short.json"))).toBe(
          false,
        );
      });
    });

    it("cleans up state file after notification", async () => {
      await withWebhookServer(async ({ url }) => {
        const stateDir = getStateDir(projectDir);
        writeJson(join(stateDir, "agent-agent-cleanup.json"), {
          agentId: "agent-cleanup",
          agentType: "Plan",
          startedAtMs: Date.now() - 60_000,
        });

        await runHook(
          {
            hook_event_name: "SubagentStop",
            session_id: "s1",
            agent_id: "agent-cleanup",
            agent_type: "Plan",
            stop_hook_active: false,
          },
          { cwd: projectDir, env: { FEISHU_WEBHOOK_URL: url } },
        );

        expect(existsSync(join(stateDir, "agent-agent-cleanup.json"))).toBe(
          false,
        );
      });
    });
  });
});
