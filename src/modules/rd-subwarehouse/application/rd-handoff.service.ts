import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditStatusSnapshot,
  DocumentLifecycleStatus,
  InventoryEffectStatus,
  InventoryOperationType,
  Prisma,
  StockDirection,
} from "../../../generated/prisma/client";
import {
  buildDashedTimestampDocumentNo,
  createWithGeneratedDocumentNo,
} from "../../../shared/common/document-number.util";
import { PrismaService } from "../../../shared/prisma/prisma.service";
import {
  FIFO_SOURCE_OPERATION_TYPES,
  InventoryService,
} from "../../inventory-core/application/inventory.service";
import { MasterDataService } from "../../master-data/application/master-data.service";
import type { CreateRdHandoffOrderDto } from "../dto/create-rd-handoff-order.dto";
import type { QueryRdHandoffOrderDto } from "../dto/query-rd-handoff-order.dto";
import { RdHandoffRepository } from "../infrastructure/rd-handoff.repository";
import { RdProcurementRequestRepository } from "../infrastructure/rd-procurement-request.repository";
import {
  applyHandoffStatusesForOrder,
  RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE,
  reverseHandoffStatusesForOrder,
} from "./rd-material-status.helper";

const DOCUMENT_TYPE = "RdHandoffOrder";
const BUSINESS_MODULE = "rd-subwarehouse";

@Injectable()
export class RdHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RdHandoffRepository,
    private readonly rdProcurementRequestRepository: RdProcurementRequestRepository,
    private readonly masterDataService: MasterDataService,
    private readonly inventoryService: InventoryService,
  ) {}

  async listOrders(query: QueryRdHandoffOrderDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    return this.repository.findOrders({
      documentNo: query.documentNo,
      bizDateFrom: query.bizDateFrom ? new Date(query.bizDateFrom) : undefined,
      bizDateTo: query.bizDateTo ? new Date(query.bizDateTo) : undefined,
      handlerName: query.handlerName,
      materialId: query.materialId,
      materialName: query.materialName,
      sourceWorkshopId: query.sourceWorkshopId,
      targetWorkshopId: query.targetWorkshopId,
      limit,
      offset,
    });
  }

  async getOrderById(id: number) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`RD 交接单不存在: ${id}`);
    }
    return order;
  }

  async createOrder(dto: CreateRdHandoffOrderDto, createdBy?: string) {
    const [sourceStockScopeRecord, targetStockScopeRecord] = await Promise.all([
      this.masterDataService.getStockScopeByCode("MAIN"),
      this.masterDataService.getStockScopeByCode("RD_SUB"),
    ]);

    const handlerSnapshot = dto.handlerPersonnelId
      ? await this.resolveHandlerSnapshot(dto.handlerPersonnelId)
      : { handlerNameSnapshot: null };

    const bizDate = new Date(dto.bizDate);
    const requestCache = new Map<
      number,
      Awaited<ReturnType<RdProcurementRequestRepository["findRequestById"]>>
    >();
    const linesWithSnapshots = await Promise.all(
      dto.lines.map(async (line, idx) => {
        const material = await this.masterDataService.getMaterialById(
          line.materialId,
        );
        const sourceRequest = await this.resolveSourceRequest(
          line.sourceDocumentId,
          requestCache,
        );
        const sourceDocumentType =
          line.sourceDocumentType ?? RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE;
        if (sourceDocumentType !== RD_PROCUREMENT_REQUEST_DOCUMENT_TYPE) {
          throw new BadRequestException(
            "RD 交接明细只能显式关联 RD 采购需求行",
          );
        }
        if (!line.sourceDocumentLineId) {
          throw new BadRequestException("RD 交接明细必须绑定采购需求行");
        }
        const requestLine = sourceRequest?.lines.find(
          (item) => item.id === line.sourceDocumentLineId,
        );
        if (!requestLine) {
          throw new BadRequestException("交接来源采购行不存在");
        }
        if (requestLine.materialId !== material.id) {
          throw new BadRequestException("交接物料必须与采购需求行一致");
        }
        const quantity = new Prisma.Decimal(line.quantity);
        const unitPrice = new Prisma.Decimal(line.unitPrice ?? "0");
        const amount = quantity.mul(unitPrice);
        return {
          lineNo: idx + 1,
          materialId: material.id,
          materialCodeSnapshot: material.materialCode,
          materialNameSnapshot: material.materialName,
          materialSpecSnapshot: material.specModel ?? "",
          unitCodeSnapshot: material.unitCode,
          quantity,
          unitPrice,
          amount,
          sourceDocumentType,
          sourceDocumentId: sourceRequest?.id,
          sourceDocumentLineId: requestLine.id,
          remark: line.remark,
        };
      }),
    );

    const totalQty = linesWithSnapshots.reduce(
      (sum, line) => sum.add(line.quantity),
      new Prisma.Decimal(0),
    );
    const totalAmount = linesWithSnapshots.reduce(
      (sum, line) => sum.add(line.amount),
      new Prisma.Decimal(0),
    );

    return createWithGeneratedDocumentNo((attempt) => {
      const documentNo = buildDashedTimestampDocumentNo(
        "RDH",
        bizDate,
        attempt,
      );
      return this.prisma.runInTransaction(async (tx) => {
        const order = await this.repository.createOrder(
          {
            documentNo,
            bizDate,
            handlerPersonnelId: dto.handlerPersonnelId,
            sourceStockScopeId: sourceStockScopeRecord.id,
            targetStockScopeId: targetStockScopeRecord.id,
            sourceWorkshopId: null,
            targetWorkshopId: null,
            auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
            handlerNameSnapshot: handlerSnapshot.handlerNameSnapshot,
            sourceWorkshopNameSnapshot: sourceStockScopeRecord.scopeName,
            targetWorkshopNameSnapshot: targetStockScopeRecord.scopeName,
            totalQty,
            totalAmount,
            remark: dto.remark,
            createdBy,
            updatedBy: createdBy,
          },
          linesWithSnapshots.map((line) => ({
            ...line,
            createdBy,
            updatedBy: createdBy,
          })),
          tx,
        );

        const inboundLogIdByLineId = new Map<number, number>();
        const mainSourceTypes = FIFO_SOURCE_OPERATION_TYPES.filter(
          (t) => t !== "RD_HANDOFF_IN",
        );
        for (const line of order.lines) {
          // MAIN OUT: settle against MAIN source layers via FIFO.
          const outSettlement = await this.inventoryService.settleConsumerOut(
            {
              materialId: line.materialId,
              stockScope: "MAIN",
              quantity: line.quantity,
              operationType: InventoryOperationType.RD_HANDOFF_OUT,
              businessModule: BUSINESS_MODULE,
              businessDocumentType: DOCUMENT_TYPE,
              businessDocumentId: order.id,
              businessDocumentNumber: order.documentNo,
              businessDocumentLineId: line.id,
              operatorId: createdBy,
              idempotencyKey: `${DOCUMENT_TYPE}:${order.id}:out:${line.id}`,
              note: `主仓交接到 RD 小仓: ${order.sourceWorkshopNameSnapshot} -> ${order.targetWorkshopNameSnapshot}`,
              consumerLineId: line.id,
              sourceOperationTypes: mainSourceTypes,
            },
            tx,
          );

          // RD_SUB IN: create one IN log per FIFO allocation piece to preserve the
          // original MAIN source layer granularity (cost bridge). Each piece gets its
          // own deterministic idempotency key so the bridge is idempotent and auditable.
          // The first piece's log is used as the representative for status-helper mapping.
          let representativeInLogId: number | undefined;
          const allocationsToCreate =
            outSettlement.allocations.length > 0
              ? outSettlement.allocations
              : [
                  // Fallback: single synthetic piece covering the full line qty with
                  // aggregated cost (only used if FIFO returned empty allocations,
                  // which should not occur in normal operation).
                  {
                    sourceLogId: 0,
                    allocatedQty: new Prisma.Decimal(line.quantity),
                    unitCost: outSettlement.settledUnitCost,
                    costAmount: outSettlement.settledCostAmount,
                  },
                ];

          for (const allocation of allocationsToCreate) {
            const bridgeIdempotencyKey =
              allocation.sourceLogId > 0
                ? `${DOCUMENT_TYPE}:${order.id}:in:${line.id}:src:${allocation.sourceLogId}`
                : `${DOCUMENT_TYPE}:${order.id}:in:${line.id}`;

            const bridgeLog = await this.inventoryService.increaseStock(
              {
                materialId: line.materialId,
                stockScope: "RD_SUB",
                quantity: allocation.allocatedQty,
                operationType: InventoryOperationType.RD_HANDOFF_IN,
                businessModule: BUSINESS_MODULE,
                businessDocumentType: DOCUMENT_TYPE,
                businessDocumentId: order.id,
                businessDocumentNumber: order.documentNo,
                businessDocumentLineId: line.id,
                operatorId: createdBy,
                idempotencyKey: bridgeIdempotencyKey,
                note: `主仓交接到 RD 小仓 (MAIN 来源层 ${allocation.sourceLogId}): ${order.sourceWorkshopNameSnapshot} -> ${order.targetWorkshopNameSnapshot}`,
                unitCost: allocation.unitCost,
                costAmount: allocation.costAmount,
              },
              tx,
            );

            if (representativeInLogId === undefined) {
              representativeInLogId = bridgeLog.id;
            }
          }

          if (representativeInLogId !== undefined) {
            inboundLogIdByLineId.set(line.id, representativeInLogId);
          }

          // Persist aggregated cost snapshot on the handoff order line.
          await this.repository.updateOrderLineCost(
            line.id,
            {
              costUnitPrice: outSettlement.settledUnitCost,
              costAmount: outSettlement.settledCostAmount,
            },
            tx,
          );
        }

        await applyHandoffStatusesForOrder(
          {
            orderId: order.id,
            documentNo: order.documentNo,
            lines: order.lines,
            operatorId: createdBy,
            logIdByLineId: inboundLogIdByLineId,
          },
          tx,
        );

        return order;
      });
    });
  }

  async voidOrder(id: number, voidReason?: string, voidedBy?: string) {
    const order = await this.repository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`RD 交接单不存在: ${id}`);
    }
    if (order.lifecycleStatus === DocumentLifecycleStatus.VOIDED) {
      throw new BadRequestException("单据已作废");
    }
    if (order.inventoryEffectStatus !== InventoryEffectStatus.POSTED) {
      throw new BadRequestException("库存状态异常，无法作废");
    }

    return this.prisma.runInTransaction(async (tx) => {
      await reverseHandoffStatusesForOrder(
        {
          orderId: id,
          documentNo: order.documentNo,
          operatorId: voidedBy,
          note: `作废 RD 交接单: ${order.documentNo}`,
        },
        tx,
      );

      // Release MAIN source allocations that were created during the OUT settlement.
      await this.inventoryService.releaseAllSourceUsagesForConsumer(
        {
          consumerDocumentType: DOCUMENT_TYPE,
          consumerDocumentId: id,
          operatorId: voidedBy,
        },
        tx,
      );

      const logs = await this.inventoryService.getLogsForDocument(
        {
          businessDocumentType: DOCUMENT_TYPE,
          businessDocumentId: id,
        },
        tx,
      );
      if (logs.length === 0) {
        throw new BadRequestException("未找到可冲回的库存流水");
      }

      const orderedLogs = [...logs].sort((left, right) => {
        if (left.direction === right.direction) {
          return left.id - right.id;
        }
        return left.direction === StockDirection.IN ? -1 : 1;
      });

      // Guard: RD_SUB IN bridge logs are FIFO source layers for downstream RD_SUB
      // consumers. Block the void if any bridge layer has been partially or fully
      // allocated downstream and not yet released.
      for (const log of orderedLogs) {
        if (log.direction === StockDirection.IN) {
          const hasAllocations =
            await this.inventoryService.hasUnreleasedAllocations(log.id, tx);
          if (hasAllocations) {
            throw new BadRequestException(
              `RD 小仓交接入库流水 ${log.id} 已有下游消耗分配，不能作废交接单，请先撤销 RD 小仓内的相关消耗记录`,
            );
          }
        }
      }

      for (const log of orderedLogs) {
        await this.inventoryService.reverseStock(
          {
            logIdToReverse: log.id,
            idempotencyKey: `${DOCUMENT_TYPE}:void:${id}:log:${log.id}`,
            note: `作废 RD 交接单: ${order.documentNo}`,
          },
          tx,
        );
      }

      await this.repository.updateOrder(
        id,
        {
          lifecycleStatus: DocumentLifecycleStatus.VOIDED,
          inventoryEffectStatus: InventoryEffectStatus.REVERSED,
          auditStatusSnapshot: AuditStatusSnapshot.NOT_REQUIRED,
          voidReason: voidReason ?? null,
          voidedBy: voidedBy ?? null,
          voidedAt: new Date(),
          updatedBy: voidedBy,
        },
        tx,
      );

      return this.repository.findOrderById(id, tx);
    });
  }

  private async resolveHandlerSnapshot(handlerPersonnelId: number) {
    const personnel =
      await this.masterDataService.getPersonnelById(handlerPersonnelId);
    return { handlerNameSnapshot: personnel.personnelName };
  }

  private async resolveSourceRequest(
    requestId: number | undefined,
    cache: Map<
      number,
      Awaited<ReturnType<RdProcurementRequestRepository["findRequestById"]>>
    >,
  ) {
    if (!requestId) {
      throw new BadRequestException("RD 交接明细必须绑定采购需求单");
    }
    if (cache.has(requestId)) {
      return cache.get(requestId) ?? null;
    }

    const request =
      await this.rdProcurementRequestRepository.findRequestById(requestId);
    if (!request) {
      throw new BadRequestException(`采购需求不存在: ${requestId}`);
    }
    if (request.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException("只能关联有效的 RD 采购需求");
    }
    cache.set(requestId, request);
    return request;
  }
}
