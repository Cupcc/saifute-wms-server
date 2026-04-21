import { BadRequestException } from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { createRepositoryMock } from "./master-data.service.test-support";
import { WorkshopService } from "./workshop.service";

describe("WorkshopService", () => {
  function createService() {
    const repository = createRepositoryMock();
    const service = new WorkshopService(
      repository as unknown as MasterDataRepository,
    );
    return { repository, service };
  }

  it("lists workshops with active-only filter by default", async () => {
    const { repository, service } = createService();
    repository.findWorkshops.mockResolvedValue({ items: [], total: 0 });

    await service.list({ keyword: "车间", limit: 20, offset: 0 });

    expect(repository.findWorkshops).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
    );
  });

  it("creates a workshop with an optional default handler", async () => {
    const { repository, service } = createService();
    repository.findWorkshopByName.mockResolvedValue(null);
    repository.createWorkshop.mockResolvedValue({
      id: 1,
      workshopName: "装配车间",
      defaultHandlerPersonnelId: 20,
      status: "ACTIVE",
    });
    repository.findPersonnelById.mockResolvedValue({
      id: 20,
      personnelName: "张三",
      status: "ACTIVE",
    });

    const result = await service.create(
      { workshopName: "装配车间", defaultHandlerPersonnelId: 20 },
      "1",
    );

    expect(repository.createWorkshop).toHaveBeenCalledWith(
      {
        workshopName: "装配车间",
        defaultHandlerPersonnelId: 20,
      },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({
        workshopName: "装配车间",
        defaultHandlerPersonnelId: 20,
      }),
    );
  });

  it("updates workshop default handler when explicitly cleared", async () => {
    const { repository, service } = createService();
    repository.findWorkshopById.mockResolvedValue({
      id: 1,
      workshopName: "装配车间",
      defaultHandlerPersonnelId: 20,
      status: "ACTIVE",
    });
    repository.updateWorkshop.mockResolvedValue({
      id: 1,
      workshopName: "装配车间",
      defaultHandlerPersonnelId: null,
      status: "ACTIVE",
    });

    await service.update(1, { defaultHandlerPersonnelId: null }, "1");

    expect(repository.updateWorkshop).toHaveBeenCalledWith(
      1,
      { workshopName: undefined, defaultHandlerPersonnelId: null },
      "1",
    );
  });

  it("deactivates active workshops", async () => {
    const { repository, service } = createService();
    repository.findWorkshopById.mockResolvedValue({
      id: 1,
      workshopName: "装配车间",
      status: "ACTIVE",
    });
    repository.updateWorkshop.mockResolvedValue({
      id: 1,
      status: "DISABLED",
    });

    const result = await service.deactivate(1, "1");

    expect(repository.updateWorkshop).toHaveBeenCalledWith(
      1,
      { status: "DISABLED" },
      "1",
    );
    expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
  });

  it("rejects getByName when the matching record is DISABLED", async () => {
    const { repository, service } = createService();
    repository.findWorkshopByName.mockResolvedValue({
      id: 2,
      workshopName: "研发小仓",
      status: "DISABLED",
    });

    await expect(service.getByName("研发小仓")).rejects.toThrow(
      BadRequestException,
    );
  });
});
