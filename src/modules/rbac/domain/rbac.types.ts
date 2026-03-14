import type { SessionUserSnapshot } from "../../session/domain/user-session";

export interface RbacUserRecord extends SessionUserSnapshot {
  passwordHash: string;
  status: "active" | "disabled";
  deleted: boolean;
}

export interface RouteNode {
  name: string;
  path: string;
  component: string;
  permissions: string[];
  children?: RouteNode[];
}
