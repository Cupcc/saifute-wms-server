import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller, Get } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { PrismaE2eStub } from "../../../../test/prisma-e2e-stub";
import { RedisStoreE2eStub } from "../../../../test/redis-store.e2e-stub";
import { ResponseEnvelopeInterceptor } from "../../../shared/common/interceptors/response-envelope.interceptor";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { SharedConfigModule } from "../../../shared/config/shared-config.module";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { RedisStoreService } from "../../../shared/redis/redis-store.service";
import { AuditLogModule } from "../../audit-log/audit-log.module";
import { AuditLogRepository } from "../../audit-log/infrastructure/audit-log.repository";
import { FileStorageModule } from "../file-storage.module";
import { registerFileStorageStaticAssets } from "../infrastructure/file-storage-static-assets";

@Controller()
class HealthController {
  @Get("health")
  getHealth() {
    return {
      status: "ok",
    };
  }
}

async function flushAuditEvents(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("FileStorageController", () => {
  let app: NestExpressApplication;
  let tempDirectory: string;
  const auditLogRepository = {
    createLoginLog: jest.fn(),
    createOperLog: jest.fn().mockResolvedValue({ id: 1 }),
    findLoginLogs: jest.fn(),
    findOperLogs: jest.fn(),
    deleteLoginLog: jest.fn(),
    clearLoginLogs: jest.fn(),
    deleteOperLog: jest.fn(),
    clearOperLogs: jest.fn(),
  };

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "wms-file-storage-"));
    Object.values(auditLogRepository).forEach((mockFn) => {
      if ("mockClear" in mockFn) {
        mockFn.mockClear();
      }
    });

    const moduleRef = await Test.createTestingModule({
      imports: [SharedConfigModule, AuditLogModule, FileStorageModule],
      controllers: [HealthController],
      providers: [ResponseEnvelopeInterceptor],
    })
      .overrideProvider(AuditLogRepository)
      .useValue(auditLogRepository)
      .overrideProvider(PrismaService)
      .useClass(PrismaE2eStub)
      .overrideProvider(RedisStoreService)
      .useClass(RedisStoreE2eStub)
      .overrideProvider(AppConfigService)
      .useValue({
        apiGlobalPrefix: "api",
        fileStorageRootPath: tempDirectory,
        profilePublicPrefix: "/profile",
        fileUploadMaxSizeBytes: 2048,
        fileAllowedExtensions: [".txt", ".png"],
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    const appConfigService = app.get(AppConfigService);
    app.setGlobalPrefix(appConfigService.apiGlobalPrefix);
    app.useGlobalInterceptors(app.get(ResponseEnvelopeInterceptor));
    await registerFileStorageStaticAssets(app, appConfigService);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it("uploads and downloads files, preserves /profile compatibility, and logs only annotated endpoints", async () => {
    const uploadResponse = await request(app.getHttpServer())
      .post("/api/files/upload")
      .field("password", "secret")
      .field("token", "abc123")
      .attach("file", Buffer.from("hello world"), "note.txt")
      .expect(201);

    await flushAuditEvents();

    expect(uploadResponse.body.data.url).toMatch(/^\/profile\/upload\//);
    expect(auditLogRepository.createOperLog).toHaveBeenCalledTimes(1);
    const uploadLog = auditLogRepository.createOperLog.mock.calls[0][0];
    const requestData = JSON.parse(uploadLog.requestData);
    expect(requestData.body.password).toBe("[REDACTED]");
    expect(requestData.body.token).toBe("[REDACTED]");
    expect(requestData.file.file).toBe("[FILE]");

    const downloadResponse = await request(app.getHttpServer())
      .get("/api/files/download")
      .query({ path: uploadResponse.body.data.relativePath })
      .expect(200);

    await flushAuditEvents();

    expect(Buffer.from(downloadResponse.body).toString("utf8")).toBe(
      "hello world",
    );
    expect(downloadResponse.headers["content-disposition"]).toContain(
      "attachment",
    );
    expect(auditLogRepository.createOperLog).toHaveBeenCalledTimes(2);
    const downloadLog = auditLogRepository.createOperLog.mock.calls[1][0];
    expect(downloadLog.responseData).toContain("[STREAMABLE_FILE]");
    expect(downloadLog.responseData).not.toContain(tempDirectory);

    await request(app.getHttpServer())
      .get(uploadResponse.body.data.url)
      .expect(200)
      .expect("hello world");

    await request(app.getHttpServer()).get("/api/health").expect(200);
    await flushAuditEvents();

    expect(auditLogRepository.createOperLog).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported uploads and blocks download traversal", async () => {
    await request(app.getHttpServer())
      .post("/api/files/upload")
      .attach("file", Buffer.from("boom"), "bad.exe")
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/files/download")
      .query({ path: "../secret.txt" })
      .expect(400);
  });

  it("keeps upload and download working when operation-log persistence fails", async () => {
    auditLogRepository.createOperLog.mockRejectedValue(new Error("audit down"));

    const uploadResponse = await request(app.getHttpServer())
      .post("/api/files/upload")
      .attach("file", Buffer.from("hello world"), "note.txt")
      .expect(201);

    await flushAuditEvents();

    await request(app.getHttpServer())
      .get("/api/files/download")
      .query({ path: uploadResponse.body.data.relativePath })
      .expect(200);

    await flushAuditEvents();

    expect(auditLogRepository.createOperLog).toHaveBeenCalledTimes(2);
  });
});
