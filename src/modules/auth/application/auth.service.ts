import { randomInt, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Request } from "express";
import {
  normalizeIpAddress,
  resolveRequestIp,
} from "../../../shared/common/request-ip.util";
import { AppConfigService } from "../../../shared/config/app-config.service";
import {
  AUTH_AUDIT_ACTION,
  AUTH_AUDIT_EVENT,
  AUTH_AUDIT_RESULT,
  type AuthAuditEvent,
  createAuthAuditEvent,
} from "../../../shared/events/auth-audit.event";
import { RbacService } from "../../rbac/application/rbac.service";
import type { RbacUserRecord } from "../../rbac/domain/rbac.types";
import { SessionService } from "../../session/application/session.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { LoginDto } from "../dto/login.dto";
import { AuthStateRepository } from "../infrastructure/auth-state.repository";

@Injectable()
export class AuthService {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly authStateRepository: AuthStateRepository,
    private readonly rbacService: RbacService,
    private readonly sessionService: SessionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async generateCaptcha() {
    if (!this.appConfigService.captchaEnabled) {
      return {
        captchaEnabled: false,
        captchaId: "",
        captchaCode: "",
        expiresInSeconds: 0,
      };
    }

    const captchaId = randomUUID();
    const captchaCode = String(randomInt(1000, 10000));
    await this.authStateRepository.storeCaptcha(captchaId, captchaCode);

    return {
      captchaEnabled: true,
      captchaId,
      captchaCode,
      expiresInSeconds: this.appConfigService.captchaTtlSeconds,
    };
  }

  async login(loginDto: LoginDto, request: Request) {
    const clientIp = this.resolveClientIp(request);
    const userAgent = this.resolveUserAgent(request);
    if (this.appConfigService.captchaEnabled) {
      const captchaValid = await this.authStateRepository.consumeCaptcha(
        loginDto.captchaId ?? "",
        loginDto.captchaCode ?? "",
      );
      if (!captchaValid) {
        this.emitAuthAuditEvent(
          createAuthAuditEvent({
            action: AUTH_AUDIT_ACTION.LOGIN,
            result: AUTH_AUDIT_RESULT.FAILURE,
            username: loginDto.username,
            ip: clientIp,
            userAgent,
            reason: "captcha_invalid",
          }),
        );
        throw new BadRequestException("验证码错误或已失效");
      }
    }

    if (this.isBlockedIp(clientIp)) {
      this.emitAuthAuditEvent(
        createAuthAuditEvent({
          action: AUTH_AUDIT_ACTION.LOGIN,
          result: AUTH_AUDIT_RESULT.FAILURE,
          username: loginDto.username,
          ip: clientIp,
          userAgent,
          reason: "ip_blocked",
        }),
      );
      throw new UnauthorizedException("登录请求已被拒绝");
    }

    const passwordAttempt = await this.authStateRepository.getPasswordAttempt(
      loginDto.username,
    );
    if (
      passwordAttempt.lockedUntil &&
      new Date(passwordAttempt.lockedUntil).getTime() > Date.now()
    ) {
      this.emitAuthAuditEvent(
        createAuthAuditEvent({
          action: AUTH_AUDIT_ACTION.LOGIN,
          result: AUTH_AUDIT_RESULT.FAILURE,
          username: loginDto.username,
          ip: clientIp,
          userAgent,
          reason: "account_locked",
        }),
      );
      throw new UnauthorizedException("账号已被临时锁定，请稍后再试");
    }

    let user: RbacUserRecord;
    try {
      user = await this.rbacService.findUserForLogin(loginDto.username);
    } catch (error) {
      this.emitAuthAuditEvent(
        createAuthAuditEvent({
          action: AUTH_AUDIT_ACTION.LOGIN,
          result: AUTH_AUDIT_RESULT.FAILURE,
          username: loginDto.username,
          ip: clientIp,
          userAgent,
          reason: "user_invalid",
        }),
      );
      throw error;
    }

    const passwordValid = this.rbacService.verifyPassword(
      loginDto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      await this.authStateRepository.recordPasswordFailure(loginDto.username);
      this.emitAuthAuditEvent(
        createAuthAuditEvent({
          action: AUTH_AUDIT_ACTION.LOGIN,
          result: AUTH_AUDIT_RESULT.FAILURE,
          username: loginDto.username,
          userId: user.userId,
          ip: clientIp,
          userAgent,
          reason: "password_invalid",
        }),
      );
      throw new UnauthorizedException("用户名或密码错误");
    }

    await this.authStateRepository.clearPasswordFailures(loginDto.username);

    const sessionUser = this.rbacService.toSessionUser(user);
    const { accessToken, refreshToken, session } =
      await this.sessionService.createSession({
        user: sessionUser,
        ip: clientIp,
        device: userAgent,
      });

    this.emitAuthAuditEvent(
      createAuthAuditEvent({
        action: AUTH_AUDIT_ACTION.LOGIN,
        result: AUTH_AUDIT_RESULT.SUCCESS,
        username: loginDto.username,
        userId: sessionUser.userId,
        sessionId: session.sessionId,
        ip: clientIp,
        userAgent,
      }),
    );

    return {
      accessToken,
      refreshToken,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      user: sessionUser,
    };
  }

  async refresh(refreshToken: string) {
    const nextSession = await this.sessionService.refreshSession(refreshToken);

    return {
      accessToken: nextSession.accessToken,
      refreshToken: nextSession.refreshToken,
      sessionId: nextSession.session.sessionId,
      expiresAt: nextSession.session.expiresAt,
      user: nextSession.session.user,
    };
  }

  async logout(
    bearerToken: string | undefined,
    request: Request,
  ): Promise<{ loggedOut: boolean }> {
    if (!bearerToken) {
      return { loggedOut: true };
    }

    const token = bearerToken.startsWith("Bearer ")
      ? bearerToken.slice("Bearer ".length)
      : bearerToken;
    const clientIp = this.resolveClientIp(request);
    const userAgent = this.resolveUserAgent(request);

    try {
      const session = await this.sessionService.resolveSessionFromToken(token);
      await this.sessionService.invalidateToken(token);
      this.emitAuthAuditEvent(
        createAuthAuditEvent({
          action: AUTH_AUDIT_ACTION.LOGOUT,
          result: AUTH_AUDIT_RESULT.SUCCESS,
          username: session.user.username,
          userId: session.user.userId,
          sessionId: session.sessionId,
          ip: clientIp,
          userAgent,
        }),
      );
    } catch {
      return { loggedOut: true };
    }

    return { loggedOut: true };
  }

  async getCurrentUser(user: SessionUserSnapshot) {
    return this.rbacService.getCurrentUser(user.userId);
  }

  async getRoutes(user: SessionUserSnapshot) {
    return this.rbacService.getRoutesForUser(user.userId);
  }

  private isBlockedIp(ip: string): boolean {
    return this.appConfigService.authIpBlacklist.some(
      (blockedIp) => normalizeIpAddress(blockedIp) === normalizeIpAddress(ip),
    );
  }

  private resolveClientIp(request: Request): string {
    return resolveRequestIp(request);
  }

  private emitAuthAuditEvent(event: AuthAuditEvent): void {
    this.eventEmitter.emit(AUTH_AUDIT_EVENT, event);
  }

  private resolveUserAgent(request: Request): string {
    const userAgent = request.headers["user-agent"];
    if (Array.isArray(userAgent)) {
      return userAgent[0] ?? "unknown";
    }

    return userAgent ?? "unknown";
  }
}
