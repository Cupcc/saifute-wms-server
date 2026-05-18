import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import type { ApprovalService } from "../../approval/application/approval.service";
import type { InventoryService } from "../../inventory-core/application/inventory.service";
import type { MasterDataService } from "../../master-data/application/master-data.service";
import type { SupplierService } from "../../master-data/application/supplier.service";
import type { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import type { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundAcceptanceCreationService } from "./inbound-acceptance-creation.service";
import type { InboundAcceptanceLineSnapshotService } from "./inbound-acceptance-line-snapshot.service";
import { InboundSharedService } from "./inbound-shared.service";

jest.mock(
  "../../rd-subwarehouse/application/rd-material-status.helper",
  () => ({
    applyAcceptanceStatusesForOrder: jest.fn().mockResolvedValue(undefined),
  }),
);

describe("InboundAcceptanceCreationService supplier auto-create", () => {
  const tx = {};
  const material = {
    id: 100,
    materialCode: "MAT001",
    materialName: "Material A",
    specModel: "Spec",
    unitCode: "PCS",
    category: {
      id: 99,
      categoryCode: "RESISTOR",
      categoryName: "电阻",
    },
  };
  const autoSupplier = {
    id: 31,
    supplierCode: "AUTO-SUP-YS20250314101010001",
    supplierName: "自动补建供应商",
  };
  const line = {
    id: 501,
    orderId: 88,
    lineNo: 1,
    materialId: 100,
    rdProcurementRequestLineId: null,
    materialCategoryIdSnapshot: 99,
    materialCategoryCodeSnapshot: "RESISTOR",
    materialCategoryNameSnapshot: "电阻",
    materialCategoryPathSnapshot: [
      { id: 99, categoryCode: "RESISTOR", categoryName: "电阻" },
    ],
    materialCodeSnapshot: "MAT001",
    materialNameSnapshot: "Material A",
    materialSpecSnapshot: "Spec",
    unitCodeSnapshot: "PCS",
    quantity: new Prisma.Decimal(100),
    unitPrice: new Prisma.Decimal(10),
    amount: new Prisma.Decimal(1000),
    remark: null,
    createdBy: "1",
    createdAt: new Date("2025-03-14T00:00:00.000Z"),
    updatedBy: "1",
    updatedAt: new Date("2025-03-14T00:00:00.000Z"),
  };
  const createdOrder = {
    id: 88,
    documentNo: "YS20250314101010001",
    orderType: StockInOrderType.ACCEPTANCE,
    bizDate: new Date("2025-03-14"),
    supplierId: null,
    handlerPersonnelId: null,
    stockScopeId: 1,
    workshopId: null,
    rdProcurementRequestId: null,
    lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
    auditStatusSnapshot: AuditStatusSnapshot.PENDING,
    inventoryEffectStatus: InventoryEffectStatus.POSTED,
    revisionNo: 1,
    supplierCodeSnapshot: null,
    supplierNameSnapshot: null,
    handlerNameSnapshot: "当前账号昵称",
    workshopNameSnapshot: null,
    rdProcurementRequestNoSnapshot: null,
    rdProcurementProjectCodeSnapshot: null,
    rdProcurementProjectNameSnapshot: null,
    totalQty: new Prisma.Decimal(100),
    totalAmount: new Prisma.Decimal(1000),
    remark: null,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    createdBy: "1",
    createdAt: new Date("2025-03-14T00:00:00.000Z"),
    updatedBy: "1",
    updatedAt: new Date("2025-03-14T00:00:00.000Z"),
    lines: [line],
  };

  it("persists a free-text supplier through master-data before stock posting", async () => {
    const orderWithSupplier = {
      ...createdOrder,
      supplierId: autoSupplier.id,
      supplierCodeSnapshot: autoSupplier.supplierCode,
      supplierNameSnapshot: autoSupplier.supplierName,
    };
    const repository = {
      runInTransaction: jest.fn((handler) => handler(tx)),
      createOrder: jest.fn().mockResolvedValue(createdOrder),
      updateOrder: jest.fn().mockResolvedValue(orderWithSupplier),
    } as unknown as jest.Mocked<InboundRepository>;
    const masterDataService = {
      getMaterialById: jest.fn().mockResolvedValue(material),
      getStockScopeByCode: jest.fn().mockResolvedValue({
        id: 1,
        scopeCode: "MAIN",
        scopeName: "主仓",
      }),
      getSupplierById: jest.fn(),
      getPersonnelById: jest.fn(),
    } as unknown as jest.Mocked<MasterDataService>;
    const supplierService = {
      ensure: jest.fn().mockResolvedValue(autoSupplier),
    } as unknown as jest.Mocked<SupplierService>;
    const inventoryService = {
      increaseStock: jest.fn().mockResolvedValue({ id: 9001 }),
    } as unknown as jest.Mocked<InventoryService>;
    const approvalService = {
      createOrRefreshApprovalDocument: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ApprovalService>;
    const lineSnapshots = {
      buildLineWriteData: jest.fn().mockResolvedValue({
        lineNo: 1,
        materialId: 100,
        rdProcurementRequestLineId: null,
        materialCategoryIdSnapshot: 99,
        materialCategoryCodeSnapshot: "RESISTOR",
        materialCategoryNameSnapshot: "电阻",
        materialCategoryPathSnapshot: [
          { id: 99, categoryCode: "RESISTOR", categoryName: "电阻" },
        ],
        materialCodeSnapshot: "MAT001",
        materialNameSnapshot: "Material A",
        materialSpecSnapshot: "Spec",
        unitCodeSnapshot: "PCS",
        quantity: new Prisma.Decimal(100),
        unitPrice: new Prisma.Decimal(10),
        amount: new Prisma.Decimal(1000),
        remark: undefined,
      }),
      markAutoMaterialSourceDocument: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<InboundAcceptanceLineSnapshotService>;
    const shared = new InboundSharedService(
      masterDataService,
      { getRequestById: jest.fn() } as unknown as RdProcurementRequestService,
      repository,
      supplierService,
    );
    const service = new InboundAcceptanceCreationService(
      repository,
      inventoryService,
      approvalService,
      lineSnapshots,
      shared,
    );

    const result = await service.createOrder(
      {
        orderType: StockInOrderType.ACCEPTANCE,
        bizDate: "2025-03-14",
        supplierName: "  自动补建供应商  ",
        handlerName: "当前账号昵称",
        lines: [{ materialId: 100, quantity: "100", unitPrice: "10" }],
      },
      "1",
    );

    expect(supplierService.ensure).toHaveBeenCalledWith(
      {
        supplierCode: "AUTO-SUP-YS20250314101010001",
        supplierName: "自动补建供应商",
        sourceDocumentType: BusinessDocumentType.StockInOrder,
        sourceDocumentId: 88,
      },
      "1",
      tx,
    );
    expect(repository.updateOrder).toHaveBeenCalledWith(
      88,
      expect.objectContaining({
        supplierId: 31,
        supplierCodeSnapshot: "AUTO-SUP-YS20250314101010001",
        supplierNameSnapshot: "自动补建供应商",
      }),
      tx,
    );
    expect(inventoryService.increaseStock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessDocumentType: BusinessDocumentType.StockInOrder,
        businessDocumentId: 88,
        businessDocumentNumber: "YS20250314101010001",
      }),
      tx,
    );
    expect(
      approvalService.createOrRefreshApprovalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentFamily: DocumentFamily.STOCK_IN,
        documentType: BusinessDocumentType.StockInOrder,
        documentId: 88,
      }),
      tx,
    );
    expect(result).toEqual(orderWithSupplier);
  });
});
