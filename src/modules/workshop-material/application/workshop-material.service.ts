import { Injectable } from "@nestjs/common";
import { type StockScopeCode } from "../../session/domain/user-session";
import type { CreateWorkshopMaterialOrderDto } from "../dto/create-workshop-material-order.dto";
import type { QueryWorkshopMaterialOrderDto } from "../dto/query-workshop-material-order.dto";
import type { UpdateWorkshopMaterialOrderDto } from "../dto/update-workshop-material-order.dto";
import { WorkshopMaterialPickService } from "./workshop-material-pick.service";
import { WorkshopMaterialReturnService } from "./workshop-material-return.service";
import { WorkshopMaterialScrapService } from "./workshop-material-scrap.service";

/**
 * Stable, controller-facing facade for the workshop-material module. Each
 * orderType (PICK / RETURN / SCRAP) has its own dedicated service; this class
 * only delegates so the public API and module wiring stay backward-compatible
 * after the split.
 */
@Injectable()
export class WorkshopMaterialService {
  constructor(
    private readonly pickService: WorkshopMaterialPickService,
    private readonly returnService: WorkshopMaterialReturnService,
    private readonly scrapService: WorkshopMaterialScrapService,
  ) {}

  // ─── PICK ─────────────────────────────────────────────────────────────────

  async listPickOrders(query: QueryWorkshopMaterialOrderDto) {
    return this.pickService.listPickOrders(query);
  }

  async getPickOrderById(id: number) {
    return this.pickService.getPickOrderById(id);
  }

  async createPickOrder(
    dto: CreateWorkshopMaterialOrderDto,
    createdBy?: string,
  ) {
    return this.pickService.createPickOrder(dto, createdBy);
  }

  async updatePickOrder(
    id: number,
    dto: UpdateWorkshopMaterialOrderDto,
    updatedBy?: string,
  ) {
    return this.pickService.updatePickOrder(id, dto, updatedBy);
  }

  async voidPickOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.pickService.voidPickOrder(id, voidReason, voidedBy);
  }

  // ─── RETURN ───────────────────────────────────────────────────────────────

  async listReturnOrders(query: QueryWorkshopMaterialOrderDto) {
    return this.returnService.listReturnOrders(query);
  }

  async getReturnOrderById(id: number) {
    return this.returnService.getReturnOrderById(id);
  }

  async createReturnOrder(
    dto: CreateWorkshopMaterialOrderDto,
    createdBy?: string,
  ) {
    return this.returnService.createReturnOrder(dto, createdBy);
  }

  async updateReturnOrder(
    id: number,
    dto: UpdateWorkshopMaterialOrderDto,
    updatedBy?: string,
  ) {
    return this.returnService.updateReturnOrder(id, dto, updatedBy);
  }

  async voidReturnOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.returnService.voidReturnOrder(id, voidReason, voidedBy);
  }

  // ─── SCRAP ────────────────────────────────────────────────────────────────

  async listScrapOrders(
    query: QueryWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
  ) {
    return this.scrapService.listScrapOrders(query);
  }

  async getScrapOrderById(id: number) {
    return this.scrapService.getScrapOrderById(id);
  }

  async createScrapOrder(
    dto: CreateWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
    createdBy?: string,
  ) {
    return this.scrapService.createScrapOrder(dto, createdBy);
  }

  async updateScrapOrder(
    id: number,
    dto: UpdateWorkshopMaterialOrderDto & { stockScope?: StockScopeCode },
    updatedBy?: string,
  ) {
    return this.scrapService.updateScrapOrder(id, dto, updatedBy);
  }

  async voidScrapOrder(id: number, voidReason?: string, voidedBy?: string) {
    return this.scrapService.voidScrapOrder(id, voidReason, voidedBy);
  }
}
