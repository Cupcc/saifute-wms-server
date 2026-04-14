import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AppConfigService } from "../../../shared/config/app-config.service";
import type {
  CreateSessionInput,
  RefreshSessionClaims,
  SessionClaims,
  SessionUserSnapshot,
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
      refreshTokenId: randomUUID(),
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
    const { accessToken, refreshToken } = await this.issueTokens(session);

    return {
      accessToken,
      refreshToken,
      session,
    };
  }

  async resolveSessionFromToken(token: string): Promise<UserSession> {
    const claims = await this.verifyAccessToken(token);
    const session = await this.sessionRepository.findBySessionId(claims.sid);
    if (!session) {
      throw new UnauthorizedException("登录会话不存在或已失效");
    }

    await this.refreshSessionIfNeeded(session);
    return session;
  }

  async refreshSession(refreshToken: string) {
    const claims = await this.verifyRefreshToken(refreshToken);
    const session = await this.sessionRepository.findBySessionId(claims.sid);
    if (!session) {
      throw new UnauthorizedException("登录会话不存在或已失效");
    }

    if (!session.refreshTokenId || session.refreshTokenId !== claims.jti) {
      throw new UnauthorizedException("刷新令牌无效或已过期");
    }

    await this.refreshSessionIfNeeded(session);
    session.refreshTokenId = randomUUID();
    await this.persistSession(session);
    const tokens = await this.issueTokens(session);

    return {
      ...tokens,
      session,
    };
  }

  async invalidateSession(sessionId: string): Promise<{ removed: boolean }> {
    const removed = await this.sessionRepository.delete(sessionId);
    return { removed };
  }

  async invalidateToken(token: string): Promise<void> {
    const claims = await this.verifyAccessToken(token, true);
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

  async invalidateSessionsByUserIds(userIds: number[]): Promise<number> {
    if (userIds.length === 0) {
      return 0;
    }

    const userIdSet = new Set(userIds);
    const sessions = await this.sessionRepository.listOnlineSessions();
    const targets = sessions.filter((session) =>
      userIdSet.has(session.user.userId),
    );

    await Promise.all(
      targets.map((session) =>
        this.sessionRepository.delete(session.sessionId),
      ),
    );

    return targets.length;
  }

  async syncSessionUser(
    session: UserSession,
    latestUser: SessionUserSnapshot,
  ): Promise<void> {
    if (this.isSameSessionUser(session.user, latestUser)) {
      return;
    }

    const remainingTtl = await this.sessionRepository.getRemainingTtl(
      session.sessionId,
    );
    if (remainingTtl === null) {
      throw new UnauthorizedException("登录会话不存在或已失效");
    }

    session.user = latestUser;
    await this.sessionRepository.save(session, Math.max(1, remainingTtl));
  }

  private async verifyAccessToken(
    token: string,
    ignoreExpiration = false,
  ): Promise<SessionClaims> {
    try {
      const claims = await this.jwtService.verifyAsync<SessionClaims>(token, {
        secret: this.appConfigService.jwtSecret,
        ignoreExpiration,
      });

      if (claims.typ && claims.typ !== "access") {
        throw new Error("Unexpected token type");
      }

      return claims;
    } catch {
      throw new UnauthorizedException("访问令牌无效或已过期");
    }
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshSessionClaims> {
    try {
      const claims = await this.jwtService.verifyAsync<RefreshSessionClaims>(
        token,
        {
          secret: this.appConfigService.jwtRefreshSecret,
        },
      );

      if (claims.typ !== "refresh" || !claims.jti) {
        throw new Error("Unexpected token type");
      }

      return claims;
    } catch {
      throw new UnauthorizedException("刷新令牌无效或已过期");
    }
  }

  private async issueTokens(session: UserSession) {
    if (!session.refreshTokenId) {
      throw new UnauthorizedException("登录会话不存在或已失效");
    }

    const accessToken = await this.jwtService.signAsync({
      sub: String(session.user.userId),
      sid: session.sessionId,
      username: session.user.username,
      typ: "access",
    });
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: String(session.user.userId),
        sid: session.sessionId,
        username: session.user.username,
        typ: "refresh",
        jti: session.refreshTokenId,
      },
      {
        secret: this.appConfigService.jwtRefreshSecret,
        expiresIn: this.appConfigService.jwtRefreshExpiresInSeconds,
      },
    );

    return {
      accessToken,
      refreshToken,
    };
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

  private async persistSession(session: UserSession): Promise<void> {
    const remainingMilliseconds =
      new Date(session.expiresAt).getTime() - Date.now();
    if (remainingMilliseconds <= 0) {
      await this.sessionRepository.delete(session.sessionId);
      throw new UnauthorizedException("登录会话不存在或已失效");
    }

    await this.sessionRepository.save(
      session,
      Math.max(1, Math.ceil(remainingMilliseconds / 1000)),
    );
  }

  private isSameSessionUser(
    left: SessionUserSnapshot,
    right: SessionUserSnapshot,
  ): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
