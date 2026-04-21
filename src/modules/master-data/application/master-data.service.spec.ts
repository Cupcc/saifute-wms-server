import {
  createMasterDataService,
  createRepositoryMock,
} from "./master-data.service.test-support";

describe("MasterDataService", () => {
  it("ensures canonical workshops and stock scopes on module init", async () => {
    const repository = createRepositoryMock();
    const service = createMasterDataService(repository);

    await service.onModuleInit();

    expect(repository.ensureCanonicalWorkshops).toHaveBeenCalledTimes(1);
    expect(repository.ensureCanonicalStockScopes).toHaveBeenCalledTimes(1);
    expect(repository.ensureDefaultMaterialCategory).toHaveBeenCalledTimes(1);
    expect(
      repository.assignDefaultCategoryToUncategorizedMaterials,
    ).toHaveBeenCalledWith(99);
  });
});
