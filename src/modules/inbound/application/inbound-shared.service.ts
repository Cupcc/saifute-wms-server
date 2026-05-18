import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { SupplierService } from "../../master-data/application/supplier.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import {
  type SalesProjectBindingReference,
  SalesProjectService,
} from "../../sales-project/application/sales-project.service";
import type { CreateInboundOrderDto } from "../dto/create-inbound-order.dto";
import type { UpdateInboundOrderDto } from "../dto/update-inbound-order.dto";
import { InboundRepository } from "../infrastructure/inbound.repository";

@Injectable()
export class InboundSharedService {
  constructor(
    private readonly masterDataService: MasterDataService,
    private readonly rdProcurementRequestService: RdProcurementRequestService,
    private readonly inboundRepository: InboundRepository,
    private readonly supplierService: SupplierService,
    @Optional()
    private readonly salesProjectService?: SalesProjectService,
  ) {}

  async validateMasterData(
    dto: CreateInboundOrderDto,
    supplierId?: number,
    options?: { hasPendingSupplier?: boolean },
  ) {
    this.ensureSupplierRequirement(
      dto.orderType,
      supplierId,
      options?.hasPendingSupplier,
    );
    this.ensureWorkshopRequirement(dto.orderType, dto.workshopId);
    await this.resolveSalesProjectReference(
      dto.orderType,
      dto.salesProjectId,
      dto.workshopId ?? null,
    );
    if (supplierId) {
      await this.masterDataService.getSupplierById(supplierId);
    }
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      if (line.materialId) {
        await this.masterDataService.getMaterialById(line.materialId);
      }
    }
  }

  async validateMasterDataForUpdate(
    dto: UpdateInboundOrderDto,
    orderType: StockInOrderType,
    supplierId?: number,
    workshopId?: number | null,
    salesProjectId?: number | null,
  ) {
    this.ensureSupplierRequirement(orderType, supplierId);
    this.ensureWorkshopRequirement(orderType, workshopId);
    await this.resolveSalesProjectReference(
      orderType,
      salesProjectId ?? null,
      workshopId ?? null,
    );
    if (supplierId) {
      await this.masterDataService.getSupplierById(supplierId);
    }
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private ensureSupplierRequirement(
    orderType: StockInOrderType,
    supplierId?: number,
    hasPendingSupplier = false,
  ) {
    if (
      orderType === StockInOrderType.ACCEPTANCE &&
      !supplierId &&
      !hasPendingSupplier
    ) {
      throw new BadRequestException("验收单必须选择供应商");
    }
  }

  private ensureWorkshopRequirement(
    orderType: StockInOrderType,
    workshopId?: number | null,
  ) {
    if (
      orderType === StockInOrderType.PRODUCTION_RECEIPT &&
      (!workshopId || workshopId < 1)
    ) {
      throw new BadRequestException("生产入库单必须选择部门");
    }
  }

  async resolveSalesProjectReference(
    orderType: StockInOrderType,
    salesProjectId?: number | null,
    workshopId?: number | null,
    tx?: Prisma.TransactionClient,
  ): Promise<SalesProjectBindingReference | null> {
    if (salesProjectId == null) {
      return null;
    }
    if (orderType !== StockInOrderType.ACCEPTANCE) {
      throw new BadRequestException("只有验收单可以关联销售项目");
    }
    if (!this.salesProjectService) {
      throw new BadRequestException(
        "销售项目服务不可用，无法校验验收单项目归属",
      );
    }
    const project = await this.salesProjectService.getProjectReferenceById(
      salesProjectId,
      undefined,
      tx,
    );
    if (workshopId != null && project.workshopId !== workshopId) {
      throw new BadRequestException(
        `销售项目与验收单车间不一致: salesProjectId=${project.id}`,
      );
    }
    return project;
  }

  getWorkshopById(workshopId: number) {
    return this.masterDataService.getWorkshopById(workshopId);
  }

  getMainStockScope() {
    return this.masterDataService.getStockScopeByCode("MAIN");
  }

  toSalesProjectSnapshots(project: SalesProjectBindingReference | null) {
    return {
      salesProjectId: project?.id ?? null,
      salesProjectCodeSnapshot: project?.salesProjectCode ?? null,
      salesProjectNameSnapshot: project?.salesProjectName ?? null,
      projectTargetId: project?.projectTargetId ?? null,
    };
  }

  async resolveSupplierSnapshot(supplierId?: number) {
    if (!supplierId) {
      return { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    }
    const s = await this.masterDataService.getSupplierById(supplierId);
    return {
      supplierCodeSnapshot: s.supplierCode,
      supplierNameSnapshot: s.supplierName,
    };
  }

  async ensureSupplier(
    params: {
      supplierCode: string;
      supplierName: string;
      sourceDocumentType?: string;
      sourceDocumentId?: number;
    },
    createdBy?: string,
    db?: Prisma.TransactionClient,
  ) {
    return this.supplierService.ensure(params, createdBy, db);
  }

  async resolveHandlerSnapshot(
    handlerPersonnelId?: number,
    handlerName?: string,
  ) {
    if (!handlerPersonnelId) {
      return { handlerNameSnapshot: handlerName?.trim() || null };
    }
    const p = await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: p.personnelName };
  }

  async buildLineWriteData(
    line: {
      materialId: number;
      quantity: string;
      unitPrice?: string;
      rdProcurementRequestLineId?: number;
      remark?: string;
    },
    lineNo: number,
    options?: {
      rdProcurementLineMap?: Map<
        number,
        { id: number; materialId: number; quantity: Prisma.Decimal }
      > | null;
      seenRdProcurementLineIds?: Set<number>;
    },
  ) {
    const material = await this.masterDataService.getMaterialById(
      line.materialId,
    );
    const materialCategorySnapshot =
      await this.buildMaterialCategorySnapshot(material);
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
    const amount = quantity.mul(unitPrice);
    const requestLine = this.resolveRdProcurementLineLink(
      line.rdProcurementRequestLineId,
      material.id,
      quantity,
      options?.rdProcurementLineMap,
      options?.seenRdProcurementLineIds,
    );

    return {
      lineNo,
      materialId: material.id,
      rdProcurementRequestLineId: requestLine?.id ?? null,
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
      remark: line.remark,
    };
  }

  async resolveRdProcurementLink(
    orderType: StockInOrderType,
    rdProcurementRequestId?: number,
    supplierId?: number,
  ) {
    if (!rdProcurementRequestId) {
      return {
        request: null,
        supplierId,
        lineMap: null,
      };
    }

    if (orderType !== StockInOrderType.ACCEPTANCE) {
      throw new BadRequestException("只有验收单可以关联 RD 采购需求");
    }

    const request = await this.rdProcurementRequestService.getRequestById(
      rdProcurementRequestId,
    );
    if (request.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException("只能关联有效的 RD 采购需求");
    }
    if (request.supplierId && supplierId && request.supplierId !== supplierId) {
      throw new BadRequestException("验收单供应商需与 RD 采购需求一致");
    }

    return {
      request,
      supplierId: supplierId ?? request.supplierId ?? undefined,
      lineMap: new Map(
        request.lines.map((line) => [
          line.id,
          {
            id: line.id,
            materialId: line.materialId,
            quantity: new Prisma.Decimal(line.quantity),
          },
        ]),
      ),
    };
  }

  private resolveRdProcurementLineLink(
    rdProcurementRequestLineId: number | undefined,
    materialId: number,
    quantity: Prisma.Decimal,
    rdProcurementLineMap?: Map<
      number,
      { id: number; materialId: number; quantity: Prisma.Decimal }
    > | null,
    seenRdProcurementLineIds?: Set<number>,
  ) {
    if (!rdProcurementLineMap) {
      if (rdProcurementRequestLineId) {
        throw new BadRequestException(
          "明细不能在未关联采购需求时单独引用 RD 采购行",
        );
      }
      return null;
    }

    if (!rdProcurementRequestLineId) {
      return null;
    }
    if (seenRdProcurementLineIds?.has(rdProcurementRequestLineId)) {
      throw new BadRequestException(
        "同一条 RD 采购需求行不能重复关联到多个验收明细",
      );
    }

    const requestLine = rdProcurementLineMap.get(rdProcurementRequestLineId);
    if (!requestLine) {
      throw new BadRequestException("存在不属于当前 RD 采购需求的明细关联");
    }
    if (requestLine.materialId !== materialId) {
      throw new BadRequestException("验收物料必须与 RD 采购需求行一致");
    }
    if (quantity.gt(requestLine.quantity)) {
      throw new BadRequestException("验收数量不能大于对应 RD 采购需求数量");
    }

    seenRdProcurementLineIds?.add(rdProcurementRequestLineId);
    return requestLine;
  }

  async assertRdProcurementAcceptedQtyWithinLimit(
    rdProcurementLineMap:
      | Map<
          number,
          { id: number; materialId: number; quantity: Prisma.Decimal }
        >
      | null
      | undefined,
    lines: Array<{
      rdProcurementRequestLineId: number | null;
      quantity: Prisma.Decimal;
    }>,
    excludeOrderId?: number,
    tx?: Prisma.TransactionClient,
  ) {
    if (!rdProcurementLineMap || lines.length === 0) {
      return;
    }

    const requestedLineIds = lines
      .map((line) => line.rdProcurementRequestLineId)
      .filter((lineId): lineId is number => Boolean(lineId));
    if (requestedLineIds.length === 0) {
      return;
    }

    const existingAcceptedQtyMap =
      await this.inboundRepository.sumEffectiveAcceptedQtyByRdProcurementLineIds(
        requestedLineIds,
        excludeOrderId,
        tx,
      );
    const newAcceptedQtyMap = new Map<number, Prisma.Decimal>();
    lines.forEach((line) => {
      if (!line.rdProcurementRequestLineId) {
        return;
      }
      const current =
        newAcceptedQtyMap.get(line.rdProcurementRequestLineId) ??
        new Prisma.Decimal(0);
      newAcceptedQtyMap.set(
        line.rdProcurementRequestLineId,
        current.add(new Prisma.Decimal(line.quantity)),
      );
    });

    requestedLineIds.forEach((lineId) => {
      const requestLine = rdProcurementLineMap.get(lineId);
      if (!requestLine) {
        return;
      }
      const existingAcceptedQty =
        existingAcceptedQtyMap.get(lineId) ?? new Prisma.Decimal(0);
      const newAcceptedQty =
        newAcceptedQtyMap.get(lineId) ?? new Prisma.Decimal(0);
      if (existingAcceptedQty.add(newAcceptedQty).gt(requestLine.quantity)) {
        throw new BadRequestException(
          "累计验收数量不能大于对应 RD 采购需求数量",
        );
      }
    });
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
}
