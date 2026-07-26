import { BadRequestException } from "@nestjs/common";
import {
  InventoryOperationType,
  Prisma,
  RdMaterialStatusEventType,
  StockDirection,
} from "../../../../generated/prisma/client";
import { BusinessDocumentType } from "../../../shared/domain/business-document-type";
import { InventoryService } from "../../inventory-core/application/inventory.service";
import type {
  FifoAllocationPiece,
  SettleConsumerOutResult,
} from "../../inventory-core/application/inventory.types";
import { RdProjectLookupService } from "../../rd-project/application/rd-project-lookup.service";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import { resolveHandoffRdProjectForRequest } from "./rd-handoff-resolver.helper";
import { applyManualReturnStatus } from "./rd-material-status.helper";

const DOCUMENT_TYPE = BusinessDocumentType.RdProcurementRequest;
const BUSINESS_MODULE = "rd-subwarehouse";

export type RdProcurementRequestDetail = NonNullable<
  Awaited<ReturnType<RdProcurementRequestRepository["findRequestById"]>>
>;
export type RdProcurementRequestDetailLine =
  RdProcurementRequestDetail["lines"][number];
export type RdProcurementStatusHistoryDetail = NonNullable<
  Awaited<ReturnType<RdProcurementRequestRepository["findStatusHistoryById"]>>
>;

const MANUAL_REVERSIBLE_EVENT_TYPES: RdMaterialStatusEventType[] = [
  RdMaterialStatusEventType.PROCUREMENT_STARTED,
  RdMaterialStatusEventType.ACCEPTANCE_CONFIRMED,
  RdMaterialStatusEventType.MANUAL_CANCELLED,
  RdMaterialStatusEventType.MANUAL_RETURNED,
];

/**
 * Bridge IN logs mirror the FIFO allocation pieces of the OUT settlement.
 * If FIFO returned no pieces (should not occur in normal operation), fall
 * back to a single synthetic piece covering the full quantity with the
 * aggregated settled cost.
 */
export function resolveBridgeAllocations(
  outSettlement: Pick<
    SettleConsumerOutResult,
    "allocations" | "settledUnitCost" | "settledCostAmount"
  >,
  fallbackQuantity: Prisma.Decimal | string,
): FifoAllocationPiece[] {
  if (outSettlement.allocations.length > 0) {
    return outSettlement.allocations;
  }
  return [
    {
      sourceLogId: 0,
      allocatedQty: new Prisma.Decimal(fallbackQuantity),
      unitCost: outSettlement.settledUnitCost,
      costAmount: outSettlement.settledCostAmount,
    },
  ];
}

export function assertReversibleManualHistory(
  history: RdProcurementStatusHistoryDetail,
) {
  if (
    history.sourceDocumentType !== BusinessDocumentType.RdProcurementRequest
  ) {
    throw new BadRequestException(
      "该状态历史由其它业务单据产生，请通过作废对应单据回滚",
    );
  }
  if (history.reversalOfHistoryId != null) {
    throw new BadRequestException("不能回滚回滚记录");
  }
  if (history.isReversed) {
    throw new BadRequestException("该状态历史已被回滚");
  }
  if (!MANUAL_REVERSIBLE_EVENT_TYPES.includes(history.eventType)) {
    throw new BadRequestException(
      `该状态事件不支持手工回滚: ${history.eventType}`,
    );
  }
}

export async function applyManualReturnWithInventory(
  params: {
    inventoryService: InventoryService;
    rdProjectLookupService: RdProjectLookupService;
    repository: RdProcurementRequestRepository;
    request: RdProcurementRequestDetail;
    requestLine: RdProcurementRequestDetailLine;
    quantity: string;
    referenceNo: string;
    reason: string;
    bizDate?: string;
    note?: string;
    operatorId?: string;
  },
  tx: Prisma.TransactionClient,
) {
  const { request, requestLine, operatorId } = params;
  if (!request.projectCode?.trim()) {
    throw new BadRequestException("RD 采购需求缺少研发项目编码，无法执行退回");
  }
  if (requestLine.materialId == null) {
    throw new BadRequestException(
      `采购品项“${requestLine.materialNameSnapshot}”尚未登记验收并绑定物料，不能退回库存`,
    );
  }
  const materialId = requestLine.materialId;

  const project = await resolveHandoffRdProjectForRequest(
    params.rdProjectLookupService,
    request,
    new Map(),
  );
  const currentProject =
    await params.rdProjectLookupService.requireEffectiveProjectById(
      project.id,
      tx,
    );
  const projectTargetId =
    await params.rdProjectLookupService.ensureProjectTarget({
      project: currentProject,
      updatedBy: operatorId,
      tx,
    });

  const histories = await applyManualReturnStatus(
    {
      requestId: request.id,
      requestDocumentNo: request.documentNo,
      requestLineId: requestLine.id,
      quantity: params.quantity,
      note: params.note,
      reason: params.reason,
      referenceNo: params.referenceNo,
      operatorId,
    },
    tx,
  );
  const anchorHistoryId = histories[0]?.id;
  if (anchorHistoryId == null) {
    throw new BadRequestException("RD 退回状态历史创建失败");
  }

  const bizDate = params.bizDate ? new Date(params.bizDate) : new Date();
  const outSettlement = await params.inventoryService.settleConsumerOut(
    {
      materialId,
      stockScope: "RD_SUB",
      bizDate,
      quantity: params.quantity,
      operationType: InventoryOperationType.RD_RETURN_OUT,
      businessModule: BUSINESS_MODULE,
      businessDocumentType: DOCUMENT_TYPE,
      businessDocumentId: request.id,
      businessDocumentNumber: request.documentNo,
      businessDocumentLineId: requestLine.id,
      projectTargetId,
      operatorId,
      idempotencyKey: `${DOCUMENT_TYPE}:${request.id}:return-out:${requestLine.id}:hist:${anchorHistoryId}`,
      note: `RD 小仓退回主仓 (${project.projectCode}): ${params.reason}`,
      // Source-usage identity must be unique per return action, not per request
      // line: InventorySourceUsage is unique on (consumerDocumentType,
      // consumerLineId, sourceLogId) and allocation uses absolute-target
      // semantics, so a second return on the same line would collide with the
      // first one. The anchor history id is created once per action.
      consumerLineId: anchorHistoryId,
      sourceOperationTypes: [InventoryOperationType.RD_HANDOFF_IN],
      sourceProjectTargetId: projectTargetId,
    },
    tx,
  );

  const allocationsToCreate = resolveBridgeAllocations(
    outSettlement,
    params.quantity,
  );

  for (const allocation of allocationsToCreate) {
    const bridgeIdempotencyKey =
      allocation.sourceLogId > 0
        ? `${DOCUMENT_TYPE}:${request.id}:return-in:${requestLine.id}:hist:${anchorHistoryId}:src:${allocation.sourceLogId}`
        : `${DOCUMENT_TYPE}:${request.id}:return-in:${requestLine.id}:hist:${anchorHistoryId}`;

    // MAIN IN bridge stays unattributed (no projectTargetId): MAIN FIFO
    // consumers only see projectTarget-null layers, so attributing the
    // returned stock to the RD project would orphan it in MAIN.
    await params.inventoryService.increaseStock(
      {
        materialId,
        stockScope: "MAIN",
        bizDate,
        quantity: allocation.allocatedQty,
        operationType: InventoryOperationType.RD_RETURN_IN,
        businessModule: BUSINESS_MODULE,
        businessDocumentType: DOCUMENT_TYPE,
        businessDocumentId: request.id,
        businessDocumentNumber: request.documentNo,
        businessDocumentLineId: requestLine.id,
        operatorId,
        idempotencyKey: bridgeIdempotencyKey,
        note: `RD 小仓退回主仓 / ${project.projectCode} (RD_SUB 来源层 ${allocation.sourceLogId})`,
        unitCost: allocation.unitCost,
        costAmount: allocation.costAmount,
      },
      tx,
    );
  }

  await params.repository.linkStatusHistoriesToInventoryLog(
    histories.map((history) => history.id),
    outSettlement.outLog.id,
    tx,
  );

  return histories;
}

export async function reverseManualReturnInventory(
  params: {
    inventoryService: InventoryService;
    request: RdProcurementRequestDetail;
    history: RdProcurementStatusHistoryDetail;
    operatorId?: string;
  },
  tx: Prisma.TransactionClient,
) {
  const { request, history, operatorId } = params;
  const logs = await params.inventoryService.getLogsForDocument(
    {
      businessDocumentType: DOCUMENT_TYPE,
      businessDocumentId: request.id,
    },
    tx,
  );
  const marker = `:hist:${history.id}`;
  const actionLogs = logs.filter((log) => {
    const idx = log.idempotencyKey.indexOf(marker);
    if (idx === -1) {
      return false;
    }
    const rest = log.idempotencyKey.slice(idx + marker.length);
    return rest === "" || rest.startsWith(":");
  });
  const inLogs = actionLogs.filter(
    (log) => log.direction === StockDirection.IN,
  );
  const outLogs = actionLogs.filter(
    (log) => log.direction === StockDirection.OUT,
  );
  if (!outLogs.some((log) => log.id === history.relatedInventoryLogId)) {
    throw new BadRequestException("未找到可冲回的退回库存流水");
  }

  for (const log of inLogs) {
    const hasAllocations =
      await params.inventoryService.hasUnreleasedAllocations(log.id, tx);
    if (hasAllocations) {
      throw new BadRequestException(
        `主仓退回入库流水 ${log.id} 已有下游消耗分配，不能回滚该退回记录，请先撤销主仓内的相关消耗记录`,
      );
    }
  }

  // Usages were allocated with the anchor history id as consumerLineId (one
  // identity per return action), so release only this action's allocations.
  await params.inventoryService.releaseSourceUsagesForConsumerLine(
    {
      consumerDocumentType: DOCUMENT_TYPE,
      consumerDocumentId: request.id,
      consumerLineId: history.id,
      operatorId,
    },
    tx,
  );

  for (const log of [...inLogs, ...outLogs]) {
    await params.inventoryService.reverseStock(
      {
        logIdToReverse: log.id,
        idempotencyKey: `${DOCUMENT_TYPE}:reverse:${history.id}:log:${log.id}`,
        note: `回滚 RD 退回动作: ${request.documentNo}`,
      },
      tx,
    );
  }
}
