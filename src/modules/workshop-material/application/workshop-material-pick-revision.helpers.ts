import { Prisma } from "../../../../generated/prisma/client";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import { type StockScopeCode } from "../../session/domain/user-session";
import type { CreateWorkshopMaterialOrderLineDto } from "../dto/create-workshop-material-order-line.dto";
import type { UpdateWorkshopMaterialOrderLineDto } from "../dto/update-workshop-material-order-line.dto";
import {
  WORKSHOP_MATERIAL_BUSINESS_MODULE,
  WORKSHOP_MATERIAL_DOCUMENT_TYPE,
  type WorkshopMaterialLineWriteData,
  type WorkshopMaterialOrderLineEntity,
  WorkshopMaterialSharedService,
} from "./workshop-material-shared.service";

/**
 * Shared line-level mechanics for PICK revisions. Keeping these operations
 * outside the lifecycle service makes it explicit which changes affect stock
 * and which only update the document snapshot.
 */
export class WorkshopMaterialPickRevisionHelpers {
  constructor(private readonly shared: WorkshopMaterialSharedService) {}

  async updateExistingLine(
    currentLine: WorkshopMaterialOrderLineEntity,
    lineData: WorkshopMaterialLineWriteData,
    inputLine: UpdateWorkshopMaterialOrderLineDto,
    inventoryNeedsRepost: boolean,
    operatorId: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<WorkshopMaterialOrderLineEntity> {
    const lineChanged = this.lineNeedsDataUpdate(
      currentLine,
      lineData,
      inputLine,
    );

    if (!lineChanged && !inventoryNeedsRepost) {
      return currentLine;
    }

    return this.shared.repository.updateOrderLine(
      currentLine.id,
      {
        lineNo: lineData.lineNo,
        materialId: lineData.materialId,
        materialCodeSnapshot: lineData.materialCodeSnapshot,
        materialNameSnapshot: lineData.materialNameSnapshot,
        materialSpecSnapshot: lineData.materialSpecSnapshot,
        unitCodeSnapshot: lineData.unitCodeSnapshot,
        quantity: lineData.quantity,
        ...(inventoryNeedsRepost
          ? { unitPrice: lineData.unitPrice, amount: lineData.amount }
          : {}),
        ...(typeof inputLine.sourceDocumentType === "undefined"
          ? {}
          : { sourceDocumentType: inputLine.sourceDocumentType }),
        ...(typeof inputLine.sourceDocumentId === "undefined"
          ? {}
          : { sourceDocumentId: inputLine.sourceDocumentId }),
        ...(typeof inputLine.sourceDocumentLineId === "undefined"
          ? {}
          : { sourceDocumentLineId: inputLine.sourceDocumentLineId }),
        remark: lineData.remark,
        updatedBy: operatorId,
      },
      tx,
    );
  }

  currentCostMatchesSelection(
    currentLine: WorkshopMaterialOrderLineEntity,
    inputLine: CreateWorkshopMaterialOrderLineDto,
  ) {
    const currentCost = currentLine.costUnitPrice ?? currentLine.unitPrice;
    return Boolean(
      currentCost &&
        inputLine.selectedUnitCost &&
        new Prisma.Decimal(currentCost).eq(inputLine.selectedUnitCost),
    );
  }

  lineNeedsDataUpdate(
    currentLine: WorkshopMaterialOrderLineEntity,
    lineData: WorkshopMaterialLineWriteData,
    inputLine: UpdateWorkshopMaterialOrderLineDto,
  ) {
    return (
      currentLine.lineNo !== lineData.lineNo ||
      currentLine.materialId !== lineData.materialId ||
      currentLine.materialCodeSnapshot !== lineData.materialCodeSnapshot ||
      currentLine.materialNameSnapshot !== lineData.materialNameSnapshot ||
      currentLine.materialSpecSnapshot !== lineData.materialSpecSnapshot ||
      currentLine.unitCodeSnapshot !== lineData.unitCodeSnapshot ||
      !new Prisma.Decimal(currentLine.quantity).eq(lineData.quantity) ||
      (currentLine.remark ?? null) !== (lineData.remark ?? null) ||
      (inputLine.sourceDocumentType ?? null) !==
        (currentLine.sourceDocumentType ?? null) ||
      (inputLine.sourceDocumentId ?? null) !==
        (currentLine.sourceDocumentId ?? null) ||
      (inputLine.sourceDocumentLineId ?? null) !==
        (currentLine.sourceDocumentLineId ?? null)
    );
  }

  sameCalendarDate(left: Date, right: Date) {
    return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
  }

  async manualSourceNeedsRepost(
    orderId: number,
    lineId: number,
    sourceLogId: number | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (sourceLogId == null) return false;
    const usages =
      await this.shared.inventoryService.listSourceUsagesForConsumerLine(
        {
          consumerDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
          consumerDocumentId: orderId,
          consumerLineId: lineId,
        },
        tx,
      );
    const activeUsages = usages.filter((usage) =>
      new Prisma.Decimal(usage.allocatedQty).gt(
        new Prisma.Decimal(usage.releasedQty),
      ),
    );
    return (
      activeUsages.length !== 1 || activeUsages[0]?.sourceLogId !== sourceLogId
    );
  }

  lineAmount(line: WorkshopMaterialOrderLineEntity) {
    return new Prisma.Decimal(line.costAmount ?? line.amount ?? 0);
  }

  async settleConsumerOutForLines(params: {
    orderId: number;
    documentNo: string;
    inventoryStockScope: StockScopeCode;
    bizDate: Date;
    lines: WorkshopMaterialOrderLineEntity[];
    inputLines: CreateWorkshopMaterialOrderLineDto[];
    idempotencyPrefix: string;
    operatorId?: string;
    tx: Prisma.TransactionClient;
  }): Promise<Prisma.Decimal> {
    let settledTotalAmount = new Prisma.Decimal(0);

    for (const line of params.lines) {
      const lineDto = params.inputLines[line.lineNo - 1];
      settledTotalAmount = settledTotalAmount.add(
        await this.settleConsumerOutForLine({
          orderId: params.orderId,
          documentNo: params.documentNo,
          inventoryStockScope: params.inventoryStockScope,
          bizDate: params.bizDate,
          line,
          inputLine: lineDto,
          idempotencyKey: `${params.idempotencyPrefix}:line:${line.id}`,
          operatorId: params.operatorId,
          tx: params.tx,
        }),
      );
    }
    return settledTotalAmount;
  }

  async settleConsumerOutForLine(params: {
    orderId: number;
    documentNo: string;
    inventoryStockScope: StockScopeCode;
    bizDate: Date;
    line: WorkshopMaterialOrderLineEntity;
    inputLine: CreateWorkshopMaterialOrderLineDto;
    idempotencyKey: string;
    operatorId?: string;
    tx: Prisma.TransactionClient;
  }): Promise<Prisma.Decimal> {
    const sourceTypes = FIFO_SOURCE_OPERATION_TYPES.filter(
      (t) => t !== "RD_HANDOFF_IN",
    );
    const settlement = await (
      this.shared.inventoryService as InventoryService
    ).settleConsumerOut(
      {
        materialId: params.line.materialId,
        stockScope: params.inventoryStockScope,
        bizDate: params.bizDate,
        quantity: params.line.quantity,
        operationType: "PICK_OUT",
        businessModule: WORKSHOP_MATERIAL_BUSINESS_MODULE,
        businessDocumentType: WORKSHOP_MATERIAL_DOCUMENT_TYPE,
        businessDocumentId: params.orderId,
        businessDocumentNumber: params.documentNo,
        businessDocumentLineId: params.line.id,
        operatorId: params.operatorId,
        idempotencyKey: params.idempotencyKey,
        consumerLineId: params.line.id,
        sourceLogId: params.inputLine.sourceLogId ?? undefined,
        selectedUnitCost: params.inputLine.selectedUnitCost ?? undefined,
        sourceOperationTypes: sourceTypes,
      },
      params.tx,
    );
    await this.shared.repository.updateOrderLineCost(
      params.line.id,
      {
        costUnitPrice: settlement.settledUnitCost,
        costAmount: settlement.settledCostAmount,
        unitPrice: settlement.settledUnitCost,
        amount: settlement.settledCostAmount,
      },
      params.tx,
    );
    return settlement.settledCostAmount;
  }
}
