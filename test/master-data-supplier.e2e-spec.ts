import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { setupApp } from "../src/app.setup";
import { PrismaService } from "../src/shared/prisma/prisma.service";
import { RedisStoreService } from "../src/shared/redis/redis-store.service";
import { PrismaE2eStub } from "./prisma-e2e-stub";
import { RedisStoreE2eStub } from "./redis-store.e2e-stub";

type TestHttpServer = ReturnType<NestExpressApplication["getHttpServer"]>;

describe("Master-data supplier CRUD (e2e)", () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useClass(PrismaE2eStub)
      .overrideProvider(RedisStoreService)
      .useClass(RedisStoreE2eStub)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

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

  it("allows admin to create, update, deactivate, and still read supplier details", async () => {
    const server = app.getHttpServer();
    const loginResponse = await login(server, "admin", "admin123");
    const accessToken = loginResponse.body.data.accessToken as string;

    const createResponse = await request(server)
      .post("/api/master-data/suppliers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        supplierCode: "SUP-001",
        supplierName: "赛福特供应商",
        contactPerson: "张三",
        contactPhone: "13800000000",
        address: "苏州工业园区",
      })
      .expect(201);

    const supplierId = createResponse.body.data.id as number;
    expect(createResponse.body.data.supplierCode).toBe("SUP-001");
    expect(createResponse.body.data.supplierName).toBe("赛福特供应商");
    expect(createResponse.body.data.contactPhone).toBe("13800000000");

    await request(server)
      .post("/api/master-data/suppliers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        supplierCode: "SUP-001",
        supplierName: "重复供应商",
      })
      .expect(409);

    const updateResponse = await request(server)
      .patch(`/api/master-data/suppliers/${supplierId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        supplierCode: "SUP-002",
        supplierName: "更新后供应商",
        contactPerson: "李四",
        contactPhone: "13900000000",
        address: "上海市闵行区",
      })
      .expect(200);

    expect(updateResponse.body.data.supplierCode).toBe("SUP-002");
    expect(updateResponse.body.data.supplierName).toBe("更新后供应商");
    expect(updateResponse.body.data.contactPerson).toBe("李四");

    const listResponse = await request(server)
      .get("/api/master-data/suppliers")
      .query({
        keyword: "更新后",
        limit: 20,
        offset: 0,
      })
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(listResponse.body.data.total).toBe(1);
    expect(listResponse.body.data.items[0].supplierCode).toBe("SUP-002");
    expect(listResponse.body.data.items[0].contactPhone).toBe("13900000000");

    await request(server)
      .patch(`/api/master-data/suppliers/${supplierId}/deactivate`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const filteredListResponse = await request(server)
      .get("/api/master-data/suppliers")
      .query({
        keyword: "更新后",
        limit: 20,
        offset: 0,
      })
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(filteredListResponse.body.data.total).toBe(0);
    expect(filteredListResponse.body.data.items).toEqual([]);

    const historyListResponse = await request(server)
      .get("/api/master-data/suppliers")
      .query({
        keyword: "更新后",
        includeDisabled: true,
        limit: 20,
        offset: 0,
      })
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(historyListResponse.body.data.total).toBe(1);
    expect(historyListResponse.body.data.items[0].status).toBe("DISABLED");

    const detailResponse = await request(server)
      .get(`/api/master-data/suppliers/${supplierId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(detailResponse.body.data.supplierCode).toBe("SUP-002");
    expect(detailResponse.body.data.status).toBe("DISABLED");
    expect(detailResponse.body.data.address).toBe("上海市闵行区");
  });

  it("forbids supplier creation for rd-operator accounts that do not hold the create permission", async () => {
    const server = app.getHttpServer();
    const loginResponse = await login(server, "rd-operator", "rd123456");
    const accessToken = loginResponse.body.data.accessToken as string;

    await request(server)
      .post("/api/master-data/suppliers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        supplierCode: "SUP-403",
        supplierName: "无权创建供应商",
      })
      .expect(403);
  });
});
