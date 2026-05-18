import { WorkshopMaterialOrderType } from "../../../../generated/prisma/client";
import {
  createMocks,
  createSharedService,
  type WorkshopMaterialMocks,
} from "./workshop-material.service.test-support";

describe("WorkshopMaterialSharedService / document numbers", () => {
  let mocks: WorkshopMaterialMocks;
  let service: ReturnType<typeof createSharedService>;

  beforeEach(() => {
    mocks = createMocks();
    service = createSharedService(mocks);
  });

  it("creates return document numbers as TL + biz date + three-digit daily sequence", async () => {
    const result = await service.createWithDocumentNo(
      WorkshopMaterialOrderType.RETURN,
      new Date("2026-02-07"),
      async (documentNo) => documentNo,
    );

    expect(result).toBe("TL20260207001");
    expect(
      mocks.documentNumberRepository.findDocumentNosByOrderTypeAndStem,
    ).toHaveBeenCalledWith(
      WorkshopMaterialOrderType.RETURN,
      "TL20260207",
      expect.anything(),
    );
  });

  it("continues the short daily sequence while ignoring legacy timestamp numbers", async () => {
    (
      mocks.documentNumberRepository
        .findDocumentNosByOrderTypeAndStem as jest.Mock
    ).mockResolvedValue(["TL20260207001", "TL20260207140107018"]);

    const result = await service.createWithDocumentNo(
      WorkshopMaterialOrderType.RETURN,
      new Date("2026-02-07"),
      async (documentNo) => documentNo,
    );

    expect(result).toBe("TL20260207002");
  });
});
