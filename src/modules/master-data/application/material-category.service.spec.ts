import { BadRequestException, ConflictException } from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { createRepositoryMock } from "./master-data.service.test-support";
import { MaterialCategoryService } from "./material-category.service";

describe("MaterialCategoryService", () => {
  function createService() {
    const repository = createRepositoryMock();
    const service = new MaterialCategoryService(
      repository as unknown as MasterDataRepository,
    );

    return { repository, service };
  }

  it("lists material categories with active-only filter by default", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategories.mockResolvedValue({
      items: [],
      total: 0,
    });

    await service.list({
      keyword: "电子",
      limit: 20,
      offset: 0,
    });

    expect(repository.findMaterialCategories).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
    );
  });

  it("includes disabled categories when opt-in", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategories.mockResolvedValue({
      items: [],
      total: 0,
    });

    await service.list({
      includeDisabled: true,
      limit: 10,
      offset: 0,
    });

    expect(repository.findMaterialCategories).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });

  it("creates a material category after unique-code check", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategoryByCode.mockResolvedValue(null);
    repository.createMaterialCategory.mockResolvedValue({
      id: 1,
      categoryCode: "ELEC",
      categoryName: "电子元器件",
      status: "ACTIVE",
    });

    const result = await service.create(
      { categoryCode: "ELEC", categoryName: "电子元器件" },
      "1",
    );

    expect(repository.findMaterialCategoryByCode).toHaveBeenCalledWith("ELEC");
    expect(repository.createMaterialCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryCode: "ELEC",
        categoryName: "电子元器件",
      }),
      "1",
    );
    expect(result).toEqual(expect.objectContaining({ categoryCode: "ELEC" }));
  });

  it("rejects duplicate category codes on create", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategoryByCode.mockResolvedValue({
      id: 1,
      categoryCode: "ELEC",
    });

    await expect(
      service.create({
        categoryCode: "ELEC",
        categoryName: "重复",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("blocks renaming the default uncategorized category", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategoryById.mockResolvedValue({
      id: 99,
      categoryCode: "UNCATEGORIZED",
      categoryName: "未分类",
      status: "ACTIVE",
    });

    await expect(
      service.update(99, { categoryName: "其它分类" }, "1"),
    ).rejects.toThrow(BadRequestException);
    expect(repository.updateMaterialCategory).not.toHaveBeenCalled();
  });

  it("blocks deactivating the default uncategorized category", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategoryById.mockResolvedValue({
      id: 99,
      categoryCode: "UNCATEGORIZED",
      categoryName: "未分类",
      status: "ACTIVE",
    });

    await expect(service.deactivate(99, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateMaterialCategory).not.toHaveBeenCalled();
  });

  it("blocks deactivation when active materials reference the category", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategoryById.mockResolvedValue({
      id: 1,
      categoryCode: "ELEC",
      status: "ACTIVE",
    });
    repository.countActiveMaterialsByCategory.mockResolvedValue(5);

    await expect(service.deactivate(1, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateMaterialCategory).not.toHaveBeenCalled();
  });

  it("deactivates a material category when guards pass", async () => {
    const { repository, service } = createService();
    repository.findMaterialCategoryById.mockResolvedValue({
      id: 1,
      categoryCode: "ELEC",
      status: "ACTIVE",
    });
    repository.countActiveMaterialsByCategory.mockResolvedValue(0);
    repository.updateMaterialCategory.mockResolvedValue({
      id: 1,
      status: "DISABLED",
    });

    const result = await service.deactivate(1, "1");

    expect(repository.updateMaterialCategory).toHaveBeenCalledWith(
      1,
      { status: "DISABLED" },
      "1",
    );
    expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
  });
});
