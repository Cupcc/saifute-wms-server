import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { normalizeOptionalMaterialCode } from "../../../shared/domain/material-code";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundAutoMaterialRepository } from "../infrastructure/inbound-auto-material.repository";

const PROJECT_AUTO_MATERIAL_CODE_PREFIX = "xm";
const TEMPORARY_SOURCE_DOCUMENT_ID = 0;

@Injectable()
export class InboundAcceptanceLineSnapshotService {
  constructor(
    private readonly masterDataService: MasterDataService,
    private readonly inboundRepository: InboundRepository,
    private readonly autoMaterialRepository: InboundAutoMaterialRepository,
  ) {}

  async buildLineWriteData(
    line: {
      materialId?: number;
      materialCode?: string;
      materialName?: string;
      specModel?: string;
      unitCode?: string;
      quantity: string;
      unitPrice?: string;
      remark?: string;
    },
    lineNo: number,
    options?: {
      createdBy?: string;
      tx?: Prisma.TransactionClient;
    },
  ) {
    const material = await this.resolveMaterialForLine(line, options);
    const materialCategorySnapshot =
      await this.buildMaterialCategorySnapshot(material);
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");

    return {
      lineNo,
      materialId: material.id,
      autoCreatedMaterialId:
        line.materialId == null
          ? material.id
          : (undefined as number | undefined),
      rdProcurementRequestLineId: null,
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
      amount: quantity.mul(unitPrice),
      remark: line.remark,
    };
  }

  async markAutoMaterialSourceDocument(
    materialIds: number[],
    sourceDocumentId: number,
    updatedBy?: string,
    tx?: Prisma.TransactionClient,
  ) {
    for (const materialId of [...new Set(materialIds)]) {
      await this.autoMaterialRepository.updateMaterialSourceDocumentId(
        materialId,
        sourceDocumentId,
        updatedBy,
        tx,
      );
    }
  }

  private async resolveMaterialForLine(
    line: {
      materialId?: number;
      materialCode?: string;
      materialName?: string;
      specModel?: string;
      unitCode?: string;
    },
    options?: {
      createdBy?: string;
      tx?: Prisma.TransactionClient;
    },
  ) {
    if (line.materialId) {
      return this.masterDataService.getMaterialById(line.materialId);
    }

    this.ensureAutoMaterialInput(line);
    const materialCode =
      normalizeOptionalMaterialCode(line.materialCode) ??
      (await this.generateAutoMaterialCode(options?.tx));
    const existing = await this.autoMaterialRepository.findMaterialByCode(
      materialCode,
      options?.tx,
    );
    if (existing) {
      return existing;
    }

    return this.createAutoMaterialWithRetry(
      {
        materialCode,
        materialName: this.normalizeOptionalText(line.materialName) ?? "",
        specModel: this.normalizeOptionalText(line.specModel) ?? undefined,
        unitCode: this.normalizeOptionalText(line.unitCode) ?? "",
      },
      options,
    );
  }

  private ensureAutoMaterialInput(line: {
    materialName?: string;
    unitCode?: string;
  }) {
    if (!this.normalizeOptionalText(line.materialName)) {
      throw new BadRequestException("新物料必须填写物料名称");
    }
    if (!this.normalizeOptionalText(line.unitCode)) {
      throw new BadRequestException("新物料必须填写单位");
    }
  }

  private async generateAutoMaterialCode(tx?: Prisma.TransactionClient) {
    const maxSequence =
      await this.autoMaterialRepository.findMaxMaterialCodeSequence(
        PROJECT_AUTO_MATERIAL_CODE_PREFIX,
        tx,
      );
    return `${PROJECT_AUTO_MATERIAL_CODE_PREFIX}${maxSequence + 1}`;
  }

  private async createAutoMaterialWithRetry(
    line: {
      materialCode: string;
      materialName: string;
      specModel?: string;
      unitCode: string;
    },
    options?: {
      createdBy?: string;
      tx?: Prisma.TransactionClient;
    },
  ) {
    let materialCode = line.materialCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.autoMaterialRepository.createAutoMaterial(
          {
            materialCode,
            materialName: line.materialName,
            specModel: line.specModel,
            unitCode: line.unitCode,
            sourceDocumentType: BusinessDocumentType.StockInOrder,
            sourceDocumentId: TEMPORARY_SOURCE_DOCUMENT_ID,
          },
          options?.createdBy,
          options?.tx,
        );
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
        materialCode = await this.generateAutoMaterialCode(options?.tx);
      }
    }

    throw new BadRequestException("自动生成物料编码失败，请重试");
  }

  private async buildMaterialCategorySnapshot(material: {
    category: {
      id: number;
      categoryCode: string;
      categoryName: string;
    } | null;
  }) {
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
        } as Prisma.JsonObject,
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

    const defaultCategory =
      await this.inboundRepository.findMaterialCategoryByCode("15");
    if (!defaultCategory) {
      throw new BadRequestException(
        "物料缺少有效分类，且默认未分类不存在，无法写入分类快照",
      );
    }
    return defaultCategory;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
