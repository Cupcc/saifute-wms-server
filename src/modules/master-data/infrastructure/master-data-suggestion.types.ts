import type { Prisma } from "../../../../generated/prisma/client";

export type MaterialSuggestionField =
  | "unitCode"
  | "specModel"
  | "materialName"
  | "materialCode";
export type CustomerSuggestionField = "customerCode" | "customerName";
export type SupplierSuggestionField = "supplierCode" | "supplierName";
export type WorkshopSuggestionField = "workshopName";
export type PersonnelSuggestionField = "personnelName";
export type SuggestionField = string;

export type SuggestionSource<Field extends SuggestionField = SuggestionField> =
  {
    field: Field;
    load: () => Promise<Array<Record<Field, string | null | undefined>>>;
  };

export type DistinctStringSourceDelegate<Field extends SuggestionField> = {
  findMany: (args: {
    select: Record<Field, true>;
    distinct: [Field];
    orderBy: Record<Field, Prisma.SortOrder>;
    take: number;
  }) => PromiseLike<Array<Record<Field, string | null | undefined>>>;
};
