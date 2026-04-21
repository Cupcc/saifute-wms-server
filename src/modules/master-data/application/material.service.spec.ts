import { BadRequestException } from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { createRepositoryMock } from "./master-data.service.test-support";
import { MaterialService } from "./material.service";

describe("MaterialService", () => {
  function createService() {
    const repository = createRepositoryMock();
    const service = new MaterialService(
      repository as unknown as MasterDataRepository,
    );

    return { repository, service };
  }

  it("lists materials with active-only filter by default", async () => {
    const { repository, service } = createService();
    repository.findMaterials.mockResolvedValue({ items: [], total: 0 });

    await service.list({ keyword: "电阻", limit: 20, offset: 0 });

    expect(repository.findMaterials).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
    );
  });

  it("blocks material deactivation when any positive balance row exists", async () => {
    const { repository, service } = createService();
    repository.findMaterialById.mockResolvedValue({
      id: 1,
      materialCode: "M-001",
      status: "ACTIVE",
    });
    repository.countPositiveInventoryBalanceRows.mockResolvedValue(1);

    await expect(service.deactivate(1, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateMaterial).not.toHaveBeenCalled();
  });

  it("blocks deactivation even when positive and negative rows offset to zero net", async () => {
    const { repository, service } = createService();
    repository.findMaterialById.mockResolvedValue({
      id: 1,
      materialCode: "M-001",
      status: "ACTIVE",
    });
    repository.countPositiveInventoryBalanceRows.mockResolvedValue(1);

    await expect(service.deactivate(1, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateMaterial).not.toHaveBeenCalled();
  });

  it("blocks material deactivation when effective document references exist", async () => {
    const { repository, service } = createService();
    repository.findMaterialById.mockResolvedValue({
      id: 1,
      materialCode: "M-001",
      status: "ACTIVE",
    });
    repository.countPositiveInventoryBalanceRows.mockResolvedValue(0);
    repository.countEffectiveDocumentReferences.mockResolvedValue(3);

    await expect(service.deactivate(1, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateMaterial).not.toHaveBeenCalled();
  });

  it("deactivates material when all guards pass", async () => {
    const { repository, service } = createService();
    repository.findMaterialById.mockResolvedValue({
      id: 1,
      materialCode: "M-001",
      status: "ACTIVE",
    });
    repository.countPositiveInventoryBalanceRows.mockResolvedValue(0);
    repository.countEffectiveDocumentReferences.mockResolvedValue(0);
    repository.updateMaterial.mockResolvedValue({
      id: 1,
      status: "DISABLED",
    });

    const result = await service.deactivate(1, "1");

    expect(repository.updateMaterial).toHaveBeenCalledWith(
      1,
      { status: "DISABLED" },
      "1",
    );
    expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
  });

  it("rejects material creation when category does not exist", async () => {
    const { repository, service } = createService();
    repository.findMaterialByCode.mockResolvedValue(null);
    repository.findMaterialCategoryById.mockResolvedValue(null);

    await expect(
      service.create({
        materialCode: "MAT-404",
        materialName: "不存在分类物料",
        unitCode: "个",
        categoryId: 999,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.createMaterial).not.toHaveBeenCalled();
  });

  it("rejects material creation when category is disabled", async () => {
    const { repository, service } = createService();
    repository.findMaterialByCode.mockResolvedValue(null);
    repository.findMaterialCategoryById.mockResolvedValue({
      id: 3,
      categoryCode: "CAT-3",
      categoryName: "停用分类",
      status: "DISABLED",
    });

    await expect(
      service.create({
        materialCode: "MAT-DISABLED-CAT",
        materialName: "停用分类物料",
        unitCode: "个",
        categoryId: 3,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.createMaterial).not.toHaveBeenCalled();
  });

  it("rejects material updates when category does not exist", async () => {
    const { repository, service } = createService();
    repository.findMaterialById.mockResolvedValue({
      id: 1,
      materialCode: "MAT-001",
      materialName: "测试物料",
      status: "ACTIVE",
    });
    repository.findMaterialCategoryById.mockResolvedValue(null);

    await expect(service.update(1, { categoryId: 777 }, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateMaterial).not.toHaveBeenCalled();
  });

  it("assigns the default uncategorized category on material create", async () => {
    const { repository, service } = createService();
    repository.findMaterialByCode.mockResolvedValue(null);
    repository.createMaterial.mockResolvedValue({
      id: 1,
      materialCode: "MAT-OPTIONAL-CAT",
      materialName: "可空分类物料",
      categoryId: 99,
      status: "ACTIVE",
    });

    await service.create({
      materialCode: "MAT-OPTIONAL-CAT",
      materialName: "可空分类物料",
      unitCode: "个",
    });

    expect(repository.findMaterialCategoryById).not.toHaveBeenCalled();
    expect(repository.ensureDefaultMaterialCategory).toHaveBeenCalledTimes(1);
    expect(repository.createMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 99,
      }),
      undefined,
    );
  });

  it("assigns the default uncategorized category when material update clears category", async () => {
    const { repository, service } = createService();
    repository.findMaterialById.mockResolvedValue({
      id: 1,
      materialCode: "MAT-001",
      materialName: "测试物料",
      status: "ACTIVE",
    });
    repository.updateMaterial.mockResolvedValue({
      id: 1,
      categoryId: 99,
      status: "ACTIVE",
    });

    await service.update(1, { categoryId: null }, "1");

    expect(repository.ensureDefaultMaterialCategory).toHaveBeenCalledTimes(1);
    expect(repository.updateMaterial).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        categoryId: 99,
      }),
      "1",
    );
  });

  it("creates AUTO_CREATED materials only when provenance is complete", async () => {
    const { repository, service } = createService();
    repository.findMaterialByCode.mockResolvedValue(null);
    repository.createAutoMaterial.mockResolvedValue({
      id: 9,
      materialCode: "M-AUTO",
      status: "ACTIVE",
      creationMode: "AUTO_CREATED",
      sourceDocumentType: "StockInOrder",
      sourceDocumentId: 5,
    });

    const result = await service.ensure(
      {
        materialCode: "M-AUTO",
        materialName: "自动补建物料",
        unitCode: "个",
        sourceDocumentType: "StockInOrder",
        sourceDocumentId: 5,
      },
      "1",
    );

    expect(repository.createAutoMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        materialCode: "M-AUTO",
        categoryId: 99,
        sourceDocumentType: "StockInOrder",
        sourceDocumentId: 5,
      }),
      "1",
    );
    expect(result).toEqual(
      expect.objectContaining({ creationMode: "AUTO_CREATED" }),
    );
  });

  it("rejects AUTO_CREATED materials without provenance", async () => {
    const { repository, service } = createService();
    repository.findMaterialByCode.mockResolvedValue(null);

    await expect(
      service.ensure({
        materialCode: "M-AUTO",
        materialName: "自动补建物料",
        unitCode: "个",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.createAutoMaterial).not.toHaveBeenCalled();
  });
});
