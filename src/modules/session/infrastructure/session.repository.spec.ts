import type Redis from "ioredis";
import {
  canConnectToRedisForTests,
  closeRedisClient,
  createRedisAppConfigStub,
  createRedisClientForTests,
} from "../../../../test/redis-test.utils";
import { RedisStoreService } from "../../../shared/redis/redis-store.service";
import type { UserSession } from "../domain/user-session";
import { SessionRepository } from "./session.repository";

function buildSession(sessionId: string, userId: number): UserSession {
  return {
    version: 1,
    sessionId,
    user: {
      userId,
      username: `user-${userId}`,
      displayName: `User ${userId}`,
      roles: ["operator"],
      permissions: ["dashboard:view"],
      department: null,
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopName: null,
      },
    },
    loginTime: "2026-03-27T10:00:00.000Z",
    lastActiveAt: "2026-03-27T10:00:00.000Z",
    expiresAt: "2026-03-27T11:00:00.000Z",
    maxExpiresAt: "2026-03-27T18:00:00.000Z",
    ip: "127.0.0.1",
    device: "jest",
  };
}

describe("SessionRepository (integration)", () => {
  let rawClient: Redis | null = null;
  let redisStoreService: RedisStoreService | null = null;
  let repository: SessionRepository | null = null;

  beforeAll(async () => {
    const redisAvailable = await canConnectToRedisForTests();
    if (!redisAvailable) {
      process.stderr.write(
        "[SessionRepository.spec] Redis unavailable, skipping integration assertions.\n",
      );
      return;
    }

    rawClient = await createRedisClientForTests();
    redisStoreService = new RedisStoreService(createRedisAppConfigStub());
    await redisStoreService.onModuleInit();
    repository = new SessionRepository(redisStoreService);
  });

  beforeEach(async () => {
    await rawClient?.flushdb();
  });

  afterAll(async () => {
    if (redisStoreService) {
      await redisStoreService.onModuleDestroy();
    }
    await closeRedisClient(rawClient);
  });

  it("saves sessions to Redis and keeps ttl-based lookup semantics", async () => {
    if (!repository || !rawClient) {
      return;
    }

    const session = buildSession("session-1", 1);
    await repository.save(session, 120);

    expect(await rawClient.get("login_tokens:session-1")).toBe(
      JSON.stringify(session),
    );
    expect(await repository.findBySessionId("session-1")).toEqual(session);
    expect(await repository.getRemainingTtl("session-1")).toBeGreaterThan(0);

    expect(await repository.delete("session-1")).toBe(true);
    expect(await repository.findBySessionId("session-1")).toBeNull();
    expect(await repository.getRemainingTtl("session-1")).toBeNull();
  });

  it("lists online sessions from the login_tokens prefix only", async () => {
    if (!repository) {
      return;
    }

    const sessionA = buildSession("session-a", 1);
    const sessionB = buildSession("session-b", 2);
    await repository.save(sessionA, 120);
    await repository.save(sessionB, 120);
    await redisStoreService?.set(
      "auth:captcha:ignore",
      { captchaCode: "1234" },
      60,
    );

    const sessions = await repository.listOnlineSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.sessionId).sort()).toEqual([
      "session-a",
      "session-b",
    ]);
  });
});
