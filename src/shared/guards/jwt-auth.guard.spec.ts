import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { RbacService } from "../../modules/rbac/application/rbac.service";
import { SessionService } from "../../modules/session/application/session.service";
import type {
  SessionUserSnapshot,
  UserSession,
} from "../../modules/session/domain/user-session";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  const sessionUser: SessionUserSnapshot = {
    userId: 2,
    username: "operator",
    displayName: "仓库管理员",
    roles: ["warehouse-manager"],
    permissions: ["dashboard:view"],
    department: {
      departmentId: 300,
      departmentName: "仓库",
    },
    consoleMode: "default",
    workshopScope: {
      mode: "ALL",
      workshopId: null,
      workshopName: null,
    },
  };

  const latestUser: SessionUserSnapshot = {
    ...sessionUser,
    permissions: ["dashboard:view", "inbound:order:list"],
  };

  function createContext(request: Request & Record<string, unknown>) {
    return {
      getHandler: () => "handler",
      getClass: () => "class",
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as never;
  }

  it("refreshes stale session user snapshot before attaching request user", async () => {
    const request = {
      headers: {
        authorization: "Bearer token-1",
      },
    } as Request & Record<string, unknown>;
    const session: UserSession = {
      version: 1,
      sessionId: "session-1",
      user: { ...sessionUser },
      loginTime: "2026-03-31T09:00:00.000Z",
      lastActiveAt: "2026-03-31T09:00:00.000Z",
      expiresAt: "2026-03-31T10:00:00.000Z",
      maxExpiresAt: "2026-03-31T11:00:00.000Z",
      ip: "127.0.0.1",
      device: "jest",
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const sessionService = {
      resolveSessionFromToken: jest.fn().mockResolvedValue(session),
      syncSessionUser: jest
        .fn()
        .mockImplementation(async (current, nextUser) => {
          current.user = nextUser;
        }),
    } as unknown as SessionService;
    const rbacService = {
      getCurrentUser: jest.fn().mockResolvedValue(latestUser),
    } as unknown as RbacService;
    const guard = new JwtAuthGuard(reflector, sessionService, rbacService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(sessionService.resolveSessionFromToken).toHaveBeenCalledWith(
      "token-1",
    );
    expect(rbacService.getCurrentUser).toHaveBeenCalledWith(2);
    expect(sessionService.syncSessionUser).toHaveBeenCalledWith(
      session,
      latestUser,
    );
    expect(request.user).toEqual(latestUser);
    expect(request.session).toBe(session);
    expect(request.accessToken).toBe("token-1");
  });

  it("throws when authorization header is missing", async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(
      reflector,
      {} as SessionService,
      {} as RbacService,
    );

    await expect(
      guard.canActivate(
        createContext({
          headers: {},
        } as Request & Record<string, unknown>),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
