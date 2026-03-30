export interface SessionDepartmentSnapshot {
  departmentId: number;
  departmentName: string;
}

export type SessionConsoleMode = "default" | "rd-subwarehouse";
export type StockScopeCode = "MAIN" | "RD_SUB";

export interface SessionWorkshopScopeSnapshot {
  mode: "ALL" | "FIXED";
  workshopId: number | null;
  workshopCode: string | null;
  workshopName: string | null;
}

export interface SessionStockScopeSnapshot {
  mode: "ALL" | "FIXED";
  stockScope: StockScopeCode | null;
  workshopId: number | null;
  workshopCode: string | null;
  workshopName: string | null;
}

export interface ResolvedStockScopeContext {
  stockScope: StockScopeCode;
  workshopId: number;
  workshopCode: string;
  workshopName: string;
}

const STOCK_SCOPE_BY_WORKSHOP_CODE: Record<string, StockScopeCode> = {
  MAIN: "MAIN",
  RD: "RD_SUB",
  RD_SUB: "RD_SUB",
};

const STOCK_SCOPE_BY_WORKSHOP_NAME: Record<string, StockScopeCode> = {
  主仓: "MAIN",
  研发小仓: "RD_SUB",
};

export function createAllSessionWorkshopScope(): SessionWorkshopScopeSnapshot {
  return {
    mode: "ALL",
    workshopId: null,
    workshopCode: null,
    workshopName: null,
  };
}

export function createAllSessionStockScope(): SessionStockScopeSnapshot {
  return {
    mode: "ALL",
    stockScope: null,
    workshopId: null,
    workshopCode: null,
    workshopName: null,
  };
}

export function resolveStockScopeFromWorkshopIdentity(params: {
  workshopCode?: string | null;
  workshopName?: string | null;
}): StockScopeCode | null {
  if (params.workshopCode) {
    return STOCK_SCOPE_BY_WORKSHOP_CODE[params.workshopCode] ?? null;
  }

  if (params.workshopName) {
    return STOCK_SCOPE_BY_WORKSHOP_NAME[params.workshopName] ?? null;
  }

  return null;
}

export function resolveWorkshopCodeFromStockScope(
  stockScope: StockScopeCode,
): string {
  return stockScope === "RD_SUB" ? "RD" : "MAIN";
}

export function toSessionStockScopeSnapshotFromWorkshopScope(
  scope: SessionWorkshopScopeSnapshot | null | undefined,
): SessionStockScopeSnapshot {
  if (!scope || scope.mode !== "FIXED") {
    return createAllSessionStockScope();
  }

  return {
    mode: "FIXED",
    stockScope: resolveStockScopeFromWorkshopIdentity({
      workshopCode: scope.workshopCode,
      workshopName: scope.workshopName,
    }),
    workshopId: scope.workshopId,
    workshopCode: scope.workshopCode,
    workshopName: scope.workshopName,
  };
}

export function toSessionWorkshopScopeSnapshotFromStockScope(
  scope: SessionStockScopeSnapshot | null | undefined,
): SessionWorkshopScopeSnapshot {
  if (!scope || scope.mode !== "FIXED") {
    return createAllSessionWorkshopScope();
  }

  return {
    mode: "FIXED",
    workshopId: scope.workshopId,
    workshopCode:
      scope.workshopCode ??
      (scope.stockScope
        ? resolveWorkshopCodeFromStockScope(scope.stockScope)
        : null),
    workshopName: scope.workshopName,
  };
}

export interface SessionUserSnapshot {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  roles: string[];
  permissions: string[];
  department: SessionDepartmentSnapshot | null;
  consoleMode: SessionConsoleMode;
  stockScope?: SessionStockScopeSnapshot;
  workshopScope: SessionWorkshopScopeSnapshot;
}

export interface SessionClaims {
  sub: string;
  sid: string;
  username: string;
}

export interface UserSession {
  version: number;
  sessionId: string;
  user: SessionUserSnapshot;
  loginTime: string;
  lastActiveAt: string;
  expiresAt: string;
  maxExpiresAt: string;
  ip: string;
  device: string;
}

export interface CreateSessionInput {
  user: SessionUserSnapshot;
  ip?: string;
  device?: string;
}
