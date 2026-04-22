import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type MaterialSuggestionField =
  | "unitCode"
  | "specModel"
  | "materialName"
  | "materialCode";
type CustomerSuggestionField = "customerCode" | "customerName";
type SupplierSuggestionField = "supplierCode" | "supplierName";
type WorkshopSuggestionField = "workshopName";
type PersonnelSuggestionField = "personnelName";

type SuggestionSource = {
  field: string;
  load: () => Promise<Array<Record<string, unknown>>>;
};

const SYSTEM_BOOTSTRAP_ACTOR = "system-bootstrap";
const LEGACY_BOOTSTRAP_WORKSHOP_NAMES = ["主仓", "研发小仓"] as const;
export const DEFAULT_MATERIAL_CATEGORY_CODE = "UNCATEGORIZED";
export const DEFAULT_MATERIAL_CATEGORY_NAME = "未分类";

const CANONICAL_WORKSHOPS = [
  {
    workshopName: "装备车间",
  },
  {
    workshopName: "硐室车间",
  },
  {
    workshopName: "配件车间",
  },
  {
    workshopName: "电子车间",
  },
] as const satisfies ReadonlyArray<
  Pick<Prisma.WorkshopCreateManyInput, "workshopName">
>;

const CANONICAL_STOCK_SCOPES: Prisma.StockScopeCreateManyInput[] = [
  {
    scopeCode: "MAIN",
    scopeName: "主仓",
    scopeType: "MAIN",
    status: "ACTIVE",
    createdBy: SYSTEM_BOOTSTRAP_ACTOR,
    updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
  },
  {
    scopeCode: "RD_SUB",
    scopeName: "研发小仓",
    scopeType: "RD_SUB",
    status: "ACTIVE",
    createdBy: SYSTEM_BOOTSTRAP_ACTOR,
    updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
  },
];

const DEFAULT_MATERIAL_CATEGORY: Prisma.MaterialCategoryUncheckedCreateInput = {
  categoryCode: DEFAULT_MATERIAL_CATEGORY_CODE,
  categoryName: DEFAULT_MATERIAL_CATEGORY_NAME,
  sortOrder: 9999,
  status: "ACTIVE",
  createdBy: SYSTEM_BOOTSTRAP_ACTOR,
  updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
};

type CanonicalWorkshop = (typeof CANONICAL_WORKSHOPS)[number];

const WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE = {
  defaultHandlerPersonnel: {
    select: {
      id: true,
      personnelName: true,
    },
  },
} as const satisfies Prisma.WorkshopInclude;

@Injectable()
export class MasterDataRepository {
  private readonly logger = new Logger(MasterDataRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureCanonicalWorkshops() {
    await this.prisma.$transaction(async (tx) => {
      for (const workshop of CANONICAL_WORKSHOPS) {
        await this.ensureCanonicalWorkshop(tx, workshop);
      }

      await tx.workshop.updateMany({
        where: {
          workshopName: { in: [...LEGACY_BOOTSTRAP_WORKSHOP_NAMES] },
          createdBy: SYSTEM_BOOTSTRAP_ACTOR,
          status: "ACTIVE",
        },
        data: {
          status: "DISABLED",
          updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
        },
      });
    });
  }

  async ensureCanonicalStockScopes() {
    await this.prisma.$transaction(async (tx) => {
      for (const stockScope of CANONICAL_STOCK_SCOPES) {
        await tx.stockScope.upsert({
          where: {
            scopeCode: stockScope.scopeCode,
          },
          update: {
            scopeName: stockScope.scopeName,
            scopeType: stockScope.scopeType,
            status: stockScope.status,
            updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
          },
          create: stockScope,
        });
      }
    });
  }

  async ensureDefaultMaterialCategory() {
    return this.prisma.materialCategory.upsert({
      where: {
        categoryCode: DEFAULT_MATERIAL_CATEGORY_CODE,
      },
      update: {
        categoryName: DEFAULT_MATERIAL_CATEGORY_NAME,
        sortOrder: DEFAULT_MATERIAL_CATEGORY.sortOrder,
        status: "ACTIVE",
        updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
      },
      create: DEFAULT_MATERIAL_CATEGORY,
    });
  }

  async assignDefaultCategoryToUncategorizedMaterials(categoryId: number) {
    return this.prisma.material.updateMany({
      where: {
        categoryId: null,
      },
      data: {
        categoryId,
        updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
      },
    });
  }

  private async ensureCanonicalWorkshop(
    tx: Prisma.TransactionClient,
    workshop: CanonicalWorkshop,
  ) {
    await tx.workshop.upsert({
      where: {
        workshopName: workshop.workshopName,
      },
      update: {
        status: "ACTIVE",
        updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
      },
      create: {
        workshopName: workshop.workshopName,
        status: "ACTIVE",
        createdBy: SYSTEM_BOOTSTRAP_ACTOR,
        updatedBy: SYSTEM_BOOTSTRAP_ACTOR,
      },
    });
  }

  // ─── Field Suggestions ──────────────────────────────────────────────────────

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

  private createDistinctStringSource(
    delegate: {
      findMany: (...args: any[]) => PromiseLike<Array<Record<string, unknown>>>;
    },
    field: string,
    limit: number,
  ): SuggestionSource {
    return {
      field,
      load: () =>
        Promise.resolve(
          delegate.findMany({
            select: { [field]: true },
            distinct: [field],
            orderBy: { [field]: "asc" },
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

  // ─── MaterialCategory ───────────────────────────────────────────────────────

  async findMaterialCategories(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.MaterialCategoryWhereInput["status"];
  }) {
    const where: Prisma.MaterialCategoryWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { categoryCode: { contains: params.keyword } },
        { categoryName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.materialCategory.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ sortOrder: "asc" }, { categoryCode: "asc" }],
      }),
      this.prisma.materialCategory.count({ where }),
    ]);

    return { items, total };
  }

  async findMaterialCategoryById(id: number) {
    return this.prisma.materialCategory.findUnique({
      where: { id },
    });
  }

  async findMaterialCategoryByCode(categoryCode: string) {
    return this.prisma.materialCategory.findUnique({
      where: { categoryCode },
    });
  }

  async createMaterialCategory(
    data: Pick<
      Prisma.MaterialCategoryUncheckedCreateInput,
      "categoryCode" | "categoryName" | "sortOrder"
    >,
    createdBy?: string,
  ) {
    return this.prisma.materialCategory.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateMaterialCategory(
    id: number,
    data: Prisma.MaterialCategoryUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.materialCategory.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async countActiveMaterialsByCategory(categoryId: number) {
    return this.prisma.material.count({
      where: { categoryId, status: "ACTIVE" },
    });
  }

  // ─── Material ────────────────────────────────────────────────────────────────

  async findMaterials(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.MaterialWhereInput["status"];
  }) {
    const where: Prisma.MaterialWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { materialCode: { contains: params.keyword } },
        { materialName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { materialCode: "asc" },
        include: { category: true },
      }),
      this.prisma.material.count({ where }),
    ]);

    return { items, total };
  }

  async findMaterialById(id: number) {
    return this.prisma.material.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  async findMaterialByCode(materialCode: string) {
    return this.prisma.material.findUnique({
      where: { materialCode },
    });
  }

  async createMaterial(
    data: Prisma.MaterialUncheckedCreateInput,
    createdBy?: string,
  ) {
    return this.prisma.material.create({
      data: {
        ...data,
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async createAutoMaterial(
    data: Pick<
      Prisma.MaterialUncheckedCreateInput,
      | "materialCode"
      | "materialName"
      | "unitCode"
      | "specModel"
      | "categoryId"
      | "sourceDocumentType"
      | "sourceDocumentId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.material.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateMaterial(
    id: number,
    data: Prisma.MaterialUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.material.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async countPositiveInventoryBalanceRows(materialId: number): Promise<number> {
    return this.prisma.inventoryBalance.count({
      where: { materialId, quantityOnHand: { gt: 0 } },
    });
  }

  async countEffectiveDocumentReferences(materialId: number): Promise<number> {
    const [
      stockIn,
      customerStock,
      workshopMaterial,
      rdProject,
      rdHandoff,
      rdProcurement,
      rdStocktake,
    ] = await Promise.all([
      this.prisma.stockInOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.salesStockOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.workshopMaterialOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdProjectMaterialLine.count({
        where: { materialId, rdProject: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdHandoffOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdProcurementRequestLine.count({
        where: { materialId, request: { lifecycleStatus: "EFFECTIVE" } },
      }),
      this.prisma.rdStocktakeOrderLine.count({
        where: { materialId, order: { lifecycleStatus: "EFFECTIVE" } },
      }),
    ]);

    return (
      stockIn +
      customerStock +
      workshopMaterial +
      rdProject +
      rdHandoff +
      rdProcurement +
      rdStocktake
    );
  }

  // ─── Customer ────────────────────────────────────────────────────────────────

  async findCustomers(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.CustomerWhereInput["status"];
  }) {
    const where: Prisma.CustomerWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { customerCode: { contains: params.keyword } },
        { customerName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { customerCode: "asc" },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total };
  }

  async findCustomerById(id: number) {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  async findCustomerByCode(customerCode: string) {
    return this.prisma.customer.findUnique({
      where: { customerCode },
    });
  }

  async createCustomer(
    data: Pick<
      Prisma.CustomerUncheckedCreateInput,
      "customerCode" | "customerName" | "parentId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.customer.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "MANUAL",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async createAutoCustomer(
    data: Pick<
      Prisma.CustomerUncheckedCreateInput,
      | "customerCode"
      | "customerName"
      | "parentId"
      | "sourceDocumentType"
      | "sourceDocumentId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.customer.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateCustomer(
    id: number,
    data: Prisma.CustomerUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.customer.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async countActiveChildCustomers(parentId: number) {
    return this.prisma.customer.count({
      where: { parentId, status: "ACTIVE" },
    });
  }

  // ─── Supplier ────────────────────────────────────────────────────────────────

  async findSupplierById(id: number) {
    return this.prisma.supplier.findUnique({
      where: { id },
    });
  }

  async findSupplierByCode(supplierCode: string) {
    return this.prisma.supplier.findUnique({
      where: { supplierCode },
    });
  }

  async findSuppliers(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.SupplierWhereInput["status"];
  }) {
    const where: Prisma.SupplierWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { supplierCode: { contains: params.keyword } },
        { supplierName: { contains: params.keyword } },
        { contactPerson: { contains: params.keyword } },
        { contactPhone: { contains: params.keyword } },
        { address: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { supplierCode: "asc" },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, total };
  }

  async createSupplier(
    data: Pick<
      Prisma.SupplierUncheckedCreateInput,
      | "supplierCode"
      | "supplierName"
      | "contactPerson"
      | "contactPhone"
      | "address"
    >,
    createdBy?: string,
  ) {
    return this.prisma.supplier.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "MANUAL",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async createAutoSupplier(
    data: Pick<
      Prisma.SupplierUncheckedCreateInput,
      | "supplierCode"
      | "supplierName"
      | "sourceDocumentType"
      | "sourceDocumentId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.supplier.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateSupplier(
    id: number,
    data: Prisma.SupplierUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...data,
        updatedBy,
      },
    });
  }

  // ─── Personnel ───────────────────────────────────────────────────────────────

  async findPersonnel(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.PersonnelWhereInput["status"];
  }) {
    const where: Prisma.PersonnelWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.personnelName = { contains: params.keyword };
    }

    const [items, total] = await Promise.all([
      this.prisma.personnel.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { personnelName: "asc" },
      }),
      this.prisma.personnel.count({ where }),
    ]);

    return { items, total };
  }

  async findPersonnelById(id: number) {
    return this.prisma.personnel.findUnique({
      where: { id },
    });
  }

  async createPersonnel(
    data: Pick<
      Prisma.PersonnelUncheckedCreateInput,
      "personnelName" | "contactPhone"
    >,
    createdBy?: string,
  ) {
    return this.prisma.personnel.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updatePersonnel(
    id: number,
    data: Prisma.PersonnelUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.personnel.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  // ─── Workshop ────────────────────────────────────────────────────────────────

  async findWorkshops(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.WorkshopWhereInput["status"];
  }) {
    const where: Prisma.WorkshopWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { workshopName: { contains: params.keyword } },
        {
          defaultHandlerPersonnel: {
            is: {
              personnelName: {
                contains: params.keyword,
              },
            },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.workshop.findMany({
        where,
        include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ workshopName: "asc" }, { id: "asc" }],
      }),
      this.prisma.workshop.count({ where }),
    ]);

    return { items, total };
  }

  async findWorkshopById(id: number) {
    return this.prisma.workshop.findUnique({
      where: { id },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
    });
  }

  async findWorkshopByName(workshopName: string) {
    return this.prisma.workshop.findFirst({
      where: {
        workshopName,
      },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
      orderBy: {
        id: "asc",
      },
    });
  }

  async createWorkshop(
    data: Pick<
      Prisma.WorkshopUncheckedCreateInput,
      "defaultHandlerPersonnelId" | "workshopName"
    >,
    createdBy?: string,
  ) {
    return this.prisma.workshop.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
    });
  }

  async updateWorkshop(
    id: number,
    data: Prisma.WorkshopUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.workshop.update({
      where: { id },
      data: { ...data, updatedBy },
      include: WORKSHOP_WITH_DEFAULT_HANDLER_INCLUDE,
    });
  }

  // ─── StockScope ──────────────────────────────────────────────────────────────

  async findStockScopes(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.StockScopeWhereInput["status"];
  }) {
    const where: Prisma.StockScopeWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { scopeCode: { contains: params.keyword } },
        { scopeName: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.stockScope.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { scopeCode: "asc" },
      }),
      this.prisma.stockScope.count({ where }),
    ]);

    return { items, total };
  }

  async findStockScopeById(id: number) {
    return this.prisma.stockScope.findUnique({
      where: { id },
    });
  }

  async findStockScopeByCode(scopeCode: string) {
    return this.prisma.stockScope.findUnique({
      where: { scopeCode },
    });
  }

  async createStockScope(
    data: Pick<
      Prisma.StockScopeUncheckedCreateInput,
      "scopeCode" | "scopeName"
    >,
    createdBy?: string,
  ) {
    return this.prisma.stockScope.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateStockScope(
    id: number,
    data: Prisma.StockScopeUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.stockScope.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async countPositiveStockScopeBalanceRows(
    stockScopeId: number,
  ): Promise<number> {
    return this.prisma.inventoryBalance.count({
      where: { stockScopeId, quantityOnHand: { gt: 0 } },
    });
  }
}
