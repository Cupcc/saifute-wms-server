import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/shared/common/filters/http-exception.filter";
import { ResponseEnvelopeInterceptor } from "../src/shared/common/interceptors/response-envelope.interceptor";

interface TestAppContext {
  app: INestApplication;
  close: () => Promise<void>;
}

type TestHttpServer = ReturnType<INestApplication["getHttpServer"]>;

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
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
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
      captchaId: captchaResponse.body.data.captchaId as string,
      captchaCode: captchaResponse.body.data.captchaCode as string,
    };
  }

  async function login(
    server: TestHttpServer,
    { username, password, headers }: LoginOptions,
    expectedStatus = 201,
  ) {
    const { captchaId, captchaCode } = await getCaptcha(server);
    let httpRequest = request(server).post("/api/auth/login");

    for (const [headerName, headerValue] of Object.entries(headers ?? {})) {
      httpRequest = httpRequest.set(headerName, headerValue);
    }

    return httpRequest
      .send({
        username,
        password,
        captchaId,
        captchaCode,
      })
      .expect(expectedStatus);
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
    expect(meResponse.body.data.department.departmentName).toBe("系统管理部");

    const routesResponse = await request(server)
      .get("/api/auth/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(routesResponse.body.data).toHaveLength(2);

    const onlineResponse = await request(server)
      .get("/api/sessions/online")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(onlineResponse.body.data.total).toBe(1);
    expect(onlineResponse.body.data.items[0].sessionId).toBe(sessionId);
    expect(onlineResponse.body.data.items[0].department.departmentName).toBe(
      "系统管理部",
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

  it("should forbid operator access to session admin endpoints and filter routes", async () => {
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

    expect(routesResponse.body.data).toHaveLength(1);
    expect(routesResponse.body.data[0].path).toBe("/dashboard");

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
});
