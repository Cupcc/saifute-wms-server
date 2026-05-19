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
    repository.findActivePersonnelByIdentity.mockResolvedValue(null);
    repository.createPersonnel.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: "13800000000",
      workshopId: null,
      status: "ACTIVE",
    });

    const result = await service.create(
      { personnelName: " 张三 ", contactPhone: " 13800000000 " },
      "1",
    );

    expect(repository.findActivePersonnelByIdentity).toHaveBeenCalledWith({
      personnelName: "张三",
      contactPhone: "13800000000",
      workshopId: null,
    });
    expect(repository.createPersonnel).toHaveBeenCalledWith(
      {
        personnelName: "张三",
        contactPhone: "13800000000",
        workshopId: null,
      },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({
        personnelName: "张三",
        contactPhone: "13800000000",
      }),
    );
  });

  it("creates personnel with an optional workshop after validating it", async () => {
    const { repository, service } = createService();
    repository.findActivePersonnelByIdentity.mockResolvedValue(null);
    repository.findWorkshopById.mockResolvedValue({
      id: 2,
      workshopName: "装配车间",
      status: "ACTIVE",
    });
    repository.createPersonnel.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: null,
      workshopId: 2,
      status: "ACTIVE",
    });

    await service.create({ personnelName: "张三", workshopId: 2 }, "1");

    expect(repository.findWorkshopById).toHaveBeenCalledWith(2);
    expect(repository.createPersonnel).toHaveBeenCalledWith(
      {
        personnelName: "张三",
        contactPhone: null,
        workshopId: 2,
      },
      "1",
    );
  });

  it("rejects duplicate active personnel on create", async () => {
    const { repository, service } = createService();
    repository.findActivePersonnelByIdentity.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: null,
      workshopId: null,
      status: "ACTIVE",
    });

    await expect(
      service.create({ personnelName: "张三" }, "1"),
    ).rejects.toThrow("人员已存在: 张三");

    expect(repository.createPersonnel).not.toHaveBeenCalled();
  });

  it("updates personnel and allows clearing contactPhone", async () => {
    const { repository, service } = createService();
    repository.findPersonnelById.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: "13800000000",
      workshopId: null,
      status: "ACTIVE",
    });
    repository.findActivePersonnelByIdentity.mockResolvedValue(null);
    repository.updatePersonnel.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: null,
      status: "ACTIVE",
    });

    const result = await service.update(1, { contactPhone: null }, "1");

    expect(repository.findActivePersonnelByIdentity).toHaveBeenCalledWith({
      personnelName: "张三",
      contactPhone: null,
      workshopId: null,
      excludeId: 1,
    });
    expect(repository.updatePersonnel).toHaveBeenCalledWith(
      1,
      { contactPhone: null },
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({
        personnelName: "张三",
        contactPhone: null,
      }),
    );
  });

  it("updates personnel and allows clearing workshop", async () => {
    const { repository, service } = createService();
    repository.findPersonnelById.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      workshopId: 2,
      contactPhone: null,
      status: "ACTIVE",
    });
    repository.findActivePersonnelByIdentity.mockResolvedValue(null);
    repository.updatePersonnel.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      workshopId: null,
      status: "ACTIVE",
    });

    await service.update(1, { workshopId: null }, "1");

    expect(repository.findWorkshopById).not.toHaveBeenCalled();
    expect(repository.updatePersonnel).toHaveBeenCalledWith(
      1,
      { workshopId: null },
      "1",
    );
  });

  it("rejects duplicate active personnel on update", async () => {
    const { repository, service } = createService();
    repository.findPersonnelById.mockResolvedValue({
      id: 2,
      personnelName: "李四",
      contactPhone: null,
      workshopId: null,
      status: "ACTIVE",
    });
    repository.findActivePersonnelByIdentity.mockResolvedValue({
      id: 1,
      personnelName: "张三",
      contactPhone: null,
      workshopId: null,
      status: "ACTIVE",
    });

    await expect(
      service.update(2, { personnelName: "张三" }, "1"),
    ).rejects.toThrow("人员已存在: 张三");

    expect(repository.updatePersonnel).not.toHaveBeenCalled();
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
