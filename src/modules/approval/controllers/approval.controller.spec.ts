import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { ApprovalService } from "../application/approval.service";
import { ApprovalModule } from "../approval.module";
import { ApprovalRepository } from "../infrastructure/approval.repository";

describe("ApprovalController", () => {
  let app: INestApplication;
  const approvalService = {
    getApprovalStatus: jest.fn(),
    getApprovalDocument: jest.fn(),
    listApprovals: jest.fn(),
    createOrRefreshApprovalDocument: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    reset: jest.fn(),
  };

  beforeEach(async () => {
    Object.values(approvalService).forEach((mockFn) => {
      mockFn.mockReset();
    });

    const moduleRef = await Test.createTestingModule({
      imports: [ApprovalModule],
    })
      .overrideProvider(ApprovalService)
      .useValue(approvalService)
      .overrideProvider(ApprovalRepository)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("serves the canonical approval status route", async () => {
    approvalService.getApprovalStatus.mockResolvedValue({
      auditStatus: "PENDING",
    });

    await request(app.getHttpServer())
      .get("/api/approval/documents/status")
      .query({ documentType: "StockInOrder", documentId: "101" })
      .expect(200)
      .expect({ auditStatus: "PENDING" });

    expect(approvalService.getApprovalStatus).toHaveBeenCalledTimes(1);
    expect(approvalService.getApprovalStatus).toHaveBeenCalledWith(
      "StockInOrder",
      101,
    );
  });

  it("serves the canonical approval create route", async () => {
    approvalService.createOrRefreshApprovalDocument.mockResolvedValue({
      id: 1,
      documentType: "StockInOrder",
    });

    const payload = {
      documentFamily: "STOCK_IN",
      documentType: "StockInOrder",
      documentId: 101,
      documentNumber: "SI-001",
      submittedBy: "9",
    };

    await request(app.getHttpServer())
      .post("/api/approval/documents")
      .send(payload)
      .expect(201)
      .expect({ id: 1, documentType: "StockInOrder" });

    expect(
      approvalService.createOrRefreshApprovalDocument,
    ).toHaveBeenCalledTimes(1);
    expect(
      approvalService.createOrRefreshApprovalDocument,
    ).toHaveBeenCalledWith({
      ...payload,
      createdBy: undefined,
      submittedBy: "9",
    });
  });
});
