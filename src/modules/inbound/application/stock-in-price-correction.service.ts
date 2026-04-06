import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentFamily,
  DocumentLifecycleStatus,
  InventoryOperationType,
  Prisma,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { AuditService } from "../../audit/application/audit.service";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateStockInPriceCorrectionOrderDto } from "../dto/create-stock-in-price-correction-order.dto";
import type { QueryStockInPriceCorrectionOrderDto } from "../dto/query-stock-in-price-correction-order.dto";
import { StockInPriceCorrectionRepository } from "../infrastructure/stock-in-price-correction.repository";

const DOCUMENT_TYPE = "StockInPriceCorrectionOrder";
const BUSINESS_MODULE = "inbound";
const MAIN_WAREHOUSE_CODE = "MAIN";

@Injectable()
export class StockInPriceCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: StockInPriceCorrectionRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
  ) {}

  async listOrders(
    query: QueryStockInPriceCorrectionOrderDto & { stockScopeId?: number },
  ) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      materialId: query.materialId,
      sourceInventoryLogId: query.sourceInventoryLogId,
      stockScopeId: query.stockScopeId,
      workshopId: query.workshopId,
      limit,
      offset,
    });
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`入库调价单不存在: ${id}`);
    }
    return order;
  }

  async createOrder(
    dto: CreateStockInPriceCorrectionOrderDto,
    createdBy?: string,
  ) {
    const existing = await this.repository.findOrderByDocumentNo(
      dto.documentNo,
    );
    if (existing) {
      throw new ConflictException(`单据编号已存在: ${dto.documentNo}`);
    }

    const workshop = await this.masterDataService.getWorkshopById(
      dto.workshopId,
    );
    this.assertMainWarehouse(workshop);
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode("MAIN");
    this.assertNoDuplicateSourceLogs(dto.lines);

    const createdOrder = await this.prisma.runInTransaction(async (tx) => {
      const order = await this.repository.createOrder(
        {
          documentNo: dto.documentNo,
          bizDate: new Date(dto.bizDate),
          stockScopeId: stockScopeRecord.id,
          workshopId: dto.workshopId,
          lifecycleStatus: DocumentLifecycleStatus.EFFECTIVE,
          auditStatusSnapshot: AuditStatusSnapshot.PENDING,
          totalLineCount: dto.lines.length,
          totalHistoricalDiffAmount: 0,
          remark: dto.remark,
          createdBy,
          updatedBy: createdBy,
        },
        tx,
      );

      let totalHistoricalDiffAmount = new Prisma.Decimal(0);

      for (let index = 0; index < dto.lines.length; index++) {
        const lineDto = dto.lines[index];
        const correctUnitCost = this.toPositiveMoney(
          lineDto.correctUnitCost,
          "correctUnitCost",
        );

        await tx.$queryRaw`
          SELECT id
          FROM inventory_log
          WHERE id = ${lineDto.sourceInventoryLogId}
          FOR UPDATE
        `;

        const sourceLog = await tx.inventoryLog.findUnique({
          where: { id: lineDto.sourceInventoryLogId },
        });
        if (!sourceLog) {
          throw new NotFoundException(
            `来源库存流水不存在: ${lineDto.sourceInventoryLogId}`,
          );
        }

        await this.assertSourceLogEligible(
          sourceLog,
          lineDto.materialId,
          stockScopeRecord.id,
          dto.workshopId,
          tx,
        );

        const sourceUsageRows = await tx.inventorySourceUsage.findMany({
          where: { sourceLogId: sourceLog.id },
          select: { allocatedQty: true, releasedQty: true },
        });
        const consumedQtyAtCorrection = sourceUsageRows.reduce(
          (sum, usage) =>
            sum
              .add(new Prisma.Decimal(usage.allocatedQty))
              .sub(new Prisma.Decimal(usage.releasedQty)),
          new Prisma.Decimal(0),
        );
        const sourceInQty = new Prisma.Decimal(sourceLog.changeQty);
        const remainingQtyAtCorrection = sourceInQty.sub(
          consumedQtyAtCorrection,
        );
        if (remainingQtyAtCorrection.lt(0)) {
          throw new BadRequestException(
            `来源库存流水剩余数量异常: sourceLogId=${sourceLog.id}`,
          );
        }

        const wrongUnitCost = sourceLog.unitCost
          ? new Prisma.Decimal(sourceLog.unitCost)
          : null;
        if (!wrongUnitCost) {
          throw new BadRequestException(
            `来源库存流水缺少成本价快照: ${sourceLog.id}`,
          );
        }

        const sourceReference = await this.resolveSourceReference(
          sourceLog,
          tx,
        );
        const historicalDiffAmount = correctUnitCost
          .sub(wrongUnitCost)
          .mul(consumedQtyAtCorrection);
        totalHistoricalDiffAmount =
          totalHistoricalDiffAmount.add(historicalDiffAmount);

        const createdLine = await this.repository.createOrderLine(
          {
            orderId: order.id,
            lineNo: index + 1,
            materialId: lineDto.materialId,
            sourceStockInOrderId: sourceReference.sourceStockInOrderId,
            sourceStockInOrderLineId: sourceReference.sourceStockInOrderLineId,
            sourceInventoryLogId: sourceLog.id,
            sourceDocumentNoSnapshot: sourceReference.sourceDocumentNoSnapshot,
            sourceBizDateSnapshot: sourceReference.sourceBizDateSnapshot,
            wrongUnitCost,
            correctUnitCost,
            sourceInQty,
            consumedQtyAtCorrection,
            remainingQtyAtCorrection,
            historicalDiffAmount,
            remark: null,
            createdBy,
            updatedBy: createdBy,
          },
          tx,
        );

        if (remainingQtyAtCorrection.gt(0)) {
          const correctionOut = await this.inventoryService.settleConsumerOut(
            {
              materialId: sourceLog.materialId,
              workshopId: sourceLog.workshopId,
              quantity: remainingQtyAtCorrection,
              operationType: InventoryOperationType.PRICE_CORRECTION_OUT,
              businessModule: BUSINESS_MODULE,
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: order.id,
              businessDocumentNumber: order.documentNo,
              businessDocumentLineId: createdLine.id,
              operatorId: createdBy,
              idempotencyKey: `StockInPriceCorrectionOrder:${order.id}:line:${createdLine.id}:out`,
              consumerLineId: createdLine.id,
              sourceLogId: sourceLog.id,
              sourceOperationTypes: FIFO_SOURCE_OPERATION_TYPES,
            },
            tx,
          );

          const correctionIn = await this.inventoryService.increaseStock(
            {
              materialId: sourceLog.materialId,
              workshopId: sourceLog.workshopId,
              quantity: remainingQtyAtCorrection,
              operationType: InventoryOperationType.PRICE_CORRECTION_IN,
              businessModule: BUSINESS_MODULE,
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: order.id,
              businessDocumentNumber: order.documentNo,
              businessDocumentLineId: createdLine.id,
              operatorId: createdBy,
              idempotencyKey: `StockInPriceCorrectionOrder:${order.id}:line:${createdLine.id}:in`,
              unitCost: correctUnitCost,
              costAmount: correctUnitCost.mul(remainingQtyAtCorrection),
            },
            tx,
          );

          await this.repository.updateOrderLine(
            createdLine.id,
            {
              generatedOutLogId: correctionOut.outLog.id,
              generatedInLogId: correctionIn.id,
              updatedBy: createdBy,
            },
            tx,
          );
        }
      }

      await this.repository.updateOrder(
        order.id,
        {
          totalHistoricalDiffAmount,
          updatedBy: createdBy,
        },
        tx,
      );

      await this.auditService.createOrRefreshAuditDocument(
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

      const refreshedOrder = await this.repository.findOrderById(order.id, tx);
      if (!refreshedOrder) {
        throw new NotFoundException(`入库调价单不存在: ${order.id}`);
      }
      return refreshedOrder;
    });

    return createdOrder;
  }

  private assertNoDuplicateSourceLogs(
    lines: CreateStockInPriceCorrectionOrderDto["lines"],
  ) {
    const sourceLogIds = new Set<number>();
    for (const line of lines) {
      if (sourceLogIds.has(line.sourceInventoryLogId)) {
        throw new BadRequestException(
          `同一张调价单内不允许重复引用来源库存流水: ${line.sourceInventoryLogId}`,
        );
      }
      sourceLogIds.add(line.sourceInventoryLogId);
    }
  }

  private async assertSourceLogEligible(
    sourceLog: {
      id: number;
      direction: string;
      operationType: InventoryOperationType;
      materialId: number;
      stockScopeId: number | null;
      workshopId: number;
    },
    materialId: number,
    stockScopeId: number,
    workshopId: number,
    tx: Prisma.TransactionClient,
  ) {
    if (sourceLog.direction !== "IN") {
      throw new BadRequestException("来源库存流水必须是入库方向");
    }
    if (!FIFO_SOURCE_OPERATION_TYPES.includes(sourceLog.operationType)) {
      throw new BadRequestException(
        `来源库存流水不是合法的 FIFO 来源类型: ${sourceLog.operationType}`,
      );
    }
    if (sourceLog.materialId !== materialId) {
      throw new BadRequestException("调价物料必须与来源库存流水一致");
    }
    if (sourceLog.stockScopeId !== stockScopeId) {
      throw new BadRequestException("调价库存范围必须与来源库存流水一致");
    }
    if (sourceLog.workshopId !== workshopId) {
      throw new BadRequestException("调价车间必须与来源库存流水一致");
    }

    const [reversalLog, existingCorrectionLine] = await Promise.all([
      tx.inventoryLog.findFirst({
        where: { reversalOfLogId: sourceLog.id },
        select: { id: true },
      }),
      this.repository.findLineBySourceInventoryLogId(sourceLog.id, tx),
    ]);
    if (reversalLog) {
      throw new BadRequestException("来源库存流水已逆操作，不能继续调价");
    }
    if (existingCorrectionLine) {
      throw new BadRequestException(
        `来源库存流水已被调价单占用: ${existingCorrectionLine.order.documentNo}`,
      );
    }
  }

  private async resolveSourceReference(
    sourceLog: {
      id: number;
      businessDocumentType: string;
      businessDocumentId: number;
      businessDocumentNumber: string;
      businessDocumentLineId: number | null;
    },
    tx: Prisma.TransactionClient,
  ) {
    if (
      sourceLog.businessDocumentType === "StockInOrder" &&
      sourceLog.businessDocumentLineId != null
    ) {
      const [sourceOrder, sourceLine] = await Promise.all([
        tx.stockInOrder.findUnique({
          where: { id: sourceLog.businessDocumentId },
          select: { id: true, documentNo: true, bizDate: true },
        }),
        tx.stockInOrderLine.findUnique({
          where: { id: sourceLog.businessDocumentLineId },
          select: { id: true },
        }),
      ]);

      return {
        sourceStockInOrderId: sourceOrder?.id ?? sourceLog.businessDocumentId,
        sourceStockInOrderLineId:
          sourceLine?.id ?? sourceLog.businessDocumentLineId,
        sourceDocumentNoSnapshot:
          sourceOrder?.documentNo ?? sourceLog.businessDocumentNumber,
        sourceBizDateSnapshot: sourceOrder?.bizDate ?? null,
      };
    }

    const priorCorrectionLine =
      await this.repository.findLineByGeneratedInLogId(sourceLog.id, tx);

    return {
      sourceStockInOrderId: priorCorrectionLine?.sourceStockInOrderId ?? null,
      sourceStockInOrderLineId:
        priorCorrectionLine?.sourceStockInOrderLineId ?? null,
      sourceDocumentNoSnapshot:
        priorCorrectionLine?.sourceDocumentNoSnapshot ??
        priorCorrectionLine?.sourceStockInOrder?.documentNo ??
        sourceLog.businessDocumentNumber,
      sourceBizDateSnapshot:
        priorCorrectionLine?.sourceBizDateSnapshot ??
        priorCorrectionLine?.sourceStockInOrder?.bizDate ??
        null,
    };
  }

  private assertMainWarehouse(workshop: {
    workshopCode: string;
    workshopName: string;
  }) {
    if (workshop.workshopCode !== MAIN_WAREHOUSE_CODE) {
      throw new BadRequestException("入库调价单只能归属主仓");
    }
  }

  private toPositiveMoney(value: Prisma.Decimal | string, fieldName: string) {
    let parsed: Prisma.Decimal;
    try {
      parsed = new Prisma.Decimal(value);
    } catch {
      throw new BadRequestException(`${fieldName} 格式无效`);
    }
    if (parsed.lte(0)) {
      throw new BadRequestException(`${fieldName} 必须大于 0`);
    }
    return parsed;
  }
}
