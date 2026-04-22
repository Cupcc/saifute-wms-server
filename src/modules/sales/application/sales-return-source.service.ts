import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { InventoryService } from "../../inventory-core/application/inventory.service";

const DOCUMENT_TYPE = BusinessDocumentType.SalesStockOrder;

@Injectable()
export class SalesReturnSourceService {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Releases outbound source usages proportional to the returned quantity and
   * returns the derived cost (unit cost and total cost) from those released layers.
   * Oldest allocations are released first (FIFO order).
   */
  async releaseOutboundSourceForReturn(
    outboundOrderId: number,
    outboundLineId: number,
    returnQty: Prisma.Decimal,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<{
    releasedUnitCost: Prisma.Decimal;
    releasedCostAmount: Prisma.Decimal;
  }> {
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
        },
        tx,
      )
    ).sort((a, b) => Number(a.sourceLogId) - Number(b.sourceLogId));

    let remaining = new Prisma.Decimal(returnQty);
    let releasedCostAmount = new Prisma.Decimal(0);
    const releasedPieces: { qty: Prisma.Decimal; unitCost: Prisma.Decimal }[] =
      [];

    for (const usage of lineUsages) {
      if (remaining.lte(0)) break;
      const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      const unreleased = allocatedQty.sub(releasedQty);
      if (unreleased.lte(0)) continue;

      const toReleaseNow = unreleased.gt(remaining) ? remaining : unreleased;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
          targetReleasedQty: releasedQty.add(toReleaseNow),
          operatorId,
        },
        tx,
      );

      const srcUnitCost = usage.sourceLog.unitCost
        ? new Prisma.Decimal(usage.sourceLog.unitCost)
        : new Prisma.Decimal(0);
      releasedCostAmount = releasedCostAmount.add(
        srcUnitCost.mul(toReleaseNow),
      );
      releasedPieces.push({ qty: toReleaseNow, unitCost: srcUnitCost });
      remaining = remaining.sub(toReleaseNow);
    }

    if (remaining.gt(0)) {
      throw new BadRequestException(
        `销售退货来源库存释放不足: outboundOrderId=${outboundOrderId}, outboundLineId=${outboundLineId}，退货需释放 ${returnQty.toFixed()} 但实际只能释放 ${returnQty.sub(remaining).toFixed()}`,
      );
    }

    const releasedUnitCost = returnQty.gt(0)
      ? releasedCostAmount.div(returnQty)
      : new Prisma.Decimal(0);

    return { releasedUnitCost, releasedCostAmount };
  }

  /**
   * Restores (un-releases) outbound source usage releases that were applied when
   * a sales return was created. Processes usages newest-first to mirror the
   * forward-release sequence in reverse.
   */
  async restoreOutboundSourceForReturnVoid(
    outboundOrderId: number | undefined,
    outboundLineId: number,
    quantityToRestore: Prisma.Decimal,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!outboundOrderId) return;

    // Line-scoped lookup avoids document-level truncation when a large outbound
    // order has many source-usage rows across multiple lines.
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
        },
        tx,
      )
    ).sort((a, b) => Number(b.sourceLogId) - Number(a.sourceLogId));

    let remainingToRestore = new Prisma.Decimal(quantityToRestore);
    for (const usage of lineUsages) {
      if (remainingToRestore.lte(0)) break;
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      if (releasedQty.lte(0)) continue;
      const toRestoreNow = releasedQty.gt(remainingToRestore)
        ? remainingToRestore
        : releasedQty;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: outboundOrderId,
          consumerLineId: outboundLineId,
          targetReleasedQty: releasedQty.sub(toRestoreNow),
          operatorId,
        },
        tx,
      );
      remainingToRestore = remainingToRestore.sub(toRestoreNow);
    }

    if (remainingToRestore.gt(0)) {
      throw new BadRequestException(
        `销售退货来源库存恢复不足: outboundOrderId=${outboundOrderId}, outboundLineId=${outboundLineId}，需恢复 ${quantityToRestore.toFixed()} 但实际只能恢复 ${quantityToRestore.sub(remainingToRestore).toFixed()}`,
      );
    }
  }
}
