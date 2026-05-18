import { Prisma } from "../../../../generated/prisma/client";
import {
  appendLinkedAcceptanceDocuments,
  buildProjectMaterialSummary,
} from "./sales-project-material-view.helper";
import type { ProjectMaterialViewRow } from "./sales-project-material-view.service";

describe("sales project material view helpers", () => {
  it("links acceptance forms to the matching project price layer row", () => {
    const rows = new Map<string, ProjectMaterialViewRow>([
      ["100:PROJECT_STOCK:5001:8", createRow(100, "8")],
      ["100:PROJECT_STOCK:5001:9", createRow(100, "9")],
    ]);

    appendLinkedAcceptanceDocuments(rows, [
      {
        id: 501,
        lineNo: 1,
        materialId: 100,
        unitPrice: new Prisma.Decimal(8),
        quantity: new Prisma.Decimal(25),
        order: {
          id: 401,
          documentNo: "YS20260517001",
          bizDate: new Date("2026-05-17"),
          orderType: "ACCEPTANCE",
        },
      },
    ] as never);

    expect(rows.get("100:PROJECT_STOCK:5001:8")?.linkedDocuments).toEqual([
      {
        documentType: "StockInOrder",
        documentId: 401,
        documentNo: "YS20260517001",
        documentDate: new Date("2026-05-17"),
        documentLabel: "验收单",
        lineId: 501,
        lineNo: 1,
        quantity: new Prisma.Decimal(25),
        unitPrice: new Prisma.Decimal(8),
      },
    ]);
    expect(rows.get("100:PROJECT_STOCK:5001:9")?.linkedDocuments).toEqual([]);
  });

  it("keeps summary totals independent from linked document metadata", () => {
    const row = createRow(100, "8");
    row.linkedDocuments.push({
      documentType: "StockInOrder",
      documentId: 401,
      documentNo: "YS20260517001",
      documentDate: new Date("2026-05-17"),
      documentLabel: "验收单",
      lineId: 501,
      lineNo: 1,
      quantity: new Prisma.Decimal(25),
      unitPrice: new Prisma.Decimal(8),
    });

    const summary = buildProjectMaterialSummary([row]);

    expect(summary.materialLineCount).toBe(1);
    expect(summary.materialKindCount).toBe(1);
    expect(summary.totalCurrentInventoryQty.toString()).toBe("25");
  });
});

function createRow(
  materialId: number,
  selectedUnitCost: string,
): ProjectMaterialViewRow {
  return {
    materialId,
    materialSourceType: "PROJECT_STOCK",
    sourceProjectTargetId: 5001,
    materialCodeSnapshot: "MAT-100",
    materialNameSnapshot: "Material 100",
    materialSpecSnapshot: "Spec",
    unitCodeSnapshot: "PCS",
    selectedUnitCost: new Prisma.Decimal(selectedUnitCost),
    priceLayerAvailableQty: new Prisma.Decimal(25),
    priceLayerSourceLogCount: 1,
    targetQty: new Prisma.Decimal(0),
    targetUnitPrice: new Prisma.Decimal(0),
    targetAmount: new Prisma.Decimal(0),
    currentInventoryQty: new Prisma.Decimal(25),
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
    remark: null,
    lastShipmentDate: null,
    linkedDocuments: [],
  };
}
