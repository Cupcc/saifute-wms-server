import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  Prisma,
} from "../../../generated/prisma/client";
import {
  buildDashedTimestampDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { ApplyRdProcurementStatusActionDto } from "../dto/apply-rd-procurement-status-action.dto";
import type { CreateRdProcurementRequestDto } from "../dto/create-rd-procurement-request.dto";
import type { QueryRdProcurementRequestDto } from "../dto/query-rd-procurement-request.dto";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import {
  applyManualCancelStatus,
  applyManualReturnStatus,
  applyProcurementStartedStatus,
  applyRequestVoidStatus,
  getStatusLedgerProjection,
  initializeRequestStatusTruth,
} from "./rd-material-status.helper";

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
    const result = await this.repository.findRequests({
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
    return {
      ...result,
      items: await Promise.all(
        result.items.map((item) => this.withStatusProjection(item)),
      ),
    };
  }

  async getRequestById(id: number) {
    const request = await this.repository.findRequestById(id);
    if (!request) {
      throw new NotFoundException(`RD 采购需求不存在: ${id}`);
    }
    return this.withStatusProjection(request);
  }

  async createRequest(dto: CreateRdProcurementRequestDto, createdBy?: string) {
    const workshopId = this.requireWorkshopId(dto.workshopId);

    const workshop = await this.masterDataService.getWorkshopById(workshopId);
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode("RD_SUB");

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

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildDashedTimestampDocumentNo(
        "RDPUR",
        bizDate,
        attempt,
      );
      return this.prisma.runInTransaction(async (tx) => {
        const request = await this.repository.createRequest(
          {
            documentNo,
            bizDate,
            projectCode: dto.projectCode,
            projectName: dto.projectName,
            supplierId: dto.supplierId,
            handlerPersonnelId: dto.handlerPersonnelId,
            stockScopeId: stockScopeRecord.id,
            workshopId,
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
        );

        await initializeRequestStatusTruth(
          {
            requestId: request.id,
            documentNo: request.documentNo,
            lines: request.lines.map((line) => ({
              id: line.id,
              quantity: line.quantity,
            })),
            operatorId: createdBy,
          },
          tx,
        );

        return this.withStatusProjection(request, tx);
      });
    });
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

      for (const line of request.lines) {
        await applyRequestVoidStatus(
          {
            requestLineId: line.id,
            requestId: request.id,
            requestDocumentNo: request.documentNo,
            operatorId: voidedBy,
            note: voidReason,
            reason: voidReason,
          },
          tx,
        );
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

      const updated = await this.repository.findRequestById(id, tx);
      if (!updated) {
        throw new NotFoundException(`RD 采购需求不存在: ${id}`);
      }
      return this.withStatusProjection(updated, tx);
    });
  }

  async applyStatusAction(
    requestId: number,
    dto: ApplyRdProcurementStatusActionDto,
    operatorId?: string,
  ) {
    const request = await this.repository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundException(`RD 采购需求不存在: ${requestId}`);
    }
    if (request.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException("只有有效采购需求可以调整状态");
    }

    const requestLine = request.lines.find((line) => line.id === dto.lineId);
    if (!requestLine) {
      throw new BadRequestException("状态动作目标行不属于当前采购需求");
    }

    return this.prisma.runInTransaction(async (tx) => {
      await this.applyLineStatusAction(
        request.id,
        request.documentNo,
        requestLine.id,
        dto,
        operatorId,
        tx,
      );

      const latest = await this.repository.findRequestById(request.id, tx);
      if (!latest) {
        throw new NotFoundException(`RD 采购需求不存在: ${request.id}`);
      }
      return this.withStatusProjection(latest, tx);
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

  private async applyLineStatusAction(
    requestId: number,
    requestDocumentNo: string,
    requestLineId: number,
    dto: ApplyRdProcurementStatusActionDto,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    switch (dto.actionType) {
      case "PROCUREMENT_STARTED":
        return applyProcurementStartedStatus(
          {
            requestId,
            requestDocumentNo,
            requestLineId,
            quantity: dto.quantity,
            note: dto.note,
            operatorId,
          },
          tx,
        );
      case "MANUAL_CANCELLED":
        return applyManualCancelStatus(
          {
            requestId,
            requestDocumentNo,
            requestLineId,
            quantity: dto.quantity,
            note: dto.note,
            reason: dto.reason,
            operatorId,
          },
          tx,
        );
      case "MANUAL_RETURNED":
        if (!dto.referenceNo?.trim() || !dto.reason?.trim()) {
          throw new BadRequestException(
            "退回动作必须填写 referenceNo 和 reason",
          );
        }
        return applyManualReturnStatus(
          {
            requestId,
            requestDocumentNo,
            requestLineId,
            quantity: dto.quantity,
            note: dto.note,
            reason: dto.reason,
            referenceNo: dto.referenceNo,
            operatorId,
          },
          tx,
        );
      default:
        return this.assertNeverAction(dto.actionType);
    }
  }

  private async withStatusProjection<
    T extends {
      lines: Array<
        {
          id: number;
          quantity: Prisma.Decimal;
          statusLedger?: unknown;
        } & Record<string, unknown>
      >;
    } & Record<string, unknown>,
  >(request: T, tx?: Prisma.TransactionClient): Promise<T> {
    const lines = await Promise.all(
      request.lines.map(async (line) => ({
        ...line,
        statusLedger: line.statusLedger
          ? line.statusLedger
          : await getStatusLedgerProjection(line.id, tx ?? this.prisma),
      })),
    );

    return {
      ...request,
      lines,
    };
  }

  private assertNeverAction(actionType: never): never {
    throw new BadRequestException(`不支持的 RD 状态动作: ${actionType}`);
  }

  private requireWorkshopId(workshopId?: number) {
    if (!workshopId || workshopId < 1) {
      throw new BadRequestException("workshopId 必填");
    }
    return workshopId;
  }
}
