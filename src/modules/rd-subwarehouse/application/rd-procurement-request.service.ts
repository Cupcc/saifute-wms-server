import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  Prisma,
  RdMaterialStatusEventType,
} from "../../../../generated/prisma/client";
import {
  buildDailyDocumentNoStem,
  buildDashedTimestampDocumentNo,
  createWithGeneratedDocumentNo,
  resolveDailyStartAttempt,
} from "../../../shared/common/document-number.util";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import type { ApplyRdProcurementStatusActionDto } from "../dto/apply-rd-procurement-status-action.dto";
import type { CreateRdProcurementRequestDto } from "../dto/create-rd-procurement-request.dto";
import type { QueryRdProcurementRequestDto } from "../dto/query-rd-procurement-request.dto";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import {
  applyManualAcceptanceStatus,
  applyManualCancelStatus,
  applyProcurementStartedStatus,
  applyRequestVoidStatus,
  getStatusLedgerProjection,
  initializeRequestStatusTruth,
  reverseStatusHistory,
} from "./rd-material-status.helper";
import { RdProcurementItemService } from "./rd-procurement-item.service";
import {
  applyManualReturnWithInventory,
  assertReversibleManualHistory,
  type RdProcurementRequestDetail,
  type RdProcurementRequestDetailLine,
  type RdProcurementStatusHistoryDetail,
  reverseManualReturnInventory,
} from "./rd-procurement-return.helper";

@Injectable()
export class RdProcurementRequestService {
  constructor(
    private readonly repository: RdProcurementRequestRepository,
    private readonly itemService: RdProcurementItemService,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly rdProjectLookupService: RdProjectLookupService,
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
      projectCodeExact: query.projectCodeExact,
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

  getProjectProcurementProjection(params: {
    projectCode: string;
    workshopId: number;
  }) {
    return this.repository.findEffectiveProjectProcurementProjection(params);
  }

  async createRequest(dto: CreateRdProcurementRequestDto, createdBy?: string) {
    if (dto.clientRequestId) {
      const existing = await this.repository.findRequestByClientRequestId(
        dto.clientRequestId,
      );
      if (existing) {
        return this.withStatusProjection(existing);
      }
    }
    const project =
      await this.rdProjectLookupService.requireEffectiveProjectByCode(
        dto.projectCode,
      );
    const workshopId = project.workshopId;
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
    const linesWithSnapshots = await this.itemService.resolveCreateLines(
      dto.lines,
      createdBy,
    );

    const totalQty = linesWithSnapshots.reduce(
      (sum, line) => sum.add(line.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = linesWithSnapshots.reduce(
      (sum, line) => sum.add(line.amount),
      new Prisma.Decimal(0),
    );

    const persistRequest = (attempt: number) => {
      const documentNo = buildDashedTimestampDocumentNo("RQ", bizDate, attempt);
      return this.repository.runInTransaction(async (tx) => {
        const request = await this.repository.createRequest(
          {
            documentNo,
            bizDate,
            projectCode: project.projectCode,
            projectName: project.projectName,
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
            clientRequestId: dto.clientRequestId,
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
    };

    const documentNoStem = buildDailyDocumentNoStem("RQ", bizDate);
    try {
      return await createWithGeneratedDocumentNo(persistRequest, {
        resolveStartAttempt: async () =>
          resolveDailyStartAttempt(
            await this.repository.findDocumentNosByPrefix(documentNoStem),
            documentNoStem,
          ),
      });
    } catch (error) {
      if (dto.clientRequestId && isClientRequestIdUniqueConflict(error)) {
        const existing = await this.repository.findRequestByClientRequestId(
          dto.clientRequestId,
        );
        if (existing) {
          return this.withStatusProjection(existing);
        }
      }
      throw error;
    }
  }

  async voidRequest(id: number, voidReason?: string, voidedBy?: string) {
    const request = await this.repository.findRequestById(id);
    if (!request) {
      throw new NotFoundException(`RD 采购需求不存在: ${id}`);
    }
    if (request.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }

    return this.repository.runInTransaction(async (tx) => {
      await this.assertCanVoidRequest(request.lines, tx);

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
    if (dto.actionType !== "ACCEPTANCE_CONFIRMED" && dto.materialId != null) {
      throw new BadRequestException("只有登记验收动作可以提交物料绑定");
    }
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

    return this.repository.runInTransaction(async (tx) => {
      try {
        if (dto.actionType === "ACCEPTANCE_CONFIRMED") {
          await this.itemService.bindForAcceptance({
            requestId: request.id,
            lineId: requestLine.id,
            requestedMaterialId: dto.materialId,
            operatorId,
            tx,
          });
        }
        await this.applyLineStatusAction(
          request,
          requestLine,
          dto,
          operatorId,
          tx,
        );
      } catch (error) {
        throw wrapRequestLineError(error, requestLine);
      }

      const latest = await this.repository.findRequestById(request.id, tx);
      if (!latest) {
        throw new NotFoundException(`RD 采购需求不存在: ${request.id}`);
      }
      return this.withStatusProjection(latest, tx);
    });
  }

  async getStatusActionHistory(
    requestId: number,
    historyId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<RdProcurementStatusHistoryDetail> {
    const history = await this.repository.findStatusHistoryById(historyId, tx);
    if (!history || history.requestLine.requestId !== requestId) {
      throw new NotFoundException(`RD 状态历史不存在: ${historyId}`);
    }
    return history;
  }

  async reverseStatusAction(
    requestId: number,
    historyId: number,
    reason?: string,
    operatorId?: string,
  ) {
    const request = await this.repository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundException(`RD 采购需求不存在: ${requestId}`);
    }
    if (request.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException("只有有效采购需求可以回滚状态动作");
    }

    return this.repository.runInTransaction(async (tx) => {
      const history = await this.getStatusActionHistory(
        requestId,
        historyId,
        tx,
      );
      assertReversibleManualHistory(history);

      if (
        history.eventType === RdMaterialStatusEventType.MANUAL_RETURNED &&
        history.relatedInventoryLogId != null
      ) {
        await reverseManualReturnInventory(
          {
            inventoryService: this.inventoryService,
            request,
            history,
            operatorId,
          },
          tx,
        );
      }

      await reverseStatusHistory(
        {
          historyId: history.id,
          reason,
          note: `手工回滚状态事件 ${history.id}`,
          operatorId,
        },
        tx,
      );

      const latest = await this.repository.findRequestById(requestId, tx);
      if (!latest) {
        throw new NotFoundException(`RD 采购需求不存在: ${requestId}`);
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
    request: RdProcurementRequestDetail,
    requestLine: RdProcurementRequestDetailLine,
    dto: ApplyRdProcurementStatusActionDto,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    const requestId = request.id;
    const requestDocumentNo = request.documentNo;
    const requestLineId = requestLine.id;
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
      case "ACCEPTANCE_CONFIRMED":
        return applyManualAcceptanceStatus(
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
        return this.applyManualReturnAction(
          request,
          requestLine,
          dto,
          operatorId,
          tx,
        );
      default:
        return this.assertNeverAction(dto.actionType);
    }
  }

  private async applyManualReturnAction(
    request: RdProcurementRequestDetail,
    requestLine: RdProcurementRequestDetailLine,
    dto: ApplyRdProcurementStatusActionDto,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (!dto.referenceNo?.trim()) {
      throw new BadRequestException("退回必须填写关联单号");
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException("退回必须填写退回原因");
    }
    return applyManualReturnWithInventory(
      {
        inventoryService: this.inventoryService,
        rdProjectLookupService: this.rdProjectLookupService,
        repository: this.repository,
        request,
        requestLine,
        quantity: dto.quantity,
        referenceNo: dto.referenceNo,
        reason: dto.reason,
        bizDate: dto.bizDate,
        note: dto.note,
        operatorId,
      },
      tx,
    );
  }

  private async assertCanVoidRequest(
    lines: Array<{ id: number }>,
    tx: Prisma.TransactionClient,
  ) {
    for (const line of lines) {
      const projection = await getStatusLedgerProjection(line.id, tx);
      const hasClosedFacts =
        projection.acceptedQty.gt(0) ||
        projection.handedOffQty.gt(0) ||
        projection.scrappedQty.gt(0) ||
        projection.returnedQty.gt(0);
      if (hasClosedFacts) {
        throw new BadRequestException(
          "该采购需求已存在验收/交接/报废/退回事实，不能作废",
        );
      }
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
          : await this.getMissingStatusProjection(line.id, tx),
      })),
    );

    return {
      ...request,
      lines,
    };
  }

  private getMissingStatusProjection(
    requestLineId: number,
    tx?: Prisma.TransactionClient,
  ) {
    return getStatusLedgerProjection(
      requestLineId,
      tx ?? this.repository.client,
    );
  }

  private assertNeverAction(actionType: never): never {
    throw new BadRequestException(`不支持的 RD 状态动作: ${actionType}`);
  }
}

function isClientRequestIdUniqueConflict(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const conflictText =
    `${JSON.stringify(error.meta ?? {})} ${error.message}`.toLowerCase();
  return (
    conflictText.includes("client_request_id") ||
    conflictText.includes("clientrequestid")
  );
}

function wrapRequestLineError(
  error: unknown,
  requestLine: Pick<
    RdProcurementRequestDetailLine,
    "lineNo" | "materialCodeSnapshot" | "materialNameSnapshot"
  >,
): unknown {
  if (!(error instanceof BadRequestException)) {
    return error;
  }
  const materialLabel =
    requestLine.materialNameSnapshot || requestLine.materialCodeSnapshot;
  return new BadRequestException(
    `第 ${requestLine.lineNo} 行 物料 ${materialLabel}: ${error.message}`,
  );
}
