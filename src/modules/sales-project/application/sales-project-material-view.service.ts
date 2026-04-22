import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  SalesStockOrderType,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { SalesProjectRepository } from "../infrastructure/sales-project.repository";
import {
  maxZero,
  SALES_PROJECT_LABEL,
  SALES_PROJECT_STOCK_SCOPE,
  toDecimal,
} from "./sales-project.shared";

export type SalesProjectRecord = NonNullable<
  Awaited<ReturnType<SalesProjectRepository["findProjectById"]>>
>;

export type ProjectMaterialViewRow = {
  materialId: number;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitCodeSnapshot: string;
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
    const shipmentLines =
      await this.repository.findEffectiveShipmentLinesByProjectId(
        project.id,
        tx,
      );

    const ledgerSeed = new Map<number, ProjectMaterialViewRow>();

    for (const line of project.materialLines) {
      ledgerSeed.set(line.materialId, {
        materialId: line.materialId,
        materialCodeSnapshot: line.materialCodeSnapshot,
        materialNameSnapshot: line.materialNameSnapshot,
        materialSpecSnapshot: line.materialSpecSnapshot,
        unitCodeSnapshot: line.unitCodeSnapshot,
        targetQty: toDecimal(line.quantity),
        targetUnitPrice: toDecimal(line.unitPrice),
        targetAmount: toDecimal(line.amount),
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
        remark: line.remark ?? null,
        lastShipmentDate: null,
      });
    }

    for (const line of shipmentLines) {
      const current = ledgerSeed.get(line.materialId) ?? {
        materialId: line.materialId,
        materialCodeSnapshot: line.materialCodeSnapshot,
        materialNameSnapshot: line.materialNameSnapshot,
        materialSpecSnapshot: line.materialSpecSnapshot,
        unitCodeSnapshot: line.unitCodeSnapshot,
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
        remark: line.remark ?? null,
        lastShipmentDate: null,
      };

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

      if (
        current.lastShipmentDate == null ||
        current.lastShipmentDate.getTime() < line.order.bizDate.getTime()
      ) {
        current.lastShipmentDate = line.order.bizDate;
      }

      ledgerSeed.set(line.materialId, current);
    }

    const items = await Promise.all(
      Array.from(ledgerSeed.values()).map(async (row) => {
        const balance = await this.inventoryService.getBalanceSnapshot(
          {
            materialId: row.materialId,
            stockScope: SALES_PROJECT_STOCK_SCOPE,
          },
          tx,
        );
        const currentInventoryQty = toDecimal(balance?.quantityOnHand);
        const netShipmentQty = row.outboundQty.sub(row.returnQty);
        const netShipmentAmount = row.outboundAmount.sub(row.returnAmount);
        const netShipmentCostAmount = row.outboundCostAmount.sub(
          row.returnCostAmount,
        );
        const pendingSupplyQty = maxZero(row.targetQty.sub(netShipmentQty));

        return {
          ...row,
          currentInventoryQty,
          netShipmentQty,
          netShipmentAmount,
          netShipmentCostAmount,
          pendingSupplyQty,
        };
      }),
    );

    const summary = items.reduce(
      (acc, row) => ({
        materialLineCount: acc.materialLineCount + 1,
        totalTargetQty: acc.totalTargetQty.add(row.targetQty),
        totalTargetAmount: acc.totalTargetAmount.add(row.targetAmount),
        totalCurrentInventoryQty: acc.totalCurrentInventoryQty.add(
          row.currentInventoryQty,
        ),
        totalOutboundQty: acc.totalOutboundQty.add(row.outboundQty),
        totalOutboundAmount: acc.totalOutboundAmount.add(row.outboundAmount),
        totalOutboundCostAmount: acc.totalOutboundCostAmount.add(
          row.outboundCostAmount,
        ),
        totalReturnQty: acc.totalReturnQty.add(row.returnQty),
        totalReturnAmount: acc.totalReturnAmount.add(row.returnAmount),
        totalReturnCostAmount: acc.totalReturnCostAmount.add(
          row.returnCostAmount,
        ),
        totalNetShipmentQty: acc.totalNetShipmentQty.add(row.netShipmentQty),
        totalNetShipmentAmount: acc.totalNetShipmentAmount.add(
          row.netShipmentAmount,
        ),
        totalNetShipmentCostAmount: acc.totalNetShipmentCostAmount.add(
          row.netShipmentCostAmount,
        ),
        totalPendingSupplyQty: acc.totalPendingSupplyQty.add(
          row.pendingSupplyQty,
        ),
      }),
      {
        materialLineCount: 0,
        totalTargetQty: new Prisma.Decimal(0),
        totalTargetAmount: new Prisma.Decimal(0),
        totalCurrentInventoryQty: new Prisma.Decimal(0),
        totalOutboundQty: new Prisma.Decimal(0),
        totalOutboundAmount: new Prisma.Decimal(0),
        totalOutboundCostAmount: new Prisma.Decimal(0),
        totalReturnQty: new Prisma.Decimal(0),
        totalReturnAmount: new Prisma.Decimal(0),
        totalReturnCostAmount: new Prisma.Decimal(0),
        totalNetShipmentQty: new Prisma.Decimal(0),
        totalNetShipmentAmount: new Prisma.Decimal(0),
        totalNetShipmentCostAmount: new Prisma.Decimal(0),
        totalPendingSupplyQty: new Prisma.Decimal(0),
      },
    );

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
}
