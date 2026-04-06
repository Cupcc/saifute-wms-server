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
import { dirname, join } from "node:path";

const repoRoot = join(__dirname, "..");
const hookScript = join(repoRoot, ".codex", "hooks", "feishu-stop-notify.py");

function createTempProjectDir() {
  return mkdtempSync(join(tmpdir(), "codex-feishu-hook-"));
}

function getStateDir(projectDir: string) {
  return join(projectDir, ".codex", "hooks", "state");
}

function getTurnStatePath(projectDir: string, turnId: string) {
  return join(getStateDir(projectDir), `turn-${turnId}.json`);
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
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
    const child = spawn("python3", [hookScript], {
      cwd: options?.cwd ?? repoRoot,
      env: {
        ...process.env,
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

  if (!port) {
    throw new Error("Failed to allocate test port.");
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
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe("codex feishu stop hook", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProjectDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe("UserPromptSubmit", () => {
    it("writes turn state file with correct fields", async () => {
      const result = await runHook(
        {
          hook_event_name: "UserPromptSubmit",
          session_id: "sess-abc",
          turn_id: "turn-abc",
          prompt: "修复飞书通知耗时",
        },
        {
          cwd: projectDir,
          env: { CODEX_PROJECT_DIR: projectDir },
        },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ continue: true });

      const statePath = getTurnStatePath(projectDir, "turn-abc");
      expect(existsSync(statePath)).toBe(true);

      const state = readJson(statePath) as {
        turnId: string;
        sessionId: string;
        startedAtMs: number;
        startedAtIso: string;
        promptSummary: string;
      };

      expect(state.turnId).toBe("turn-abc");
      expect(state.sessionId).toBe("sess-abc");
      expect(state.promptSummary).toBe("修复飞书通知耗时");
      expect(state.startedAtMs).toBeGreaterThan(1_000_000_000_000);
      expect(state.startedAtIso).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });
  });

  describe("Stop", () => {
    it("sends notification with current turn duration", async () => {
      await withWebhookServer(async ({ url, getRequests }) => {
        const twoMinAgo = Date.now() - 120_000;
        writeJson(getTurnStatePath(projectDir, "turn-stop"), {
          turnId: "turn-stop",
          sessionId: "sess-stop",
          startedAtMs: twoMinAgo,
          startedAtIso: new Date(twoMinAgo).toISOString(),
          promptSummary: "修复飞书通知耗时",
        });
        writeJson(join(getStateDir(projectDir), "current-turn.json"), {
          turnId: "turn-stop",
          sessionId: "sess-stop",
          startedAtMs: twoMinAgo,
        });

        const result = await runHook(
          {
            hook_event_name: "Stop",
            cwd: projectDir,
            session_id: "sess-stop",
            turn_id: "turn-stop",
            last_assistant_message: "已经修复飞书通知耗时。",
          },
          {
            cwd: projectDir,
            env: {
              CODEX_PROJECT_DIR: projectDir,
              FEISHU_WEBHOOK_URL: url,
            },
          },
        );

        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({ continue: true });
        expect(getRequests()).toHaveLength(1);

        const payload = JSON.parse(getRequests()[0]?.body ?? "{}") as {
          event: string;
          msg: string;
          type: string;
        };

        expect(payload.event).toBe("session_complete");
        expect(payload.type).toBe("info");
        expect(payload.msg).toContain("Codex 已完成：已经修复飞书通知耗时。");
        expect(payload.msg).toContain("本轮对话运行：2分钟");
        expect(payload.msg).toContain(`项目：${projectDir.split("/").pop()}`);
        expect(payload.msg).toContain("session_id：sess-s");
        expect(payload.msg).toContain("turn_id：turn-s");
      });
    });

    it("cleans up turn state after notification", async () => {
      await withWebhookServer(async ({ url }) => {
        const oneMinAgo = Date.now() - 60_000;
        writeJson(getTurnStatePath(projectDir, "turn-cleanup"), {
          turnId: "turn-cleanup",
          sessionId: "sess-cleanup",
          startedAtMs: oneMinAgo,
        });
        writeJson(join(getStateDir(projectDir), "current-turn.json"), {
          turnId: "turn-cleanup",
          sessionId: "sess-cleanup",
          startedAtMs: oneMinAgo,
        });

        await runHook(
          {
            hook_event_name: "Stop",
            cwd: projectDir,
            session_id: "sess-cleanup",
            turn_id: "turn-cleanup",
            last_assistant_message: "cleanup",
          },
          {
            cwd: projectDir,
            env: {
              CODEX_PROJECT_DIR: projectDir,
              FEISHU_WEBHOOK_URL: url,
            },
          },
        );

        expect(existsSync(getTurnStatePath(projectDir, "turn-cleanup"))).toBe(
          false,
        );
        expect(
          existsSync(join(getStateDir(projectDir), "current-turn.json")),
        ).toBe(false);
      });
    });
  });
});
