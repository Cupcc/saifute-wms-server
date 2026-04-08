import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MasterDataService } from "../../master-data/application/master-data.service";
import {
  createAllSessionStockScope,
  createAllSessionWorkshopScope,
  type ResolvedStockScopeContext,
  type SessionUserSnapshot,
  type SessionWorkshopScopeSnapshot,
} from "../../session/domain/user-session";

@Injectable()
export class WorkshopScopeService {
  constructor(private readonly masterDataService: MasterDataService) {}

  async getResolvedStockScope(
    user?: SessionUserSnapshot | null,
  ): Promise<ResolvedStockScopeContext | null> {
    const scope = user?.stockScope ?? createAllSessionStockScope();
    if (scope.mode !== "FIXED" || !scope.stockScope) {
      return null;
    }

    try {
      const stockScopeRecord = await this.masterDataService.getStockScopeByCode(
        scope.stockScope,
      );
      return {
        stockScopeId: stockScopeRecord.id,
        stockScope: scope.stockScope,
        stockScopeName: stockScopeRecord.scopeName,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException("当前用户绑定的库存范围不存在");
      }
      throw error;
    }
  }

  async getResolvedScope(
    user?: SessionUserSnapshot | null,
  ): Promise<SessionWorkshopScopeSnapshot | null> {
    const scope = user?.workshopScope ?? createAllSessionWorkshopScope();
    if (scope.mode !== "FIXED") {
      return null;
    }

    if (scope.workshopId && scope.workshopName) {
      return scope;
    }

    try {
      if (scope.workshopId) {
        const workshop = await this.masterDataService.getWorkshopById(
          scope.workshopId,
        );
        return {
          mode: "FIXED",
          workshopId: workshop.id,
          workshopName: workshop.workshopName,
        };
      }

      if (scope.workshopName) {
        const workshop = await this.masterDataService.getWorkshopByName(
          scope.workshopName,
        );
        return {
          mode: "FIXED",
          workshopId: workshop.id,
          workshopName: workshop.workshopName,
        };
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException("当前用户绑定的车间不存在");
      }
      throw error;
    }

    throw new BadRequestException("当前用户未绑定车间");
  }

  async resolveInventoryQueryScope(
    user: SessionUserSnapshot | undefined,
    _requestedWorkshopId?: number,
  ): Promise<ResolvedStockScopeContext | null> {
    return this.getResolvedStockScope(user);
  }

  async resolveInventoryQueryWorkshopId(
    user: SessionUserSnapshot | undefined,
    requestedWorkshopId?: number,
  ): Promise<number | undefined> {
    const scope = await this.getResolvedScope(user);
    if (!scope) {
      return requestedWorkshopId;
    }

    if (requestedWorkshopId && requestedWorkshopId !== scope.workshopId) {
      throw new ForbiddenException("当前用户只能访问绑定车间数据");
    }

    return scope.workshopId ?? undefined;
  }

  async resolveQueryWorkshopId(
    user: SessionUserSnapshot | undefined,
    requestedWorkshopId?: number,
  ): Promise<number | undefined> {
    return this.resolveInventoryQueryWorkshopId(user, requestedWorkshopId);
  }

  async applyFixedWorkshopScope<T extends { workshopId?: number }>(
    user: SessionUserSnapshot | undefined,
    payload: T,
  ): Promise<T> {
    const scope = await this.getResolvedScope(user);
    if (!scope) {
      return payload;
    }

    if (payload.workshopId && payload.workshopId !== scope.workshopId) {
      throw new ForbiddenException("当前用户只能操作绑定车间单据");
    }

    return {
      ...payload,
      workshopId: scope.workshopId ?? undefined,
    };
  }

  async assertWorkshopAccess(
    user: SessionUserSnapshot | undefined,
    workshopId: number | null | undefined,
  ): Promise<void> {
    if (!workshopId) {
      return;
    }

    const scope = await this.getResolvedScope(user);
    if (!scope) {
      return;
    }

    if (scope.workshopId !== workshopId) {
      throw new ForbiddenException("当前用户只能访问绑定车间数据");
    }
  }

  async assertInventoryWorkshopAccess(
    user: SessionUserSnapshot | undefined,
    workshopId: number | null | undefined,
  ): Promise<void> {
    return this.assertWorkshopAccess(user, workshopId);
  }

  async assertInventoryStockScopeAccess(
    user: SessionUserSnapshot | undefined,
    stockScopeId: number | null | undefined,
  ): Promise<void> {
    if (!stockScopeId) {
      return;
    }

    const fixedScope = await this.getResolvedStockScope(user);
    if (!fixedScope) {
      return;
    }

    if (fixedScope.stockScopeId !== stockScopeId) {
      throw new ForbiddenException("当前用户只能访问绑定库存范围数据");
    }
  }

  async getVisibleWorkshops(user: SessionUserSnapshot | undefined): Promise<{
    items: Array<{
      id: number;
      workshopName: string;
    }>;
    total: number;
  } | null> {
    const scope = await this.getResolvedScope(user);
    if (!scope || !scope.workshopId || !scope.workshopName) {
      return null;
    }

    return {
      items: [
        {
          id: scope.workshopId,
          workshopName: scope.workshopName,
        },
      ],
      total: 1,
    };
  }
}
