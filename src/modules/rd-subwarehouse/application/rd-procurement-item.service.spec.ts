import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
  RdProcurementMaterialBindingSource,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import { RdProcurementItemService } from "./rd-procurement-item.service";

describe("RdProcurementItemService", () => {
  let service: RdProcurementItemService;
  let repository: jest.Mocked<RdProcurementRequestRepository>;
  let masterDataService: jest.Mocked<MasterDataService>;
  let rdProjectLookupService: jest.Mocked<RdProjectLookupService>;
  const tx = {} as Prisma.TransactionClient;

  const activeMaterial = {
    id: 100,
    materialCode: "MAT001",
    materialName: "标准电机",
    specModel: "24V",
    unitCode: "PCS",
    status: "ACTIVE",
    creationMode: "MANUAL",
  };

  beforeEach(() => {
    repository = {
      findAcceptanceMaterialOptions: jest.fn(),
      lockRequestLineForUpdate: jest.fn(),
      findRequestLineById: jest.fn(),
      bindMaterialIfUnbound: jest.fn(),
    } as unknown as jest.Mocked<RdProcurementRequestRepository>;
    masterDataService = {
      listMaterials: jest.fn(),
      getMaterialById: jest.fn(),
    } as unknown as jest.Mocked<MasterDataService>;
    rdProjectLookupService = {
      listEffectiveBomMaterialSuggestions: jest.fn(),
      requireEffectiveProjectByCode: jest.fn(),
      assertMaterialInEffectiveBomCatalog: jest.fn(),
    } as unknown as jest.Mocked<RdProjectLookupService>;
    service = new RdProcurementItemService(
      repository,
      masterDataService,
      rdProjectLookupService,
    );
  });

  it("builds a free-text procurement item without looking up or creating material", async () => {
    const [line] = await service.resolveCreateLines(
      [
        {
          materialName: "  一次性定制夹具  ",
          specModel: "  图号 A-01  ",
          unitCode: "  SET  ",
          quantity: "2",
          unitPrice: "12.5",
        },
      ],
      "rd-user",
    );

    expect(line).toEqual(
      expect.objectContaining({
        materialId: null,
        materialCodeSnapshot: null,
        materialNameSnapshot: "一次性定制夹具",
        materialSpecSnapshot: "图号 A-01",
        unitCodeSnapshot: "SET",
        materialBindingSource: null,
        materialBoundAt: null,
        materialBoundBy: null,
      }),
    );
    expect(
      rdProjectLookupService.assertMaterialInEffectiveBomCatalog,
    ).not.toHaveBeenCalled();
    expect(masterDataService.getMaterialById).not.toHaveBeenCalled();
  });

  it("freezes server-side snapshots only after BOM catalog membership validation", async () => {
    rdProjectLookupService.assertMaterialInEffectiveBomCatalog.mockResolvedValue(
      activeMaterial as never,
    );

    const [line] = await service.resolveCreateLines(
      [{ materialId: 100, quantity: "1", unitPrice: "8" }],
      "rd-user",
    );

    expect(
      rdProjectLookupService.assertMaterialInEffectiveBomCatalog,
    ).toHaveBeenCalledWith(100);
    expect(line).toEqual(
      expect.objectContaining({
        materialId: 100,
        materialCodeSnapshot: "MAT001",
        materialNameSnapshot: "标准电机",
        materialBindingSource: RdProcurementMaterialBindingSource.BOM_CATALOG,
        materialBoundBy: "rd-user",
      }),
    );
  });

  it("requires an existing material when an unbound line is accepted", async () => {
    repository.lockRequestLineForUpdate.mockResolvedValue({
      id: 11,
      materialId: null,
      materialNameSnapshot: "一次性定制夹具",
      material: null,
      request: { lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE },
      statusLedger: null,
    } as never);

    await expect(
      service.bindForAcceptance({ requestId: 1, lineId: 11, tx }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.bindMaterialIfUnbound).not.toHaveBeenCalled();
  });

  it("locks and compare-and-sets the first acceptance material binding", async () => {
    repository.lockRequestLineForUpdate.mockResolvedValue({
      id: 11,
      materialId: null,
      materialNameSnapshot: "一次性定制夹具",
      material: null,
      request: { lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE },
      statusLedger: null,
    } as never);
    masterDataService.getMaterialById.mockResolvedValue(
      activeMaterial as never,
    );
    repository.bindMaterialIfUnbound.mockResolvedValue({ count: 1 });
    repository.findRequestLineById.mockResolvedValue({
      id: 11,
      materialId: 100,
      material: activeMaterial,
    } as never);

    const result = await service.bindForAcceptance({
      requestId: 1,
      lineId: 11,
      requestedMaterialId: 100,
      operatorId: "rd-user",
      tx,
    });

    expect(repository.lockRequestLineForUpdate).toHaveBeenCalledWith(1, 11, tx);
    expect(repository.bindMaterialIfUnbound).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 1,
        lineId: 11,
        materialId: 100,
        materialBoundBy: "rd-user",
      }),
      tx,
    );
    expect(result.materialId).toBe(100);
  });

  it("rejects changing an existing binding with 409 semantics", async () => {
    repository.lockRequestLineForUpdate.mockResolvedValue({
      id: 11,
      materialId: 100,
      materialNameSnapshot: "一次性定制夹具",
      material: activeMaterial,
      request: { lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE },
      statusLedger: null,
    } as never);

    await expect(
      service.bindForAcceptance({
        requestId: 1,
        lineId: 11,
        requestedMaterialId: 101,
        tx,
      }),
    ).rejects.toThrow(ConflictException);
    expect(masterDataService.getMaterialById).not.toHaveBeenCalled();
  });

  it("treats a lost CAS with another material as a binding conflict", async () => {
    repository.lockRequestLineForUpdate.mockResolvedValue({
      id: 11,
      materialId: null,
      materialNameSnapshot: "一次性定制夹具",
      material: null,
      request: { lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE },
      statusLedger: null,
    } as never);
    masterDataService.getMaterialById.mockResolvedValue(
      activeMaterial as never,
    );
    repository.bindMaterialIfUnbound.mockResolvedValue({ count: 0 });
    repository.findRequestLineById.mockResolvedValue({
      id: 11,
      materialId: 101,
    } as never);

    await expect(
      service.bindForAcceptance({
        requestId: 1,
        lineId: 11,
        requestedMaterialId: 100,
        tx,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
