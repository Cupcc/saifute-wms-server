import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import {
  InventoryService,
  type PriceLayerAvailabilityItem,
} from "../../inventory-core/application/inventory.service";
import { SalesProjectRepository } from "../infrastructure/sales-project.repository";
import {
  requireProjectTargetId,
  SALES_PROJECT_LABEL,
  SALES_PROJECT_STOCK_SCOPE,
  toDecimal,
} from "./sales-project.shared";
import {
  appendLinkedAcceptanceDocuments,
  buildProjectMaterialSummary,
  type ProjectMaterialLinkedDocument,
} from "./sales-project-material-view.helper";

export type SalesProjectRecord = NonNullable<
  Awaited<ReturnType<SalesProjectRepository["findProjectById"]>>
>;

type MaterialSnapshot = {
  id: number;
  materialCode: string;
  materialName: string;
  specModel: string | null;
  unitCode: string;
};

export type ProjectMaterialViewRow = {
  materialId: number;
  materialSourceType: "PROJECT_STOCK" | "SELECTED_STOCK";
  sourceProjectTargetId: number | null;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
  selectedUnitCost: Prisma.Decimal | null;
  priceLayerAvailableQty: Prisma.Decimal;
  priceLayerSourceLogCount: number;
  targetQty: Prisma.Decimal;
  targetUnitPrice: Prisma.Decimal;
  targetAmount: Prisma.Decimal;
  currentInventoryQty: Prisma.Decimal;
  outboundQty: Prisma.Decimal;
  outboundAmount: Prisma.Decimal;
  outboundCostAmount: Prisma.Decimal;
  returnQty: Prisma.Decimal;
  returnAmount: Prisma.Decimal;
  returnCostAmount: Prisma.Decimal;
  netShipmentQty: Prisma.Decimal;
  netShipmentAmount: Prisma.Decimal;
  netShipmentCostAmount: Prisma.Decimal;
  pendingSupplyQty: Prisma.Decimal;
  remark: string | null;
  lastShipmentDate: Date | null;
  linkedDocuments: ProjectMaterialLinkedDocument[];
};

@Injectable()
export class SalesProjectMaterialViewService {
  constructor(
    private readonly repository: SalesProjectRepository,
    private readonly inventoryService: InventoryService,
  ) {}

  async requireProject(id: number, tx?: Prisma.TransactionClient) {
    const project = await this.repository.findProjectById(id, tx);
    if (!project) {
      throw new NotFoundException(`${SALES_PROJECT_LABEL}不存在: ${id}`);
    }
    return project;
  }

  async buildProjectView(
    project: SalesProjectRecord,
    tx?: Prisma.TransactionClient,
  ) {
    const projectTargetId = requireProjectTargetId(project);
    const shipmentLines =
      await this.repository.findEffectiveShipmentLinesByProjectId(
        project.id,
        tx,
      );
    const attributedQuantities =
      await this.inventoryService.listAttributedQuantitySnapshots(
        {
          stockScope: SALES_PROJECT_STOCK_SCOPE,
          projectTargetId,
        },
        tx,
      );

    const materialIds = new Set<number>([
      ...attributedQuantities.keys(),
      ...shipmentLines.map((line) => line.materialId),
      ...project.materialLines.map((line) => line.materialId),
    ]);
    const materialSnapshots = await this.repository.findMaterialSnapshotsByIds(
      [...materialIds],
      tx,
    );
    const acceptanceLineLinks =
      await this.repository.findEffectiveAcceptanceLineLinksByProjectId(
        project.id,
        [...materialIds],
        tx,
      );
    const materialSnapshotById = new Map(
      materialSnapshots.map((material) => [material.id, material]),
    );
    const materialLinesByMaterialId = new Map<
      number,
      SalesProjectRecord["materialLines"]
    >();
    for (const line of project.materialLines) {
      const lines = materialLinesByMaterialId.get(line.materialId) ?? [];
      lines.push(line);
      materialLinesByMaterialId.set(line.materialId, lines);
    }
    const ledgerRows = new Map<string, ProjectMaterialViewRow>();

    for (const materialId of materialIds) {
      const priceLayers =
        await this.inventoryService.listPriceLayerAvailability({
          materialId,
          stockScope: SALES_PROJECT_STOCK_SCOPE,
          projectTargetId,
        });
      this.seedPriceLayerRows(
        ledgerRows,
        materialId,
        priceLayers,
        "PROJECT_STOCK",
        projectTargetId,
        materialSnapshotById,
      );

      if (priceLayers.length === 0) {
        const currentQty =
          attributedQuantities.get(materialId) ?? new Prisma.Decimal(0);
        if (!currentQty.eq(0)) {
          const row = this.ensureLedgerRow(
            ledgerRows,
            materialId,
            null,
            "PROJECT_STOCK",
            projectTargetId,
            materialSnapshotById,
          );
          row.currentInventoryQty = currentQty;
          row.priceLayerAvailableQty = currentQty;
        }
      }
    }

    for (const line of shipmentLines) {
      const current = this.ensureLedgerRow(
        ledgerRows,
        line.materialId,
        toDecimal(line.selectedUnitCost),
        "PROJECT_STOCK",
        projectTargetId,
        materialSnapshotById,
        line,
      );

      if (line.order.orderType === SalesStockOrderType.OUTBOUND) {
        current.outboundQty = current.outboundQty.add(toDecimal(line.quantity));
        current.outboundAmount = current.outboundAmount.add(
          toDecimal(line.amount),
        );
        current.outboundCostAmount = current.outboundCostAmount.add(
          toDecimal(line.costAmount),
        );
      } else {
        current.returnQty = current.returnQty.add(toDecimal(line.quantity));
        current.returnAmount = current.returnAmount.add(toDecimal(line.amount));
        current.returnCostAmount = current.returnCostAmount.add(
          toDecimal(line.costAmount),
        );
      }

      current.netShipmentQty = current.outboundQty.sub(current.returnQty);
      current.netShipmentAmount = current.outboundAmount.sub(
        current.returnAmount,
      );
      current.netShipmentCostAmount = current.outboundCostAmount.sub(
        current.returnCostAmount,
      );

      if (
        current.lastShipmentDate == null ||
        current.lastShipmentDate.getTime() < line.order.bizDate.getTime()
      ) {
        current.lastShipmentDate = line.order.bizDate;
      }
    }

    for (const [materialId, materialLines] of materialLinesByMaterialId) {
      const projectRows = this.findProjectRowsForMaterial(
        ledgerRows,
        materialId,
      );
      if (projectRows.length > 0) {
        this.applyMaterialLinesToProjectRows(projectRows, materialLines);
        continue;
      }

      const priceLayers =
        await this.inventoryService.listPriceLayerAvailability({
          materialId,
          stockScope: SALES_PROJECT_STOCK_SCOPE,
          projectTargetId: null,
        });
      const fallbackLine = materialLines[0];
      if (priceLayers.length === 0) {
        const row = this.ensureLedgerRow(
          ledgerRows,
          materialId,
          null,
          "SELECTED_STOCK",
          null,
          materialSnapshotById,
          fallbackLine,
        );
        this.applyMaterialLineSnapshots(row, materialLines);
        continue;
      }

      for (const layer of priceLayers) {
        const row = this.ensureLedgerRow(
          ledgerRows,
          materialId,
          layer.unitCost,
          "SELECTED_STOCK",
          null,
          materialSnapshotById,
          fallbackLine,
        );
        const availableQty = toDecimal(layer.availableQty);
        row.currentInventoryQty = row.currentInventoryQty.add(availableQty);
        row.priceLayerAvailableQty =
          row.priceLayerAvailableQty.add(availableQty);
        row.priceLayerSourceLogCount += layer.sourceLogCount;
        this.applyMaterialLineSnapshots(row, materialLines);
      }
    }

    appendLinkedAcceptanceDocuments(ledgerRows, acceptanceLineLinks);

    const items = Array.from(ledgerRows.values()).sort((left, right) => {
      const materialCompare = left.materialCodeSnapshot.localeCompare(
        right.materialCodeSnapshot,
      );
      if (materialCompare !== 0) {
        return materialCompare;
      }
      if (left.selectedUnitCost === null && right.selectedUnitCost === null) {
        return 0;
      }
      if (left.selectedUnitCost === null) {
        return 1;
      }
      if (right.selectedUnitCost === null) {
        return -1;
      }
      return left.selectedUnitCost.comparedTo(right.selectedUnitCost);
    });

    const summary = buildProjectMaterialSummary(items);

    return {
      ...project,
      summary,
      items,
    };
  }

  async getProjectView(id: number, tx?: Prisma.TransactionClient) {
    const project = await this.requireProject(id, tx);
    return this.buildProjectView(project, tx);
  }

  private seedPriceLayerRows(
    ledgerRows: Map<string, ProjectMaterialViewRow>,
    materialId: number,
    priceLayers: PriceLayerAvailabilityItem[],
    materialSourceType: ProjectMaterialViewRow["materialSourceType"],
    sourceProjectTargetId: number | null,
    materialSnapshotById: Map<number, MaterialSnapshot>,
  ) {
    for (const layer of priceLayers) {
      const row = this.ensureLedgerRow(
        ledgerRows,
        materialId,
        layer.unitCost,
        materialSourceType,
        sourceProjectTargetId,
        materialSnapshotById,
      );
      const availableQty = toDecimal(layer.availableQty);
      row.currentInventoryQty = row.currentInventoryQty.add(availableQty);
      row.priceLayerAvailableQty = row.priceLayerAvailableQty.add(availableQty);
      row.priceLayerSourceLogCount += layer.sourceLogCount;
    }
  }

  private ensureLedgerRow(
    ledgerRows: Map<string, ProjectMaterialViewRow>,
    materialId: number,
    selectedUnitCost: Prisma.Decimal | null,
    materialSourceType: ProjectMaterialViewRow["materialSourceType"],
    sourceProjectTargetId: number | null,
    materialSnapshotById: Map<number, MaterialSnapshot>,
    fallbackLine?: {
      materialCodeSnapshot: string;
      materialNameSnapshot: string;
      materialSpecSnapshot: string | null;
      unitCodeSnapshot: string;
      remark: string | null;
    },
  ) {
    const rowKey = this.buildRowKey(
      materialId,
      selectedUnitCost,
      materialSourceType,
      sourceProjectTargetId,
    );
    const existing = ledgerRows.get(rowKey);
    if (existing) {
      return existing;
    }

    const material = materialSnapshotById.get(materialId);
    if (!material && !fallbackLine) {
      throw new BadRequestException(`项目物料不存在: materialId=${materialId}`);
    }

    const row: ProjectMaterialViewRow = {
      materialId,
      materialSourceType,
      sourceProjectTargetId,
      materialCodeSnapshot:
        material?.materialCode ?? fallbackLine?.materialCodeSnapshot ?? "",
      materialNameSnapshot:
        material?.materialName ?? fallbackLine?.materialNameSnapshot ?? "",
      materialSpecSnapshot:
        material?.specModel ?? fallbackLine?.materialSpecSnapshot ?? null,
      unitCodeSnapshot:
        material?.unitCode ?? fallbackLine?.unitCodeSnapshot ?? "",
      selectedUnitCost,
      priceLayerAvailableQty: new Prisma.Decimal(0),
      priceLayerSourceLogCount: 0,
      targetQty: new Prisma.Decimal(0),
      targetUnitPrice: new Prisma.Decimal(0),
      targetAmount: new Prisma.Decimal(0),
      currentInventoryQty: new Prisma.Decimal(0),
      outboundQty: new Prisma.Decimal(0),
      outboundAmount: new Prisma.Decimal(0),
      outboundCostAmount: new Prisma.Decimal(0),
      returnQty: new Prisma.Decimal(0),
      returnAmount: new Prisma.Decimal(0),
      returnCostAmount: new Prisma.Decimal(0),
      netShipmentQty: new Prisma.Decimal(0),
      netShipmentAmount: new Prisma.Decimal(0),
      netShipmentCostAmount: new Prisma.Decimal(0),
      pendingSupplyQty: new Prisma.Decimal(0),
      remark: fallbackLine?.remark ?? null,
      lastShipmentDate: null,
      linkedDocuments: [],
    };

    ledgerRows.set(rowKey, row);
    return row;
  }

  private findProjectRowsForMaterial(
    ledgerRows: Map<string, ProjectMaterialViewRow>,
    materialId: number,
  ) {
    return Array.from(ledgerRows.values()).filter(
      (row) =>
        row.materialId === materialId &&
        row.materialSourceType === "PROJECT_STOCK",
    );
  }

  private applyMaterialLinesToProjectRows(
    rows: ProjectMaterialViewRow[],
    materialLines: SalesProjectRecord["materialLines"],
  ) {
    const rowsWithCurrentStockFirst = [...rows].sort((left, right) => {
      if (left.currentInventoryQty.gt(0) && !right.currentInventoryQty.gt(0)) {
        return -1;
      }
      if (!left.currentInventoryQty.gt(0) && right.currentInventoryQty.gt(0)) {
        return 1;
      }
      return 0;
    });

    rowsWithCurrentStockFirst.forEach((row, index) => {
      this.applyMaterialLineSnapshots(row, materialLines, {
        includeTargetTotals: index === 0,
      });
    });
  }

  private buildRowKey(
    materialId: number,
    selectedUnitCost: Prisma.Decimal | null,
    materialSourceType: ProjectMaterialViewRow["materialSourceType"],
    sourceProjectTargetId: number | null,
  ) {
    return [
      materialId,
      materialSourceType,
      sourceProjectTargetId ?? "unattributed",
      selectedUnitCost?.toString() ?? "no-price-layer",
    ].join(":");
  }

  private applyMaterialLineSnapshots(
    row: ProjectMaterialViewRow,
    lines: Array<{
      quantity: Prisma.Decimal | number | string;
      unitPrice: Prisma.Decimal | number | string;
      amount: Prisma.Decimal | number | string;
      remark: string | null;
    }>,
    options: { includeTargetTotals?: boolean } = {},
  ) {
    const includeTargetTotals = options.includeTargetTotals ?? true;
    for (const line of lines) {
      if (includeTargetTotals) {
        row.targetQty = row.targetQty.add(toDecimal(line.quantity));
        row.targetAmount = row.targetAmount.add(toDecimal(line.amount));
      }
      row.targetUnitPrice = toDecimal(line.unitPrice);
      row.remark = line.remark ?? row.remark;
    }
  }
}
