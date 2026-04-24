import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import { RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE } from "../../rd-subwarehouse/application/rd-material-status.helper";
import { type StockScopeCode } from "../../session/domain/user-session";
import { toCreateDocumentPrefix } from "../domain/workshop-material-order-type.helper";
import type { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import type { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import type { UpdateWorkshopMaterialOrderDto } from "../dto/update-workshop-material-order.dto";
import { WorkshopMaterialRepository } from "../infrastructure/workshop-material.repository";

export const WORKSHOP_MATERIAL_DOCUMENT_TYPE =
  BusinessDocumentType.WorkshopMaterialOrder;
export const WORKSHOP_MATERIAL_BUSINESS_MODULE = "workshop-material";

export type RdScrapRequestCache = Map<
  number,
  {
    lifecycleStatus: DocumentLifecycleStatus;
    lines: Array<{ id: number; materialId: number }>;
  } | null
>;

export type WorkshopMaterialOrderEntity = NonNullable<
  Awaited<ReturnType<WorkshopMaterialRepository["findOrderById"]>>
>;

export type WorkshopMaterialOrderLineEntity = Awaited<
  ReturnType<WorkshopMaterialRepository["createOrderLine"]>
>;

export type WorkshopMaterialLineWriteData = {
  lineNo: number;
  materialId: number;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string;
  unitCodeSnapshot: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  remark?: string;
};

/**
 * Shared collaborator for the per-orderType workshop-material services. Holds
 * the cross-cutting helpers (master-data validation, snapshot building,
 * approval bookkeeping, inventory log reversal) so the per-type services stay
 * focused on the orderType-specific lifecycle. Prisma usage and transaction
 * boundaries remain here — this refactor is responsibility-only and does not
 * push data access down to a new repository layer.
 */
@Injectable()
export class WorkshopMaterialSharedService {
  constructor(
    public readonly repository: WorkshopMaterialRepository,
    public readonly masterDataService: MasterDataService,
    public readonly inventoryService: InventoryService,
    public readonly approvalService: ApprovalService,
  ) {}

  // ─── Query helpers ────────────────────────────────────────────────────────

  async listOrders(
    query: QueryWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
  ) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      handlerName: query.handlerName,
      materialId: query.materialId,
      materialName: query.materialName,
      orderType: query.orderType,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      workshopId: query.workshopId,
      stockScope: query.stockScope,
      limit,
      offset,
    });
  }

  async getOrderById(id: number, orderType?: WorkshopMaterialOrderType) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`车间物料单不存在: ${id}`);
    }
    if (orderType && order.orderType !== orderType) {
      throw new NotFoundException(
        `单据类型不匹配: 期望 ${orderType}, 实际 ${order.orderType}`,
      );
    }
    return order;
  }

  // ─── Master-data validation & snapshot resolution ─────────────────────────

  async validateMasterData(dto: CreateWorkshopMaterialOrderDto) {
    await this.masterDataService.getWorkshopById(
      this.requireWorkshopId(dto.workshopId),
    );
    if (dto.handlerPersonnelId) {
      await this.masterDataService.getPersonnelById(dto.handlerPersonnelId);
    }
    for (const line of dto.lines) {
      await this.masterDataService.getMaterialById(line.materialId);
    }
  }

  async resolveHandlerSnapshot(
    handlerPersonnelId?: number,
    handlerName?: string,
  ) {
    if (!handlerPersonnelId) {
      return { handlerNameSnapshot: handlerName?.trim() || null };
    }
    const p = await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: p.personnelName };
  }

  requireWorkshopId(workshopId?: number) {
    if (!workshopId || workshopId < 1) {
      throw new BadRequestException("workshopId 必填");
    }
    return workshopId;
  }

  resolveInventoryStockScope(
    orderType: WorkshopMaterialOrderType,
    stockScope?: StockScopeCode,
  ): StockScopeCode {
    if (orderType !== WorkshopMaterialOrderType.SCRAP) {
      return "MAIN";
    }
    return stockScope ?? "MAIN";
  }

  async buildLineWriteData(
    line: CreateWorkshopMaterialOrderLineDto,
    lineNo: number,
  ): Promise<WorkshopMaterialLineWriteData> {
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

  computeTotals(
    lines: ReadonlyArray<{ quantity: Prisma.Decimal; amount: Prisma.Decimal }>,
  ) {
    const totalQty = lines.reduce(
      (sum, l) => sum.add(l.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = lines.reduce(
      (sum, l) => sum.add(l.amount),
      new Prisma.Decimal(0),
    );
    return { totalQty, totalAmount };
  }

  // ─── Mutation gates ──────────────────────────────────────────────────────

  assertOrderMutable(
    order: Pick<
      WorkshopMaterialOrderEntity,
      "lifecycleStatus" | "inventoryEffectStatus"
    >,
  ) {
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("已作废的单据不能修改");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法修改");
    }
  }

  assertUpdateHeaderCompatibility(
    existing: Pick<WorkshopMaterialOrderEntity, "documentNo" | "orderType">,
    dto: UpdateWorkshopMaterialOrderDto,
  ) {
    if (dto.documentNo && dto.documentNo !== existing.documentNo) {
      throw new BadRequestException("改单不支持修改单据编号");
    }
    if (dto.orderType && dto.orderType !== existing.orderType) {
      throw new BadRequestException("改单不支持修改单据类型");
    }
  }

  toEffectiveUpdateDto(
    existing: WorkshopMaterialOrderEntity,
    dto: UpdateWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
  ): CreateWorkshopMaterialOrderDto & { stockScope?: StockScopeCode } {
    return {
      documentNo: existing.documentNo,
      orderType: existing.orderType,
      bizDate: dto.bizDate ?? existing.bizDate.toISOString().slice(0, 10),
      handlerPersonnelId:
        dto.handlerPersonnelId ?? existing.handlerPersonnelId ?? undefined,
      handlerName: dto.handlerName ?? existing.handlerNameSnapshot ?? undefined,
      workshopId: dto.workshopId ?? existing.workshopId,
      remark: dto.remark ?? existing.remark ?? undefined,
      stockScope:
        dto.stockScope ??
        (existing.stockScope?.scopeCode as StockScopeCode | undefined) ??
        undefined,
      lines: dto.lines,
    };
  }

  // ─── Document number generation ─────────────────────────────────────────

  async createWithDocumentNo<T>(
    orderType: WorkshopMaterialOrderType,
    bizDate: Date,
    run: (documentNo: string, tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const prefix = toCreateDocumentPrefix(orderType);
    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildCompactDocumentNo(prefix, bizDate, attempt);
      return this.repository.runInTransaction((tx) => run(documentNo, tx));
    });
  }

  runInTransaction<T>(
    handler: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.repository.runInTransaction(handler);
  }

  // ─── Approval bookkeeping ────────────────────────────────────────────────

  async requestApproval(
    orderId: number,
    documentNo: string,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    await this.approvalService.createOrRefreshApprovalDocument(
      {
        documentFamily: DocumentFamily.WORKSHOP_MATERIAL,
        documentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        documentId: orderId,
        documentNumber: documentNo,
        submittedBy: operatorId,
        createdBy: operatorId,
      },
      tx,
    );
  }

  async markApprovalNotRequired(
    orderId: number,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    await this.approvalService.markApprovalNotRequired(
      WORKSHOP_MATERIAL_DOCUMENT_TYPE,
      orderId,
      operatorId,
      tx,
    );
  }

  // ─── Inventory reversal helpers (shared between update + void flows) ────

  async reverseAllLogsForOrder(
    params: {
      orderId: number;
      documentNo: string;
      keySuffix: string;
      note: string;
    },
    tx: Prisma.TransactionClient,
  ) {
    const logs = await this.inventoryService.getLogsForDocument(
      {
        businessDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        businessDocumentId: params.orderId,
      },
      tx,
    );

    if (logs.length === 0) {
      throw new BadRequestException("未找到可重算的库存流水");
    }

    for (const log of logs) {
      await this.inventoryService.reverseStock(
        {
          logIdToReverse: log.id,
          idempotencyKey: `${WORKSHOP_MATERIAL_DOCUMENT_TYPE}:${params.keySuffix}:log:${log.id}`,
          note: params.note,
        },
        tx,
      );
    }
  }

  async releaseAllSourceUsages(
    orderId: number,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    await this.inventoryService.releaseAllSourceUsagesForConsumer(
      {
        consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        consumerDocumentId: orderId,
        operatorId,
      },
      tx,
    );
  }

  // ─── RD SCRAP source-line guard ─────────────────────────────────────────

  buildRdScrapRequestCache(): RdScrapRequestCache {
    return new Map();
  }

  async assertRdScrapSourceLine(
    line: CreateWorkshopMaterialOrderLineDto,
    materialId: number,
    requestCache: RdScrapRequestCache,
  ) {
    const sourceDocumentType =
      line.sourceDocumentType ?? RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE;
    if (sourceDocumentType !== RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE) {
      throw new BadRequestException("RD 报废只能关联 RD 采购需求行");
    }
    if (!line.sourceDocumentId || !line.sourceDocumentLineId) {
      throw new BadRequestException("RD 报废明细必须绑定采购需求行");
    }

    let request = requestCache.get(line.sourceDocumentId);
    if (!request) {
      request = await this.repository.findRdProcurementRequestForScrapSource(
        line.sourceDocumentId,
      );
      requestCache.set(line.sourceDocumentId, request);
    }
    if (
      !request ||
      request.lifecycleStatus === DocumentLifecycleStatus.VOIDED
    ) {
      throw new BadRequestException("RD 报废来源采购需求不存在或已作废");
    }

    const requestLine = request.lines.find(
      (item) => item.id === line.sourceDocumentLineId,
    );
    if (!requestLine) {
      throw new BadRequestException("RD 报废来源采购行不存在");
    }
    if (requestLine.materialId !== materialId) {
      throw new BadRequestException("RD 报废物料必须与采购需求行一致");
    }
  }

  // ─── Audit status helper ────────────────────────────────────────────────

  resolveAuditStatusForCreate(orderType: WorkshopMaterialOrderType) {
    return orderType === WorkshopMaterialOrderType.SCRAP
      ? AuditStatusSnapshot.NOT_REQUIRED
      : AuditStatusSnapshot.PENDING;
  }
}
