import { Logger } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import type {
  CustomerSuggestionField,
  DistinctStringSourceDelegate,
  MaterialSuggestionField,
  PersonnelSuggestionField,
  SuggestionField,
  SuggestionSource,
  SupplierSuggestionField,
  WorkshopSuggestionField,
} from "./master-data-suggestion.types";

export class MasterDataSuggestionsRepository {
  private readonly logger = new Logger(MasterDataSuggestionsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMaterialSuggestionValues(
    field: MaterialSuggestionField,
    limit: number,
  ): Promise<string[]> {
    switch (field) {
      case "materialCode":
        return this.mergeSuggestionSources(
          [
            this.createDistinctStringSource(
              this.prisma.material,
              "materialCode",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.stockInOrderLine,
              "materialCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.salesStockOrderLine,
              "materialCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.workshopMaterialOrderLine,
              "materialCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProjectMaterialLine,
              "materialCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdHandoffOrderLine,
              "materialCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProcurementRequestLine,
              "materialCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdStocktakeOrderLine,
              "materialCodeSnapshot",
              limit,
            ),
          ],
          limit,
        );
      case "materialName":
        return this.mergeSuggestionSources(
          [
            this.createDistinctStringSource(
              this.prisma.material,
              "materialName",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.stockInOrderLine,
              "materialNameSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.salesStockOrderLine,
              "materialNameSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.workshopMaterialOrderLine,
              "materialNameSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProjectMaterialLine,
              "materialNameSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdHandoffOrderLine,
              "materialNameSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProcurementRequestLine,
              "materialNameSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdStocktakeOrderLine,
              "materialNameSnapshot",
              limit,
            ),
          ],
          limit,
        );
      case "specModel":
        return this.mergeSuggestionSources(
          [
            this.createDistinctStringSource(
              this.prisma.material,
              "specModel",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.stockInOrderLine,
              "materialSpecSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.salesStockOrderLine,
              "materialSpecSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.workshopMaterialOrderLine,
              "materialSpecSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProjectMaterialLine,
              "materialSpecSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdHandoffOrderLine,
              "materialSpecSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProcurementRequestLine,
              "materialSpecSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdStocktakeOrderLine,
              "materialSpecSnapshot",
              limit,
            ),
          ],
          limit,
        );
      case "unitCode":
        return this.mergeSuggestionSources(
          [
            this.createDistinctStringSource(
              this.prisma.material,
              "unitCode",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.stockInOrderLine,
              "unitCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.salesStockOrderLine,
              "unitCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.workshopMaterialOrderLine,
              "unitCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProjectMaterialLine,
              "unitCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdHandoffOrderLine,
              "unitCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdProcurementRequestLine,
              "unitCodeSnapshot",
              limit,
            ),
            this.createDistinctStringSource(
              this.prisma.rdStocktakeOrderLine,
              "unitCodeSnapshot",
              limit,
            ),
          ],
          limit,
        );
    }
  }

  async findCustomerSuggestionValues(
    field: CustomerSuggestionField,
    limit: number,
  ): Promise<string[]> {
    if (field === "customerCode") {
      return this.mergeSuggestionSources(
        [
          this.createDistinctStringSource(
            this.prisma.customer,
            "customerCode",
            limit,
          ),
          this.createDistinctStringSource(
            this.prisma.salesStockOrder,
            "customerCodeSnapshot",
            limit,
          ),
          this.createDistinctStringSource(
            this.prisma.rdProject,
            "customerCodeSnapshot",
            limit,
          ),
        ],
        limit,
      );
    }

    return this.mergeSuggestionSources(
      [
        this.createDistinctStringSource(
          this.prisma.customer,
          "customerName",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.salesStockOrder,
          "customerNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdProject,
          "customerNameSnapshot",
          limit,
        ),
      ],
      limit,
    );
  }

  async findSupplierSuggestionValues(
    field: SupplierSuggestionField,
    limit: number,
  ): Promise<string[]> {
    if (field === "supplierCode") {
      return this.mergeSuggestionSources(
        [
          this.createDistinctStringSource(
            this.prisma.supplier,
            "supplierCode",
            limit,
          ),
          this.createDistinctStringSource(
            this.prisma.stockInOrder,
            "supplierCodeSnapshot",
            limit,
          ),
          this.createDistinctStringSource(
            this.prisma.rdProject,
            "supplierCodeSnapshot",
            limit,
          ),
          this.createDistinctStringSource(
            this.prisma.rdProcurementRequest,
            "supplierCodeSnapshot",
            limit,
          ),
        ],
        limit,
      );
    }

    return this.mergeSuggestionSources(
      [
        this.createDistinctStringSource(
          this.prisma.supplier,
          "supplierName",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.stockInOrder,
          "supplierNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdProject,
          "supplierNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdProcurementRequest,
          "supplierNameSnapshot",
          limit,
        ),
      ],
      limit,
    );
  }

  async findWorkshopSuggestionValues(
    _field: WorkshopSuggestionField,
    limit: number,
  ): Promise<string[]> {
    return this.mergeSuggestionSources(
      [
        this.createDistinctStringSource(
          this.prisma.workshop,
          "workshopName",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.stockInOrder,
          "workshopNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.salesStockOrder,
          "workshopNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.workshopMaterialOrder,
          "workshopNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdProject,
          "workshopNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdProcurementRequest,
          "workshopNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdHandoffOrder,
          "sourceWorkshopNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdHandoffOrder,
          "targetWorkshopNameSnapshot",
          limit,
        ),
      ],
      limit,
    );
  }

  async findPersonnelSuggestionValues(
    _field: PersonnelSuggestionField,
    limit: number,
  ): Promise<string[]> {
    return this.mergeSuggestionSources(
      [
        this.createDistinctStringSource(
          this.prisma.personnel,
          "personnelName",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.stockInOrder,
          "handlerNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.salesStockOrder,
          "handlerNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.workshopMaterialOrder,
          "handlerNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdHandoffOrder,
          "handlerNameSnapshot",
          limit,
        ),
        this.createDistinctStringSource(
          this.prisma.rdProcurementRequest,
          "handlerNameSnapshot",
          limit,
        ),
      ],
      limit,
    );
  }

  private createDistinctStringSource<Field extends SuggestionField>(
    delegate: DistinctStringSourceDelegate<Field>,
    field: Field,
    limit: number,
  ): SuggestionSource<Field> {
    return {
      field,
      load: () =>
        Promise.resolve(
          delegate.findMany({
            select: { [field]: true } as Record<Field, true>,
            distinct: [field],
            orderBy: { [field]: "asc" } as Record<Field, Prisma.SortOrder>,
            take: limit,
          }),
        ),
    };
  }

  private async mergeSuggestionSources(
    sources: SuggestionSource[],
    limit: number,
  ): Promise<string[]> {
    const loadedSources = await Promise.all(
      sources.map(async (source) => {
        try {
          return {
            field: source.field,
            rows: await source.load(),
          };
        } catch (error) {
          if (!this.isIgnorableSuggestionSourceError(error)) {
            throw error;
          }

          const errorCode =
            error instanceof Prisma.PrismaClientKnownRequestError
              ? error.code
              : "unknown";
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Skipping field suggestion source "${source.field}" due to schema drift (${errorCode}): ${errorMessage}`,
          );

          return {
            field: source.field,
            rows: [],
          };
        }
      }),
    );

    const values = new Set<string>();
    for (const source of loadedSources) {
      for (const row of source.rows) {
        const rawValue = row[source.field];
        if (typeof rawValue !== "string") {
          continue;
        }
        const normalizedValue = rawValue.trim();
        if (!normalizedValue) {
          continue;
        }
        values.add(normalizedValue);
      }
    }

    return [...values]
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
      .slice(0, limit);
  }

  private isIgnorableSuggestionSourceError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    );
  }
}
