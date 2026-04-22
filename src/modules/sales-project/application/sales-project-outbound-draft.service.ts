import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import type { CreateSalesProjectOutboundDraftDto } from "../dto/create-sales-project-outbound-draft.dto";
import {
  type ProjectMaterialViewRow,
  SalesProjectMaterialViewService,
} from "./sales-project-material-view.service";

@Injectable()
export class SalesProjectOutboundDraftService {
  constructor(private readonly materialView: SalesProjectMaterialViewService) {}

  async createSalesOutboundDraft(
    projectId: number,
    dto: CreateSalesProjectOutboundDraftDto,
  ) {
    const project = await this.materialView.requireProject(projectId);
    if (project.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的销售项目不能生成出库草稿");
    }

    const view = await this.materialView.buildProjectView(project);
    const rowByMaterialId = new Map(
      view.items.map((row: ProjectMaterialViewRow) => [row.materialId, row]),
    );
    const requestedLines = dto.lines?.length
      ? dto.lines
      : view.items
          .filter((row: ProjectMaterialViewRow) => row.pendingSupplyQty.gt(0))
          .map((row: ProjectMaterialViewRow) => ({
            materialId: row.materialId,
            quantity: row.pendingSupplyQty.toString(),
            unitPrice: row.targetUnitPrice.toString(),
            remark: row.remark ?? undefined,
          }));

    if (requestedLines.length === 0) {
      throw new BadRequestException("当前项目没有可生成出库草稿的待供货物料");
    }

    const bizDate = dto.bizDate ?? new Date().toISOString().slice(0, 10);
    const customerId = dto.customerId ?? project.customerId ?? undefined;
    const handlerPersonnelId =
      dto.handlerPersonnelId ?? project.managerPersonnelId ?? undefined;
    const workshopId = dto.workshopId ?? project.workshopId;

    const lines = requestedLines.map((line) => {
      const row = rowByMaterialId.get(line.materialId);
      if (!row) {
        throw new BadRequestException(
          `销售项目不存在对应物料上下文: materialId=${line.materialId}`,
        );
      }

      const quantity = line.quantity
        ? new Prisma.Decimal(line.quantity)
        : row.pendingSupplyQty.gt(0)
          ? row.pendingSupplyQty
          : row.targetQty;
      if (quantity.lte(0)) {
        throw new BadRequestException(
          `销售项目物料出库数量必须大于 0: materialId=${line.materialId}`,
        );
      }

      const unitPrice = new Prisma.Decimal(
        line.unitPrice ?? row.targetUnitPrice.toString(),
      );

      return {
        materialId: row.materialId,
        materialCode: row.materialCodeSnapshot,
        materialName: row.materialNameSnapshot,
        specification: row.materialSpecSnapshot ?? "",
        quantity: quantity.toString(),
        selectedUnitCost: "",
        unitPrice: unitPrice.toString(),
        salesProjectId: project.id,
        salesProjectCode: project.salesProjectCode,
        salesProjectName: project.salesProjectName,
        remark: line.remark ?? row.remark ?? "",
      };
    });

    return {
      orderId: undefined,
      documentNo: "",
      bizDate,
      customerId,
      customerCode: project.customerCodeSnapshot ?? "",
      customerName: project.customerNameSnapshot ?? "",
      handlerPersonnelId,
      handlerName: project.managerNameSnapshot ?? "",
      workshopId,
      workshopName: project.workshopNameSnapshot,
      remark: dto.remark ?? project.remark ?? "",
      salesProjectId: project.id,
      salesProjectCode: project.salesProjectCode,
      salesProjectName: project.salesProjectName,
      lines,
    };
  }
}
