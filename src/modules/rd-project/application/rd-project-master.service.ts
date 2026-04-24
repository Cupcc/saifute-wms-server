import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  type Prisma,
  Prisma as PrismaNamespace,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { type StockScopeCode } from "../../session/domain/user-session";
import type { CreateRdProjectDto } from "../dto/create-rd-project.dto";
import type { CreateRdProjectMaterialActionDto } from "../dto/create-rd-project-material-action.dto";
import type { QueryRdProjectDto } from "../dto/query-rd-project.dto";
import type { QueryRdProjectMaterialActionDto } from "../dto/query-rd-project-material-action.dto";
import type { UpdateRdProjectDto } from "../dto/update-rd-project.dto";
import {
  RD_PROJECT_ACTION_DOCUMENT_TYPE,
  RD_PROJECT_DOCUMENT_TYPE,
  ensureProjectTarget as ensureSharedProjectTarget,
} from "./rd-project.shared";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
const BUSINESS_MODULE = "rd-project";
const RD_PROJECT_STOCK_SCOPE: StockScopeCode = "RD_SUB";
const RD_PROJECT_LABEL = "研发项目";
const RD_PROJECT_ACTION_LABEL = "研发项目物料动作";
type RdProjectRecord = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findProjectById"]>>
>;
type RdProjectActionRecord = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findMaterialActionById"]>>
>;
function toDecimal(
  value: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
  if (value == null) {
    return new PrismaNamespace.Decimal(0);
  }
  return new PrismaNamespace.Decimal(value);
}
function decimalMax(
  left: Prisma.Decimal,
  right: Prisma.Decimal,
): Prisma.Decimal {
  return left.gte(right) ? left : right;
}
function actionPrefix(actionType: RdProjectMaterialActionType) {
  switch (actionType) {
    case RdProjectMaterialActionType.PICK:
      return "PJPK";
    case RdProjectMaterialActionType.RETURN:
      return "PJRT";
    case RdProjectMaterialActionType.SCRAP:
      return "PJSC";
    default:
      throw new BadRequestException(`Unsupported actionType: ${actionType}`);
  }
}
function actionOperationType(actionType: RdProjectMaterialActionType) {
  switch (actionType) {
    case RdProjectMaterialActionType.PICK:
      return InventoryOperationType.RD_PROJECT_OUT;
    case RdProjectMaterialActionType.RETURN:
      return InventoryOperationType.RETURN_IN;
    case RdProjectMaterialActionType.SCRAP:
      return InventoryOperationType.SCRAP_OUT;
    default:
      throw new BadRequestException(`Unsupported actionType: ${actionType}`);
  }
}
function replenishmentStatusLabel(params: {
  shortageQty: Prisma.Decimal;
  procurementOpenQty: Prisma.Decimal;
}) {
  if (params.shortageQty.lte(0)) {
    return "充足";
  }
  if (params.procurementOpenQty.gt(0)) {
    return "补货中";
  }
  return "待补货";
}
import { RdProjectViewService } from "./rd-project-view.service";
@Injectable()
export class RdProjectMasterService {
  constructor(
    private readonly repository: RdProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly viewService: RdProjectViewService,
    private readonly rdProcurementRequestService: RdProcurementRequestService,
  ) {}
  async listProjects(
    query: QueryRdProjectDto & { stockScope?: StockScopeCode },
  ) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findProjects({
      projectCode: query.projectCode,
      projectName: query.projectName,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      customerId: query.customerId,
      supplierId: query.supplierId,
      workshopId: query.workshopId,
      stockScope: RD_PROJECT_STOCK_SCOPE,
      limit,
      offset,
    });
  }
  async getProjectById(id: number) {
    const project = await this.requireProject(id);
    return this.viewService.buildProjectView(project);
  }
  async createProject(
    dto: CreateRdProjectDto & { stockScope?: StockScopeCode },
    createdBy?: string,
  ) {
    const existing = await this.repository.findProjectByCode(dto.projectCode);
    if (existing) {
      throw new ConflictException(`研发项目编码已存在: ${dto.projectCode}`);
    }
    await this.validateMasterData(dto);
    const bizDate = new Date(dto.bizDate);
    const customerSnapshot = dto.customerId
      ? await this.resolveCustomerSnapshot(dto.customerId)
      : { customerCodeSnapshot: null, customerNameSnapshot: null };
    const supplierSnapshot = dto.supplierId
      ? await this.resolveSupplierSnapshot(dto.supplierId)
      : { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    const managerSnapshot = dto.managerPersonnelId
      ? await this.resolveManagerSnapshot(dto.managerPersonnelId)
      : { managerNameSnapshot: null };
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      RD_PROJECT_STOCK_SCOPE,
    );
    const bomLines = await this.viewService.buildBomLines(dto.bomLines ?? [], createdBy);
    const totalQty = bomLines.reduce(
      (sum, line) => sum.add(line.quantity),
      new PrismaNamespace.Decimal(0),
    );
    const totalAmount = bomLines.reduce(
      (sum, line) => sum.add(line.amount),
      new PrismaNamespace.Decimal(0),
    );
    return this.repository.runInTransaction(async (tx) => {
      const project = await this.repository.createProject(
        {
          projectCode: dto.projectCode,
          projectName: dto.projectName,
          bizDate,
          customerId: dto.customerId,
          supplierId: dto.supplierId,
          managerPersonnelId: dto.managerPersonnelId,
          stockScopeId: stockScopeRecord.id,
          workshopId: dto.workshopId,
          customerCodeSnapshot: customerSnapshot.customerCodeSnapshot,
          customerNameSnapshot: customerSnapshot.customerNameSnapshot,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
          managerNameSnapshot: managerSnapshot.managerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          createdBy,
          updatedBy: createdBy,
        },
        bomLines,
        tx,
      );
      await ensureSharedProjectTarget({
        project,
        updatedBy: createdBy,
        repository: this.repository,
        tx,
      });
      const latest = await this.repository.findProjectById(project.id, tx);
      if (!latest) {
        throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${project.id}`);
      }
      return this.viewService.buildProjectView(latest, tx);
    });
  }
  async updateProject(
    id: number,
    dto: UpdateRdProjectDto & { stockScope?: StockScopeCode },
    updatedBy?: string,
  ) {
    const existing = await this.requireProject(id);
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的研发项目不能修改");
    }
    if (dto.projectCode && dto.projectCode !== existing.projectCode) {
      const conflict = await this.repository.findProjectByCode(dto.projectCode);
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`研发项目编码已存在: ${dto.projectCode}`);
      }
      const hasProcurement = await this.hasActiveProcurementRequests(
        existing.projectCode,
        existing.workshopId,
      );
      if (hasProcurement) {
        throw new BadRequestException("已有采购补货关联，不能修改研发项目编码");
      }
      if (await this.repository.hasEffectiveMaterialActions(id)) {
        throw new BadRequestException(
          "已有研发项目物料动作，不能修改研发项目编码",
        );
      }
    }
    await this.validateMasterDataForUpdate(dto);
    const finalProjectCode = dto.projectCode ?? existing.projectCode;
    const finalProjectName = dto.projectName ?? existing.projectName;
    const finalCustomerId = dto.customerId ?? existing.customerId ?? undefined;
    const finalSupplierId = dto.supplierId ?? existing.supplierId ?? undefined;
    const finalManagerId =
      dto.managerPersonnelId ?? existing.managerPersonnelId ?? undefined;
    const finalWorkshopId = dto.workshopId ?? existing.workshopId;
    const bizDate = dto.bizDate ? new Date(dto.bizDate) : existing.bizDate;
    const customerSnapshot = finalCustomerId
      ? await this.resolveCustomerSnapshot(finalCustomerId)
      : { customerCodeSnapshot: null, customerNameSnapshot: null };
    const supplierSnapshot = finalSupplierId
      ? await this.resolveSupplierSnapshot(finalSupplierId)
      : { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    const managerSnapshot = finalManagerId
      ? await this.resolveManagerSnapshot(finalManagerId)
      : { managerNameSnapshot: null };
    const workshop =
      await this.masterDataService.getWorkshopById(finalWorkshopId);
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      RD_PROJECT_STOCK_SCOPE,
    );
    const nextBomLines =
      dto.bomLines !== undefined
        ? await this.viewService.buildBomLines(dto.bomLines, updatedBy)
        : existing.bomLines;
    const totalQty = nextBomLines.reduce(
      (sum, line) => sum.add(toDecimal(line.quantity)),
      new PrismaNamespace.Decimal(0),
    );
    const totalAmount = nextBomLines.reduce(
      (sum, line) => sum.add(toDecimal(line.amount)),
      new PrismaNamespace.Decimal(0),
    );
    return this.repository.runInTransaction(async (tx) => {
      await this.repository.updateProject(
        id,
        {
          projectCode: finalProjectCode,
          projectName: finalProjectName,
          bizDate,
          customerId: finalCustomerId,
          supplierId: finalSupplierId,
          managerPersonnelId: finalManagerId,
          stockScopeId: stockScopeRecord.id,
          workshopId: finalWorkshopId,
          customerCodeSnapshot: customerSnapshot.customerCodeSnapshot,
          customerNameSnapshot: customerSnapshot.customerNameSnapshot,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
          managerNameSnapshot: managerSnapshot.managerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark ?? existing.remark,
          revisionNo: { increment: 1 },
          updatedBy,
        },
        tx,
      );
      if (dto.bomLines !== undefined) {
        await this.repository.replaceProjectBomLines(
          id,
          nextBomLines.map((line, index) => ({
            lineNo: index + 1,
            materialId: line.materialId,
            materialCodeSnapshot: line.materialCodeSnapshot,
            materialNameSnapshot: line.materialNameSnapshot,
            materialSpecSnapshot: line.materialSpecSnapshot,
            unitCodeSnapshot: line.unitCodeSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
            remark: line.remark,
            createdBy: updatedBy,
            updatedBy,
          })),
          tx,
        );
      }
      await ensureSharedProjectTarget({
        project: {
          id,
          projectCode: finalProjectCode,
          projectName: finalProjectName,
          projectTargetId: existing.projectTargetId,
        },
        updatedBy,
        repository: this.repository,
        tx,
      });
      const latest = await this.repository.findProjectById(id, tx);
      if (!latest) {
        throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${id}`);
      }
      return this.viewService.buildProjectView(latest, tx);
    });
  }
  async voidProject(id: number, voidReason?: string, voidedBy?: string) {
    const project = await this.requireProject(id);
    if (project.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("研发项目已作废");
    }
    if (await this.repository.hasEffectiveMaterialActions(id)) {
      throw new BadRequestException("存在研发项目物料动作，不能作废研发项目");
    }
    if (
      await this.hasActiveProcurementRequests(
        project.projectCode,
        project.workshopId,
      )
    ) {
      throw new BadRequestException("存在采购补货记录，不能作废项目");
    }
    return this.repository.runInTransaction(async (tx) => {
      if (await this.repository.hasActiveDownstreamDependencies(id, tx)) {
        throw new BadRequestException("存在下游依赖，不能作废");
      }
      await this.repository.updateProject(
        id,
        {
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          voidReason: voidReason ?? null,
          voidedBy: voidedBy ?? null,
          voidedAt: new Date(),
          updatedBy: voidedBy,
        },
        tx,
      );
      const latest = await this.repository.findProjectById(id, tx);
      if (!latest) {
        throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${id}`);
      }
      return this.viewService.buildProjectView(latest, tx);
    });
  }
  async listMaterials(projectId: number) {
    const project = await this.requireProject(projectId);
    const detail = await this.viewService.buildProjectView(project);
    return detail.materialLedger;
  }
  private async requireProject(id: number, tx?: Prisma.TransactionClient) {
    const project = await this.repository.findProjectById(id, tx);
    if (!project) {
      throw new NotFoundException(`${RD_PROJECT_LABEL}不存在: ${id}`);
    }
    return project;
  }
  private async hasActiveProcurementRequests(
    projectCode: string,
    workshopId: number,
  ) {
    const result = await this.rdProcurementRequestService.listRequests({
      projectCode,
      workshopId,
      limit: 1,
      offset: 0,
    });
    return result.total > 0;
  }
  private async validateMasterData(dto: CreateRdProjectDto) {
    await this.masterDataService.getWorkshopById(dto.workshopId);
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.supplierId) {
      await this.masterDataService.getSupplierById(dto.supplierId);
    }
    if (dto.managerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.managerPersonnelId);
    }
    for (const line of dto.bomLines ?? []) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }
  private async validateMasterDataForUpdate(dto: UpdateRdProjectDto) {
    if (dto.workshopId) {
      await this.masterDataService.getWorkshopById(dto.workshopId);
    }
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.supplierId) {
      await this.masterDataService.getSupplierById(dto.supplierId);
    }
    if (dto.managerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.managerPersonnelId);
    }
    for (const line of dto.bomLines ?? []) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }
  private async resolveCustomerSnapshot(customerId?: number) {
    if (!customerId) {
      return { customerCodeSnapshot: null, customerNameSnapshot: null };
    }
    const customer = await this.masterDataService.getCustomerById(customerId);
    return {
      customerCodeSnapshot: customer.customerCode,
      customerNameSnapshot: customer.customerName,
    };
  }
  private async resolveSupplierSnapshot(supplierId?: number) {
    if (!supplierId) {
      return { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    }
    const supplier = await this.masterDataService.getSupplierById(supplierId);
    return {
      supplierCodeSnapshot: supplier.supplierCode,
      supplierNameSnapshot: supplier.supplierName,
    };
  }
  private async resolveManagerSnapshot(managerPersonnelId?: number) {
    if (!managerPersonnelId) {
      return { managerNameSnapshot: null };
    }
    const personnel =
      await this.masterDataService.getPersonnelById(managerPersonnelId);
    return { managerNameSnapshot: personnel.personnelName };
  }
}
