import type {
  SessionConsoleMode,
  SessionStockScopeSnapshot,
  SessionUserSnapshot,
  SessionWorkshopScopeSnapshot,
} from "../../session/domain/user-session";

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

export interface ManagedDeptRecord {
  deptId: number;
  parentId: number;
  ancestors: string;
  deptName: string;
  orderNum: number;
  leader: string;
  phone: string;
  email: string;
  status: "0" | "1";
  createTime: string;
}

export interface ManagedPostRecord {
  postId: number;
  postCode: string;
  postName: string;
  postSort: number;
  status: "0" | "1";
  remark: string;
  createTime: string;
}

export interface ManagedMenuRecord {
  menuId: number;
  parentId: number;
  menuName: string;
  orderNum: number;
  path: string;
  component: string;
  routeName: string;
  menuType: "M" | "C" | "F";
  visible: "0" | "1";
  status: "0" | "1";
  perms: string;
  icon: string;
  query: string;
  isFrame: "0" | "1";
  isCache: "0" | "1";
}

export interface ManagedRoleRecord {
  roleId: number;
  roleName: string;
  roleKey: string;
  roleSort: number;
  status: "0" | "1";
  dataScope: string;
  menuCheckStrictly: boolean;
  deptCheckStrictly: boolean;
  menuIds: number[];
  deptIds: number[];
  remark: string;
  createTime: string;
}

export interface ManagedUserRecord {
  userId: number;
  deptId: number | null;
  userName: string;
  nickName: string;
  avatarUrl: string | null;
  email: string;
  phonenumber: string;
  sex: "0" | "1" | "2";
  status: "0" | "1";
  deleted: boolean;
  remark: string;
  createTime: string;
  postIds: number[];
  roleIds: number[];
  passwordHash: string;
  consoleMode: SessionConsoleMode;
  stockScope: SessionStockScopeSnapshot;
  workshopScope: SessionWorkshopScopeSnapshot;
  extraPermissions: string[];
}

export interface ManagedDictTypeRecord {
  dictId: number;
  dictName: string;
  dictType: string;
  status: "0" | "1";
  remark: string;
  createTime: string;
}

export interface ManagedDictDataRecord {
  dictCode: number;
  dictSort: number;
  dictLabel: string;
  dictValue: string;
  dictType: string;
  cssClass: string;
  listClass: string;
  isDefault: "Y" | "N";
  status: "0" | "1";
  remark: string;
  createTime: string;
}

export interface ManagedConfigRecord {
  configId: number;
  configName: string;
  configKey: string;
  configValue: string;
  configType: "Y" | "N";
  remark: string;
  createTime: string;
}

export interface ManagedNoticeRecord {
  noticeId: number;
  noticeTitle: string;
  noticeType: "1" | "2";
  noticeContent: string;
  status: "0" | "1";
  remark: string;
  createTime: string;
}
