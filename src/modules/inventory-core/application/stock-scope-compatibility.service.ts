import { BadRequestException, Injectable } from "@nestjs/common";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  type ResolvedStockScopeContext,
  resolveStockScopeFromWorkshopIdentity,
  resolveWorkshopCodeFromStockScope,
  type StockScopeCode,
} from "../../session/domain/user-session";

@Injectable()
export class StockScopeCompatibilityService {
  constructor(private readonly masterDataService: MasterDataService) {}

  async resolveRequired(params: {
    stockScope?: StockScopeCode | null;
    workshopId?: number | null;
  }): Promise<ResolvedStockScopeContext> {
    const scope = await this.resolveOptional(params);
    if (!scope) {
      throw new BadRequestException("缺少库存范围");
    }
    return scope;
  }

  async resolveOptional(params: {
    stockScope?: StockScopeCode | null;
    workshopId?: number | null;
  }): Promise<ResolvedStockScopeContext | null> {
    if (params.stockScope && params.workshopId) {
      const [resolvedByScope, resolvedByWorkshop] = await Promise.all([
        this.resolveByStockScope(params.stockScope),
        this.resolveByWorkshopId(params.workshopId),
      ]);
      if (resolvedByScope.stockScope !== resolvedByWorkshop.stockScope) {
        throw new BadRequestException("库存范围与兼容车间口径不一致");
      }
      return resolvedByScope;
    }

    if (params.stockScope) {
      return this.resolveByStockScope(params.stockScope);
    }

    if (params.workshopId) {
      return this.resolveByWorkshopId(params.workshopId);
    }

    return null;
  }

  async listRealStockWorkshopIds(): Promise<number[]> {
    const scopes = await Promise.all([
      this.resolveByStockScope("MAIN"),
      this.resolveByStockScope("RD_SUB"),
    ]);

    return scopes.map((scope) => scope.workshopId);
  }

  async resolveByStockScope(
    stockScope: StockScopeCode,
  ): Promise<ResolvedStockScopeContext> {
    const workshop = await this.masterDataService.getWorkshopByCode(
      resolveWorkshopCodeFromStockScope(stockScope),
    );
    return this.toResolvedInventoryScope(workshop);
  }

  async resolveByWorkshopId(
    workshopId: number,
  ): Promise<ResolvedStockScopeContext> {
    const workshop = await this.masterDataService.getWorkshopById(workshopId);
    return this.toResolvedInventoryScope(workshop);
  }

  toResolvedInventoryScope(workshop: {
    id: number;
    workshopCode: string;
    workshopName: string;
  }): ResolvedStockScopeContext {
    const stockScope = resolveStockScopeFromWorkshopIdentity({
      workshopCode: workshop.workshopCode,
      workshopName: workshop.workshopName,
    });
    if (!stockScope) {
      throw new BadRequestException("真实库存范围只允许主仓或研发小仓");
    }

    return {
      stockScope,
      workshopId: workshop.id,
      workshopCode: workshop.workshopCode,
      workshopName: workshop.workshopName,
    };
  }
}
