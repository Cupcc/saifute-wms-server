import { BadRequestException, Injectable } from "@nestjs/common";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  type ResolvedStockScopeContext,
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
    if (!params.stockScope) {
      return null;
    }

    return this.resolveByStockScope(params.stockScope);
  }

  async listRealStockWorkshopIds(): Promise<number[]> {
    return [];
  }

  async listRealStockScopeIds(): Promise<number[]> {
    const scopes = await Promise.all([
      this.resolveByStockScope("MAIN"),
      this.resolveByStockScope("RD_SUB"),
    ]);

    return scopes.map((scope) => scope.stockScopeId);
  }

  async resolveByStockScope(
    stockScope: StockScopeCode,
  ): Promise<ResolvedStockScopeContext> {
    const stockScopeRecord =
      await this.masterDataService.getStockScopeByCode(stockScope);
    return {
      stockScopeId: stockScopeRecord.id,
      stockScope,
      stockScopeName: stockScopeRecord.scopeName,
    };
  }
}
