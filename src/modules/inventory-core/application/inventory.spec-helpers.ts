import {
  InventoryOperationType,
  SourceUsageStatus,
  StockDirection,
} from "../../../../generated/prisma/client";

export const mockBalance = {
  id: 1,
  materialId: 10,
  quantityOnHand: 100,
  rowVersion: 0,
  createdBy: null,
  createdAt: new Date(),
  updatedBy: null,
  updatedAt: new Date(),
};

export const mockLog = {
  id: 1,
  balanceId: 1,
  materialId: 10,
  workshopId: 20,
  bizDate: new Date("2026-04-09"),
  direction: StockDirection.IN,
  operationType: InventoryOperationType.ACCEPTANCE_IN,
  businessModule: "inbound",
  businessDocumentType: "StockInOrder",
  businessDocumentId: 100,
  businessDocumentNumber: "SI-001",
  businessDocumentLineId: null,
  changeQty: 50,
  beforeQty: 100,
  afterQty: 150,
  operatorId: "1",
  occurredAt: new Date(),
  reversalOfLogId: null,
  idempotencyKey: "test-key-1",
  note: null,
};

export const mockSourceUsage = {
  id: 10,
  materialId: 10,
  sourceLogId: 1,
  consumerDocumentType: "WorkshopMaterialOrder",
  consumerDocumentId: 300,
  consumerLineId: 1,
  allocatedQty: 30,
  releasedQty: 0,
  status: SourceUsageStatus.ALLOCATED,
  createdBy: "1",
  createdAt: new Date(),
  updatedBy: "1",
  updatedAt: new Date(),
};

export const createStockScopeCompatibilityServiceMock = () => ({
  resolveRequired: jest
    .fn()
    .mockImplementation(async ({ stockScope, workshopId }) => ({
      stockScope: stockScope ?? "MAIN",
      stockScopeId: 1,
      workshopId: workshopId ?? 20,
      workshopCode: stockScope === "RD_SUB" ? "RD" : "MAIN",
      workshopName: stockScope === "RD_SUB" ? "研发小仓" : "主仓",
    })),
  resolveOptional: jest
    .fn()
    .mockImplementation(async ({ stockScope, workshopId }) => {
      if (!stockScope && !workshopId) {
        return null;
      }

      return {
        stockScope: stockScope ?? "MAIN",
        stockScopeId: 1,
        workshopId: workshopId ?? 20,
        workshopCode: stockScope === "RD_SUB" ? "RD" : "MAIN",
        workshopName: stockScope === "RD_SUB" ? "研发小仓" : "主仓",
      };
    }),
  listRealStockWorkshopIds: jest.fn().mockResolvedValue([20]),
  listRealStockScopeIds: jest.fn().mockResolvedValue([1]),
  resolveByStockScope: jest.fn(),
  resolveByWorkshopId: jest.fn(),
});
