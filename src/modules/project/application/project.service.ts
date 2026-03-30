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
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  resolveStockScopeFromWorkshopIdentity,
  type StockScopeCode,
} from "../../session/domain/user-session";
import type { CreateProjectDto } from "../dto/create-project.dto";
import type { QueryProjectDto } from "../dto/query-project.dto";
import type { UpdateProjectDto } from "../dto/update-project.dto";
import { ProjectRepository } from "../infrastructure/project.repository";

const DOCUMENT_TYPE = "Project";
const BUSINESS_MODULE = "project";

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ProjectRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
  ) {}

  async listProjects(query: QueryProjectDto) {
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
      limit,
      offset,
    });
  }

  async getProjectById(id: number) {
    const project = await this.repository.findProjectById(id);
    if (!project) {
      throw new NotFoundException(`项目不存在: ${id}`);
    }
    return project;
  }

  async createProject(dto: CreateProjectDto, createdBy?: string) {
    const existing = await this.repository.findProjectByCode(dto.projectCode);
    if (existing) {
      throw new ConflictException(`项目编码已存在: ${dto.projectCode}`);
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
    const inventoryStockScope = this.resolveInventoryStockScope(workshop);

    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) => {
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
        const qty = new Prisma.Decimal(line.quantity);
        const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
        const amount = qty.mul(unitPrice);
        return {
          lineNo: idx + 1,
          materialId: material.id,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity: qty,
          unitPrice,
          amount,
          remark: line.remark,
        };
      }),
    );

    const totalQty = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = linesWithSnapshots.reduce(
      (sum, l) => sum.add(l.amount),
      new Prisma.Decimal(0),
    );

    return this.prisma.runInTransaction(async (tx) => {
      const project = await this.repository.createProject(
        {
          projectCode: dto.projectCode,
          projectName: dto.projectName,
          bizDate,
          customerId: dto.customerId,
          supplierId: dto.supplierId,
          managerPersonnelId: dto.managerPersonnelId,
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
        linesWithSnapshots.map((l) => ({
          ...l,
          createdBy,
          updatedBy: createdBy,
        })),
        tx,
      );

      for (const line of project.materialLines) {
        await this.inventoryService.decreaseStock(
          {
            materialId: line.materialId,
            stockScope: inventoryStockScope,
            quantity: line.quantity,
            operationType: InventoryOperationType.PROJECT_CONSUMPTION_OUT,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: project.id,
            businessDocumentNumber: project.projectCode,
            businessDocumentLineId: line.id,
            operatorId: createdBy,
            idempotencyKey: `Project:${project.id}:line:${line.id}`,
          },
          tx,
        );
      }

      return project;
    });
  }

  async updateProject(id: number, dto: UpdateProjectDto, updatedBy?: string) {
    const existing = await this.repository.findProjectById(id);
    if (!existing) {
      throw new NotFoundException(`项目不存在: ${id}`);
    }
    if (existing.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的项目不能修改");
    }
    if (existing.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法修改");
    }

    await this.validateMasterDataForUpdate(dto);

    const bizDate = dto.bizDate ? new Date(dto.bizDate) : existing.bizDate;
    const nextRevision = existing.revisionNo + 1;
    const finalCustomerId = dto.customerId ?? existing.customerId ?? undefined;
    const finalSupplierId = dto.supplierId ?? existing.supplierId ?? undefined;
    const finalManagerId =
      dto.managerPersonnelId ?? existing.managerPersonnelId ?? undefined;

    const customerSnapshot = finalCustomerId
      ? await this.resolveCustomerSnapshot(finalCustomerId)
      : {
          customerCodeSnapshot: existing.customerCodeSnapshot,
          customerNameSnapshot: existing.customerNameSnapshot,
        };
    const supplierSnapshot = finalSupplierId
      ? await this.resolveSupplierSnapshot(finalSupplierId)
      : {
          supplierCodeSnapshot: existing.supplierCodeSnapshot,
          supplierNameSnapshot: existing.supplierNameSnapshot,
        };
    const managerSnapshot = finalManagerId
      ? await this.resolveManagerSnapshot(finalManagerId)
      : { managerNameSnapshot: existing.managerNameSnapshot };
    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId ?? existing.workshopId,
    );
    const inventoryStockScope = this.resolveInventoryStockScope(workshop);

    return this.prisma.runInTransaction(async (tx) => {
      const currentProject = await this.repository.findProjectById(id, tx);
      if (!currentProject) {
        throw new NotFoundException(`项目不存在: ${id}`);
      }

      const logs = await this.inventoryService.getLogsForDocument(
        {
          businessDocumentType: DOCUMENT_TYPE,
          businessDocumentId: id,
        },
        tx,
      );
      const logByLineId = new Map(
        logs
          .filter((log) => log.businessDocumentLineId !== null)
          .map((log) => [log.businessDocumentLineId as number, log]),
      );
      const currentLinesById = new Map(
        currentProject.materialLines.map((line) => [line.id, line]),
      );
      const seenLineIds = new Set<number>();
      const workshopId = dto.workshopId ?? currentProject.workshopId;
      const workshopChanged = workshopId !== currentProject.workshopId;

      for (const line of dto.lines) {
        if (!line.id) continue;
        if (seenLineIds.has(line.id)) {
          throw new BadRequestException(`重复的明细 ID: ${line.id}`);
        }
        if (!currentLinesById.has(line.id)) {
          throw new BadRequestException(`明细不存在: ${line.id}`);
        }
        seenLineIds.add(line.id);
      }

      for (const currentLine of currentProject.materialLines) {
        if (seenLineIds.has(currentLine.id)) continue;

        const currentLog = logByLineId.get(currentLine.id);
        if (!currentLog) {
          throw new BadRequestException(
            `未找到明细对应的库存流水: lineId=${currentLine.id}`,
          );
        }

        await this.inventoryService.reverseStock(
          {
            logIdToReverse: currentLog.id,
            idempotencyKey: `Project:${id}:rev:${nextRevision}:delete:${currentLine.id}`,
            note: `改单删除明细冲回: ${existing.projectCode}`,
          },
          tx,
        );
        await this.repository.deleteProjectLine(currentLine.id, tx);
      }

      const finalLines = [];
      for (let index = 0; index < dto.lines.length; index++) {
        const incomingLine = dto.lines[index];
        const lineData = await this.buildLineWriteData(incomingLine, index + 1);

        if (incomingLine.id) {
          const currentLine = currentLinesById.get(incomingLine.id);
          if (!currentLine) {
            throw new BadRequestException(`明细不存在: ${incomingLine.id}`);
          }

          const inventoryNeedsRepost =
            workshopChanged ||
            currentLine.materialId !== lineData.materialId ||
            !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity);

          if (inventoryNeedsRepost) {
            const currentLog = logByLineId.get(currentLine.id);
            if (!currentLog) {
              throw new BadRequestException(
                `未找到明细对应的库存流水: lineId=${currentLine.id}`,
              );
            }

            await this.inventoryService.reverseStock(
              {
                logIdToReverse: currentLog.id,
                idempotencyKey: `Project:${id}:rev:${nextRevision}:replace:${currentLine.id}`,
                note: `改单重算明细冲回: ${existing.projectCode}`,
              },
              tx,
            );
          }

          const updatedLine = await this.repository.updateProjectLine(
            currentLine.id,
            {
              lineNo: lineData.lineNo,
              materialId: lineData.materialId,
              materialCodeSnapshot: lineData.materialCodeSnapshot,
              materialNameSnapshot: lineData.materialNameSnapshot,
              materialSpecSnapshot: lineData.materialSpecSnapshot,
              unitCodeSnapshot: lineData.unitCodeSnapshot,
              quantity: lineData.quantity,
              unitPrice: lineData.unitPrice,
              amount: lineData.amount,
              remark: lineData.remark,
              updatedBy,
            },
            tx,
          );

          if (inventoryNeedsRepost) {
            await this.inventoryService.decreaseStock(
              {
                materialId: updatedLine.materialId,
                stockScope: inventoryStockScope,
                quantity: updatedLine.quantity,
                operationType: InventoryOperationType.PROJECT_CONSUMPTION_OUT,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: id,
                businessDocumentNumber: existing.projectCode,
                businessDocumentLineId: updatedLine.id,
                operatorId: updatedBy,
                idempotencyKey: `Project:${id}:rev:${nextRevision}:line:${updatedLine.id}`,
              },
              tx,
            );
          }

          finalLines.push(updatedLine);
          continue;
        }

        const createdLine = await this.repository.createProjectLine(
          {
            projectId: id,
            lineNo: lineData.lineNo,
            materialId: lineData.materialId,
            materialCodeSnapshot: lineData.materialCodeSnapshot,
            materialNameSnapshot: lineData.materialNameSnapshot,
            materialSpecSnapshot: lineData.materialSpecSnapshot,
            unitCodeSnapshot: lineData.unitCodeSnapshot,
            quantity: lineData.quantity,
            unitPrice: lineData.unitPrice,
            amount: lineData.amount,
            remark: lineData.remark,
            createdBy: updatedBy,
            updatedBy,
          },
          tx,
        );

        await this.inventoryService.decreaseStock(
          {
            materialId: createdLine.materialId,
            stockScope: inventoryStockScope,
            quantity: createdLine.quantity,
            operationType: InventoryOperationType.PROJECT_CONSUMPTION_OUT,
            businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE,
            businessDocumentId: id,
            businessDocumentNumber: existing.projectCode,
            businessDocumentLineId: createdLine.id,
            operatorId: updatedBy,
            idempotencyKey: `Project:${id}:rev:${nextRevision}:line:${createdLine.id}`,
          },
          tx,
        );

        finalLines.push(createdLine);
      }

      const totalQty = finalLines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.quantity)),
        new Prisma.Decimal(0),
      );
      const totalAmount = finalLines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.amount)),
        new Prisma.Decimal(0),
      );

      await this.repository.updateProject(
        id,
        {
          bizDate,
          customerId: finalCustomerId,
          supplierId: finalSupplierId,
          managerPersonnelId: finalManagerId,
          workshopId,
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

      return this.repository.findProjectById(id, tx);
    });
  }

  async voidProject(id: number, voidReason?: string, voidedBy?: string) {
    const project = await this.repository.findProjectById(id);
    if (!project) {
      throw new NotFoundException(`项目不存在: ${id}`);
    }
    if (project.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("项目已作废");
    }
    if (project.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
      const hasDownstreamDependencies =
        await this.repository.hasActiveDownstreamDependencies(id, tx);
      if (hasDownstreamDependencies) {
        throw new BadRequestException("存在下游依赖，不能作废");
      }

      const logs = await this.inventoryService.getLogsForDocument(
        {
          businessDocumentType: DOCUMENT_TYPE,
          businessDocumentId: id,
        },
        tx,
      );

      if (logs.length === 0) {
        throw new BadRequestException("未找到可冲回的库存流水");
      }

      for (const log of logs) {
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: log.id,
            idempotencyKey: `Project:void:${id}:log:${log.id}`,
            note: `作废项目: ${project.projectCode}`,
          },
          tx,
        );
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

      return this.repository.findProjectById(id, tx);
    });
  }

  async listMaterials(projectId: number) {
    const project = await this.repository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundException(`项目不存在: ${projectId}`);
    }
    return project.materialLines;
  }

  private async validateMasterData(dto: CreateProjectDto) {
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
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async validateMasterDataForUpdate(dto: UpdateProjectDto) {
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
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  private async resolveCustomerSnapshot(customerId?: number) {
    if (!customerId) {
      return { customerCodeSnapshot: null, customerNameSnapshot: null };
    }
    const c = await this.masterDataService.getCustomerById(customerId);
    return {
      customerCodeSnapshot: c.customerCode,
      customerNameSnapshot: c.customerName,
    };
  }

  private async resolveSupplierSnapshot(supplierId?: number) {
    if (!supplierId) {
      return { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    }
    const s = await this.masterDataService.getSupplierById(supplierId);
    return {
      supplierCodeSnapshot: s.supplierCode,
      supplierNameSnapshot: s.supplierName,
    };
  }

  private async resolveManagerSnapshot(managerPersonnelId?: number) {
    if (!managerPersonnelId) {
      return { managerNameSnapshot: null };
    }
    const p = await this.masterDataService.getPersonnelById(managerPersonnelId);
    return { managerNameSnapshot: p.personnelName };
  }

  private async buildLineWriteData(
    line: {
      materialId: number;
      quantity: string;
      unitPrice?: string;
      remark?: string;
    },
    lineNo: number,
  ) {
    const material = await this.masterDataService.getMaterialById(
      line.materialId,
    );
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
    const amount = quantity.mul(unitPrice);

    return {
      lineNo,
      materialId: material.id,
      materialCodeSnapshot: material.materialCode,
      materialNameSnapshot: material.materialName,
      materialSpecSnapshot: material.specModel ?? "",
      unitCodeSnapshot: material.unitCode,
      quantity,
      unitPrice,
      amount,
      remark: line.remark,
    };
  }

  private resolveInventoryStockScope(workshop: {
    workshopCode: string;
    workshopName: string;
  }): StockScopeCode {
    return (
      resolveStockScopeFromWorkshopIdentity({
        workshopCode: workshop.workshopCode,
        workshopName: workshop.workshopName,
      }) ?? "MAIN"
    );
  }
}
