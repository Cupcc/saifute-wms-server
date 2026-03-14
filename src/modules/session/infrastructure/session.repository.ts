import { Injectable } from "@nestjs/common";
import { RedisStoreService } from "../../../shared/redis/redis-store.service";
import type { UserSession } from "../domain/user-session";

const SESSION_KEY_PREFIX = "login_tokens:";

@Injectable()
export class SessionRepository {
  constructor(private readonly redisStoreService: RedisStoreService) {}

  async save(session: UserSession, ttlSeconds: number): Promise<void> {
    await this.redisStoreService.set(
      this.buildKey(session.sessionId),
      session,
      ttlSeconds,
    );
  }

  async findBySessionId(sessionId: string): Promise<UserSession | null> {
    return this.redisStoreService.get<UserSession>(this.buildKey(sessionId));
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.redisStoreService.del(this.buildKey(sessionId));
  }

  async getRemainingTtl(sessionId: string): Promise<number | null> {
    return this.redisStoreService.ttl(this.buildKey(sessionId));
  }

  async listOnlineSessions(): Promise<UserSession[]> {
    const entries =
      await this.redisStoreService.listByPrefix<UserSession>(
        SESSION_KEY_PREFIX,
      );
    return entries.map(({ value }) => value);
  }

  private buildKey(sessionId: string): string {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
  }
}
