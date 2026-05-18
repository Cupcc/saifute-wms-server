import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  InventoryOperationType,
  Prisma,
  StockInOrderType,
} from "../../../../generated/prisma/client";
import {
  buildCompactDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { applyAcceptanceStatusesForOrder } from "../../rd-subwarehouse/application/rd-material-status.helper";
import type { CreateInboundOrderDto } from "../dto/create-inbound-order.dto";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundAcceptanceLineSnapshotService } from "./inbound-acceptance-line-snapshot.service";
import { InboundSharedService } from "./inbound-shared.service";

const DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
const BUSINESS_MODULE = "inbound";
const AUTO_SUPPLIER_CODE_PREFIX = "AUTO-SUP";

type PendingSupplierInput = {
  supplierCode?: string;
  supplierName: string;
};

@Injectable()
export class InboundAcceptanceCreationService {
  constructor(
    private readonly repository: InboundRepository,
    private readonly inventoryService: InventoryService,
    private readonly approvalService: ApprovalService,
    private readonly lineSnapshots: InboundAcceptanceLineSnapshotService,
    private readonly shared: InboundSharedService,
  ) {}

  async listOrders(query: {
    documentNo?: string;
    bizDateFrom?: Date;
    bizDateTo?: Date;
    supplierId?: number;
    supplierName?: string;
    handlerName?: string;
    materialId?: number;
    detailId?: number;
    materialCode?: string;
    materialName?: string;
    specification?: string;
    stockScopeId?: number;
    workshopId?: number;
    limit: number;
    offset: number;
  }) {
    return this.repository.findOrders({
      ...query,
      orderType: StockInOrderType.ACCEPTANCE,
    });
  }

  async listOrderLines(query: {
    documentNo?: string;
    bizDateFrom?: Date;
    bizDateTo?: Date;
    supplierId?: number;
    supplierName?: string;
    handlerName?: string;
    materialId?: number;
    detailId?: number;
    materialCode?: string;
    materialName?: string;
    specification?: string;
    stockScopeId?: number;
    workshopId?: number;
    limit: number;
    offset: number;
  }) {
    return this.repository.findOrderLines({
      ...query,
      orderType: StockInOrderType.ACCEPTANCE,
    });
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`入库单不存在：${id}`);
    }
    if (order.orderType !== StockInOrderType.ACCEPTANCE) {
      throw new NotFoundException(`不是验收单：${id}`);
    }
    return order;
  }

  async createOrder(dto: CreateInboundOrderDto, createdBy?: string) {
    if (dto.orderType !== StockInOrderType.ACCEPTANCE) {
      throw new BadRequestException("此方法仅用于验收单");
    }
    const bizDate = new Date(dto.bizDate);
    const workshop = dto.workshopId
      ? await this.shared.getWorkshopById(dto.workshopId)
      : null;
    const salesProjectReference =
      await this.shared.resolveSalesProjectReference(
        StockInOrderType.ACCEPTANCE,
        dto.salesProjectId,
        workshop?.id ?? null,
      );
    const salesProjectSnapshots = this.shared.toSalesProjectSnapshots(
      salesProjectReference,
    );
    const pendingSupplier = this.resolvePendingSupplierInput(dto);
    await this.shared.validateMasterData(dto, dto.supplierId, {
      hasPendingSupplier: Boolean(pendingSupplier),
    });
    const { supplierCodeSnapshot, supplierNameSnapshot } =
      await this.shared.resolveSupplierSnapshot(dto.supplierId);
    const { handlerNameSnapshot } = await this.shared.resolveHandlerSnapshot(
      dto.handlerPersonnelId ?? undefined,
      dto.handlerName,
    );
    const stockScopeRecord = await this.shared.getMainStockScope();

    const prefix = "YS";

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildCompactDocumentNo(prefix, bizDate, attempt);
      return this.repository.runInTransaction(async (tx) => {
        const linesWithSnapshots = [];
        for (let index = 0; index < dto.lines.length; index++) {
          linesWithSnapshots.push(
            await this.lineSnapshots.buildLineWriteData(
              dto.lines[index],
              index + 1,
              { createdBy, tx },
            ),
          );
        }

        const totalQty = linesWithSnapshots.reduce(
          (sum, l) => sum.add(l.quantity),
          new Prisma.Decimal(0),
        );
        const totalAmount = linesWithSnapshots.reduce(
          (sum, l) => sum.add(l.amount),
          new Prisma.Decimal(0),
        );

        let order = await this.repository.createOrder(
          {
            documentNo,
            orderType: StockInOrderType.ACCEPTANCE,
            bizDate,
            salesProjectId: salesProjectSnapshots.salesProjectId,
            supplierId: dto.supplierId ?? null,
            handlerPersonnelId: dto.handlerPersonnelId ?? null,
            stockScopeId: stockScopeRecord.id,
            workshopId: workshop?.id ?? null,
            rdProcurementRequestId: null,
            salesProjectCodeSnapshot:
              salesProjectSnapshots.salesProjectCodeSnapshot,
            salesProjectNameSnapshot:
              salesProjectSnapshots.salesProjectNameSnapshot,
            supplierCodeSnapshot,
            supplierNameSnapshot,
            handlerNameSnapshot,
            workshopNameSnapshot: workshop?.workshopName ?? null,
            ...this.toRdProcurementOrderSnapshots(null),
            totalQty,
            totalAmount,
            remark: dto.remark,
            auditStatusSnapshot: AuditStatusSnapshot.PENDING,
            createdBy,
            updatedBy: createdBy,
          },
          linesWithSnapshots.map(
            ({ autoCreatedMaterialId: _ignored, ...l }) => ({
              ...l,
              createdBy,
              updatedBy: createdBy,
            }),
          ),
          tx,
        );

        await this.lineSnapshots.markAutoMaterialSourceDocument(
          linesWithSnapshots
            .map((line) => line.autoCreatedMaterialId)
            .filter((id): id is number => typeof id === "number"),
          order.id,
          createdBy,
          tx,
        );

        if (pendingSupplier) {
          const supplier = await this.shared.ensureSupplier(
            {
              supplierCode:
                pendingSupplier.supplierCode ??
                this.buildAutoSupplierCode(order.documentNo),
              supplierName: pendingSupplier.supplierName,
              sourceDocumentType: DOCUMENT_TYPE,
              sourceDocumentId: order.id,
            },
            createdBy,
            tx,
          );
          order = await this.repository.updateOrder(
            order.id,
            {
              supplierId: supplier.id,
              supplierCodeSnapshot: supplier.supplierCode,
              supplierNameSnapshot: supplier.supplierName,
              updatedBy: createdBy,
            },
            tx,
          );
        }

        const operationType = InventoryOperationType.ACCEPTANCE_IN;
        const logIdByLineId = new Map<number, number>();
        for (const line of order.lines) {
          const log = await this.inventoryService.increaseStock(
            {
              materialId: line.materialId,
              stockScope: "MAIN",
              bizDate,
              quantity: line.quantity,
              operationType,
              businessModule: BUSINESS_MODULE,
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: order.id,
              businessDocumentNumber: order.documentNo,
              businessDocumentLineId: line.id,
              projectTargetId:
                salesProjectSnapshots.projectTargetId ?? undefined,
              operatorId: createdBy,
              idempotencyKey: `StockInOrder:${order.id}:line:${line.id}`,
              unitCost: new Prisma.Decimal(line.unitPrice),
              costAmount: new Prisma.Decimal(line.amount),
            },
            tx,
          );
          logIdByLineId.set(line.id, log.id);
        }

        await applyAcceptanceStatusesForOrder(
          {
            orderId: order.id,
            documentNo: order.documentNo,
            lines: order.lines,
            operatorId: createdBy,
            logIdByLineId,
          },
          tx,
        );
        await this.approvalService.createOrRefreshApprovalDocument(
          {
            documentFamily: DocumentFamily.STOCK_IN,
            documentType: DOCUMENT_TYPE,
            documentId: order.id,
            documentNumber: order.documentNo,
            submittedBy: createdBy,
            createdBy,
          },
          tx,
        );
        return order;
      });
    });
  }

  private resolvePendingSupplierInput(
    dto: CreateInboundOrderDto,
  ): PendingSupplierInput | null {
    if (dto.supplierId) {
      return null;
    }
    const supplierName = this.normalizeOptionalText(dto.supplierName);
    if (!supplierName) {
      return null;
    }
    const supplierCode = this.normalizeOptionalText(dto.supplierCode);
    return supplierCode ? { supplierCode, supplierName } : { supplierName };
  }

  private buildAutoSupplierCode(documentNo: string) {
    return `${AUTO_SUPPLIER_CODE_PREFIX}-${documentNo}`;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private toRdProcurementOrderSnapshots(
    request: {
      id: number;
      documentNo: string;
      projectCode: string;
      projectName: string;
    } | null,
  ) {
    if (!request) {
      return {
        rdProcurementRequestNoSnapshot: null,
        rdProcurementProjectCodeSnapshot: null,
        rdProcurementProjectNameSnapshot: null,
      };
    }
    return {
      rdProcurementRequestNoSnapshot: request.documentNo,
      rdProcurementProjectCodeSnapshot: request.projectCode,
      rdProcurementProjectNameSnapshot: request.projectName,
    };
  }
}
