import { Injectable } from "@nestjs/common";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { SalesRepository } from "../infrastructure/sales.repository";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;

@Injectable()
export class SalesTraceabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async attachOutboundTraceability(
    order: NonNullable<Awaited<ReturnType<SalesRepository["findOrderById"]>>>,
  ) {
    const sourceUsagesByLine = new Map<
      number,
      Awaited<ReturnType<InventoryService["listSourceUsagesForConsumerLine"]>>
    >();

    for (const line of order.lines) {
      sourceUsagesByLine.set(
        line.id,
        await this.inventoryService.listSourceUsagesForConsumerLine({
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: order.id,
          consumerLineId: line.id,
        }),
      );
    }

    const sourceLogIds = [
      ...new Set(
        [...sourceUsagesByLine.values()].flatMap((usages) =>
          usages.map((usage) => usage.sourceLogId),
        ),
      ),
    ];

    const correctionLines =
      sourceLogIds.length > 0
        ? await this.prisma.stockInPriceCorrectionOrderLine.findMany({
            where: {
              OR: [
                { sourceInventoryLogId: { in: sourceLogIds } },
                { generatedInLogId: { in: sourceLogIds } },
              ],
            },
            include: {
              order: {
                select: {
                  id: true,
                  documentNo: true,
                  bizDate: true,
                },
              },
              sourceStockInOrder: {
                select: {
                  id: true,
                  documentNo: true,
                  bizDate: true,
                },
              },
              sourceStockInOrderLine: {
                select: {
                  id: true,
                  lineNo: true,
                  materialId: true,
                  materialCodeSnapshot: true,
                  materialNameSnapshot: true,
                  quantity: true,
                  unitPrice: true,
                },
              },
            },
          })
        : [];
    const correctionByGeneratedInLogId = new Map<
      number,
      (typeof correctionLines)[number]
    >();
    for (const correctionLine of correctionLines) {
      if (correctionLine.generatedInLogId != null) {
        correctionByGeneratedInLogId.set(
          correctionLine.generatedInLogId,
          correctionLine,
        );
      }
    }

    const directStockInLineIds = [
      ...new Set(
        [...sourceUsagesByLine.values()].flatMap((usages) =>
          usages
            .filter(
              (usage) =>
                usage.sourceLog.businessDocumentType ===
                  BusinessDocumentType.StockInOrder &&
                usage.sourceLog.businessDocumentLineId != null,
            )
            .map((usage) => usage.sourceLog.businessDocumentLineId as number),
        ),
      ),
    ];
    const directStockInLines =
      directStockInLineIds.length > 0
        ? await this.prisma.stockInOrderLine.findMany({
            where: { id: { in: directStockInLineIds } },
            include: {
              order: {
                select: {
                  id: true,
                  documentNo: true,
                  bizDate: true,
                },
              },
            },
          })
        : [];
    const directStockInLineById = new Map(
      directStockInLines.map((line) => [line.id, line]),
    );

    return {
      ...order,
      lines: order.lines.map((line) => ({
        ...line,
        sourceUsages: (sourceUsagesByLine.get(line.id) ?? []).map((usage) => {
          const directStockInLine =
            usage.sourceLog.businessDocumentType ===
              BusinessDocumentType.StockInOrder &&
            usage.sourceLog.businessDocumentLineId != null
              ? directStockInLineById.get(
                  usage.sourceLog.businessDocumentLineId,
                )
              : null;
          const correctionLine =
            directStockInLine == null
              ? (correctionByGeneratedInLogId.get(usage.sourceLogId) ?? null)
              : null;

          const originalInboundOrder =
            correctionLine?.sourceStockInOrder ??
            directStockInLine?.order ??
            null;
          const originalInboundLine =
            correctionLine?.sourceStockInOrderLine ?? directStockInLine ?? null;

          return {
            ...usage,
            priceCorrection: correctionLine
              ? {
                  id: correctionLine.id,
                  orderId: correctionLine.orderId,
                  documentNo: correctionLine.order.documentNo,
                  bizDate: correctionLine.order.bizDate,
                  sourceInventoryLogId: correctionLine.sourceInventoryLogId,
                  wrongUnitCost: correctionLine.wrongUnitCost,
                  correctUnitCost: correctionLine.correctUnitCost,
                  historicalDiffAmount: correctionLine.historicalDiffAmount,
                  generatedInLogId: correctionLine.generatedInLogId,
                  generatedOutLogId: correctionLine.generatedOutLogId,
                }
              : null,
            originalInboundOrder,
            originalInboundLine,
          };
        }),
      })),
    };
  }
}
