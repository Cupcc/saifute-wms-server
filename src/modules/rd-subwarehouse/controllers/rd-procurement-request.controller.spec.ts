import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RdProcurementRequestService } from "../application/rd-procurement-request.service";
import { RdProcurementRequestController } from "./rd-procurement-request.controller";

describe("RdProcurementRequestController", () => {
  let controller: RdProcurementRequestController;
  let rdProcurementRequestService: jest.Mocked<RdProcurementRequestService>;
  let workshopScopeService: jest.Mocked<WorkshopScopeService>;

  const rdUser: SessionUserSnapshot = {
    userId: 5,
    username: "rd-operator",
    displayName: "研发小仓管理员",
    roles: ["rd-operator"],
    permissions: [
      "rd:procurement-request:list",
      "rd:procurement-request:status-action",
    ],
    department: null,
    consoleMode: "rd-subwarehouse",
    workshopScope: {
      mode: "FIXED",
      workshopId: 6,
      workshopCode: "RD",
      workshopName: "研发小仓",
    },
  };

  const mainUser: SessionUserSnapshot = {
    userId: 2,
    username: "operator",
    displayName: "仓库操作员",
    roles: ["operator"],
    permissions: [
      "rd:procurement-request:list",
      "rd:procurement-request:return-action",
    ],
    department: null,
    consoleMode: "default",
    workshopScope: {
      mode: "ALL",
      workshopId: null,
      workshopCode: null,
      workshopName: null,
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RdProcurementRequestController],
      providers: [
        {
          provide: RdProcurementRequestService,
          useValue: {
            listRequests: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            getRequestById: jest.fn().mockResolvedValue({
              id: 1,
              workshopId: 6,
            }),
            createRequest: jest.fn().mockResolvedValue({ id: 1 }),
            voidRequest: jest.fn().mockResolvedValue({ id: 1 }),
            applyStatusAction: jest.fn().mockResolvedValue({ id: 1 }),
          },
        },
        {
          provide: WorkshopScopeService,
          useValue: {
            resolveQueryWorkshopId: jest.fn().mockResolvedValue(6),
            assertWorkshopAccess: jest.fn().mockResolvedValue(undefined),
            applyFixedWorkshopScope: jest
              .fn()
              .mockImplementation(async (_user, dto) => dto),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(RdProcurementRequestController);
    rdProcurementRequestService = moduleRef.get(RdProcurementRequestService);
    workshopScopeService = moduleRef.get(WorkshopScopeService);
  });

  it("resolves workshop scope when listing requests", async () => {
    await controller.listRequests(
      { workshopId: 999, limit: 10, offset: 0 },
      rdUser,
    );

    expect(workshopScopeService.resolveQueryWorkshopId).toHaveBeenCalledWith(
      rdUser,
      999,
    );
    expect(rdProcurementRequestService.listRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        workshopId: 6,
        limit: 10,
        offset: 0,
      }),
    );
  });

  it("allows rd users to execute non-return status actions", async () => {
    await controller.applyStatusAction(
      1,
      {
        actionType: "PROCUREMENT_STARTED",
        lineId: 11,
        quantity: "2",
      },
      rdUser,
    );

    expect(workshopScopeService.assertWorkshopAccess).toHaveBeenCalledWith(
      rdUser,
      6,
    );
    expect(rdProcurementRequestService.applyStatusAction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        actionType: "PROCUREMENT_STARTED",
        lineId: 11,
        quantity: "2",
      }),
      "5",
    );
  });

  it("rejects manual return for rd daily users", async () => {
    await expect(
      controller.applyStatusAction(
        1,
        {
          actionType: "MANUAL_RETURNED",
          lineId: 11,
          quantity: "1",
          referenceNo: "RET-001",
          reason: "主仓退回",
        },
        rdUser,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(
      rdProcurementRequestService.applyStatusAction,
    ).not.toHaveBeenCalled();
  });

  it("allows main-side users to execute manual return", async () => {
    await controller.applyStatusAction(
      1,
      {
        actionType: "MANUAL_RETURNED",
        lineId: 11,
        quantity: "1",
        referenceNo: "RET-001",
        reason: "主仓退回",
      },
      mainUser,
    );

    expect(rdProcurementRequestService.applyStatusAction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        actionType: "MANUAL_RETURNED",
        lineId: 11,
        quantity: "1",
      }),
      "2",
    );
  });
});
