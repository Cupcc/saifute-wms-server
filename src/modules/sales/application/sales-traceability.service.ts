import { Injectable } from "@nestjs/common";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import { SalesRepository } from "../infrastructure/sales.repository";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;

@Injectable()
export class SalesTraceabilityService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly repository: SalesRepository,
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
      await this.repository.findPriceCorrectionLinesBySourceLogIds(
        sourceLogIds,
      );
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
      await this.repository.findStockInLinesByIds(directStockInLineIds);
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
