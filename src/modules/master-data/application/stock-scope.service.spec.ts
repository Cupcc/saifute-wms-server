import { BadRequestException, ConflictException } from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { createRepositoryMock } from "./master-data.service.test-support";
import { StockScopeService } from "./stock-scope.service";

describe("StockScopeService", () => {
  function createService() {
    const repository = createRepositoryMock();
    const service = new StockScopeService(
      repository as unknown as MasterDataRepository,
    );
    return { repository, service };
  }

  it("lists stock scopes with active-only filter by default", async () => {
    const { repository, service } = createService();
    repository.findStockScopes.mockResolvedValue({ items: [], total: 0 });

    await service.list({ limit: 20, offset: 0 });

    expect(repository.findStockScopes).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
    );
  });

  it("creates a stock scope after unique-code check", async () => {
    const { repository, service } = createService();
    repository.findStockScopeByCode.mockResolvedValue(null);
    repository.createStockScope.mockResolvedValue({
      id: 1,
      scopeCode: "TEST",
      scopeName: "测试仓",
      status: "ACTIVE",
    });

    const result = await service.create(
      { scopeCode: "TEST", scopeName: "测试仓" },
      "1",
    );

    expect(repository.createStockScope).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ scopeCode: "TEST" }));
  });

  it("rejects duplicate scope codes on create", async () => {
    const { repository, service } = createService();
    repository.findStockScopeByCode.mockResolvedValue({
      id: 1,
      scopeCode: "MAIN",
    });

    await expect(
      service.create({ scopeCode: "MAIN", scopeName: "重复" }),
    ).rejects.toThrow(ConflictException);
  });

  it("blocks stock scope deactivation when any positive balance row exists", async () => {
    const { repository, service } = createService();
    repository.findStockScopeById.mockResolvedValue({
      id: 1,
      scopeCode: "TEST",
      status: "ACTIVE",
    });
    repository.countPositiveStockScopeBalanceRows.mockResolvedValue(2);

    await expect(service.deactivate(1, "1")).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.updateStockScope).not.toHaveBeenCalled();
  });

  it("deactivates stock scope when balance is zero", async () => {
    const { repository, service } = createService();
    repository.findStockScopeById.mockResolvedValue({
      id: 1,
      scopeCode: "TEST",
      status: "ACTIVE",
    });
    repository.countPositiveStockScopeBalanceRows.mockResolvedValue(0);
    repository.updateStockScope.mockResolvedValue({
      id: 1,
      status: "DISABLED",
    });

    const result = await service.deactivate(1, "1");

    expect(repository.updateStockScope).toHaveBeenCalledWith(
      1,
      { status: "DISABLED" },
      "1",
    );
    expect(result).toEqual(expect.objectContaining({ status: "DISABLED" }));
  });

  it("rejects getByCode when the record is DISABLED", async () => {
    const { repository, service } = createService();
    repository.findStockScopeByCode.mockResolvedValue({
      id: 1,
      scopeCode: "MAIN",
      status: "DISABLED",
    });

    await expect(service.getByCode("MAIN")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("returns scope when it is ACTIVE", async () => {
    const { repository, service } = createService();
    repository.findStockScopeByCode.mockResolvedValue({
      id: 1,
      scopeCode: "MAIN",
      status: "ACTIVE",
    });

    const result = await service.getByCode("MAIN");
    expect(result).toEqual(expect.objectContaining({ scopeCode: "MAIN" }));
  });
});
