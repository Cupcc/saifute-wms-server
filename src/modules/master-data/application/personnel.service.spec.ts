import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { createRepositoryMock } from "./master-data.service.test-support";
import { PersonnelService } from "./personnel.service";

describe("PersonnelService", () => {
  function createService() {
    const repository = createRepositoryMock();
    const service = new PersonnelService(
      repository as unknown as MasterDataRepository,
    );
    return { repository, service };
  }

  it("lists personnel with active-only filter by default", async () => {
    const { repository, service } = createService();
    repository.findPersonnel.mockResolvedValue({ items: [], total: 0 });

    await service.list({ keyword: "张", limit: 20, offset: 0 });

    expect(repository.findPersonnel).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
    );
  });

  it("creates a personnel record", async () => {
    const { repository, service } = createService();
    repository.createPersonnel.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: "13800000000",
      status: "ACTIVE",
    });

    const result = await service.create(
      { personnelName: "张三", contactPhone: "13800000000" },
      "1",
    );

    expect(repository.createPersonnel).toHaveBeenCalledWith(
      { personnelName: "张三", contactPhone: "13800000000" },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({
        personnelName: "张三",
        contactPhone: "13800000000",
      }),
    );
  });

  it("updates personnel and allows clearing contactPhone", async () => {
    const { repository, service } = createService();
    repository.findPersonnelById.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: "13800000000",
      status: "ACTIVE",
    });
    repository.updatePersonnel.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: null,
      status: "ACTIVE",
    });

    const result = await service.update(1, { contactPhone: null }, "1");

    expect(repository.updatePersonnel).toHaveBeenCalledWith(
      1,
      { personnelName: undefined, contactPhone: null },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({
        personnelName: "张三",
        contactPhone: null,
      }),
    );
  });

  it("deactivates active personnel", async () => {
    const { repository, service } = createService();
    repository.findPersonnelById.mockResolvedValue({
      id: 1,
      status: "ACTIVE",
    });
    repository.updatePersonnel.mockResolvedValue({
      id: 1,
      status: "DISABLED",
    });

    const result = await service.deactivate(1, "1");

    expect(repository.updatePersonnel).toHaveBeenCalledWith(
      1,
      { status: "DISABLED" },
      "1",
    );
    expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
  });

  it("returns already-disabled personnel without extra update", async () => {
    const { repository, service } = createService();
    repository.findPersonnelById.mockResolvedValue({
      id: 1,
      status: "DISABLED",
    });

    await service.deactivate(1, "1");

    expect(repository.updatePersonnel).not.toHaveBeenCalled();
  });
});
