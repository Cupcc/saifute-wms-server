import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  type SalesProjectBindingReference,
  SalesProjectService,
} from "../../sales-project/application/sales-project.service";
import { SalesRepository } from "../infrastructure/sales.repository";

const DEFAULT_MATERIAL_CATEGORY_CODE = "UNCATEGORIZED";

export type OutboundLineWriteData = {
  lineNo: number;
  materialId: number;
  salesProjectId: number | null;
  salesProjectCodeSnapshot: string | null;
  salesProjectNameSnapshot: string | null;
  materialCategoryIdSnapshot: number;
  materialCategoryCodeSnapshot: string;
  materialCategoryNameSnapshot: string;
  materialCategoryPathSnapshot: Prisma.JsonArray;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string;
  unitCodeSnapshot: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  selectedUnitCost: Prisma.Decimal;
  projectTargetId: number | null;
  startNumber: string | null;
  endNumber: string | null;
  remark?: string;
};

export type MaterialCategorySnapshot = {
  id: number;
  code: string;
  name: string;
  path: Prisma.JsonArray;
};

@Injectable()
export class SalesSnapshotsService {
  constructor(
    private readonly repository: SalesRepository,
    private readonly masterDataService: MasterDataService,
    private readonly salesProjectService: SalesProjectService,
  ) {}

  async resolveCustomerSnapshot(customerId?: number) {
    if (!customerId) {
      return {
        customerCodeSnapshot: null,
        customerNameSnapshot: null,
      };
    }
    const c = await this.masterDataService.getCustomerById(customerId);
    return {
      customerCodeSnapshot: c.customerCode,
      customerNameSnapshot: c.customerName,
    };
  }

  async resolveHandlerSnapshot(handlerPersonnelId?: number) {
    if (!handlerPersonnelId) {
      return { handlerNameSnapshot: null };
    }
    const p = await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: p.personnelName };
  }

  async resolveSalesProjectReferencesForLines(
    lines: Array<{ salesProjectId?: number | null }>,
    options?: { allowVoided?: boolean },
  ) {
    const projectIds = lines
      .map((line) => line.salesProjectId)
      .filter((value): value is number => value != null);
    return this.salesProjectService.listProjectReferencesByIds(
      projectIds,
      options,
    );
  }

  assertSalesProjectBindingContext(
    project: SalesProjectBindingReference,
    context: {
      customerId?: number;
      workshopId: number;
    },
  ) {
    if (project.workshopId !== context.workshopId) {
      throw new BadRequestException(
        `销售项目与出库车间不一致: salesProjectId=${project.id}`,
      );
    }
    if (
      context.customerId &&
      project.customerId &&
      context.customerId !== project.customerId
    ) {
      throw new BadRequestException(
        `销售项目与出库客户不一致: salesProjectId=${project.id}`,
      );
    }
  }

  async buildOutboundLineWriteData(
    line: {
      materialId: number;
      salesProjectId?: number;
      quantity: string;
      selectedUnitCost: string;
      unitPrice?: string;
      startNumber?: string;
      endNumber?: string;
      remark?: string;
    },
    lineNo: number,
    salesProjectById: Map<number, SalesProjectBindingReference>,
    context: {
      customerId?: number;
      workshopId: number;
    },
  ): Promise<OutboundLineWriteData> {
    const material = await this.masterDataService.getMaterialById(
      line.materialId,
    );
    const materialCategorySnapshot =
      await this.buildMaterialCategorySnapshot(material);
    const salesProject =
      line.salesProjectId != null
        ? (salesProjectById.get(line.salesProjectId) ?? null)
        : null;
    if (line.salesProjectId != null && !salesProject) {
      throw new NotFoundException(`销售项目不存在: ${line.salesProjectId}`);
    }
    if (salesProject) {
      this.assertSalesProjectBindingContext(salesProject, context);
    }
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
    const amount = quantity.mul(unitPrice);
    const selectedUnitCost = new Prisma.Decimal(line.selectedUnitCost);

    return {
      lineNo,
      materialId: material.id,
      salesProjectId: salesProject?.id ?? null,
      salesProjectCodeSnapshot: salesProject?.salesProjectCode ?? null,
      salesProjectNameSnapshot: salesProject?.salesProjectName ?? null,
      materialCategoryIdSnapshot: materialCategorySnapshot.id,
      materialCategoryCodeSnapshot: materialCategorySnapshot.code,
      materialCategoryNameSnapshot: materialCategorySnapshot.name,
      materialCategoryPathSnapshot: materialCategorySnapshot.path,
      materialCodeSnapshot: material.materialCode,
      materialNameSnapshot: material.materialName,
      materialSpecSnapshot: material.specModel ?? "",
      unitCodeSnapshot: material.unitCode,
      quantity,
      unitPrice,
      amount,
      selectedUnitCost,
      projectTargetId: salesProject?.projectTargetId ?? null,
      startNumber: line.startNumber ?? null,
      endNumber: line.endNumber ?? null,
      remark: line.remark,
    };
  }

  async buildMaterialCategorySnapshot(material: {
    category: {
      id: number;
      categoryCode: string;
      categoryName: string;
    } | null;
  }): Promise<MaterialCategorySnapshot> {
    const effectiveCategory = await this.resolveEffectiveMaterialCategory(
      material.category,
    );

    return {
      id: effectiveCategory.id,
      code: effectiveCategory.categoryCode,
      name: effectiveCategory.categoryName,
      path: [
        {
          id: effectiveCategory.id,
          categoryCode: effectiveCategory.categoryCode,
          categoryName: effectiveCategory.categoryName,
        } satisfies Prisma.JsonObject,
      ] as Prisma.JsonArray,
    };
  }

  private async resolveEffectiveMaterialCategory(
    category: {
      id: number;
      categoryCode: string;
      categoryName: string;
    } | null,
  ) {
    if (category) {
      return category;
    }

    const defaultCategory = await this.repository.findMaterialCategoryByCode(
      DEFAULT_MATERIAL_CATEGORY_CODE,
    );
    if (!defaultCategory) {
      throw new BadRequestException(
        "物料缺少有效分类，且默认未分类不存在，无法写入分类快照",
      );
    }
    return defaultCategory;
  }
}
