import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { static as expressStatic } from "express";
import * as request from "supertest";
import { Prisma, SalesStockOrderType } from "../generated/prisma/client";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/shared/common/filters/http-exception.filter";
import { ResponseEnvelopeInterceptor } from "../src/shared/common/interceptors/response-envelope.interceptor";
import { AppConfigService } from "../src/shared/config/app-config.service";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { RedisStoreService } from "../src/shared/redis/redis-store.service";
import { PrismaE2eStub } from "./prisma-e2e-stub";
import { RedisStoreE2eStub } from "./redis-store.e2e-stub";

interface TestAppContext {
  app: INestApplication;
  close: () => Promise<void>;
  uploadRootPath: string;
}

type TestHttpServer = ReturnType<INestApplication["getHttpServer"]>;

describe("Batch D slice acceptance (e2e)", () => {
  let appContext: TestAppContext | null = null;

  afterEach(async () => {
    const uploadRootPath = appContext?.uploadRootPath;
    await appContext?.close();
    appContext = null;
    if (uploadRootPath) {
      rmSync(uploadRootPath, { recursive: true, force: true });
    }
  });

  async function bootstrapApp(
    envOverrides: Record<string, string | undefined> = {},
  ): Promise<TestAppContext> {
    const previousEnv = new Map<string, string | undefined>();
    const uploadRootPath = mkdtempSync(join(tmpdir(), "saifute-batch-d-"));
    const mergedOverrides = {
      ...envOverrides,
      UPLOAD_ROOT_PATH: uploadRootPath,
    };

    for (const [key, value] of Object.entries(mergedOverrides)) {
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

    const app = moduleRef.createNestApplication();
    const reflector = app.get(Reflector);
    const appConfigService = app.get(AppConfigService);
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(reflector));
    mkdirSync(appConfigService.uploadRootPath, { recursive: true });
    app
      .getHttpAdapter()
      .getInstance()
      .use("/profile", expressStatic(appConfigService.uploadRootPath));
    await app.init();

    return {
      app,
      uploadRootPath,
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
    username: string,
    password: string,
    expectedStatus = 201,
  ) {
    const { captchaId, captchaCode } = await getCaptcha(server);
    return request(server)
      .post("/api/auth/login")
      .send({
        username,
        password,
        captchaId,
        captchaCode,
      })
      .expect(expectedStatus);
  }

  it("should record login success, failure, and logout audit entries", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();

    const adminLogin = await login(server, "admin", "admin123");
    const firstToken = adminLogin.body.data.accessToken as string;

    await login(server, "admin", "wrong-password", 401);

    await request(server)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${firstToken}`)
      .expect(201);

    const secondLogin = await login(server, "admin", "admin123");
    const secondToken = secondLogin.body.data.accessToken as string;

    const auditResponse = await request(server)
      .get("/api/audit/login-logs")
      .set("Authorization", `Bearer ${secondToken}`)
      .expect(200);

    const items = auditResponse.body.data.items as Array<{ message: string }>;
    expect(items.some((item) => item.message === "登录成功")).toBe(true);
    expect(items.some((item) => item.message === "用户名或密码错误")).toBe(
      true,
    );
    expect(items.some((item) => item.message === "退出成功")).toBe(true);
  });

  it("should keep login flow working when login audit persistence fails", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const prisma = appContext.app.get<PrismaE2eStub>(PrismaService);
    prisma.loginLog.create = jest.fn().mockRejectedValue(new Error("boom"));

    const response = await login(server, "admin", "admin123");

    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeTruthy();
  });

  it("should only persist operation logs for annotated endpoints and redact secrets", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await request(server)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("hello world"), "note.txt")
      .expect(201);

    const operLogResponse = await request(server)
      .get("/api/audit/oper-logs")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const items = operLogResponse.body.data.items as Array<{
      title: string;
      requestParams: string;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("普通文件上传");
    expect(items[0]?.requestParams).toContain("[REDACTED]");
    expect(items[0]?.requestParams).not.toContain(token);
  });

  it("should preserve public profile URLs and reject invalid download paths", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const uploadResponse = await request(server)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("public-content"), "public.txt")
      .expect(201);

    const fileUrl = uploadResponse.body.data.url as string;
    expect(fileUrl.startsWith("/profile/upload/")).toBe(true);

    const publicResponse = await request(server).get(fileUrl).expect(200);
    expect(publicResponse.text).toBe("public-content");

    await request(server)
      .get("/api/files/download")
      .set("Authorization", `Bearer ${token}`)
      .query({ path: "../../secrets.txt" })
      .expect(400);
  });

  it("should reject unsupported file extensions", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    await request(server)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("bad"), "script.exe")
      .expect(400);
  });

  it("should update avatar files and surface avatarUrl from /auth/me", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const firstAvatar = await request(server)
      .post("/api/files/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("avatar", Buffer.from("avatar-a"), "avatar-a.png")
      .expect(201);

    expect(firstAvatar.body.data.avatarUrl).toMatch(/^\/profile\/avatar\//);

    const secondAvatar = await request(server)
      .post("/api/files/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("avatar", Buffer.from("avatar-b"), "avatar-b.png")
      .expect(201);

    expect(secondAvatar.body.data.previousAvatarUrl).toBe(
      firstAvatar.body.data.avatarUrl,
    );

    const meResponse = await request(server)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(meResponse.body.data.avatarUrl).toBe(
      secondAvatar.body.data.avatarUrl,
    );
  });

  it("should export reporting data as a downloadable csv file", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const exportResponse = await request(server)
      .get("/api/reporting/export")
      .set("Authorization", `Bearer ${token}`)
      .query({ reportType: "INVENTORY_SUMMARY" })
      .expect(200);

    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    expect(exportResponse.headers["content-disposition"]).toContain(
      "attachment",
    );
    expect(exportResponse.text).toContain("materialCode");
  });

  it("should keep monthly reporting scoped for rd-sub users", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const rdLogin = await login(server, "rd-operator", "rd123456");
    const token = rdLogin.body.data.accessToken as string;

    await request(server)
      .get("/api/reporting/monthly-reporting")
      .set("Authorization", `Bearer ${token}`)
      .query({ yearMonth: "2026-04" })
      .expect(200);

    await request(server)
      .get("/api/reporting/monthly-reporting")
      .set("Authorization", `Bearer ${token}`)
      .query({ yearMonth: "2026-04", stockScope: "MAIN" })
      .expect(403);
  });

  it("should expose monthly reporting drill-down details with source-month evidence", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const prisma = appContext.app.get<PrismaE2eStub>(PrismaService);
    prisma.salesStockOrder.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 2,
          documentNo: "XSTH-QA-001",
          bizDate: new Date("2026-03-31T16:30:00.000Z"),
          createdAt: new Date("2026-04-30T16:30:00.000Z"),
          orderType: SalesStockOrderType.SALES_RETURN,
          workshopId: 192,
          workshop: {
            workshopName: "装备车间",
          },
          stockScope: {
            scopeCode: "MAIN",
            scopeName: "主仓",
          },
          totalQty: new Prisma.Decimal("1"),
          totalAmount: new Prisma.Decimal("20"),
          lines: [
            {
              costAmount: new Prisma.Decimal("12.34"),
              sourceDocumentId: 1,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 1,
          bizDate: new Date("2026-03-31T15:30:00.000Z"),
          documentNo: "CK-QA-001",
        },
      ]);
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const detailResponse = await request(server)
      .get("/api/reporting/monthly-reporting/details")
      .set("Authorization", `Bearer ${token}`)
      .query({
        yearMonth: "2026-04",
        stockScope: "MAIN",
        topicKey: "SALES_RETURN",
        keyword: "CK-QA-001",
      })
      .expect(200);

    expect(detailResponse.body.data.total).toBe(1);
    expect(detailResponse.body.data.items[0]).toMatchObject({
      documentNo: "XSTH-QA-001",
      documentTypeLabel: "销售退货单",
      stockScopeName: "主仓",
      workshopName: "装备车间",
      amount: "20.00",
      cost: "12.34",
      abnormalLabels: ["补录影响", "跨月修正"],
      sourceBizMonth: "2026-03",
      sourceDocumentNo: "CK-QA-001",
    });
  });

  it("should expose material-category monthly reporting summary, line details, and export", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const prisma = appContext.app.get<PrismaE2eStub>(PrismaService);
    prisma.stockInOrderLine.findMany = jest.fn().mockResolvedValue([
      {
        id: 101,
        lineNo: 1,
        materialId: 501,
        materialCodeSnapshot: "M-RAW-001",
        materialNameSnapshot: "原料 A",
        materialSpecSnapshot: "25kg",
        unitCodeSnapshot: "KG",
        quantity: new Prisma.Decimal("3"),
        amount: new Prisma.Decimal("30"),
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: [
          { id: 10, categoryCode: "RAW", categoryName: "原料" },
          { id: 11, categoryCode: "CHEM", categoryName: "化工" },
        ],
        order: {
          id: 201,
          documentNo: "YS-001",
          bizDate: new Date("2026-04-05T00:00:00.000Z"),
          createdAt: new Date("2026-04-05T08:00:00.000Z"),
          orderType: "ACCEPTANCE",
          stockScope: {
            scopeCode: "MAIN",
            scopeName: "主仓",
          },
          workshopId: 192,
          workshopNameSnapshot: "装备车间",
          workshop: {
            workshopName: "装备车间",
          },
        },
      },
    ]);
    prisma.salesStockOrderLine.findMany = jest.fn().mockResolvedValue([
      {
        id: 301,
        lineNo: 2,
        materialId: 601,
        materialCodeSnapshot: "M-RAW-002",
        materialNameSnapshot: "原料 B",
        materialSpecSnapshot: "10kg",
        unitCodeSnapshot: "KG",
        quantity: new Prisma.Decimal("1"),
        amount: new Prisma.Decimal("8"),
        costAmount: new Prisma.Decimal("6"),
        salesProjectId: 701,
        salesProjectCodeSnapshot: "SP-701",
        salesProjectNameSnapshot: "销售项目 A",
        sourceDocumentId: 9001,
        materialCategoryIdSnapshot: 11,
        materialCategoryCodeSnapshot: "CHEM",
        materialCategoryNameSnapshot: "化工",
        materialCategoryPathSnapshot: JSON.stringify([
          { id: 10, categoryCode: "RAW", categoryName: "原料" },
          { id: 11, categoryCode: "CHEM", categoryName: "化工" },
        ]),
        order: {
          id: 401,
          documentNo: "XSTH-001",
          bizDate: new Date("2026-03-31T16:30:00.000Z"),
          createdAt: new Date("2026-04-30T16:30:00.000Z"),
          orderType: SalesStockOrderType.SALES_RETURN,
          stockScope: {
            scopeCode: "MAIN",
            scopeName: "主仓",
          },
          workshopId: 192,
          workshop: {
            workshopName: "装备车间",
          },
        },
      },
    ]);
    prisma.salesStockOrder.findMany = jest.fn().mockResolvedValue([
      {
        id: 9001,
        bizDate: new Date("2026-03-31T15:30:00.000Z"),
        documentNo: "CK-BASE-001",
      },
    ]);
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const summaryResponse = await request(server)
      .get("/api/reporting/monthly-reporting")
      .set("Authorization", `Bearer ${token}`)
      .query({
        yearMonth: "2026-04",
        viewMode: "MATERIAL_CATEGORY",
        stockScope: "MAIN",
      })
      .expect(200);

    expect(summaryResponse.body.data).toMatchObject({
      viewMode: "MATERIAL_CATEGORY",
      summary: {
        categoryCount: 1,
        lineCount: 2,
        acceptanceInboundAmount: "30.00",
        salesReturnAmount: "8.00",
        netAmount: "38.00",
      },
    });
    expect(summaryResponse.body.data.categories).toEqual([
      expect.objectContaining({
        nodeKey: "11:CHEM:化工",
        categoryId: 11,
        categoryCode: "CHEM",
        categoryName: "化工",
        acceptanceInboundAmount: "30.00",
        salesReturnAmount: "8.00",
      }),
    ]);

    const detailResponse = await request(server)
      .get("/api/reporting/monthly-reporting/details")
      .set("Authorization", `Bearer ${token}`)
      .query({
        yearMonth: "2026-04",
        viewMode: "MATERIAL_CATEGORY",
        stockScope: "MAIN",
        topicKey: "SALES_RETURN",
        keyword: "销售项目 A",
      })
      .expect(200);

    expect(detailResponse.body.data.total).toBe(1);
    expect(detailResponse.body.data.items[0]).toMatchObject({
      documentNo: "XSTH-001",
      lineNo: 2,
      categoryCode: "CHEM",
      categoryName: "化工",
      salesProjectCode: "SP-701",
      salesProjectName: "销售项目 A",
      abnormalLabels: ["补录影响", "跨月修正"],
      sourceBizMonth: "2026-03",
      sourceDocumentNo: "CK-BASE-001",
    });

    const exportResponse = await request(server)
      .post("/api/reporting/monthly-reporting/export")
      .set("Authorization", `Bearer ${token}`)
      .send({
        yearMonth: "2026-04",
        viewMode: "MATERIAL_CATEGORY",
        stockScope: "MAIN",
      })
      .expect(201);

    expect(exportResponse.headers["content-type"]).toContain(
      "application/vnd.ms-excel",
    );
    expect(exportResponse.text).toContain('<Worksheet ss:Name="分类汇总">');
    expect(exportResponse.text).toContain('<Worksheet ss:Name="单据行明细">');
    expect(exportResponse.text).toContain("化工");
    expect(exportResponse.text).not.toContain("分类路径");
    expect(exportResponse.text).not.toContain("层级");
  });

  it("should export monthly reporting data as a downloadable excel file", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const exportResponse = await request(server)
      .post("/api/reporting/monthly-reporting/export")
      .set("Authorization", `Bearer ${token}`)
      .send({ yearMonth: "2026-04" })
      .expect(201);

    expect(exportResponse.headers["content-type"]).toContain(
      "application/vnd.ms-excel",
    );
    expect(exportResponse.headers["content-disposition"]).toContain(
      "attachment",
    );
    expect(exportResponse.text).toContain("<Workbook");
  });

  it("should create, run, pause, resume, and list scheduler jobs", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const createResponse = await request(server)
      .post("/api/scheduler/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobName: "Noop smoke job",
        invokeTarget: "system.noop",
        cronExpression: "0 */5 * * * *",
      })
      .expect(201);

    const jobId = createResponse.body.data.id as number;

    await request(server)
      .post(`/api/scheduler/jobs/${jobId}/run`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const logsResponse = await request(server)
      .get("/api/scheduler/job-logs")
      .set("Authorization", `Bearer ${token}`)
      .query({ jobName: "Noop smoke job" })
      .expect(200);

    expect(logsResponse.body.data.total).toBe(1);
    expect(logsResponse.body.data.items[0].status).toBe("SUCCESS");

    const pauseResponse = await request(server)
      .post(`/api/scheduler/jobs/${jobId}/pause`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(pauseResponse.body.data.status).toBe("PAUSED");

    const resumeResponse = await request(server)
      .post(`/api/scheduler/jobs/${jobId}/resume`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(resumeResponse.body.data.status).toBe("ACTIVE");

    const jobsResponse = await request(server)
      .get("/api/scheduler/jobs")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(jobsResponse.body.data.total).toBe(1);
  });

  it("should reject unsupported scheduler invoke targets", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    await request(server)
      .post("/api/scheduler/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobName: "Bad job",
        invokeTarget: "system.unsupported",
        cronExpression: "0 */5 * * * *",
      })
      .expect(400);
  });

  it("should expose AI tools and stream SSE-compatible chat events", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const token = adminLogin.body.data.accessToken as string;

    const toolsResponse = await request(server)
      .get("/api/ai/tools")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(
      toolsResponse.body.data.items.some(
        (item: { name: string }) => item.name === "reporting.home",
      ),
    ).toBe(true);

    const chatResponse = await request(server)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: "请帮我查看首页看板",
        toolNames: ["reporting.home"],
      })
      .expect(200);

    expect(chatResponse.headers["content-type"]).toContain("text/event-stream");
    expect(chatResponse.text).toContain("event: ready");
    expect(chatResponse.text).toContain("event: tool-call");
    expect(chatResponse.text).toContain("reporting.home");
    expect(chatResponse.text).toContain("event: done");

    const operLogResponse = await request(server)
      .get("/api/audit/oper-logs")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const aiLog = (
      operLogResponse.body.data.items as Array<{
        title: string;
        requestParams: string;
      }>
    ).find((item) => item.title === "AI 对话");

    expect(aiLog).toBeDefined();
    expect(aiLog?.requestParams).toContain("messageLength");
    expect(aiLog?.requestParams).not.toContain("首页看板");
  });

  it("should reject unauthorized AI tool requests and audit the failure", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();
    const adminLogin = await login(server, "admin", "admin123");
    const adminToken = adminLogin.body.data.accessToken as string;
    const procurementLogin = await login(
      server,
      "procurement",
      "procurement123",
    );
    const procurementToken = procurementLogin.body.data.accessToken as string;

    await request(server)
      .post("/api/ai/chat")
      .set("Authorization", `Bearer ${procurementToken}`)
      .send({
        message: "请帮我查看首页看板",
        toolNames: ["reporting.home"],
      })
      .expect(403);

    const operLogResponse = await request(server)
      .get("/api/audit/oper-logs")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const failedAiLog = (
      operLogResponse.body.data.items as Array<{
        title: string;
        status: string;
        errorMessage: string;
      }>
    ).find(
      (item) =>
        item.title === "AI 对话" &&
        item.status === "FAILURE" &&
        item.errorMessage.includes("reporting.home"),
    );

    expect(failedAiLog).toBeDefined();
  });

  it("should require authentication for file upload and download endpoints", async () => {
    appContext = await bootstrapApp();
    const server = appContext.app.getHttpServer();

    await request(server)
      .post("/api/files/upload")
      .attach("file", Buffer.from("hello world"), "note.txt")
      .expect(401);

    await request(server)
      .get("/api/files/download")
      .query({ path: "upload/2026/03/15/note.txt" })
      .expect(401);
  });
});
