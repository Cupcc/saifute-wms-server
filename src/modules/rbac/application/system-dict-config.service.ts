import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

type CsvExportColumn = { header: string; value: (row: Record<string, unknown>) => unknown };
type CsvExportResult = { fileName: string; content: string; contentType: string };

@Injectable()
export class SystemDictConfigService {
  constructor(private readonly rbacRepository: InMemoryRbacRepository) {}

  listDictTypes(query: Record<string, string | undefined>) { return this.rbacRepository.listDictTypes(query); }
  exportDictTypes(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport("system-dict-types", this.extractRows(this.listDictTypes(this.withoutPagination(query))), [
      { header: "字典编号", value: (row) => row.dictId }, { header: "字典名称", value: (row) => row.dictName },
      { header: "字典类型", value: (row) => row.dictType }, { header: "状态", value: (row) => row.status },
      { header: "备注", value: (row) => row.remark }, { header: "创建时间", value: (row) => row.createdAt },
    ]);
  }
  getDictType(dictId: number) { return { data: this.wrapQuery(() => this.rbacRepository.getDictType(dictId)) }; }
  async createDictType(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createDictType(data)); }
  async updateDictType(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.updateDictType(data)); }
  async deleteDictTypes(dictIds: number[]) { return this.wrapPersistentMutation(() => { this.rbacRepository.deleteDictTypes(dictIds); return { msg: "删除成功" }; }); }
  refreshDictCache() { return { msg: "刷新成功" }; }
  listDictTypeOptions() { return { data: this.rbacRepository.listDictTypeOptions() }; }

  listDictData(query: Record<string, string | undefined>) { return this.rbacRepository.listDictData(query); }
  exportDictData(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport("system-dict-data", this.extractRows(this.listDictData(this.withoutPagination(query))), [
      { header: "字典编码", value: (row) => row.dictCode }, { header: "字典标签", value: (row) => row.dictLabel },
      { header: "字典键值", value: (row) => row.dictValue }, { header: "字典类型", value: (row) => row.dictType },
      { header: "排序", value: (row) => row.dictSort }, { header: "默认", value: (row) => row.isDefault },
      { header: "状态", value: (row) => row.status }, { header: "备注", value: (row) => row.remark },
      { header: "创建时间", value: (row) => row.createdAt },
    ]);
  }
  getDictData(dictCode: number) { return { data: this.wrapQuery(() => this.rbacRepository.getDictData(dictCode)) }; }
  getDicts(dictType: string) { return { data: this.wrapQuery(() => this.rbacRepository.getDictDataByType(dictType)) }; }
  async createDictData(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createDictData(data)); }
  async updateDictData(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.updateDictData(data)); }
  async deleteDictData(dictCodes: number[]) { return this.wrapPersistentMutation(() => { this.rbacRepository.deleteDictData(dictCodes); return { msg: "删除成功" }; }); }

  listConfigs(query: Record<string, string | undefined>) { return this.rbacRepository.listConfigs(query); }
  exportConfigs(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport("system-configs", this.extractRows(this.listConfigs(this.withoutPagination(query))), [
      { header: "参数主键", value: (row) => row.configId }, { header: "参数名称", value: (row) => row.configName },
      { header: "参数键名", value: (row) => row.configKey }, { header: "参数键值", value: (row) => row.configValue },
      { header: "系统内置", value: (row) => row.configType }, { header: "备注", value: (row) => row.remark },
      { header: "创建时间", value: (row) => row.createdAt },
    ]);
  }
  getConfig(configId: number) { return { data: this.wrapQuery(() => this.rbacRepository.getConfig(configId)) }; }
  getConfigByKey(configKey: string) { const config = this.wrapQuery(() => this.rbacRepository.getConfigByKey(configKey)); return { msg: config?.configValue ?? "" }; }
  async createConfig(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createConfig(data)); }
  async updateConfig(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.updateConfig(data)); }
  async deleteConfigs(configIds: number[]) { return this.wrapPersistentMutation(() => { this.rbacRepository.deleteConfigs(configIds); return { msg: "删除成功" }; }); }
  refreshConfigCache() { return { msg: "刷新成功" }; }

  listNotices(query: Record<string, string | undefined>) { return this.rbacRepository.listNotices(query); }
  getNotice(noticeId: number) { return { data: this.wrapQuery(() => this.rbacRepository.getNotice(noticeId)) }; }
  async createNotice(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.createNotice(data)); }
  async updateNotice(data: Record<string, unknown>) { return this.wrapPersistentMutation(() => this.rbacRepository.updateNotice(data)); }
  async deleteNotices(noticeIds: number[]) { return this.wrapPersistentMutation(() => { this.rbacRepository.deleteNotices(noticeIds); return { msg: "删除成功" }; }); }

  private wrapQuery<T>(action: () => T): T { try { return action(); } catch (error) { throw this.toHttpException(error); } }
  private async wrapPersistentMutation<T>(action: () => T): Promise<T> { const result = this.wrapQuery(action); await this.rbacRepository.flushPersistence(); return result; }
  private toHttpException(error: unknown) { const msg = error instanceof Error && error.message ? error.message : "系统管理操作失败"; if (msg.includes("不存在")) return new NotFoundException(msg); return new BadRequestException(msg); }
  private withoutPagination(query: Record<string, string | undefined>) { return { ...query, pageNum: undefined, pageSize: undefined }; }
  private extractRows(result: unknown): Record<string, unknown>[] { if (!result || typeof result !== "object") return []; const rows = (result as { rows?: unknown }).rows; if (Array.isArray(rows)) return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"); return []; }
  private buildCsvExport(fileBaseName: string, rows: Record<string, unknown>[], columns: CsvExportColumn[]): CsvExportResult { const csvLines = [columns.map((c) => this.escapeCsvValue(c.header)).join(","), ...rows.map((row) => columns.map((c) => this.escapeCsvValue(c.value(row))).join(","))]; return { fileName: `${fileBaseName}-${new Date().toISOString().slice(0, 10)}.csv`, content: `﻿${csvLines.join("\n")}`, contentType: "text/csv; charset=utf-8" }; }
  private escapeCsvValue(value: unknown): string { const s = value === null || typeof value === "undefined" ? "" : String(value); const e = s.replace(/"/g, '""'); return /[",\n]/.test(e) ? `"${e}"` : e; }
}
