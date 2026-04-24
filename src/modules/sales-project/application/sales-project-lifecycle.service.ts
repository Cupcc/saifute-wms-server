import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  Prisma,
} from "../../../../generated/prisma/client";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateSalesProjectDto } from "../dto/create-sales-project.dto";
import type { QuerySalesProjectDto } from "../dto/query-sales-project.dto";
import type { UpdateSalesProjectDto } from "../dto/update-sales-project.dto";
import { SalesProjectRepository } from "../infrastructure/sales-project.repository";
import {
  ensureSalesProjectTarget,
  SALES_PROJECT_LABEL,
  SALES_PROJECT_STOCK_SCOPE,
  toDecimal,
} from "./sales-project.shared";
import { SalesProjectMaterialViewService } from "./sales-project-material-view.service";

@Injectable()
export class SalesProjectLifecycleService {
  constructor(
    private readonly repository: SalesProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly materialView: SalesProjectMaterialViewService,
  ) {}

  async listProjects(query: QuerySalesProjectDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    const result = await this.repository.findProjects({
      salesProjectCode: query.salesProjectCode,
      salesProjectName: query.salesProjectName,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      customerId: query.customerId,
      workshopId: query.workshopId,
      limit,
      offset,
    });

    return {
      total: result.total,
      items: await Promise.all(
        result.items.map((item) => this.materialView.buildProjectView(item)),
      ),
    };
  }

  async getProjectById(id: number) {
    const project = await this.materialView.requireProject(id);
    return this.materialView.buildProjectView(project);
  }

  async createProject(dto: CreateSalesProjectDto, createdBy?: string) {
    await this.validateProjectMasterData(dto);
    await this.assertProjectCodeAvailable(dto.salesProjectCode);

    const stockScope = await this.masterDataService.getStockScopeByCode(
      SALES_PROJECT_STOCK_SCOPE,
    );
    const customerSnapshot = await this.resolveCustomerSnapshot(dto.customerId);
    const managerSnapshot = await this.resolveManagerSnapshot(
      dto.managerPersonnelId,
    );
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    const materialLines = await this.buildMaterialLineWriteData(
      dto.materialLines ?? [],
    );

    const totalQty = materialLines.reduce(
      (sum, line) => sum.add(line.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = materialLines.reduce(
      (sum, line) => sum.add(line.amount),
      new Prisma.Decimal(0),
    );

    return this.repository.runInTransaction(async (tx) => {
      const project = await this.repository.createProject(
        {
          salesProjectCode: dto.salesProjectCode,
          salesProjectName: dto.salesProjectName,
          bizDate: new Date(dto.bizDate),
          customerId: dto.customerId,
          managerPersonnelId: dto.managerPersonnelId,
          stockScopeId: stockScope.id,
          workshopId: dto.workshopId,
          customerCodeSnapshot: customerSnapshot.customerCodeSnapshot,
          customerNameSnapshot: customerSnapshot.customerNameSnapshot,
          managerNameSnapshot: managerSnapshot.managerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark,
          createdBy,
          updatedBy: createdBy,
        },
        materialLines.map((line, index) => ({
          ...line,
          lineNo: index + 1,
          createdBy,
          updatedBy: createdBy,
        })),
        tx,
      );

      await ensureSalesProjectTarget({
        project,
        updatedBy: createdBy,
        repository: this.repository,
        tx,
      });

      const latest = await this.materialView.requireProject(project.id, tx);
      return this.materialView.buildProjectView(latest, tx);
    });
  }

  async updateProject(
    id: number,
    dto: UpdateSalesProjectDto,
    updatedBy?: string,
  ) {
    const existing = await this.materialView.requireProject(id);
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的销售项目不能修改");
    }

    if (
      dto.salesProjectCode &&
      dto.salesProjectCode !== existing.salesProjectCode
    ) {
      await this.assertProjectCodeAvailable(dto.salesProjectCode, existing.id);
    }

    await this.validateProjectMasterData(dto);

    const finalCustomerId = dto.customerId ?? existing.customerId ?? undefined;
    const finalManagerId =
      dto.managerPersonnelId ?? existing.managerPersonnelId ?? undefined;
    const finalWorkshopId = dto.workshopId ?? existing.workshopId;

    const customerSnapshot = finalCustomerId
      ? await this.resolveCustomerSnapshot(finalCustomerId)
      : {
          customerCodeSnapshot: existing.customerCodeSnapshot,
          customerNameSnapshot: existing.customerNameSnapshot,
        };
    const managerSnapshot = finalManagerId
      ? await this.resolveManagerSnapshot(finalManagerId)
      : {
          managerNameSnapshot: existing.managerNameSnapshot,
        };
    const workshop =
      finalWorkshopId === existing.workshopId
        ? { workshopName: existing.workshopNameSnapshot }
        : await this.masterDataService.getWorkshopById(finalWorkshopId);

    const nextMaterialLines =
      dto.materialLines == null
        ? existing.materialLines.map((line) => ({
            materialId: line.materialId,
            materialCodeSnapshot: line.materialCodeSnapshot,
            materialNameSnapshot: line.materialNameSnapshot,
            materialSpecSnapshot: line.materialSpecSnapshot ?? "",
            unitCodeSnapshot: line.unitCodeSnapshot,
            quantity: toDecimal(line.quantity),
            unitPrice: toDecimal(line.unitPrice),
            amount: toDecimal(line.amount),
            remark: line.remark ?? undefined,
          }))
        : await this.buildMaterialLineWriteData(dto.materialLines);

    const totalQty = nextMaterialLines.reduce(
      (sum, line) => sum.add(line.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = nextMaterialLines.reduce(
      (sum, line) => sum.add(line.amount),
      new Prisma.Decimal(0),
    );

    return this.repository.runInTransaction(async (tx) => {
      await this.repository.updateProject(
        id,
        {
          salesProjectCode: dto.salesProjectCode ?? existing.salesProjectCode,
          salesProjectName: dto.salesProjectName ?? existing.salesProjectName,
          bizDate: dto.bizDate ? new Date(dto.bizDate) : existing.bizDate,
          customerId: finalCustomerId,
          managerPersonnelId: finalManagerId,
          workshopId: finalWorkshopId,
          customerCodeSnapshot: customerSnapshot.customerCodeSnapshot,
          customerNameSnapshot: customerSnapshot.customerNameSnapshot,
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

      if (dto.materialLines != null) {
        await this.repository.replaceProjectMaterialLines(
          id,
          nextMaterialLines.map((line, index) => ({
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

      const latest = await this.materialView.requireProject(id, tx);
      await ensureSalesProjectTarget({
        project: latest,
        updatedBy,
        repository: this.repository,
        tx,
      });

      const refreshed = await this.materialView.requireProject(id, tx);
      return this.materialView.buildProjectView(refreshed, tx);
    });
  }

  async voidProject(id: number, voidReason?: string, voidedBy?: string) {
    const existing = await this.materialView.requireProject(id);
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("销售项目已作废");
    }

    return this.repository.runInTransaction(async (tx) => {
      await this.repository.updateProject(
        id,
        {
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          voidReason: voidReason ?? null,
          voidedBy: voidedBy ?? null,
          voidedAt: new Date(),
          revisionNo: { increment: 1 },
          updatedBy: voidedBy,
        },
        tx,
      );

      const latest = await this.materialView.requireProject(id, tx);
      return this.materialView.buildProjectView(latest, tx);
    });
  }

  private async validateProjectMasterData(dto: {
    customerId?: number;
    managerPersonnelId?: number;
    workshopId?: number;
    materialLines?: Array<{ materialId: number }>;
  }) {
    if (dto.workshopId) {
      await this.masterDataService.getWorkshopById(dto.workshopId);
    }
    if (dto.customerId) {
      await this.masterDataService.getCustomerById(dto.customerId);
    }
    if (dto.managerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.managerPersonnelId);
    }
    for (const line of dto.materialLines ?? []) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async assertProjectCodeAvailable(
    salesProjectCode: string,
    excludeId?: number,
  ) {
    const existing = await this.repository.findProjectByCode(salesProjectCode);
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `${SALES_PROJECT_LABEL}编码已存在: ${salesProjectCode}`,
      );
    }
  }

  private async resolveCustomerSnapshot(customerId?: number) {
    if (!customerId) {
      return {
        customerCodeSnapshot: null,
        customerNameSnapshot: null,
      };
    }
    const customer = await this.masterDataService.getCustomerById(customerId);
    return {
      customerCodeSnapshot: customer.customerCode,
      customerNameSnapshot: customer.customerName,
    };
  }

  private async resolveManagerSnapshot(managerPersonnelId?: number) {
    if (!managerPersonnelId) {
      return {
        managerNameSnapshot: null,
      };
    }
    const manager =
      await this.masterDataService.getPersonnelById(managerPersonnelId);
    return {
      managerNameSnapshot: manager.personnelName,
    };
  }

  private async buildMaterialLineWriteData(
    lines: Array<{
      materialId: number;
      quantity: string;
      unitPrice?: string;
      remark?: string;
    }>,
  ) {
    return Promise.all(
      lines.map(async (line) => {
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
        const quantity = new Prisma.Decimal(line.quantity);
        const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
        return {
          materialId: material.id,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity,
          unitPrice,
          amount: quantity.mul(unitPrice),
          remark: line.remark,
        };
      }),
    );
  }
}
