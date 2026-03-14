import { randomInt, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Request } from "express";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { RbacService } from "../../rbac/application/rbac.service";
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
    const captchaId = randomUUID();
    const captchaCode = String(randomInt(1000, 10000));
    await this.authStateRepository.storeCaptcha(captchaId, captchaCode);

    return {
      captchaId,
      captchaCode,
      expiresInSeconds: 300,
    };
  }

  async login(loginDto: LoginDto, request: Request) {
    const captchaValid = await this.authStateRepository.consumeCaptcha(
      loginDto.captchaId,
      loginDto.captchaCode,
    );
    if (!captchaValid) {
      this.eventEmitter.emit("auth.login.failed", {
        username: loginDto.username,
        reason: "captcha_invalid",
      });
      throw new BadRequestException("验证码错误或已失效");
    }

    const clientIp = this.resolveClientIp(request);
    if (this.isBlockedIp(clientIp)) {
      this.eventEmitter.emit("auth.login.failed", {
        username: loginDto.username,
        reason: "ip_blocked",
        ip: clientIp,
      });
      throw new UnauthorizedException("登录请求已被拒绝");
    }

    const passwordAttempt = await this.authStateRepository.getPasswordAttempt(
      loginDto.username,
    );
    if (
      passwordAttempt.lockedUntil &&
      new Date(passwordAttempt.lockedUntil).getTime() > Date.now()
    ) {
      throw new UnauthorizedException("账号已被临时锁定，请稍后再试");
    }

    const user = await this.rbacService.findUserForLogin(loginDto.username);
    const passwordValid = this.rbacService.verifyPassword(
      loginDto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      const nextAttempt = await this.authStateRepository.recordPasswordFailure(
        loginDto.username,
      );
      this.eventEmitter.emit("auth.login.failed", {
        username: loginDto.username,
        reason: "password_invalid",
        count: nextAttempt.count,
      });
      throw new UnauthorizedException("用户名或密码错误");
    }

    await this.authStateRepository.clearPasswordFailures(loginDto.username);

    const sessionUser = this.rbacService.toSessionUser(user);
    const { accessToken, session } = await this.sessionService.createSession({
      user: sessionUser,
      ip: clientIp,
      device: request.headers["user-agent"] ?? "unknown",
    });

    this.eventEmitter.emit("auth.login.succeeded", {
      username: loginDto.username,
      sessionId: session.sessionId,
    });

    return {
      accessToken,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      user: sessionUser,
    };
  }

  async logout(bearerToken?: string): Promise<{ loggedOut: boolean }> {
    if (!bearerToken) {
      return { loggedOut: true };
    }

    const token = bearerToken.startsWith("Bearer ")
      ? bearerToken.slice("Bearer ".length)
      : bearerToken;

    try {
      await this.sessionService.invalidateToken(token);
    } catch {
      return { loggedOut: true };
    }

    this.eventEmitter.emit("auth.logout", {});
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
      (blockedIp) => this.normalizeIp(blockedIp) === this.normalizeIp(ip),
    );
  }

  private resolveClientIp(request: Request): string {
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    const candidate =
      forwardedIp?.split(",")[0]?.trim() ||
      request.ip ||
      request.socket.remoteAddress ||
      "unknown";

    return this.normalizeIp(candidate);
  }

  private normalizeIp(ip: string): string {
    if (ip === "::1") {
      return "127.0.0.1";
    }

    return ip.replace(/^::ffff:/, "");
  }
}
