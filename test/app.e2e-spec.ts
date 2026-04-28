import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { setupApp } from "../src/app.setup";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { RedisStoreService } from "../src/shared/redis/redis-store.service";
import { PrismaE2eStub } from "./prisma-e2e-stub";
import { RedisStoreE2eStub } from "./redis-store.e2e-stub";

interface TestAppContext {
  app: NestExpressApplication;
  close: () => Promise<void>;
}

type TestHttpServer = ReturnType<NestExpressApplication["getHttpServer"]>;

interface LoginOptions {
  username: string;
  password: string;
  headers?: Record<string, string>;
}

describe("Batch A acceptance (e2e)", () => {
  let appContext: TestAppContext | null = null;

  afterEach(async () => {
    await appContext?.close();
    appContext = null;
  });

  async function bootstrapApp(
    envOverrides: Record<string, string | undefined> = {},
  ): Promise<TestAppContext> {
    const previousEnv = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(envOverrides)) {
      previousEnv.set(key, process.env[key]);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useClass(PrismaE2eStub)
      .overrideProvider(RedisStoreService)
      .useClass(RedisStoreE2eStub)
      .compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();
    await setupApp(app);
    await app.init();

    return {
      app,
      close: async () => {
        await app.close();
        for (const [key, value] of previousEnv.entries()) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      },
    };
  }

  async function getCaptcha(server: TestHttpServer) {
    const captchaResponse = await request(server)
      .get("/api/auth/captcha")
      .expect(200);
    return {
      captchaEnabled: Boolean(captchaResponse.body.data.captchaEnabled),
      captchaId: captchaResponse.body.data.captchaId as string,
      captchaCode: captchaResponse.body.data.captchaCode as string,
    };
  }

  async function login(
    server: TestHttpServer,
    { username, password, headers }: LoginOptions,
    expectedStatus = 201,
  ) {
    const { captchaEnabled, captchaId, captchaCode } = await getCaptcha(server);
    let httpRequest = request(server).post("/api/auth/login");

    for (const [headerName, headerValue] of Object.entries(headers ?? {})) {
      httpRequest = httpRequest.set(headerName, headerValue);
    }

    const loginPayload: Record<string, string> = {
      username,
      password,
    };
    if (captchaEnabled) {
      loginPayload.captchaId = captchaId;
      loginPayload.captchaCode = captchaCode;
    }

    return httpRequest.send(loginPayload).expect(expectedStatus);
  }

  it("should complete the admin auth/session/rbac acceptance flow", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();

    const health = await request(server).get("/api/health").expect(200);
    expect(health.body.success).toBe(true);
    expect(health.body.data.status).toBe("ok");

    const loginResponse = await login(server, {
      username: "admin",
      password: "admin123",
    });

    const accessToken = loginResponse.body.data.accessToken as string;
    const sessionId = loginResponse.body.data.sessionId as string;
    expect(accessToken).toBeTruthy();
    expect(sessionId).toBeTruthy();

    const meResponse = await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(meResponse.body.data.username).toBe("admin");
    expect(meResponse.body.data.department.departmentName).toBe("仓库");

    const routesResponse = await request(server)
      .get("/api/auth/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    const routeNames = JSON.stringify(routesResponse.body.data);
    expect(routeNames).toContain("Dashboard");
    expect(routeNames).toContain("SystemManagement");
    expect(routeNames).toContain("RdSubwarehouse");

    const onlineResponse = await request(server)
      .get("/api/sessions/online")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(onlineResponse.body.data.total).toBe(1);
    expect(onlineResponse.body.data.items[0].sessionId).toBe(sessionId);
    expect(onlineResponse.body.data.items[0].department.departmentName).toBe(
      "仓库",
    );

    await request(server)
      .delete(`/api/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);
  });

  it("should refresh expired access tokens and rotate refresh tokens", async () => {
    appContext = await bootstrapApp({
      JWT_EXPIRES_IN_SECONDS: "1",
      JWT_REFRESH_EXPIRES_IN_SECONDS: "600",
      SESSION_TTL_SECONDS: "120",
      SESSION_MAX_TTL_SECONDS: "600",
    });
    const server = appContext.app.getHttpServer();

    const loginResponse = await login(server, {
      username: "admin",
      password: "admin123",
    });

    const expiredAccessToken = loginResponse.body.data.accessToken as string;
    const refreshToken = loginResponse.body.data.refreshToken as string;
    const sessionId = loginResponse.body.data.sessionId as string;
    expect(refreshToken).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 2100));

    await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expiredAccessToken}`)
      .expect(401);

    const refreshResponse = await request(server)
      .post("/api/auth/refresh")
      .send({
        refreshToken,
      })
      .expect(201);

    const nextAccessToken = refreshResponse.body.data.accessToken as string;
    const nextRefreshToken = refreshResponse.body.data.refreshToken as string;
    expect(refreshResponse.body.data.sessionId).toBe(sessionId);
    expect(nextAccessToken).toBeTruthy();
    expect(nextRefreshToken).toBeTruthy();
    expect(nextRefreshToken).not.toBe(refreshToken);

    await request(server)
      .post("/api/auth/refresh")
      .send({
        refreshToken,
      })
      .expect(401);

    const meResponse = await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${nextAccessToken}`)
      .expect(200);
    expect(meResponse.body.data.username).toBe("admin");
  });

  it("should forbid operator access to session admin endpoints and keep only authorized routes", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();

    const adminLoginResponse = await login(server, {
      username: "admin",
      password: "admin123",
    });
    const adminSessionId = adminLoginResponse.body.data.sessionId as string;

    const operatorLoginResponse = await login(server, {
      username: "operator",
      password: "operator123",
    });
    const operatorAccessToken = operatorLoginResponse.body.data
      .accessToken as string;

    const routesResponse = await request(server)
      .get("/api/auth/routes")
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(200);

    const routeNames = JSON.stringify(routesResponse.body.data);
    expect(routeNames).toContain("Dashboard");
    expect(routeNames).toContain("RdSubwarehouse");
    expect(routeNames).not.toContain("SystemManagement");
    expect(routeNames).not.toContain("Reporting");

    await request(server)
      .get("/api/reporting/home")
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(200);

    await request(server)
      .get("/api/reporting/material-category-summary")
      .query({ limit: 8, offset: 0 })
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(200);

    await request(server)
      .get("/api/reporting/trends")
      .query({ dateFrom: "2026-04-01", dateTo: "2026-04-02" })
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(200);

    await request(server)
      .get("/api/inventory/balances")
      .query({ limit: 10, offset: 0 })
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(200);

    await request(server)
      .get("/api/reporting/inventory-summary")
      .query({ limit: 10, offset: 0 })
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(403);

    await request(server)
      .get("/api/sessions/online")
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(403);

    await request(server)
      .delete(`/api/sessions/${adminSessionId}`)
      .set("Authorization", `Bearer ${operatorAccessToken}`)
      .expect(403);
  });

  it("should reject login from a blacklisted IP", async () => {
    appContext = await bootstrapApp({
      AUTH_IP_BLACKLIST: "203.0.113.10",
    });
    const server = appContext.app.getHttpServer();

    await login(
      server,
      {
        username: "admin",
        password: "admin123",
        headers: {
          "X-Forwarded-For": "203.0.113.10",
        },
      },
      401,
    );
  });

  it("should reject disabled users during login", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();

    await login(
      server,
      {
        username: "disabled-user",
        password: "disabled123",
      },
      401,
    );
  });

  it("should lock the account after repeated password failures", async () => {
    appContext = await bootstrapApp({
      PASSWORD_MAX_RETRIES: "2",
      PASSWORD_LOCK_MINUTES: "1",
    });
    const server = appContext.app.getHttpServer();

    await login(
      server,
      {
        username: "operator",
        password: "wrong-password",
      },
      401,
    );

    await login(
      server,
      {
        username: "operator",
        password: "wrong-password",
      },
      401,
    );

    await login(
      server,
      {
        username: "operator",
        password: "operator123",
      },
      401,
    );
  });

  it("should expose swagger docs and keep public routes unauthenticated", async () => {
    appContext = await bootstrapApp({
      SWAGGER_ENABLED: "true",
    });
    const server = appContext.app.getHttpServer();

    await request(server).get("/api/docs").expect(200);

    const swaggerResponse = await request(server)
      .get("/api/docs-json")
      .expect(200);

    expect(swaggerResponse.body.info.title).toBe("saifute-wms-server API");
    expect(swaggerResponse.body.security).toEqual([{ bearer: [] }]);
    expect(swaggerResponse.body.paths["/api/auth/login"].post.security).toEqual(
      [],
    );
    expect(
      swaggerResponse.body.paths["/api/auth/login"].post.requestBody.content[
        "application/json"
      ].schema,
    ).toEqual({
      $ref: "#/components/schemas/LoginDto",
    });
    expect(
      swaggerResponse.body.components.schemas.LoginDto.properties,
    ).toMatchObject({
      username: expect.objectContaining({
        type: "string",
        description: "登录用户名",
      }),
      password: expect.objectContaining({
        type: "string",
        description: "登录密码，至少 6 位",
      }),
      captchaId: expect.objectContaining({
        type: "string",
        description: "图形验证码 ID",
      }),
      captchaCode: expect.objectContaining({
        type: "string",
        description: "4 位图形验证码",
      }),
    });
    expect(
      swaggerResponse.body.paths["/api/auth/login"].post.responses["201"]
        .content["application/json"].schema.properties,
    ).toMatchObject({
      success: expect.objectContaining({ type: "boolean" }),
      code: expect.objectContaining({ type: "integer" }),
      data: expect.any(Object),
    });
    expect(
      swaggerResponse.body.paths["/api/inbound/orders"].get.parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "documentNo",
          in: "query",
          description: "入库单号关键字",
          schema: expect.objectContaining({ type: "string" }),
        }),
        expect.objectContaining({
          name: "limit",
          in: "query",
          description: "每页条数，默认 50，最大由服务端限制",
          schema: expect.objectContaining({ type: "number" }),
        }),
      ]),
    );
    expect(
      swaggerResponse.body.paths["/api/reporting/inventory-summary"].get
        .parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "keyword",
          in: "query",
          description: "物料编码或名称关键字",
          schema: expect.objectContaining({ type: "string" }),
        }),
        expect.objectContaining({
          name: "limit",
          in: "query",
          description: "每页条数，默认 50",
          schema: expect.objectContaining({ type: "number" }),
        }),
      ]),
    );
    expect(swaggerResponse.body.paths["/api/health"].get.security).toEqual([]);
    expect(
      swaggerResponse.body.paths["/api/sessions/online"].get.security,
    ).toBeUndefined();
  });

  it("should hide swagger docs when disabled", async () => {
    appContext = await bootstrapApp({
      SWAGGER_ENABLED: "false",
    });
    const server = appContext.app.getHttpServer();

    await request(server).get("/api/docs").expect(404);
    await request(server).get("/api/docs-json").expect(404);
  });
});
