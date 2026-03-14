export interface SessionDepartmentSnapshot {
  departmentId: number;
  departmentName: string;
}

export interface SessionUserSnapshot {
  userId: number;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  department: SessionDepartmentSnapshot | null;
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
