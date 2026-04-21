import { BadRequestException, Injectable } from "@nestjs/common";
import { MasterDataRepository } from "../infrastructure/master-data.repository";

type FieldSuggestionScope =
  | "material"
  | "customer"
  | "supplier"
  | "workshop"
  | "personnel";

const FIELD_SUGGESTION_SCOPE_CONFIG = {
  material: {
    permission: "master:material:list",
    fields: new Set(["unitCode", "specModel", "materialName", "materialCode"]),
  },
  customer: {
    permission: "master:customer:list",
    fields: new Set(["customerCode", "customerName"]),
  },
  supplier: {
    permission: "master:supplier:list",
    fields: new Set(["supplierCode", "supplierName"]),
  },
  workshop: {
    permission: "master:workshop:list",
    fields: new Set(["workshopName"]),
  },
  personnel: {
    permission: "master:personnel:list",
    fields: new Set(["personnelName"]),
  },
} as const;

@Injectable()
export class FieldSuggestionsService {
  private static readonly FIELD_SUGGESTION_LIMIT = 200;

  constructor(private readonly repository: MasterDataRepository) {}

  getRequiredPermission(scope: string): string {
    return this.resolveScopeConfig(scope).permission;
  }

  async getSuggestions(scope: string, field: string): Promise<string[]> {
    const config = this.resolveScopeConfig(scope);
    if (!config.fields.has(field)) {
      throw new BadRequestException(`不支持的建议字段: ${field}`);
    }

    switch (scope as FieldSuggestionScope) {
      case "material":
        return this.repository.findMaterialSuggestionValues(
          field as "unitCode" | "specModel" | "materialName" | "materialCode",
          FieldSuggestionsService.FIELD_SUGGESTION_LIMIT,
        );
      case "customer":
        return this.repository.findCustomerSuggestionValues(
          field as "customerCode" | "customerName",
          FieldSuggestionsService.FIELD_SUGGESTION_LIMIT,
        );
      case "supplier":
        return this.repository.findSupplierSuggestionValues(
          field as "supplierCode" | "supplierName",
          FieldSuggestionsService.FIELD_SUGGESTION_LIMIT,
        );
      case "workshop":
        return this.repository.findWorkshopSuggestionValues(
          field as "workshopName",
          FieldSuggestionsService.FIELD_SUGGESTION_LIMIT,
        );
      case "personnel":
        return this.repository.findPersonnelSuggestionValues(
          field as "personnelName",
          FieldSuggestionsService.FIELD_SUGGESTION_LIMIT,
        );
    }
  }

  private resolveScopeConfig(scope: string) {
    const config =
      FIELD_SUGGESTION_SCOPE_CONFIG[
        scope as keyof typeof FIELD_SUGGESTION_SCOPE_CONFIG
      ];
    if (!config) {
      throw new BadRequestException(`不支持的建议范围: ${scope}`);
    }
    return config;
  }
}
