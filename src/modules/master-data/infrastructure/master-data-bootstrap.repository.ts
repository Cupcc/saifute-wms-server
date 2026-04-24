import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

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

export class MasterDataBootstrapRepository {
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
}
