import { BadRequestException } from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";
import { FieldSuggestionsService } from "./field-suggestions.service";
import { createRepositoryMock } from "./master-data.service.test-support";

describe("FieldSuggestionsService", () => {
  function createService() {
    const repository = createRepositoryMock();
    const service = new FieldSuggestionsService(
      repository as unknown as MasterDataRepository,
    );

    return { repository, service };
  }

  it("returns required permission by scope", () => {
    const { service } = createService();

    expect(service.getRequiredPermission("material")).toBe(
      "master:material:list",
    );
    expect(service.getRequiredPermission("personnel")).toBe(
      "master:personnel:list",
    );
  });

  it("returns material suggestions from repository", async () => {
    const { repository, service } = createService();
    repository.findMaterialSuggestionValues.mockResolvedValue(["PCS", "套"]);

    await expect(
      service.getSuggestions("material", "unitCode"),
    ).resolves.toEqual(["PCS", "套"]);

    expect(repository.findMaterialSuggestionValues).toHaveBeenCalledWith(
      "unitCode",
      200,
    );
  });

  it("returns personnel suggestions from repository", async () => {
    const { repository, service } = createService();
    repository.findPersonnelSuggestionValues.mockResolvedValue(["张三"]);

    await expect(
      service.getSuggestions("personnel", "personnelName"),
    ).resolves.toEqual(["张三"]);

    expect(repository.findPersonnelSuggestionValues).toHaveBeenCalledWith(
      "personnelName",
      200,
    );
  });

  it("rejects unsupported suggestion fields", async () => {
    const { service } = createService();

    await expect(
      service.getSuggestions("material", "supplierName"),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects unsupported suggestion scopes", async () => {
    const { service } = createService();

    expect(() => service.getRequiredPermission("unknown")).toThrow(
      BadRequestException,
    );
    await expect(service.getSuggestions("unknown", "value")).rejects.toThrow(
      BadRequestException,
    );
  });
});
