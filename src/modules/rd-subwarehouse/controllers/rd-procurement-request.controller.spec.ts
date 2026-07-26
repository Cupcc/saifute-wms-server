import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RdMaterialStatusEventType } from "../../../../generated/prisma/client";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RdProcurementItemService } from "../application/rd-procurement-item.service";
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
      workshopName: "研发小仓",
    },
  };

  const mainUser: SessionUserSnapshot = {
    userId: 2,
    username: "operator",
    displayName: "仓库管理员",
    roles: ["warehouse-manager"],
    permissions: [
      "rd:procurement-request:list",
      "rd:procurement-request:return-action",
    ],
    department: null,
    consoleMode: "default",
    workshopScope: {
      mode: "ALL",
      workshopId: null,
      workshopName: null,
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RdProcurementRequestController],
      providers: [
        {
          provide: RdProcurementItemService,
          useValue: {
            getSuggestionProjectWorkshopId: jest.fn().mockResolvedValue(6),
            listMaterialSuggestions: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
            listAcceptanceMaterialOptions: jest
              .fn()
              .mockResolvedValue({ items: [], total: 0 }),
          },
        },
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
            getStatusActionHistory: jest.fn().mockResolvedValue({
              id: 501,
              requestLineId: 11,
              eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
            }),
            reverseStatusAction: jest.fn().mockResolvedValue({ id: 1 }),
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
      "rd-operator",
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
      "operator",
    );
  });

  it("allows rd users to reverse non-return status histories", async () => {
    await controller.reverseStatusAction(1, 501, { reason: "误操作" }, rdUser);

    expect(workshopScopeService.assertWorkshopAccess).toHaveBeenCalledWith(
      rdUser,
      6,
    );
    expect(
      rdProcurementRequestService.getStatusActionHistory,
    ).toHaveBeenCalledWith(1, 501);
    expect(
      rdProcurementRequestService.reverseStatusAction,
    ).toHaveBeenCalledWith(1, 501, "误操作", "rd-operator");
  });

  it("rejects reversing a manual return history for rd daily users", async () => {
    rdProcurementRequestService.getStatusActionHistory.mockResolvedValueOnce({
      id: 501,
      requestLineId: 11,
      eventType: RdMaterialStatusEventType.MANUAL_RETURNED,
    } as Awaited<
      ReturnType<RdProcurementRequestService["getStatusActionHistory"]>
    >);

    await expect(
      controller.reverseStatusAction(1, 501, {}, rdUser),
    ).rejects.toThrow(ForbiddenException);

    expect(
      rdProcurementRequestService.reverseStatusAction,
    ).not.toHaveBeenCalled();
  });

  it("allows main-side users to reverse a manual return history", async () => {
    rdProcurementRequestService.getStatusActionHistory.mockResolvedValueOnce({
      id: 501,
      requestLineId: 11,
      eventType: RdMaterialStatusEventType.MANUAL_RETURNED,
    } as Awaited<
      ReturnType<RdProcurementRequestService["getStatusActionHistory"]>
    >);

    await controller.reverseStatusAction(
      1,
      501,
      { reason: "退回有误" },
      mainUser,
    );

    expect(
      rdProcurementRequestService.reverseStatusAction,
    ).toHaveBeenCalledWith(1, 501, "退回有误", "operator");
  });
});
