import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditStatusSnapshot, DocumentFamily, InventoryEffectStatus, InventoryOperationType, Prisma, StockInOrderType } from "../../../../generated/prisma/client";
import { buildCompactDocumentNo, createWithGeneratedDocumentNo } from "../../../shared/common/document-number.util";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { ApprovalService } from "../../approval/application/approval.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateInboundOrderDto } from "../dto/create-inbound-order.dto";
import { InboundRepository } from "../infrastructure/inbound.repository";
import { InboundSharedService } from "./inbound-shared.service";

const DOCUMENT_TYPE = BusinessDocumentType.StockInOrder;
const BUSINESS_MODULE = "inbound";

@Injectable()
export class InboundProductionReceiptCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: InboundRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly approvalService: ApprovalService,
    private readonly shared: InboundSharedService,
  ) {}

  async listOrders(query: {
    documentNo?: string; bizDateFrom?: Date; bizDateTo?: Date; supplierId?: number; handlerName?: string;
    materialId?: number; materialName?: string; stockScopeId?: number; workshopId?: number; limit: number; offset: number;
  }) {
    return this.repository.findOrders({ ...query, orderType: StockInOrderType.PRODUCTION_RECEIPT });
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) throw new NotFoundException(`入库单不存在：${id}`);
    if (order.orderType !== StockInOrderType.PRODUCTION_RECEIPT) throw new NotFoundException(`不是生产入库单：${id}`);
    return order;
  }

  async createOrder(dto: CreateInboundOrderDto, createdBy?: string) {
    if (dto.orderType !== StockInOrderType.PRODUCTION_RECEIPT) throw new BadRequestException("此方法仅用于生产入库单");
    const bizDate = new Date(dto.bizDate);
    const workshop = dto.workshopId ? await this.masterDataService.getWorkshopById(dto.workshopId) : null;
    await this.shared.validateMasterData(dto, undefined);
    const { handlerNameSnapshot } = await this.shared.resolveHandlerSnapshot(dto.handlerPersonnelId ?? undefined, dto.handlerName);
    const stockScopeRecord = await this.masterDataService.getStockScopeByCode("MAIN");

    const linesWithSnapshots: Array<{ lineNo: number; materialId: number; rdProcurementRequestLineId: number | null; materialCategoryIdSnapshot: number; materialCategoryCodeSnapshot: string; materialCategoryNameSnapshot: string; materialCategoryPathSnapshot: Prisma.JsonArray; materialCodeSnapshot: string; materialNameSnapshot: string; materialSpecSnapshot: string; unitCodeSnapshot: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; amount: Prisma.Decimal; remark?: string }> = [];
    for (let index = 0; index < dto.lines.length; index++) {
      linesWithSnapshots.push(await this.shared.buildLineWriteData(dto.lines[index], index + 1));
    }

    const totalQty = linesWithSnapshots.reduce((sum, l) => sum.add(l.quantity), new Prisma.Decimal(0));
    const totalAmount = linesWithSnapshots.reduce((sum, l) => sum.add(l.amount), new Prisma.Decimal(0));

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildCompactDocumentNo("RK", bizDate, attempt);
      return this.prisma.runInTransaction(async (tx) => {
        const order = await this.repository.createOrder({
          documentNo, orderType: StockInOrderType.PRODUCTION_RECEIPT, bizDate, supplierId: null,
          handlerPersonnelId: dto.handlerPersonnelId ?? null, stockScopeId: stockScopeRecord.id,
          workshopId: workshop?.id ?? null, rdProcurementRequestId: null, supplierCodeSnapshot: null,
          supplierNameSnapshot: null, handlerNameSnapshot, workshopNameSnapshot: workshop?.workshopName ?? null,
          rdProcurementRequestNoSnapshot: null, rdProcurementProjectCodeSnapshot: null, rdProcurementProjectNameSnapshot: null,
          totalQty, totalAmount, remark: dto.remark, auditStatusSnapshot: AuditStatusSnapshot.PENDING,
          createdBy, updatedBy: createdBy,
        }, linesWithSnapshots.map((l) => ({ ...l, createdBy, updatedBy: createdBy })), tx);

        const logIdByLineId = new Map<number, number>();
        for (const line of order.lines) {
          const log = await this.inventoryService.increaseStock({
            materialId: line.materialId, stockScope: "MAIN", bizDate, quantity: line.quantity,
            operationType: InventoryOperationType.PRODUCTION_RECEIPT_IN, businessModule: BUSINESS_MODULE,
            businessDocumentType: DOCUMENT_TYPE, businessDocumentId: order.id,
            businessDocumentNumber: order.documentNo, businessDocumentLineId: line.id, operatorId: createdBy,
            idempotencyKey: `StockInOrder:${order.id}:line:${line.id}`,
            unitCost: new Prisma.Decimal(line.unitPrice), costAmount: new Prisma.Decimal(line.amount),
          }, tx);
          logIdByLineId.set(line.id, log.id);
        }
        await this.approvalService.createOrRefreshApprovalDocument({
          documentFamily: DocumentFamily.STOCK_IN, documentType: DOCUMENT_TYPE, documentId: order.id,
          documentNumber: order.documentNo, submittedBy: createdBy, createdBy,
        }, tx);
        return order;
      });
    });
  }
}
