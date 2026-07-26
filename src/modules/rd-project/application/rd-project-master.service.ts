import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  type Prisma,
  Prisma as PrismaNamespace,
  RdProjectMaterialActionType,
} from "../../../../generated/prisma/client";
import {
  buildPendingProjectCode,
  buildRdProjectCode,
  isProjectCodeUniqueConflict,
} from "../../../shared/common/project-code.util";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProcurementRequestService } from "../../rd-subwarehouse/application/rd-procurement-request.service";
import { type StockScopeCode } from "../../session/domain/user-session";
import type { CreateRdProjectDto } from "../dto/create-rd-project.dto";
import type { QueryRdProjectDto } from "../dto/query-rd-project.dto";
import type { UpdateRdProjectDto } from "../dto/update-rd-project.dto";
import { RdProjectRepository } from "../infrastructure/rd-project.repository";
import {
  buildRdProjectBomChanges,
  buildRdProjectHeaderChanges,
  ensureProjectTarget as ensureSharedProjectTarget,
  RD_PROJECT_CHANGE_ACTIONS,
  RD_PROJECT_WORKSHOP_NAME,
  type RdProjectFieldChange,
  toDecimal,
} from "./rd-project.shared";
import { RdProjectViewService } from "./rd-project-view.service";

const RD_PROJECT_STOCK_SCOPE: StockScopeCode = "RD_SUB";
const RD_PROJECT_LABEL = "研发项目";
function parseChangeEntries(value: string | null): RdProjectFieldChange[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
type RdProjectRecord = NonNullable<
  Awaited<ReturnType<RdProjectRepository["findProjectById"]>>
>;
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
    const workshop = await this.masterDataService.getWorkshopByName(
      RD_PROJECT_WORKSHOP_NAME,
    );
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      RD_PROJECT_STOCK_SCOPE,
    );
    const bomLines = await this.viewService.buildBomLines(
      dto.bomLines ?? [],
      createdBy,
    );
    const totalQty = bomLines.reduce(
      (sum, line) => sum.add(line.quantity),
      new PrismaNamespace.Decimal(0),
    );
    const totalAmount = bomLines.reduce(
      (sum, line) => sum.add(line.amount),
      new PrismaNamespace.Decimal(0),
    );
    return this.repository.runInTransaction(async (tx) => {
      const pendingProjectCode = buildPendingProjectCode("rd_project");
      const project = await this.repository.createProject(
        {
          projectCode: pendingProjectCode,
          projectName: dto.projectName,
          bizDate,
          customerId: dto.customerId,
          supplierId: dto.supplierId,
          managerPersonnelId: dto.managerPersonnelId,
          stockScopeId: stockScopeRecord.id,
          workshopId: workshop.id,
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
      const projectTargetId = await ensureSharedProjectTarget({
        project,
        updatedBy: createdBy,
        repository: this.repository,
        tx,
      });
      const generatedProjectCode = buildRdProjectCode(projectTargetId);
      try {
        await this.repository.updateProject(
          project.id,
          {
            projectCode: generatedProjectCode,
            updatedBy: createdBy,
          },
          tx,
        );
        await this.repository.updateProjectTarget(
          projectTargetId,
          {
            targetCode: generatedProjectCode,
            targetName: project.projectName,
            updatedBy: createdBy,
          },
          tx,
        );
      } catch (error) {
        return this.failOnProjectCodeConflict(error, generatedProjectCode);
      }
      await this.repository.appendProjectChangeLog(
        {
          projectId: project.id,
          revisionNo: 1,
          action: RD_PROJECT_CHANGE_ACTIONS.CREATE,
          summary: `创建研发项目 ${generatedProjectCode}（BOM ${bomLines.length} 行）`,
          changedBy: createdBy,
        },
        tx,
      );
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
      await this.assertProjectFieldChangeAllowed(existing, "研发项目编码");
    }
    const workshop = await this.masterDataService.getWorkshopByName(
      RD_PROJECT_WORKSHOP_NAME,
    );
    if (workshop.id !== existing.workshopId) {
      await this.assertProjectFieldChangeAllowed(existing, "研发项目所属车间");
    }
    await this.validateMasterData(dto);
    const finalProjectCode = dto.projectCode ?? existing.projectCode;
    const finalProjectName = dto.projectName ?? existing.projectName;
    const finalCustomerId =
      dto.customerId === undefined ? existing.customerId : dto.customerId;
    const finalSupplierId =
      dto.supplierId === undefined ? existing.supplierId : dto.supplierId;
    const finalManagerId =
      dto.managerPersonnelId === undefined
        ? existing.managerPersonnelId
        : dto.managerPersonnelId;
    const finalWorkshopId = workshop.id;
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
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
      RD_PROJECT_STOCK_SCOPE,
    );
    const nextBomLines =
      dto.bomLines !== undefined
        ? await this.viewService.buildBomLines(dto.bomLines, updatedBy)
        : existing.bomLines;
    if (dto.bomLines !== undefined) {
      this.assertBomCoversNetPicked(existing, nextBomLines);
    }
    const totalQty = nextBomLines.reduce(
      (sum, line) => sum.add(toDecimal(line.quantity)),
      new PrismaNamespace.Decimal(0),
    );
    const totalAmount = nextBomLines.reduce(
      (sum, line) => sum.add(toDecimal(line.amount)),
      new PrismaNamespace.Decimal(0),
    );
    const fieldChanges: RdProjectFieldChange[] = [
      ...buildRdProjectHeaderChanges(existing, {
        projectCode: finalProjectCode,
        projectName: finalProjectName,
        bizDate,
        remark: dto.remark === undefined ? existing.remark : dto.remark,
        customerNameSnapshot: customerSnapshot.customerNameSnapshot,
        supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
        managerNameSnapshot: managerSnapshot.managerNameSnapshot,
      }),
      ...(dto.bomLines !== undefined
        ? buildRdProjectBomChanges(existing.bomLines, nextBomLines)
        : []),
    ];
    try {
      return await this.repository.runInTransaction(async (tx) => {
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
            remark: dto.remark === undefined ? existing.remark : dto.remark,
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
              manufacturer: line.manufacturer,
              productLink: line.productLink,
              remark: line.remark,
              createdBy: updatedBy,
              updatedBy,
            })),
            tx,
          );
        }
        await this.repository.appendProjectChangeLog(
          {
            projectId: id,
            revisionNo: existing.revisionNo + 1,
            action: RD_PROJECT_CHANGE_ACTIONS.UPDATE,
            summary:
              fieldChanges.length > 0
                ? `修改研发项目（${fieldChanges.length} 处变更）`
                : "保存研发项目（内容无变化）",
            changes:
              fieldChanges.length > 0 ? JSON.stringify(fieldChanges) : null,
            changedBy: updatedBy,
          },
          tx,
        );
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
    } catch (error) {
      return this.failOnProjectCodeConflict(error, finalProjectCode);
    }
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
          voidReason: voidReason ?? null,
          voidedBy: voidedBy ?? null,
          voidedAt: new Date(),
          updatedBy: voidedBy,
        },
        tx,
      );
      await this.repository.appendProjectChangeLog(
        {
          projectId: id,
          revisionNo: project.revisionNo,
          action: RD_PROJECT_CHANGE_ACTIONS.VOID,
          summary: `作废研发项目${voidReason ? `，原因：${voidReason}` : ""}`,
          changedBy: voidedBy,
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
  async listChangeLogs(projectId: number) {
    await this.requireProject(projectId);
    const rows = await this.repository.findProjectChangeLogs(projectId);
    return {
      items: rows.map((row) => ({
        id: row.id,
        revisionNo: row.revisionNo,
        action: row.action,
        summary: row.summary,
        changes: parseChangeEntries(row.changes),
        changedBy: row.changedBy,
        changedAt: row.changedAt,
      })),
    };
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
  private assertBomCoversNetPicked(
    existing: RdProjectRecord,
    nextBomLines: Array<{
      materialId: number;
      quantity: Prisma.Decimal | string | number;
    }>,
  ) {
    const netPickedByMaterial = new Map<number, Prisma.Decimal>();
    const materialCodeById = new Map<number, string>();
    const addQty = (
      materialId: number,
      materialCode: string,
      delta: Prisma.Decimal,
    ) => {
      const current =
        netPickedByMaterial.get(materialId) ?? new PrismaNamespace.Decimal(0);
      netPickedByMaterial.set(materialId, current.add(delta));
      materialCodeById.set(materialId, materialCode);
    };
    for (const line of existing.materialLines) {
      addQty(
        line.materialId,
        line.materialCodeSnapshot,
        toDecimal(line.quantity),
      );
    }
    for (const action of existing.materialActions) {
      if (
        action.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE ||
        (action.actionType !== RdProjectMaterialActionType.PICK &&
          action.actionType !== RdProjectMaterialActionType.RETURN)
      ) {
        continue;
      }
      const isReturn = action.actionType === RdProjectMaterialActionType.RETURN;
      for (const line of action.lines) {
        const qty = toDecimal(line.quantity);
        addQty(
          line.materialId,
          line.materialCodeSnapshot,
          isReturn ? qty.neg() : qty,
        );
      }
    }
    const plannedByMaterial = new Map<number, Prisma.Decimal>();
    for (const line of nextBomLines) {
      const current =
        plannedByMaterial.get(line.materialId) ??
        new PrismaNamespace.Decimal(0);
      plannedByMaterial.set(
        line.materialId,
        current.add(toDecimal(line.quantity)),
      );
    }
    const offendingMaterialCodes: string[] = [];
    for (const [materialId, netPicked] of netPickedByMaterial) {
      if (netPicked.lte(0)) {
        continue;
      }
      const planned =
        plannedByMaterial.get(materialId) ?? new PrismaNamespace.Decimal(0);
      if (planned.lt(netPicked)) {
        offendingMaterialCodes.push(
          materialCodeById.get(materialId) ?? String(materialId),
        );
      }
    }
    if (offendingMaterialCodes.length > 0) {
      throw new BadRequestException(
        `BOM计划数量不能低于已领用净数量（已领-已退），物料: ${offendingMaterialCodes.join("、")}`,
      );
    }
  }
  private async hasActiveProcurementRequests(
    projectCode: string,
    workshopId: number,
  ) {
    const result = await this.rdProcurementRequestService.listRequests({
      projectCodeExact: projectCode,
      workshopId,
      limit: 1,
      offset: 0,
    });
    return result.total > 0;
  }
  private async assertProjectFieldChangeAllowed(
    existing: RdProjectRecord,
    fieldLabel: string,
  ) {
    const hasProcurement = await this.hasActiveProcurementRequests(
      existing.projectCode,
      existing.workshopId,
    );
    if (hasProcurement) {
      throw new BadRequestException(`已有采购补货关联，不能修改${fieldLabel}`);
    }
    if (await this.repository.hasEffectiveMaterialActions(existing.id)) {
      throw new BadRequestException(
        `已有研发项目物料动作，不能修改${fieldLabel}`,
      );
    }
  }
  private failOnProjectCodeConflict(
    error: unknown,
    projectCode: string,
  ): never {
    if (isProjectCodeUniqueConflict(error)) {
      throw new ConflictException(`研发项目编码已存在: ${projectCode}`);
    }
    throw error;
  }
  private async validateMasterData(
    dto: CreateRdProjectDto | UpdateRdProjectDto,
  ) {
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
