import { Test } from "@nestjs/testing";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  Prisma,
  RdMaterialStatusEventType,
} from "../../../../generated/prisma/client";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import { RdProcurementItemService } from "./rd-procurement-item.service";
import { RdProcurementRequestService } from "./rd-procurement-request.service";

export const mockRdProject = {
  id: 701,
  projectCode: "RD-PJT-001",
  projectName: "研发治具项目",
  projectTargetId: 7001,
  workshopId: 9,
  lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
};

export const mockRequest = {
  id: 1,
  documentNo: "RDPUR-001",
  bizDate: new Date("2026-03-29"),
  projectCode: "RD-PJT-001",
  projectName: "研发治具项目",
  supplierId: 10,
  handlerPersonnelId: 20,
  stockScopeId: 2,
  workshopId: 9,
  lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
  auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
  revisionNo: 1,
  supplierCodeSnapshot: "SUP001",
  supplierNameSnapshot: "Supplier A",
  handlerNameSnapshot: "Handler A",
  workshopNameSnapshot: "研发小仓",
  totalQty: new Prisma.Decimal(5),
  totalAmount: new Prisma.Decimal(50),
  remark: "rd procurement",
  voidReason: null,
  voidedBy: null,
  voidedAt: null,
  createdBy: "5",
  createdAt: new Date(),
  updatedBy: "5",
  updatedAt: new Date(),
  clientRequestId: null,
  lines: [
    {
      id: 11,
      requestId: 1,
      lineNo: 1,
      materialId: 100,
      material: {
        id: 100,
        materialCode: "MAT001",
        materialName: "Material A",
        specModel: "Spec",
        categoryId: null,
        unitCode: "PCS",
        warningMinQty: null,
        warningMaxQty: null,
        status: "ACTIVE" as const,
        creationMode: "MANUAL" as const,
        sourceDocumentType: null,
        sourceDocumentId: null,
        createdBy: "5",
        createdAt: new Date(),
        updatedBy: "5",
        updatedAt: new Date(),
      },
      materialCodeSnapshot: "MAT001",
      materialNameSnapshot: "Material A",
      materialSpecSnapshot: "Spec",
      unitCodeSnapshot: "PCS",
      materialBindingSource: "LEGACY" as const,
      materialBoundAt: new Date(),
      materialBoundBy: "5",
      quantity: new Prisma.Decimal(5),
      unitPrice: new Prisma.Decimal(10),
      amount: new Prisma.Decimal(50),
      statusLedger: {
        id: 101,
        requestLineId: 11,
        pendingQty: new Prisma.Decimal(5),
        inProcurementQty: new Prisma.Decimal(0),
        canceledQty: new Prisma.Decimal(0),
        acceptedQty: new Prisma.Decimal(0),
        handedOffQty: new Prisma.Decimal(0),
        scrappedQty: new Prisma.Decimal(0),
        returnedQty: new Prisma.Decimal(0),
        lastEventAt: null,
        createdBy: "5",
        createdAt: new Date(),
        updatedBy: "5",
        updatedAt: new Date(),
      },
      statusHistories: [],
      remark: null,
      createdBy: "5",
      createdAt: new Date(),
      updatedBy: "5",
      updatedAt: new Date(),
    },
  ],
};

export const buildStatusHistory = (
  overrides: Record<string, unknown> = {},
) => ({
  id: 501,
  requestLineId: 11,
  eventType: RdMaterialStatusEventType.PROCUREMENT_STARTED,
  fromStatus: "PENDING_PROCUREMENT",
  toStatus: "IN_PROCUREMENT",
  quantity: new Prisma.Decimal(2),
  sourceDocumentType: "RdProcurementRequest",
  sourceDocumentId: 1,
  sourceDocumentLineId: 11,
  sourceDocumentNumber: "RDPUR-001",
  referenceNo: null,
  reason: null,
  note: null,
  relatedInventoryLogId: null,
  reversalOfHistoryId: null,
  isReversed: false,
  reversedBy: null,
  reversedAt: null,
  createdBy: "5",
  createdAt: new Date(),
  requestLine: { id: 11, requestId: 1, materialId: 100 },
  ...overrides,
});

export interface RdProcurementRequestTestContext {
  service: RdProcurementRequestService;
  repository: jest.Mocked<RdProcurementRequestRepository>;
  masterDataService: jest.Mocked<MasterDataService>;
  inventoryService: jest.Mocked<InventoryService>;
}

export async function setupRdProcurementRequestTestModule(): Promise<RdProcurementRequestTestContext> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RdProcurementRequestService,
      {
        provide: RdProcurementItemService,
        useValue: {
          resolveCreateLines: jest.fn().mockImplementation(
            (
              lines: Array<{
                materialId?: number;
                materialName?: string;
                specModel?: string;
                unitCode?: string;
                quantity: string;
                unitPrice?: string;
                remark?: string;
              }>,
              operatorId?: string,
            ) =>
              Promise.resolve(
                lines.map((line, index) => {
                  const quantity = new Prisma.Decimal(line.quantity);
                  const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
                  return {
                    lineNo: index + 1,
                    materialId: line.materialId ?? null,
                    materialCodeSnapshot: line.materialId ? "MAT001" : null,
                    materialNameSnapshot:
                      line.materialId != null
                        ? "Material A"
                        : (line.materialName ?? ""),
                    materialSpecSnapshot:
                      line.materialId != null
                        ? "Spec"
                        : (line.specModel ?? null),
                    unitCodeSnapshot:
                      line.materialId != null ? "PCS" : (line.unitCode ?? ""),
                    materialBindingSource:
                      line.materialId != null ? "BOM_CATALOG" : null,
                    materialBoundAt:
                      line.materialId != null ? new Date() : null,
                    materialBoundBy:
                      line.materialId != null ? (operatorId ?? null) : null,
                    quantity,
                    unitPrice,
                    amount: quantity.mul(unitPrice),
                    remark: line.remark,
                    createdBy: operatorId,
                    updatedBy: operatorId,
                  };
                }),
              ),
          ),
          bindForAcceptance: jest.fn().mockResolvedValue(mockRequest.lines[0]),
        },
      },
      {
        provide: RdProcurementRequestRepository,
        useValue: {
          runInTransaction: jest.fn(
            (handler: (tx: unknown) => Promise<unknown>) => handler({}),
          ),
          client: {},
          findRequests: jest.fn(),
          findRequestById: jest.fn(),
          findRequestByDocumentNo: jest.fn(),
          findRequestByClientRequestId: jest.fn(),
          findDocumentNosByPrefix: jest.fn().mockResolvedValue([]),
          findStatusHistoryById: jest.fn(),
          linkStatusHistoriesToInventoryLog: jest
            .fn()
            .mockResolvedValue({ count: 1 }),
          createRequest: jest.fn(),
          updateRequest: jest.fn(),
        },
      },
      {
        provide: InventoryService,
        useValue: {
          settleConsumerOut: jest.fn().mockResolvedValue({
            outLog: { id: 3001 },
            settledUnitCost: new Prisma.Decimal(10),
            settledCostAmount: new Prisma.Decimal(20),
            allocations: [
              {
                sourceLogId: 101,
                allocatedQty: new Prisma.Decimal(2),
                unitCost: new Prisma.Decimal(10),
                costAmount: new Prisma.Decimal(20),
              },
            ],
          }),
          increaseStock: jest.fn().mockResolvedValue({ id: 3002 }),
          reverseStock: jest.fn().mockResolvedValue({ id: 3100 }),
          releaseSourceUsagesForConsumerLine: jest
            .fn()
            .mockResolvedValue(undefined),
          hasUnreleasedAllocations: jest.fn().mockResolvedValue(false),
          getLogsForDocument: jest.fn().mockResolvedValue([]),
        },
      },
      {
        provide: RdProjectLookupService,
        useValue: {
          requireEffectiveProjectByCode: jest
            .fn()
            .mockResolvedValue(mockRdProject),
          requireEffectiveProjectById: jest
            .fn()
            .mockResolvedValue(mockRdProject),
          ensureProjectTarget: jest.fn().mockResolvedValue(7001),
        },
      },
      {
        provide: MasterDataService,
        useValue: {
          getStockScopeByCode: jest.fn().mockResolvedValue({
            id: 2,
            scopeCode: "RD_SUB",
            scopeName: "研发小仓",
          }),
          getMaterialById: jest.fn().mockResolvedValue({
            id: 100,
            materialCode: "MAT001",
            materialName: "Material A",
            specModel: "Spec",
            unitCode: "PCS",
          }),
          getWorkshopById: jest.fn().mockResolvedValue({
            id: 9,
            workshopName: "研发小仓",
            defaultHandlerPersonnelId: null,
            defaultHandlerPersonnel: null,
            status: "ACTIVE",
            createdBy: null,
            createdAt: new Date("2026-03-29T00:00:00.000Z"),
            updatedBy: null,
            updatedAt: new Date("2026-03-29T00:00:00.000Z"),
          }),
          getSupplierById: jest.fn().mockResolvedValue({
            id: 10,
            supplierCode: "SUP001",
            supplierName: "Supplier A",
          }),
          getPersonnelById: jest.fn().mockResolvedValue({
            id: 20,
            personnelName: "Handler A",
          }),
        },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(RdProcurementRequestService),
    repository: moduleRef.get(RdProcurementRequestRepository),
    masterDataService: moduleRef.get(MasterDataService),
    inventoryService: moduleRef.get(InventoryService),
  };
}
