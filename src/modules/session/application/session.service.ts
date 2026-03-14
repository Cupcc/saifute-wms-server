import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AppConfigService } from "../../../shared/config/app-config.service";
import type {
  CreateSessionInput,
  SessionClaims,
  UserSession,
} from "../domain/user-session";
import { SessionRepository } from "../infrastructure/session.repository";

@Injectable()
export class SessionService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly jwtService: JwtService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async createSession(input: CreateSessionInput) {
    const now = Date.now();
    const expiresAt = now + this.appConfigService.sessionTtlSeconds * 1000;
    const maxExpiresAt =
      now + this.appConfigService.sessionMaxTtlSeconds * 1000;
    const session: UserSession = {
      version: 1,
      sessionId: randomUUID(),
      user: input.user,
      loginTime: new Date(now).toISOString(),
      lastActiveAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      maxExpiresAt: new Date(maxExpiresAt).toISOString(),
      ip: input.ip ?? "unknown",
      device: input.device ?? "unknown",
    };

    await this.sessionRepository.save(
      session,
      this.appConfigService.sessionTtlSeconds,
    );
    const accessToken = await this.jwtService.signAsync({
      sub: String(input.user.userId),
      sid: session.sessionId,
      username: input.user.username,
    });

    return {
      accessToken,
      session,
    };
  }

  async resolveSessionFromToken(token: string): Promise<UserSession> {
    const claims = await this.verifyToken(token);
    const session = await this.sessionRepository.findBySessionId(claims.sid);
    if (!session) {
      throw new UnauthorizedException("登录会话不存在或已失效");
    }

    await this.refreshSessionIfNeeded(session);
    return session;
  }

  async invalidateSession(sessionId: string): Promise<{ removed: boolean }> {
    const removed = await this.sessionRepository.delete(sessionId);
    return { removed };
  }

  async invalidateToken(token: string): Promise<void> {
    const claims = await this.verifyToken(token, true);
    await this.sessionRepository.delete(claims.sid);
  }

  async listOnlineSessions() {
    const sessions = await this.sessionRepository.listOnlineSessions();
    return sessions
      .sort((left, right) =>
        right.lastActiveAt.localeCompare(left.lastActiveAt),
      )
      .map((session) => ({
        sessionId: session.sessionId,
        userId: session.user.userId,
        username: session.user.username,
        displayName: session.user.displayName,
        roles: session.user.roles,
        department: session.user.department,
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
        ip: session.ip,
        device: session.device,
      }));
  }

  private async verifyToken(
    token: string,
    ignoreExpiration = false,
  ): Promise<SessionClaims> {
    try {
      return await this.jwtService.verifyAsync<SessionClaims>(token, {
        secret: this.appConfigService.jwtSecret,
        ignoreExpiration,
      });
    } catch {
      throw new UnauthorizedException("访问令牌无效或已过期");
    }
  }

  private async refreshSessionIfNeeded(session: UserSession): Promise<void> {
    const remainingTtl = await this.sessionRepository.getRemainingTtl(
      session.sessionId,
    );
    if (remainingTtl === null) {
      throw new UnauthorizedException("登录会话不存在或已失效");
    }

    if (remainingTtl > this.appConfigService.sessionRefreshThresholdSeconds) {
      return;
    }

    const now = Date.now();
    const maxExpiresAt = new Date(session.maxExpiresAt).getTime();
    const nextExpiresAt = Math.min(
      now + this.appConfigService.sessionTtlSeconds * 1000,
      maxExpiresAt,
    );

    if (nextExpiresAt <= now) {
      await this.sessionRepository.delete(session.sessionId);
      throw new UnauthorizedException("登录会话已超过最大生存时间");
    }

    session.lastActiveAt = new Date(now).toISOString();
    session.expiresAt = new Date(nextExpiresAt).toISOString();
    await this.sessionRepository.save(
      session,
      Math.max(1, Math.ceil((nextExpiresAt - now) / 1000)),
    );
  }
}
