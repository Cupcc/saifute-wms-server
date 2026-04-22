import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SessionService } from "../../session/application/session.service";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

type CsvExportColumn = { header: string; value: (row: Record<string, unknown>) => unknown };
type CsvExportResult = { fileName: string; content: string; contentType: string };

@Injectable()
export class SystemResourceService {
  constructor(
    private readonly rbacRepository: InMemoryRbacRepository,
    private readonly sessionService: SessionService,
  ) {}

  getDeptTreeSelect() { return { data: this.rbacRepository.getDeptTreeSelect() }; }

  listRoles(query: Record<string, string | undefined>) { return this.rbacRepository.listRoles(query); }
  exportRoles(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport("system-roles", this.extractRows(this.listRoles(this.withoutPagination(query))), [
      { header: "角色编号", value: (row) => row.roleId }, { header: "角色名称", value: (row) => row.roleName },
      { header: "角色权限字符", value: (row) => row.roleKey }, { header: "显示顺序", value: (row) => row.roleSort },
      { header: "状态", value: (row) => row.status }, { header: "数据范围", value: (row) => row.dataScope },
      { header: "创建时间", value: (row) => row.createdAt },
    ]);
  }
  getRole(roleId: number) { return { data: this.wrapQuery(() => this.rbacRepository.getRole(roleId)) }; }
  async createRole(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createRole(data)); }
  async updateRole(data: Record<string, unknown>) { const roleId = this.requireNumber(data.roleId); const result = await this.wrapPersistentMutation(() => this.rbacRepository.updateRole(data)); await this.invalidateRoleSessions([roleId]); return result; }
  async updateRoleDataScope(data: Record<string, unknown>) { const roleId = this.requireNumber(data.roleId); await this.wrapPersistentMutation(() => this.rbacRepository.updateRoleDataScope(data)); await this.invalidateRoleSessions([roleId]); return { msg: "数据权限更新成功" }; }
  async changeRoleStatus(roleId: number, status: "0" | "1") { await this.wrapPersistentMutation(() => this.rbacRepository.changeRoleStatus(roleId, status)); await this.invalidateRoleSessions([roleId]); return { msg: "状态更新成功" }; }
  async deleteRoles(roleIds: number[]) { await this.wrapPersistentMutation(() => this.rbacRepository.deleteRoles(roleIds)); await this.invalidateRoleSessions(roleIds); return { msg: "删除成功" }; }
  listAllocatedUsers(query: Record<string, string | undefined>) { return this.rbacRepository.listAllocatedUsers(query); }
  listUnallocatedUsers(query: Record<string, string | undefined>) { return this.rbacRepository.listUnallocatedUsers(query); }
  async cancelAuthUser(data: Record<string, unknown>) { const roleId = this.requireNumber(data.roleId); const userId = this.requireNumber(data.userId); await this.wrapPersistentMutation(() => this.rbacRepository.cancelAuthUsers(roleId, [userId])); await this.sessionService.invalidateSessionsByUserIds([userId]); return { msg: "取消授权成功" }; }
  async cancelAuthUserAll(query: Record<string, string | undefined>) { const roleId = this.requireNumber(query.roleId); const userIds = this.toIdList(query.userIds); await this.wrapPersistentMutation(() => this.rbacRepository.cancelAuthUsers(roleId, userIds)); await this.sessionService.invalidateSessionsByUserIds(userIds); return { msg: "取消授权成功" }; }
  async selectUsersToRole(query: Record<string, string | undefined>) { const roleId = this.requireNumber(query.roleId); const userIds = this.toIdList(query.userIds); await this.wrapPersistentMutation(() => this.rbacRepository.assignUsersToRole(roleId, userIds)); await this.sessionService.invalidateSessionsByUserIds(userIds); return { msg: "授权成功" }; }
  getRoleMenuTree(roleId: number) { return this.wrapQuery(() => this.rbacRepository.getRoleMenuTree(roleId)); }
  getRoleDeptTree(roleId: number) { return this.wrapQuery(() => this.rbacRepository.getDeptTree(roleId)); }

  listMenus(query: Record<string, string | undefined>) { return { data: this.rbacRepository.listMenus(query) }; }
  getMenu(menuId: number) { return { data: this.wrapQuery(() => this.rbacRepository.getMenu(menuId)) }; }
  getMenuTreeSelect() { return { data: this.rbacRepository.getMenuTreeSelect() }; }
  async createMenu(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createMenu(data)); }
  async updateMenu(data: Record<string, unknown>) { const result = await this.wrapPersistentMutation(() => this.rbacRepository.updateMenu(data)); await this.invalidateAllRoleSessions(); return result; }
  async deleteMenus(menuIds: number[]) { await this.wrapPersistentMutation(() => this.rbacRepository.deleteMenus(menuIds)); await this.invalidateAllRoleSessions(); return { msg: "删除成功" }; }

  listDepts(query: Record<string, string | undefined>) { return { data: this.rbacRepository.listDepts(query) }; }
  listDeptExcludeChild(deptId: number) { return { data: this.wrapQuery(() => this.rbacRepository.listDeptExcludeChild(deptId)) }; }
  getDept(deptId: number) { return { data: this.wrapQuery(() => this.rbacRepository.getDept(deptId)) }; }
  async createDept(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createDept(data)); }
  async updateDept(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.updateDept(data)); }
  async deleteDepts(deptIds: number[]) { return this.wrapPersistentMutation(() => { this.rbacRepository.deleteDepts(deptIds); return { msg: "删除成功" }; }); }

  listPosts(query: Record<string, string | undefined>) { return this.rbacRepository.listPosts(query); }
  exportPosts(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport("system-posts", this.extractRows(this.listPosts(this.withoutPagination(query))), [
      { header: "岗位编号", value: (row) => row.postId }, { header: "岗位编码", value: (row) => row.postCode },
      { header: "岗位名称", value: (row) => row.postName }, { header: "岗位排序", value: (row) => row.postSort },
      { header: "状态", value: (row) => row.status }, { header: "备注", value: (row) => row.remark },
      { header: "创建时间", value: (row) => row.createdAt },
    ]);
  }
  getPost(postId: number) { return { data: this.wrapQuery(() => this.rbacRepository.getPost(postId)) }; }
  async createPost(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createPost(data)); }
  async updatePost(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.updatePost(data)); }
  async deletePosts(postIds: number[]) { return this.wrapPersistentMutation(() => { this.rbacRepository.deletePosts(postIds); return { msg: "删除成功" }; }); }

  private async invalidateRoleSessions(roleIds: number[]) { const userIds = this.rbacRepository.findUserIdsByRoleIds(roleIds); if (userIds.length > 0) await this.sessionService.invalidateSessionsByUserIds(userIds); }
  private async invalidateAllRoleSessions() { const userIds = this.rbacRepository.findUserIdsByRoleIds(this.rbacRepository.listRoles({}).rows.map((role) => role.roleId)); if (userIds.length > 0) await this.sessionService.invalidateSessionsByUserIds(userIds); }
  private wrapQuery<T>(action: () => T): T { try { return action(); } catch (error) { throw this.toHttpException(error); } }
  private async wrapPersistentMutation<T>(action: () => T): Promise<T> { const result = this.wrapQuery(action); await this.rbacRepository.flushPersistence(); return result; }
  private toHttpException(error: unknown) { const msg = error instanceof Error && error.message ? error.message : "系统管理操作失败"; if (msg.includes("不存在")) return new NotFoundException(msg); return new BadRequestException(msg); }
  private requireNumber(value: unknown) { const result = Number(value); if (!Number.isFinite(result)) throw new BadRequestException("缺少必要的数字参数"); return result; }
  private toIdList(value: unknown) { if (!value) return []; return String(value).split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item)); }
  private withoutPagination(query: Record<string, string | undefined>) { return { ...query, pageNum: undefined, pageSize: undefined }; }
  private extractRows(result: unknown): Record<string, unknown>[] { if (!result || typeof result !== "object") return []; const rows = (result as { rows?: unknown }).rows; if (Array.isArray(rows)) return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"); return []; }
  private buildCsvExport(fileBaseName: string, rows: Record<string, unknown>[], columns: CsvExportColumn[]): CsvExportResult { const csvLines = [columns.map((c) => this.escapeCsvValue(c.header)).join(","), ...rows.map((row) => columns.map((c) => this.escapeCsvValue(c.value(row))).join(","))]; return { fileName: `${fileBaseName}-${new Date().toISOString().slice(0, 10)}.csv`, content: `﻿${csvLines.join("\n")}`, contentType: "text/csv; charset=utf-8" }; }
  private escapeCsvValue(value: unknown): string { const s = value === null || typeof value === "undefined" ? "" : String(value); const e = s.replace(/"/g, '""'); return /[",\n]/.test(e) ? `"${e}"` : e; }
}
