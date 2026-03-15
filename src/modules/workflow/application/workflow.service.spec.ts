import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentFamily,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { WorkflowRepository } from "../infrastructure/workflow.repository";
import { WorkflowService } from "./workflow.service";

describe("WorkflowService", () => {
  const mockAudit = {
    id: 1,
    documentFamily: DocumentFamily.STOCK_IN,
    documentType: "StockInOrder",
    documentId: 100,
    documentNumber: "SI-001",
    auditStatus: AuditStatusSnapshot.PENDING,
    submittedBy: "1",
    submittedAt: new Date(),
    decidedBy: null,
    decidedAt: null,
    rejectReason: null,
    resetCount: 0,
    lastResetAt: null,
    createdBy: "1",
    createdAt: new Date(),
    updatedBy: null,
    updatedAt: new Date(),
  };

  it("should create audit document", async () => {
    const created = {
      ...mockAudit,
      documentNumber: "SI-002",
    };
    const mockPrisma = {
      workflowAuditDocument: {
        upsert: jest.fn().mockResolvedValue(created),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn(),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    const result = await service.createOrRefreshAuditDocument({
      documentFamily: DocumentFamily.STOCK_IN,
      documentType: "StockInOrder",
      documentId: 101,
      documentNumber: "SI-002",
      submittedBy: "1",
      createdBy: "1",
    });

    expect(result).toEqual(created);
    expect(result.auditStatus).toBe(AuditStatusSnapshot.PENDING);
  });

  it("should reset audit state when refreshing an existing document", async () => {
    const refreshed = {
      ...mockAudit,
      auditStatus: AuditStatusSnapshot.PENDING,
      decidedBy: null,
      decidedAt: null,
      rejectReason: null,
      resetCount: 1,
      lastResetAt: new Date(),
    };
    const upsert = jest.fn().mockResolvedValue(refreshed);
    const mockPrisma = {
      workflowAuditDocument: {
        upsert,
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn(),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    await service.createOrRefreshAuditDocument({
      documentFamily: DocumentFamily.STOCK_IN,
      documentType: "StockInOrder",
      documentId: 100,
      documentNumber: "SI-001",
      submittedBy: "1",
      createdBy: "1",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          auditStatus: AuditStatusSnapshot.PENDING,
          decidedBy: null,
          decidedAt: null,
          rejectReason: null,
          resetCount: { increment: 1 },
          lastResetAt: expect.any(Date),
        }),
      }),
    );
  });

  it("should approve and transition to APPROVED", async () => {
    const approved = {
      ...mockAudit,
      auditStatus: AuditStatusSnapshot.APPROVED,
      decidedBy: "2",
      decidedAt: new Date(),
    };
    const mockPrisma = {
      workflowAuditDocument: {
        update: jest.fn().mockResolvedValue(approved),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn().mockResolvedValue(mockAudit),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    const result = await service.approve(1, "2");

    expect(result.auditStatus).toBe(AuditStatusSnapshot.APPROVED);
    expect(result.decidedBy).toBe("2");
  });

  it("should reject and transition to REJECTED", async () => {
    const rejected = {
      ...mockAudit,
      auditStatus: AuditStatusSnapshot.REJECTED,
      decidedBy: "2",
      decidedAt: new Date(),
      rejectReason: "不符合要求",
    };
    const mockPrisma = {
      workflowAuditDocument: {
        update: jest.fn().mockResolvedValue(rejected),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn().mockResolvedValue(mockAudit),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    const result = await service.reject(1, "不符合要求", "2");

    expect(result.auditStatus).toBe(AuditStatusSnapshot.REJECTED);
    expect(result.rejectReason).toBe("不符合要求");
  });

  it("should throw when approve non-PENDING audit", async () => {
    const approvedAudit = {
      ...mockAudit,
      auditStatus: AuditStatusSnapshot.APPROVED,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: { workflowAuditDocument: { update: jest.fn() } },
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn().mockResolvedValue(approvedAudit),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    await expect(service.approve(1, "2")).rejects.toThrow(BadRequestException);
  });

  it("should throw when audit not found for approve", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: { workflowAuditDocument: { update: jest.fn() } },
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    await expect(service.approve(999, "2")).rejects.toThrow(NotFoundException);
  });

  it("should reset audit to PENDING", async () => {
    const approvedAudit = {
      ...mockAudit,
      auditStatus: AuditStatusSnapshot.APPROVED,
      decidedBy: "2",
      decidedAt: new Date(),
    };
    const resetAudit = {
      ...approvedAudit,
      auditStatus: AuditStatusSnapshot.PENDING,
      decidedBy: null,
      decidedAt: null,
      rejectReason: null,
      resetCount: 1,
      lastResetAt: new Date(),
    };
    const mockPrisma = {
      workflowAuditDocument: {
        update: jest.fn().mockResolvedValue(resetAudit),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn().mockResolvedValue(approvedAudit),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    const result = await service.reset(1, "1");

    expect(result.auditStatus).toBe(AuditStatusSnapshot.PENDING);
    expect(result.resetCount).toBe(1);
  });

  it("should mark audit as NOT_REQUIRED", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockPrisma = {
      workflowAuditDocument: {
        updateMany,
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: WorkflowRepository,
          useValue: {
            findAuditByDocument: jest.fn(),
            findAuditById: jest.fn(),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(WorkflowService);
    const result = await service.markAuditNotRequired("StockInOrder", 100, "9");

    expect(result).toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        documentType: "StockInOrder",
        documentId: 100,
      },
      data: expect.objectContaining({
        auditStatus: AuditStatusSnapshot.NOT_REQUIRED,
        updatedBy: "9",
      }),
    });
  });
});
