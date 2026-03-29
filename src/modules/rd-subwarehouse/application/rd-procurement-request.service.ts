import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateRdProcurementRequestDto } from "../dto/create-rd-procurement-request.dto";
import type { QueryRdProcurementRequestDto } from "../dto/query-rd-procurement-request.dto";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";

const RD_SUBWAREHOUSE_CODE = "RD";

@Injectable()
export class RdProcurementRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RdProcurementRequestRepository,
    private readonly masterDataService: MasterDataService,
  ) {}

  async listRequests(query: QueryRdProcurementRequestDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findRequests({
      keyword: query.keyword,
      documentNo: query.documentNo,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      projectCode: query.projectCode,
      projectName: query.projectName,
      supplierId: query.supplierId,
      handlerName: query.handlerName,
      materialId: query.materialId,
      materialName: query.materialName,
      workshopId: query.workshopId,
      limit,
      offset,
    });
  }

  async getRequestById(id: number) {
    const request = await this.repository.findRequestById(id);
    if (!request) {
      throw new NotFoundException(`RD 采购需求不存在: ${id}`);
    }
    return request;
  }

  async createRequest(dto: CreateRdProcurementRequestDto, createdBy?: string) {
    const existing = await this.repository.findRequestByDocumentNo(
      dto.documentNo,
    );
    if (existing) {
      throw new ConflictException(`单据编号已存在: ${dto.documentNo}`);
    }

    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    if (workshop.workshopCode !== RD_SUBWAREHOUSE_CODE) {
      throw new BadRequestException("研发采购需求只能归属研发小仓");
    }

    const supplierSnapshot = dto.supplierId
      ? await this.resolveSupplierSnapshot(dto.supplierId)
      : { supplierCodeSnapshot: null, supplierNameSnapshot: null };
    const handlerSnapshot = dto.handlerPersonnelId
      ? await this.resolveHandlerSnapshot(dto.handlerPersonnelId)
      : { handlerNameSnapshot: null };

    const bizDate = new Date(dto.bizDate);
    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) => {
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
        const quantity = new Prisma.Decimal(line.quantity);
        const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
        const amount = quantity.mul(unitPrice);
        return {
          lineNo: idx + 1,
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
      }),
    );

    const totalQty = linesWithSnapshots.reduce(
      (sum, line) => sum.add(line.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = linesWithSnapshots.reduce(
      (sum, line) => sum.add(line.amount),
      new Prisma.Decimal(0),
    );

    return this.prisma.runInTransaction(async (tx) =>
      this.repository.createRequest(
        {
          documentNo: dto.documentNo,
          bizDate,
          projectCode: dto.projectCode,
          projectName: dto.projectName,
          supplierId: dto.supplierId,
          handlerPersonnelId: dto.handlerPersonnelId,
          workshopId: dto.workshopId,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          supplierCodeSnapshot: supplierSnapshot.supplierCodeSnapshot,
          supplierNameSnapshot: supplierSnapshot.supplierNameSnapshot,
          handlerNameSnapshot: handlerSnapshot.handlerNameSnapshot,
          workshopNameSnapshot: workshop.workshopName,
          totalQty,
          totalAmount,
          remark: dto.remark,
          createdBy,
          updatedBy: createdBy,
        },
        linesWithSnapshots.map((line) => ({
          ...line,
          createdBy,
          updatedBy: createdBy,
        })),
        tx,
      ),
    );
  }

  async voidRequest(id: number, voidReason?: string, voidedBy?: string) {
    const request = await this.repository.findRequestById(id);
    if (!request) {
      throw new NotFoundException(`RD 采购需求不存在: ${id}`);
    }
    if (request.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
      const hasActiveAcceptanceOrders =
        await this.repository.hasActiveAcceptanceOrders(id, tx);
      if (hasActiveAcceptanceOrders) {
        throw new BadRequestException("该采购需求已关联有效验收单，不能作废");
      }

      await this.repository.updateRequest(
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

      return this.repository.findRequestById(id, tx);
    });
  }

  private async resolveSupplierSnapshot(supplierId: number) {
    const supplier = await this.masterDataService.getSupplierById(supplierId);
    return {
      supplierCodeSnapshot: supplier.supplierCode,
      supplierNameSnapshot: supplier.supplierName,
    };
  }

  private async resolveHandlerSnapshot(handlerPersonnelId: number) {
    const personnel =
      await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: personnel.personnelName };
  }
}
