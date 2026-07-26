import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  RdProcurementMaterialBindingSource,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import type { CreateRdProcurementRequestLineDto } from "../dto/create-rd-procurement-request-line.dto";
import type {
  QueryRdAcceptanceMaterialOptionsDto,
  QueryRdProcurementMaterialSuggestionsDto,
} from "../dto/query-rd-procurement-material-options.dto";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";

@Injectable()
export class RdProcurementItemService {
  constructor(
    private readonly repository: RdProcurementRequestRepository,
    private readonly masterDataService: MasterDataService,
    private readonly rdProjectLookupService: RdProjectLookupService,
  ) {}

  async listMaterialSuggestions(
    query: QueryRdProcurementMaterialSuggestionsDto,
  ) {
    return this.rdProjectLookupService.listEffectiveBomMaterialSuggestions({
      currentProjectCode: query.projectCode,
      keyword: query.keyword,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getSuggestionProjectWorkshopId(projectCode: string) {
    const project =
      await this.rdProjectLookupService.requireEffectiveProjectByCode(
        projectCode,
      );
    return project.workshopId;
  }

  async listAcceptanceMaterialOptions(
    query: QueryRdAcceptanceMaterialOptionsDto,
  ) {
    const result = await this.masterDataService.listMaterials({
      keyword: query.keyword,
      limit: query.limit,
      offset: query.offset,
      includeDisabled: false,
    });
    return {
      total: result.total,
      items: result.items.map((material) => ({
        id: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        specModel: material.specModel,
        unitCode: material.unitCode,
        creationMode: material.creationMode,
      })),
    };
  }

  async resolveCreateLines(
    lines: CreateRdProcurementRequestLineDto[],
    operatorId?: string,
  ) {
    return Promise.all(
      lines.map(async (line, index) => {
        const quantity = new Prisma.Decimal(line.quantity);
        const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
        const amount = quantity.mul(unitPrice);
        const common = {
          lineNo: index + 1,
          quantity,
          unitPrice,
          amount,
          remark: line.remark,
          createdBy: operatorId,
          updatedBy: operatorId,
        };

        if (line.materialId != null) {
          const material =
            await this.rdProjectLookupService.assertMaterialInEffectiveBomCatalog(
              line.materialId,
            );
          return {
            ...common,
            materialId: material.id,
            materialCodeSnapshot: material.materialCode,
            materialNameSnapshot: material.materialName,
            materialSpecSnapshot: material.specModel,
            unitCodeSnapshot: material.unitCode,
            materialBindingSource:
              RdProcurementMaterialBindingSource.BOM_CATALOG,
            materialBoundAt: new Date(),
            materialBoundBy: operatorId ?? null,
          };
        }

        const materialName = line.materialName?.trim();
        const unitCode = line.unitCode?.trim();
        if (!materialName || !unitCode) {
          throw new BadRequestException(
            `第 ${index + 1} 行自由品项必须填写物料名称和单位`,
          );
        }

        return {
          ...common,
          materialId: null,
          materialCodeSnapshot: null,
          materialNameSnapshot: materialName,
          materialSpecSnapshot: line.specModel?.trim() || null,
          unitCodeSnapshot: unitCode,
          materialBindingSource: null,
          materialBoundAt: null,
          materialBoundBy: null,
        };
      }),
    );
  }

  async bindForAcceptance(params: {
    requestId: number;
    lineId: number;
    requestedMaterialId?: number;
    operatorId?: string;
    tx: Prisma.TransactionClient;
  }) {
    const lockedLine = await this.repository.lockRequestLineForUpdate(
      params.requestId,
      params.lineId,
      params.tx,
    );
    if (!lockedLine) {
      throw new BadRequestException("状态动作目标行不属于当前采购需求");
    }
    if (
      lockedLine.request.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE
    ) {
      throw new BadRequestException("只有有效采购需求可以登记验收");
    }

    if (lockedLine.materialId != null) {
      if (
        params.requestedMaterialId != null &&
        params.requestedMaterialId !== lockedLine.materialId
      ) {
        throw new ConflictException(
          `该采购行已绑定物料 ${lockedLine.material?.materialCode ?? lockedLine.materialId}，首次绑定后不能更换`,
        );
      }
      return lockedLine;
    }

    if (params.requestedMaterialId == null) {
      throw new BadRequestException(
        `自由品项“${lockedLine.materialNameSnapshot}”登记验收时必须选择已存在物料`,
      );
    }
    const material = await this.masterDataService.getMaterialById(
      params.requestedMaterialId,
    );
    if (material.status !== "ACTIVE") {
      throw new BadRequestException(
        `验收绑定物料不存在或已失效: ${params.requestedMaterialId}`,
      );
    }

    const result = await this.repository.bindMaterialIfUnbound(
      {
        requestId: params.requestId,
        lineId: params.lineId,
        materialId: material.id,
        materialBoundAt: new Date(),
        materialBoundBy: params.operatorId,
      },
      params.tx,
    );
    if (result.count === 1) {
      const bound = await this.repository.findRequestLineById(
        params.lineId,
        params.tx,
      );
      if (!bound) {
        throw new BadRequestException("采购行首次物料绑定后读取失败");
      }
      return bound;
    }

    const current = await this.repository.findRequestLineById(
      params.lineId,
      params.tx,
    );
    if (current?.materialId === material.id) {
      return current;
    }
    throw new ConflictException("该采购行已由其他操作绑定，请刷新后重试");
  }
}
