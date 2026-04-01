import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { MasterDataService } from "./master-data.service";

describe("MasterDataService", () => {
  it("ensures canonical workshops and stock scopes on module init", async () => {
    const repository = {
      ensureCanonicalWorkshops: jest.fn().mockResolvedValue(undefined),
      ensureCanonicalStockScopes: jest.fn().mockResolvedValue(undefined),
    } as unknown as MasterDataRepository;
    const service = new MasterDataService(repository);

    await service.onModuleInit();

    expect(repository.ensureCanonicalWorkshops).toHaveBeenCalledTimes(1);
    expect(repository.ensureCanonicalStockScopes).toHaveBeenCalledTimes(1);
  });
});
