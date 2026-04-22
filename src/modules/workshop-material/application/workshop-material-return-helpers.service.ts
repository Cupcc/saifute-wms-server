import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DocumentFamily,
  DocumentLifecycleStatus,
  DocumentRelationType,
  Prisma,
  WorkshopMaterialOrderType,
} from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import { WorkshopMaterialRepository } from "../infrastructure/workshop-material.repository";
import {
  WORKSHOP_MATERIAL_DOCUMENT_TYPE,
  type WorkshopMaterialOrderLineEntity,
} from "./workshop-material-shared.service";

/**
 * RETURN-specific collaborators. Split out of the shared service so that the
 * return-quantity reconciliation logic (cumulative qty checks, source-usage
 * release, relation upserts, void-time restoration) lives next to the code
 * that drives it without exceeding the 500-line-per-file baseline.
 */
@Injectable()
export class WorkshopMaterialReturnHelpersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: WorkshopMaterialRepository,
    private readonly inventoryService: InventoryService,
  ) {}

  async validateReturnReplayQuantities(
    orderLines: WorkshopMaterialOrderLineEntity[],
    inputLines: CreateWorkshopMaterialOrderLineDto[],
    tx: Prisma.TransactionClient,
  ) {
    const incomingQtyByPickLine = new Map<number, Prisma.Decimal>();
    const pickLineToPickOrderId = new Map<number, number>();

    for (let idx = 0; idx < orderLines.length; idx++) {
      const lineDto = inputLines[idx];
      if (!lineDto?.sourceDocumentId || !lineDto?.sourceDocumentLineId) {
        continue;
      }
      const pickLineId = lineDto.sourceDocumentLineId;
      const pickOrderId = lineDto.sourceDocumentId;
      pickLineToPickOrderId.set(pickLineId, pickOrderId);
      const prev =
        incomingQtyByPickLine.get(pickLineId) ?? new Prisma.Decimal(0);
      incomingQtyByPickLine.set(
        pickLineId,
        prev.add(new Prisma.Decimal(orderLines[idx].quantity)),
      );
    }

    const checkedPickOrders = new Map<number, Map<number, Prisma.Decimal>>();
    for (const [pickLineId, incomingQty] of incomingQtyByPickLine) {
      const pickOrderId = pickLineToPickOrderId.get(pickLineId);
      if (pickOrderId === undefined) {
        continue;
      }
      if (!checkedPickOrders.has(pickOrderId)) {
        const activeMap = await this.repository.sumActiveReturnedQtyByPickLine(
          pickOrderId,
          tx,
        );
        checkedPickOrders.set(pickOrderId, activeMap);
      }
      const activeMap =
        checkedPickOrders.get(pickOrderId) ?? new Map<number, Prisma.Decimal>();
      const pickOrder = await this.repository.findOrderById(pickOrderId, tx);
      if (
        !pickOrder ||
        pickOrder.orderType !== WorkshopMaterialOrderType.PICK ||
        pickOrder.lifecycleStatus === DocumentLifecycleStatus.VOIDED
      ) {
        continue;
      }
      const pickLine = pickOrder.lines.find((line) => line.id === pickLineId);
      if (!pickLine) {
        continue;
      }
      const alreadyReturned =
        activeMap.get(pickLineId) ?? new Prisma.Decimal(0);
      if (
        alreadyReturned
          .add(incomingQty)
          .gt(new Prisma.Decimal(pickLine.quantity))
      ) {
        throw new BadRequestException(
          `领料明细 ${pickLineId} 累计有效退料数量超过领料数量`,
        );
      }
    }
  }

  async validateAndRecordReturnRelation(
    returnOrderId: number,
    returnLineId: number,
    linkedQty: Prisma.Decimal,
    _sourceDocumentType: string,
    sourceDocumentId: number,
    sourceDocumentLineId: number,
    createdBy?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const pickOrder = await this.repository.findOrderById(sourceDocumentId, tx);
    if (!pickOrder) {
      throw new BadRequestException(`上游领料单不存在: id=${sourceDocumentId}`);
    }
    if (pickOrder.orderType !== WorkshopMaterialOrderType.PICK) {
      throw new BadRequestException(
        `上游单据必须是领料单: type=${pickOrder.orderType}`,
      );
    }
    if (pickOrder.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException(`上游领料单已作废: id=${sourceDocumentId}`);
    }

    const pickLine = pickOrder.lines.find((l) => l.id === sourceDocumentLineId);
    if (!pickLine) {
      throw new BadRequestException(
        `上游领料明细不存在: lineId=${sourceDocumentLineId}`,
      );
    }

    // Line-scoped lookup avoids document-level truncation when a large pick
    // order has many source-usage rows across multiple lines.
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
          consumerDocumentId: sourceDocumentId,
          consumerLineId: sourceDocumentLineId,
        },
        tx,
      )
    ).sort((a, b) => Number(a.sourceLogId) - Number(b.sourceLogId));

    // Release source usage only up to the quantity returned in this operation,
    // processing usages in deterministic (sourceLogId ascending) order so that
    // partial returns are always applied against the oldest allocations first.
    let remainingToRelease = new Prisma.Decimal(linkedQty);
    for (const usage of lineUsages) {
      if (remainingToRelease.lte(0)) break;
      const allocatedQty = new Prisma.Decimal(usage.allocatedQty);
      const releasedQty = new Prisma.Decimal(usage.releasedQty);
      const unreleased = allocatedQty.sub(releasedQty);
      if (unreleased.lte(0)) continue;
      const toReleaseNow = unreleased.gt(remainingToRelease)
        ? remainingToRelease
        : unreleased;
      await this.inventoryService.releaseInventorySource(
        {
          sourceLogId: usage.sourceLogId,
          consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
          consumerDocumentId: sourceDocumentId,
          consumerLineId: sourceDocumentLineId,
          targetReleasedQty: releasedQty.add(toReleaseNow),
          operatorId: createdBy,
        },
        tx,
      );
      remainingToRelease = remainingToRelease.sub(toReleaseNow);
    }

    // Guard: if the source-usage scan could not release the full linkedQty,
    // the relation must not be persisted; the data state would otherwise
    // diverge from the active return set.
    if (remainingToRelease.gt(0)) {
      throw new BadRequestException(
        `领料来源库存释放不足: pickOrderId=${sourceDocumentId}, pickLineId=${sourceDocumentLineId}，退料需释放 ${new Prisma.Decimal(linkedQty).toFixed()} 但实际只能释放 ${new Prisma.Decimal(linkedQty).sub(remainingToRelease).toFixed()}`,
      );
    }
    const client = tx ?? this.prisma;
    await client.documentRelation.upsert({
      where: {
        relationType_upstreamFamily_upstreamDocumentId_downstreamFamily_downstreamDocumentId:
          {
            relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
            upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            upstreamDocumentId: sourceDocumentId,
            downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            downstreamDocumentId: returnOrderId,
          },
      },
      create: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        upstreamDocumentId: sourceDocumentId,
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        downstreamDocumentId: returnOrderId,
        isActive: true,
        createdBy,
        updatedBy: createdBy,
      },
      update: { isActive: true, updatedBy: createdBy },
    });

    await client.documentLineRelation.upsert({
      where: {
        relationType_upstreamFamily_upstreamLineId_downstreamFamily_downstreamLineId:
          {
            relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
            upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            upstreamLineId: sourceDocumentLineId,
            downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
            downstreamLineId: returnLineId,
          },
      },
      create: {
        relationType: DocumentRelationType.WORKSHOP_RETURN_FROM_PICK,
        upstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        upstreamDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        upstreamDocumentId: sourceDocumentId,
        upstreamLineId: sourceDocumentLineId,
        downstreamFamily: DocumentFamily.WORKSHOP_MATERIAL,
        downstreamDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        downstreamDocumentId: returnOrderId,
        downstreamLineId: returnLineId,
        linkedQty,
        createdBy,
        updatedBy: createdBy,
      },
      update: { linkedQty, updatedBy: createdBy },
    });
  }

  /**
   * Reverses the source-usage releases that were applied when a return order
   * was created. Processes usages in reverse sourceLogId order (newest first)
   * so the un-release mirrors the forward-release sequence in reverse,
   * restoring the pick line's available release capacity for future returns.
   */
  async restoreSourceUsageForReturnVoid(
    pickOrderId: number,
    pickLineId: number,
    quantityToRestore: Prisma.Decimal,
    operatorId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const lineUsages = (
      await this.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
          consumerDocumentId: pickOrderId,
          consumerLineId: pickLineId,
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
          consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
          consumerDocumentId: pickOrderId,
          consumerLineId: pickLineId,
          targetReleasedQty: releasedQty.sub(toRestoreNow),
          operatorId,
        },
        tx,
      );
      remainingToRestore = remainingToRestore.sub(toRestoreNow);
    }

    if (remainingToRestore.gt(0)) {
      throw new BadRequestException(
        `领料来源库存恢复不足: pickOrderId=${pickOrderId}, pickLineId=${pickLineId}，需恢复 ${quantityToRestore.toFixed()} 但实际只能恢复 ${quantityToRestore.sub(remainingToRestore).toFixed()}`,
      );
    }
  }
}
