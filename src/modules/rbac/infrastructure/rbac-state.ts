import { Injectable } from "@nestjs/common";
import { createSystemManagementSeedState } from "../../../../prisma/system-management.seed";
import type {
  ManagedConfigRecord,
  ManagedDeptRecord,
  ManagedDictDataRecord,
  ManagedDictTypeRecord,
  ManagedMenuRecord,
  ManagedNoticeRecord,
  ManagedPostRecord,
  ManagedRoleRecord,
  ManagedUserRecord,
} from "../domain/rbac.types";

@Injectable()
export class RbacState {
  depts: ManagedDeptRecord[];
  posts: ManagedPostRecord[];
  menus: ManagedMenuRecord[];
  roles: ManagedRoleRecord[];
  dictTypes: ManagedDictTypeRecord[];
  dictData: ManagedDictDataRecord[];
  configs: ManagedConfigRecord[];
  notices: ManagedNoticeRecord[];
  users: ManagedUserRecord[];

  constructor() {
    const seedState = createSystemManagementSeedState();
    this.depts = seedState.depts;
    this.posts = seedState.posts;
    this.menus = seedState.menus;
    this.roles = seedState.roles;
    this.dictTypes = seedState.dictTypes;
    this.dictData = seedState.dictData;
    this.configs = seedState.configs;
    this.notices = seedState.notices;
    this.users = seedState.users;
  }

  getDeptAndDescendants(deptId: number) {
    return this.depts
      .filter(
        (dept) =>
          dept.deptId === deptId ||
          dept.ancestors.split(",").map(Number).includes(deptId),
      )
      .map((dept) => dept.deptId);
  }

  paginate<T>(rows: T[], query: Record<string, string | undefined>) {
    const pageNum = this.toNumber(query.pageNum) ?? 1;
    const pageSize = this.toNumber(query.pageSize) ?? (rows.length || 1);
    const start = (pageNum - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      total: rows.length,
    };
  }

  toNumber(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  requireNumber(value: unknown) {
    const result = this.toNumber(value);
    if (result === null) {
      throw new Error("缺少必要的数字参数");
    }
    return result;
  }

  normalizeNumberList(value: unknown) {
    if (Array.isArray(value)) {
      return [...new Set(value.map((item) => this.requireNumber(item)))];
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => this.requireNumber(item))
        .filter((item, index, list) => list.indexOf(item) === index);
    }
    return [];
  }

  normalizeStatus(value: unknown): "0" | "1" {
    return String(value ?? "0") === "1" ? "1" : "0";
  }

  normalizeSex(value: unknown): "0" | "1" | "2" {
    const sex = String(value ?? "2");
    return sex === "0" || sex === "1" ? sex : "2";
  }

  normalizeDataScope(value: unknown) {
    const scope = String(value ?? "1");
    return ["1", "2", "3", "4", "5"].includes(scope) ? scope : "1";
  }

  normalizeMenuType(value: unknown): "M" | "C" | "F" {
    const menuType = String(value ?? "M");
    return menuType === "C" || menuType === "F" ? menuType : "M";
  }

  normalizeNoticeType(value: unknown): "1" | "2" {
    return String(value ?? "1") === "2" ? "2" : "1";
  }

  normalizeYesNoFlag(value: unknown, fallback: "0" | "1"): "0" | "1";
  normalizeYesNoFlag(value: unknown, fallback: "Y" | "N"): "Y" | "N";
  normalizeYesNoFlag(value: unknown, fallback: "0" | "1" | "Y" | "N") {
    const normalized = String(value ?? fallback);
    if (
      (fallback === "0" || fallback === "1") &&
      (normalized === "0" || normalized === "1")
    ) {
      return normalized;
    }
    if (
      (fallback === "Y" || fallback === "N") &&
      (normalized === "Y" || normalized === "N")
    ) {
      return normalized;
    }
    return fallback;
  }

  nextId<T extends Record<TKey, number>, TKey extends keyof T>(
    rows: T[],
    key: TKey,
  ) {
    return rows.reduce((max, row) => Math.max(max, row[key]), 0) + 1;
  }

  toTreeSelect<
    T extends object,
    TIdKey extends keyof T,
    TParentKey extends keyof T,
    TLabelKey extends keyof T,
  >(
    rows: T[],
    idKey: TIdKey,
    parentKey: TParentKey,
    labelKey: TLabelKey,
    options?: {
      disabledKey?: keyof T;
      disabledValue?: string;
    },
  ) {
    const idToNode = new Map<
      number,
      {
        id: number;
        label: string;
        children: Array<{ id: number; label: string; children?: unknown[] }>;
        disabled?: boolean;
      }
    >();

    rows.forEach((row) => {
      const id = Number(row[idKey] as number | string);
      const disabled =
        options?.disabledKey &&
        String(row[options.disabledKey] as string | number | boolean) ===
          options.disabledValue;
      idToNode.set(id, {
        id,
        label: String(row[labelKey] as string | number),
        children: [],
        ...(disabled ? { disabled: true } : {}),
      });
    });

    const roots: Array<{
      id: number;
      label: string;
      children?: unknown[];
      disabled?: boolean;
    }> = [];

    rows.forEach((row) => {
      const id = Number(row[idKey] as number | string);
      const parentId = Number(row[parentKey] as number | string);
      const node = idToNode.get(id);
      if (!node) {
        return;
      }

      if (!parentId || !idToNode.has(parentId)) {
        roots.push(node);
        return;
      }

      idToNode.get(parentId)?.children.push(node);
    });

    return roots;
  }
}
