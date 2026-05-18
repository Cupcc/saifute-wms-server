import { Prisma } from "../../../../generated/prisma/client";
import type { SalesProjectRepository } from "../infrastructure/sales-project.repository";
import { toDecimal } from "./sales-project.shared";
import type { ProjectMaterialViewRow } from "./sales-project-material-view.service";

type AcceptanceLineLink = Awaited<
  ReturnType<
    SalesProjectRepository["findEffectiveAcceptanceLineLinksByProjectId"]
  >
>[number];

export type ProjectMaterialLinkedDocument = {
  documentType: "StockInOrder";
  documentId: number;
  documentNo: string;
  documentDate: Date;
  documentLabel: "验收单";
  lineId: number;
  lineNo: number;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
};

export function appendLinkedAcceptanceDocuments(
  ledgerRows: Map<string, ProjectMaterialViewRow>,
  links: AcceptanceLineLink[],
) {
  const projectRows = Array.from(ledgerRows.values()).filter(
    (row) => row.materialSourceType === "PROJECT_STOCK",
  );

  for (const link of links) {
    const linkUnitPrice = toDecimal(link.unitPrice);
    const materialRows = projectRows.filter(
      (row) => row.materialId === link.materialId,
    );
    const exactRows = materialRows.filter((row) =>
      row.selectedUnitCost?.eq(linkUnitPrice),
    );
    const candidateRows = exactRows.length > 0 ? exactRows : materialRows;
    const row =
      candidateRows.find((item) => item.currentInventoryQty.gt(0)) ??
      candidateRows[0];

    if (!row || hasLinkedDocument(row, link.id)) {
      continue;
    }

    row.linkedDocuments.push({
      documentType: "StockInOrder",
      documentId: link.order.id,
      documentNo: link.order.documentNo,
      documentDate: link.order.bizDate,
      documentLabel: "验收单",
      lineId: link.id,
      lineNo: link.lineNo,
      quantity: toDecimal(link.quantity),
      unitPrice: linkUnitPrice,
    });
  }
}

export function buildProjectMaterialSummary(items: ProjectMaterialViewRow[]) {
  const summary = items.reduce(
    (acc, row) => ({
      materialLineCount: acc.materialLineCount + 1,
      totalPriceLayerCount:
        acc.totalPriceLayerCount +
        (row.selectedUnitCost !== null && row.priceLayerAvailableQty.gt(0)
          ? 1
          : 0),
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
      totalPriceLayerCount: 0,
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
    ...summary,
    materialKindCount: new Set(items.map((item) => item.materialId)).size,
  };
}

function hasLinkedDocument(row: ProjectMaterialViewRow, lineId: number) {
  return row.linkedDocuments.some((document) => document.lineId === lineId);
}
