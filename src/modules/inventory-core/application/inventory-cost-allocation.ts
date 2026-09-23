import { BadRequestException } from "@nestjs/common";
import {
  Prisma,
  type StockDirection,
} from "../../../../generated/prisma/client";
import type { FifoAllocationPiece } from "./inventory.types";

/** Freeze the source split in the same transaction as its price-layer row. */
export async function recordCostAllocations(
  db: Prisma.TransactionClient,
  log: {
    id: number;
    direction: StockDirection;
    changeQty: Prisma.Decimal;
    costAmount: Prisma.Decimal | null;
  },
  pieces: FifoAllocationPiece[],
) {
  if (!("inventoryLogCostAllocation" in db) || !db.inventoryLogCostAllocation)
    return;
  if (!pieces.length) throw new BadRequestException("库存成本来源明细不能为空");
  const quantity = pieces.reduce(
    (sum, piece) => sum.add(piece.allocatedQty),
    new Prisma.Decimal(0),
  );
  const amount = pieces
    .reduce((sum, piece) => sum.add(piece.costAmount), new Prisma.Decimal(0))
    .toDecimalPlaces(4);
  if (
    !quantity.eq(log.changeQty) ||
    log.costAmount == null ||
    !amount.eq(log.costAmount)
  ) {
    throw new BadRequestException("库存分层数量或金额与总流水不一致");
  }
  if (
    pieces.some(
      (piece) =>
        !piece.allocatedQty.isFinite() ||
        piece.allocatedQty.lte(0) ||
        !piece.unitCost.isFinite() ||
        piece.unitCost.lt(0),
    )
  ) {
    throw new BadRequestException("库存成本分层数量或单价无效");
  }
  // Round cumulative amounts so every prefix and the final sum remain exact at
  // storage precision, even with six-decimal quantities and four-decimal costs.
  let cumulative = new Prisma.Decimal(0);
  let rounded = new Prisma.Decimal(0);
  const data = pieces.map((piece) => {
    cumulative = cumulative.add(piece.costAmount);
    const next = cumulative.toDecimalPlaces(4);
    const costAmount = next.sub(rounded);
    rounded = next;
    return {
      inventoryLogId: log.id,
      sourceLogId: piece.sourceLogId,
      direction: log.direction,
      quantity: piece.allocatedQty,
      unitCost: piece.unitCost,
      costAmount,
    };
  });
  await db.inventoryLogCostAllocation.createMany({ data });
}
