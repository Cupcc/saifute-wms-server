export interface SessionDepartmentSnapshot {
  departmentId: number;
  departmentName: string;
}

export type SessionConsoleMode = "default" | "rd-subwarehouse";
export type StockScopeCode = "MAIN" | "RD_SUB";

export interface SessionWorkshopScopeSnapshot {
  mode: "ALL" | "FIXED";
  workshopId: number | null;
  workshopName: string | null;
}

export interface SessionStockScopeSnapshot {
  mode: "ALL" | "FIXED";
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
}

export interface ResolvedStockScopeContext {
  stockScopeId: number;
  stockScope: StockScopeCode;
  stockScopeName: string;
}

const STOCK_SCOPE_BY_WORKSHOP_NAME: Record<string, StockScopeCode> = {
  主仓: "MAIN",
  研发小仓: "RD_SUB",
};

export function createAllSessionWorkshopScope(): SessionWorkshopScopeSnapshot {
  return {
    mode: "ALL",
    workshopId: null,
    workshopName: null,
  };
}

export function createAllSessionStockScope(): SessionStockScopeSnapshot {
  return {
    mode: "ALL",
    stockScope: null,
    stockScopeName: null,
  };
}

export function resolveStockScopeFromWorkshopIdentity(params: {
  workshopName?: string | null;
}): StockScopeCode | null {
  if (params.workshopName) {
    return STOCK_SCOPE_BY_WORKSHOP_NAME[params.workshopName] ?? null;
  }

  return null;
}

export function toSessionStockScopeSnapshotFromWorkshopScope(
  _scope: SessionWorkshopScopeSnapshot | null | undefined,
): SessionStockScopeSnapshot {
  return createAllSessionStockScope();
}

export function toSessionWorkshopScopeSnapshotFromStockScope(
  _scope: SessionStockScopeSnapshot | null | undefined,
): SessionWorkshopScopeSnapshot {
  return createAllSessionWorkshopScope();
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
  typ?: "access";
}

export interface RefreshSessionClaims {
  sub: string;
  sid: string;
  username: string;
  typ: "refresh";
  jti: string;
}

export interface UserSession {
  version: number;
  sessionId: string;
  refreshTokenId?: string;
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
