import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SessionService } from "../../session/application/session.service";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

type CsvExportColumn = { header: string; value: (row: Record<string, unknown>) => unknown };
type CsvExportResult = { fileName: string; content: string; contentType: string };

@Injectable()
export class SystemUserService {
  constructor(
    private readonly rbacRepository: InMemoryRbacRepository,
    private readonly sessionService: SessionService,
  ) {}

  listUsers(query: Record<string, string | undefined>) { return this.rbacRepository.listUsers(query); }

  exportUsers(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport("system-users", this.extractRows(this.listUsers(this.withoutPagination(query))), [
      { header: "用户编号", value: (row) => row.userId }, { header: "用户名称", value: (row) => row.userName },
      { header: "用户昵称", value: (row) => row.nickName },
      { header: "部门", value: (row) => this.pickNestedValue(row, "dept", "deptName") },
      { header: "手机号码", value: (row) => row.phonenumber }, { header: "邮箱", value: (row) => row.email },
      { header: "状态", value: (row) => row.status }, { header: "创建时间", value: (row) => row.createdAt },
    ]);
  }

  getUser(userId: number | null) { return this.rbacRepository.getUserForm(userId); }

  async createUser(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createUser(data)); }

  async updateUser(data: Record<string, unknown>) {
    const userId = this.requireNumber(data.userId);
    const result = await this.wrapPersistentMutation(() => this.rbacRepository.updateUser(data));
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return result;
  }

  async deleteUsers(userIds: number[]) {
    await this.wrapPersistentMutation(() => this.rbacRepository.deleteUsers(userIds));
    await this.sessionService.invalidateSessionsByUserIds(userIds);
    return { msg: "删除成功" };
  }

  async resetUserPassword(userId: number, password: string) {
    await this.wrapPersistentMutation(() => this.rbacRepository.resetUserPassword(userId, password));
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "密码重置成功" };
  }

  async changeUserStatus(userId: number, status: "0" | "1") {
    await this.wrapPersistentMutation(() => this.rbacRepository.changeUserStatus(userId, status));
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "状态更新成功" };
  }

  getCurrentUserProfile(userId: number) { return this.wrapQuery(() => this.rbacRepository.getCurrentUserProfile(userId)); }

  updateCurrentUserProfile(userId: number, data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() => this.rbacRepository.updateCurrentUserProfile(userId, {
      nickName: String(data.nickName ?? ""), phonenumber: String(data.phonenumber ?? ""),
      email: String(data.email ?? ""), sex: (data.sex as "0" | "1" | "2" | undefined) ?? "2",
    }));
  }

  async updateCurrentUserPassword(userId: number, oldPassword: string, newPassword: string) {
    await this.wrapPersistentMutation(() => this.rbacRepository.updateCurrentUserPassword(userId, oldPassword, newPassword));
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "密码修改成功" };
  }

  getAuthRole(userId: number) { return this.wrapQuery(() => this.rbacRepository.getAuthRole(userId)); }

  async updateAuthRole(data: Record<string, string | undefined>) {
    const userId = this.requireNumber(data.userId);
    const roleIds = this.toIdList(data.roleIds);
    await this.wrapPersistentMutation(() => this.rbacRepository.updateUserRoles(userId, roleIds));
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "授权成功" };
  }

  private wrapQuery<T>(action: () => T): T { try { return action(); } catch (error) { throw this.toHttpException(error); } }
  private async wrapPersistentMutation<T>(action: () => T): Promise<T> { const result = this.wrapQuery(action); await this.rbacRepository.flushPersistence(); return result; }
  private toHttpException(error: unknown) { const message = error instanceof Error && error.message ? error.message : "系统管理操作失败"; if (message.includes("不存在")) { return new NotFoundException(message); } return new BadRequestException(message); }
  private requireNumber(value: unknown) { const result = Number(value); if (!Number.isFinite(result)) { throw new BadRequestException("缺少必要的数字参数"); } return result; }
  private toIdList(value: unknown) { if (!value) return []; return String(value).split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item)); }
  private withoutPagination(query: Record<string, string | undefined>) { return { ...query, pageNum: undefined, pageSize: undefined }; }
  private extractRows(result: unknown): Record<string, unknown>[] { if (!result || typeof result !== "object") return []; const rows = (result as { rows?: unknown }).rows; if (Array.isArray(rows)) return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"); const data = (result as { data?: unknown }).data; if (Array.isArray(data)) return data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"); return []; }
  private buildCsvExport(fileBaseName: string, rows: Record<string, unknown>[], columns: CsvExportColumn[]): CsvExportResult { const csvLines = [columns.map((c) => this.escapeCsvValue(c.header)).join(","), ...rows.map((row) => columns.map((c) => this.escapeCsvValue(c.value(row))).join(","))]; return { fileName: `${fileBaseName}-${new Date().toISOString().slice(0, 10)}.csv`, content: `﻿${csvLines.join("\n")}`, contentType: "text/csv; charset=utf-8" }; }
  private escapeCsvValue(value: unknown): string { const s = value === null || typeof value === "undefined" ? "" : String(value); const e = s.replace(/"/g, '""'); return /[",\n]/.test(e) ? `"${e}"` : e; }
  private pickNestedValue(row: Record<string, unknown>, parentKey: string, childKey: string) { const parent = row[parentKey]; if (!parent || typeof parent !== "object") return ""; return (parent as Record<string, unknown>)[childKey] ?? ""; }
}
