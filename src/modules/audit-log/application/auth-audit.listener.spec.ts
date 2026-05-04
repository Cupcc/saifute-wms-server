import { UnauthorizedException } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Request } from "express";
import {
  LoginLogAction,
  LoginLogResult,
} from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { AuthService } from "../../auth/application/auth.service";
import { AuthStateRepository } from "../../auth/infrastructure/auth-state.repository";
import { RbacService } from "../../rbac/application/rbac.service";
import { SessionService } from "../../session/application/session.service";
import { AuditLogRepository } from "../infrastructure/audit-log.repository";
import { AuditLogService } from "./audit-log.service";
import { AuthAuditListener } from "./auth-audit.listener";

async function waitForLoginLogWrite(
  createLoginLog: jest.Mock,
  expectedCalls = 1,
): Promise<void> {
  const deadline = Date.now() + 1000;
  while (createLoginLog.mock.calls.length < expectedCalls) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for auth audit listener (${createLoginLog.mock.calls.length}/${expectedCalls} login log writes)`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createRequest(): Request {
  return {
    headers: {
      "user-agent": "jest-agent",
    },
    ip: "::1",
    socket: {
      remoteAddress: "::1",
    },
  } as unknown as Request;
}

async function createHarness(options?: {
  createLoginLogImpl?: () => Promise<unknown>;
}): Promise<{
  moduleRef: TestingModule;
  authService: AuthService;
  auditLogRepository: {
    createLoginLog: jest.Mock;
    createOperLog: jest.Mock;
  };
  authStateRepository: Record<string, jest.Mock>;
  rbacService: Record<string, jest.Mock>;
  sessionService: Record<string, jest.Mock>;
}> {
  const auditLogRepository = {
    createLoginLog: jest.fn(
      options?.createLoginLogImpl ?? (() => Promise.resolve({ id: 1 })),
    ),
    createOperLog: jest.fn(),
  };
  const authStateRepository = {
    storeCaptcha: jest.fn(),
    consumeCaptcha: jest.fn().mockResolvedValue(true),
    getPasswordAttempt: jest.fn().mockResolvedValue({
      count: 0,
      lockedUntil: null,
    }),
    recordPasswordFailure: jest.fn().mockResolvedValue({ count: 1 }),
    clearPasswordFailures: jest.fn().mockResolvedValue(undefined),
  };
  const rbacService = {
    findUserForLogin: jest.fn().mockResolvedValue({
      userId: 1,
      username: "admin",
      displayName: "系统管理员",
      roles: ["admin"],
      permissions: ["dashboard:view"],
      passwordHash: "hash",
      status: "active",
      deleted: false,
    }),
    verifyPassword: jest.fn().mockReturnValue(true),
    toSessionUser: jest.fn().mockReturnValue({
      userId: 1,
      username: "admin",
      displayName: "系统管理员",
      roles: ["admin"],
      permissions: ["dashboard:view"],
      department: null,
      consoleMode: "default",
      workshopScope: {
        mode: "ALL",
        workshopId: null,
        workshopCode: null,
        workshopName: null,
      },
    }),
    getCurrentUser: jest.fn(),
    getRoutesForUser: jest.fn(),
  };
  const sessionService = {
    createSession: jest.fn().mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      session: {
        sessionId: "session-1",
        expiresAt: "2026-03-15T12:00:00.000Z",
        user: rbacService.toSessionUser(),
      },
    }),
    resolveSessionFromToken: jest.fn().mockResolvedValue({
      sessionId: "session-1",
      user: rbacService.toSessionUser(),
    }),
    invalidateToken: jest.fn().mockResolvedValue(undefined),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot()],
    providers: [
      AuthService,
      AuditLogService,
      AuthAuditListener,
      {
        provide: AppConfigService,
        useValue: {
          captchaEnabled: true,
          authIpBlacklist: [],
        },
      },
      {
        provide: AuthStateRepository,
        useValue: authStateRepository,
      },
      {
        provide: RbacService,
        useValue: rbacService,
      },
      {
        provide: SessionService,
        useValue: sessionService,
      },
      {
        provide: AuditLogRepository,
        useValue: auditLogRepository,
      },
    ],
  }).compile();

  await moduleRef.init();

  return {
    moduleRef,
    authService: moduleRef.get(AuthService),
    auditLogRepository,
    authStateRepository,
    rbacService,
    sessionService,
  };
}

describe("AuthAuditListener", () => {
  it("persists a login success entry", async () => {
    const harness = await createHarness();

    try {
      const result = await harness.authService.login(
        {
          username: "admin",
          password: "admin123",
          captchaId: "captcha-id",
          captchaCode: "1234",
        },
        createRequest(),
      );

      await waitForLoginLogWrite(harness.auditLogRepository.createLoginLog);

      expect(result).toMatchObject({
        accessToken: "access-token",
        sessionId: "session-1",
      });
      expect(harness.auditLogRepository.createLoginLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: LoginLogAction.LOGIN,
          result: LoginLogResult.SUCCESS,
          username: "admin",
          userId: 1,
          sessionId: "session-1",
          ip: "127.0.0.1",
          userAgent: "jest-agent",
        }),
      );
    } finally {
      await harness.moduleRef.close();
    }
  });

  it("persists a login failure entry", async () => {
    const harness = await createHarness();
    harness.rbacService.verifyPassword.mockReturnValue(false);

    try {
      await expect(
        harness.authService.login(
          {
            username: "admin",
            password: "bad-password",
            captchaId: "captcha-id",
            captchaCode: "1234",
          },
          createRequest(),
        ),
      ).rejects.toThrow(UnauthorizedException);

      await waitForLoginLogWrite(harness.auditLogRepository.createLoginLog);

      expect(harness.auditLogRepository.createLoginLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: LoginLogAction.LOGIN,
          result: LoginLogResult.FAILURE,
          username: "admin",
          reason: "password_invalid",
        }),
      );
    } finally {
      await harness.moduleRef.close();
    }
  });

  it("persists a logout entry", async () => {
    const harness = await createHarness();

    try {
      const result = await harness.authService.logout(
        "Bearer access-token",
        createRequest(),
      );

      await waitForLoginLogWrite(harness.auditLogRepository.createLoginLog);

      expect(result).toEqual({ loggedOut: true });
      expect(harness.auditLogRepository.createLoginLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: LoginLogAction.LOGOUT,
          result: LoginLogResult.SUCCESS,
          username: "admin",
          userId: 1,
          sessionId: "session-1",
        }),
      );
    } finally {
      await harness.moduleRef.close();
    }
  });

  it("swallows audit persistence failures during login", async () => {
    const harness = await createHarness({
      createLoginLogImpl: () => Promise.reject(new Error("db unavailable")),
    });

    try {
      await expect(
        harness.authService.login(
          {
            username: "admin",
            password: "admin123",
            captchaId: "captcha-id",
            captchaCode: "1234",
          },
          createRequest(),
        ),
      ).resolves.toMatchObject({
        accessToken: "access-token",
        sessionId: "session-1",
      });

      await waitForLoginLogWrite(harness.auditLogRepository.createLoginLog);

      expect(harness.auditLogRepository.createLoginLog).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      await harness.moduleRef.close();
    }
  });
});
