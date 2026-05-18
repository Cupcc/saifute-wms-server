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
    const rowsByMaterialId = new Map<number, ProjectMaterialViewRow[]>();
    for (const row of view.items as ProjectMaterialViewRow[]) {
      const rows = rowsByMaterialId.get(row.materialId) ?? [];
      rows.push(row);
      rowsByMaterialId.set(row.materialId, rows);
    }
    const rowByMaterialAndCost = new Map(
      (view.items as ProjectMaterialViewRow[]).flatMap((row) =>
        row.selectedUnitCost === null
          ? []
          : ([
              [
                this.buildRowKey(
                  row.materialId,
                  row.selectedUnitCost,
                  row.sourceProjectTargetId,
                ),
                row,
              ],
            ] as const),
      ),
    );
    const requestedLines = dto.lines?.length
      ? dto.lines
      : view.items
          .filter(
            (row: ProjectMaterialViewRow) =>
              row.selectedUnitCost !== null && row.currentInventoryQty.gt(0),
          )
          .map((row: ProjectMaterialViewRow) => ({
            materialId: row.materialId,
            sourceProjectTargetId: row.sourceProjectTargetId,
            selectedUnitCost: row.selectedUnitCost?.toString(),
            quantity: row.currentInventoryQty.toString(),
            unitPrice: row.targetUnitPrice.toString(),
            remark: row.remark ?? undefined,
          }));

    if (requestedLines.length === 0) {
      throw new BadRequestException("当前项目没有可生成出库草稿的项目库存");
    }

    const bizDate = dto.bizDate ?? new Date().toISOString().slice(0, 10);
    const customerId = dto.customerId ?? project.customerId ?? undefined;
    const handlerPersonnelId =
      dto.handlerPersonnelId ?? project.managerPersonnelId ?? undefined;
    const workshopId = dto.workshopId ?? project.workshopId;

    const lines = requestedLines.map((line) => {
      const requestedUnitCost =
        line.selectedUnitCost != null
          ? new Prisma.Decimal(line.selectedUnitCost)
          : null;
      const row =
        requestedUnitCost !== null
          ? Object.hasOwn(line, "sourceProjectTargetId")
            ? rowByMaterialAndCost.get(
                this.buildRowKey(
                  line.materialId,
                  requestedUnitCost,
                  line.sourceProjectTargetId ?? null,
                ),
              )
            : this.resolveSingleMaterialCostRow(
                line.materialId,
                requestedUnitCost,
                rowsByMaterialId,
              )
          : this.resolveSingleMaterialRow(line.materialId, rowsByMaterialId);
      if (!row) {
        throw new BadRequestException(
          `销售项目不存在对应项目库存价层: materialId=${line.materialId}`,
        );
      }
      if (row.selectedUnitCost === null) {
        throw new BadRequestException(
          `销售项目物料缺少可出库价格层: materialId=${line.materialId}`,
        );
      }

      const quantity = line.quantity
        ? new Prisma.Decimal(line.quantity)
        : row.currentInventoryQty;
      if (quantity.lte(0)) {
        throw new BadRequestException(
          `销售项目物料出库数量必须大于 0: materialId=${line.materialId}`,
        );
      }
      if (quantity.gt(row.currentInventoryQty)) {
        throw new BadRequestException(
          `销售项目物料项目库存不足: materialId=${line.materialId}, selectedUnitCost=${row.selectedUnitCost.toString()}, requiredQty=${quantity.toString()}, availableQty=${row.currentInventoryQty.toString()}`,
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
        selectedUnitCost: row.selectedUnitCost.toString(),
        sourceProjectTargetId: row.sourceProjectTargetId,
        unitPrice: unitPrice.toString(),
        salesProjectId: project.id,
        salesProjectCode: project.salesProjectCode,
        salesProjectName: project.salesProjectName,
        projectTargetId: project.projectTargetId,
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
      projectTargetId: project.projectTargetId,
      lines,
    };
  }

  private buildRowKey(
    materialId: number,
    selectedUnitCost: Prisma.Decimal,
    sourceProjectTargetId?: number | null,
  ) {
    return `${materialId}:${sourceProjectTargetId ?? "unattributed"}:${selectedUnitCost.toString()}`;
  }

  private resolveSingleMaterialRow(
    materialId: number,
    rowsByMaterialId: Map<number, ProjectMaterialViewRow[]>,
  ) {
    const rows = rowsByMaterialId.get(materialId) ?? [];
    const outboundRows = rows.filter((row) => row.selectedUnitCost !== null);
    if (outboundRows.length > 1) {
      throw new BadRequestException(
        `销售项目物料存在多个项目价格层，请指定 selectedUnitCost: materialId=${materialId}`,
      );
    }
    return outboundRows[0] ?? rows[0];
  }

  private resolveSingleMaterialCostRow(
    materialId: number,
    selectedUnitCost: Prisma.Decimal,
    rowsByMaterialId: Map<number, ProjectMaterialViewRow[]>,
  ) {
    const rows = (rowsByMaterialId.get(materialId) ?? []).filter(
      (row) =>
        row.selectedUnitCost !== null &&
        row.selectedUnitCost.eq(selectedUnitCost),
    );
    if (rows.length > 1) {
      throw new BadRequestException(
        `销售项目物料存在多个相同价格层来源，请指定 sourceProjectTargetId: materialId=${materialId}, selectedUnitCost=${selectedUnitCost.toString()}`,
      );
    }
    return rows[0];
  }
}
