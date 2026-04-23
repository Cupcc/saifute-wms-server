import { Injectable } from "@nestjs/common";
import type {
  ManagedConfigRecord,
  ManagedDictDataRecord,
  ManagedDictTypeRecord,
  ManagedNoticeRecord,
} from "../domain/rbac.types";
import { RbacState } from "./rbac-state";

@Injectable()
export class RbacDictConfigRepository {
  constructor(private readonly state: RbacState) {}

  listDictTypes(query: Record<string, string | undefined>) {
    const rows = this.state.dictTypes
      .filter((item) => {
        if (query.dictName && !item.dictName.includes(query.dictName)) {
          return false;
        }
        if (query.dictType && !item.dictType.includes(query.dictType)) {
          return false;
        }
        if (query.status && item.status !== query.status) {
          return false;
        }
        return true;
      })
      .map((item) => structuredClone(item));
    return this.state.paginate(rows, query);
  }

  getDictType(dictId: number) {
    return structuredClone(this.requireDictType(dictId));
  }

  createDictType(data: Record<string, unknown>) {
    const record: ManagedDictTypeRecord = {
      dictId: this.state.nextId(this.state.dictTypes, "dictId"),
      dictName: String(data.dictName ?? "").trim(),
      dictType: String(data.dictType ?? "").trim(),
      status: this.state.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createdAt: new Date().toISOString(),
    };
    this.state.dictTypes.push(record);
    return structuredClone(record);
  }

  updateDictType(data: Record<string, unknown>) {
    const record = this.requireDictType(this.state.requireNumber(data.dictId));
    const previousType = record.dictType;
    record.dictName = String(data.dictName ?? record.dictName).trim();
    record.dictType = String(data.dictType ?? record.dictType).trim();
    record.status = this.state.normalizeStatus(data.status ?? record.status);
    record.remark = String(data.remark ?? record.remark);
    if (previousType !== record.dictType) {
      this.state.dictData.forEach((item) => {
        if (item.dictType === previousType) {
          item.dictType = record.dictType;
        }
      });
    }
    return structuredClone(record);
  }

  deleteDictTypes(dictIds: number[]) {
    const dictIdSet = new Set(dictIds);
    const dictTypeSet = new Set(
      dictIds.map((dictId) => this.requireDictType(dictId).dictType),
    );

    for (let index = this.state.dictData.length - 1; index >= 0; index -= 1) {
      const current = this.state.dictData[index];
      if (current && dictTypeSet.has(current.dictType)) {
        this.state.dictData.splice(index, 1);
      }
    }

    for (let index = this.state.dictTypes.length - 1; index >= 0; index -= 1) {
      const current = this.state.dictTypes[index];
      if (current && dictIdSet.has(current.dictId)) {
        this.state.dictTypes.splice(index, 1);
      }
    }
  }

  listDictTypeOptions() {
    return this.state.dictTypes
      .filter((item) => item.status === "0")
      .map((item) => structuredClone(item));
  }

  listDictData(query: Record<string, string | undefined>) {
    const rows = this.state.dictData
      .filter((item) => {
        if (query.dictType && item.dictType !== query.dictType) {
          return false;
        }
        if (query.dictLabel && !item.dictLabel.includes(query.dictLabel)) {
          return false;
        }
        if (query.status && item.status !== query.status) {
          return false;
        }
        return true;
      })
      .sort((left, right) => left.dictSort - right.dictSort)
      .map((item) => structuredClone(item));
    return this.state.paginate(rows, query);
  }

  getDictData(dictCode: number) {
    return structuredClone(this.requireDictData(dictCode));
  }

  getDictDataByType(dictType: string) {
    return this.state.dictData
      .filter((item) => item.dictType === dictType && item.status === "0")
      .sort((left, right) => left.dictSort - right.dictSort)
      .map((item) => structuredClone(item));
  }

  createDictData(data: Record<string, unknown>) {
    const record: ManagedDictDataRecord = {
      dictCode: this.state.nextId(this.state.dictData, "dictCode"),
      dictSort: this.state.requireNumber(data.dictSort ?? 0),
      dictLabel: String(data.dictLabel ?? "").trim(),
      dictValue: String(data.dictValue ?? "").trim(),
      dictType: String(data.dictType ?? "").trim(),
      cssClass: String(data.cssClass ?? ""),
      listClass: String(data.listClass ?? ""),
      isDefault: this.state.normalizeYesNoFlag(data.isDefault, "N"),
      status: this.state.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createdAt: new Date().toISOString(),
    };
    this.state.dictData.push(record);
    return structuredClone(record);
  }

  updateDictData(data: Record<string, unknown>) {
    const record = this.requireDictData(this.state.requireNumber(data.dictCode));
    record.dictSort = this.state.requireNumber(data.dictSort ?? record.dictSort);
    record.dictLabel = String(data.dictLabel ?? record.dictLabel).trim();
    record.dictValue = String(data.dictValue ?? record.dictValue).trim();
    record.dictType = String(data.dictType ?? record.dictType).trim();
    record.cssClass = String(data.cssClass ?? record.cssClass);
    record.listClass = String(data.listClass ?? record.listClass);
    record.isDefault = this.state.normalizeYesNoFlag(
      data.isDefault ?? record.isDefault,
      "N",
    );
    record.status = this.state.normalizeStatus(data.status ?? record.status);
    record.remark = String(data.remark ?? record.remark);
    return structuredClone(record);
  }

  deleteDictData(dictCodes: number[]) {
    dictCodes.forEach((dictCode) => {
      const index = this.state.dictData.findIndex(
        (item) => item.dictCode === dictCode,
      );
      if (index >= 0) {
        this.state.dictData.splice(index, 1);
      }
    });
  }

  listConfigs(query: Record<string, string | undefined>) {
    const rows = this.state.configs
      .filter((item) => {
        if (query.configName && !item.configName.includes(query.configName)) {
          return false;
        }
        if (query.configKey && !item.configKey.includes(query.configKey)) {
          return false;
        }
        if (query.configType && item.configType !== query.configType) {
          return false;
        }
        return true;
      })
      .map((item) => structuredClone(item));
    return this.state.paginate(rows, query);
  }

  getConfig(configId: number) {
    return structuredClone(this.requireConfig(configId));
  }

  getConfigByKey(configKey: string) {
    return structuredClone(
      this.state.configs.find((item) => item.configKey === configKey) ?? null,
    );
  }

  createConfig(data: Record<string, unknown>) {
    const record: ManagedConfigRecord = {
      configId: this.state.nextId(this.state.configs, "configId"),
      configName: String(data.configName ?? "").trim(),
      configKey: String(data.configKey ?? "").trim(),
      configValue: String(data.configValue ?? ""),
      configType: this.state.normalizeYesNoFlag(data.configType, "N"),
      remark: String(data.remark ?? ""),
      createdAt: new Date().toISOString(),
    };
    this.state.configs.push(record);
    return structuredClone(record);
  }

  updateConfig(data: Record<string, unknown>) {
    const record = this.requireConfig(this.state.requireNumber(data.configId));
    record.configName = String(data.configName ?? record.configName).trim();
    record.configKey = String(data.configKey ?? record.configKey).trim();
    record.configValue = String(data.configValue ?? record.configValue);
    record.configType = this.state.normalizeYesNoFlag(
      data.configType ?? record.configType,
      "N",
    );
    record.remark = String(data.remark ?? record.remark);
    return structuredClone(record);
  }

  deleteConfigs(configIds: number[]) {
    configIds.forEach((configId) => {
      const index = this.state.configs.findIndex(
        (item) => item.configId === configId,
      );
      if (index >= 0) {
        this.state.configs.splice(index, 1);
      }
    });
  }

  listNotices(query: Record<string, string | undefined>) {
    const rows = this.state.notices
      .filter((item) => {
        if (
          query.noticeTitle &&
          !item.noticeTitle.includes(query.noticeTitle)
        ) {
          return false;
        }
        if (query.noticeType && item.noticeType !== query.noticeType) {
          return false;
        }
        if (query.status && item.status !== query.status) {
          return false;
        }
        return true;
      })
      .map((item) => structuredClone(item));
    return this.state.paginate(rows, query);
  }

  getNotice(noticeId: number) {
    return structuredClone(this.requireNotice(noticeId));
  }

  createNotice(data: Record<string, unknown>) {
    const record: ManagedNoticeRecord = {
      noticeId: this.state.nextId(this.state.notices, "noticeId"),
      noticeTitle: String(data.noticeTitle ?? "").trim(),
      noticeType: this.state.normalizeNoticeType(data.noticeType),
      noticeContent: String(data.noticeContent ?? ""),
      status: this.state.normalizeStatus(data.status),
      remark: String(data.remark ?? ""),
      createdAt: new Date().toISOString(),
    };
    this.state.notices.push(record);
    return structuredClone(record);
  }

  updateNotice(data: Record<string, unknown>) {
    const record = this.requireNotice(this.state.requireNumber(data.noticeId));
    record.noticeTitle = String(data.noticeTitle ?? record.noticeTitle).trim();
    record.noticeType = this.state.normalizeNoticeType(
      data.noticeType ?? record.noticeType,
    );
    record.noticeContent = String(data.noticeContent ?? record.noticeContent);
    record.status = this.state.normalizeStatus(data.status ?? record.status);
    record.remark = String(data.remark ?? record.remark);
    return structuredClone(record);
  }

  deleteNotices(noticeIds: number[]) {
    noticeIds.forEach((noticeId) => {
      const index = this.state.notices.findIndex(
        (item) => item.noticeId === noticeId,
      );
      if (index >= 0) {
        this.state.notices.splice(index, 1);
      }
    });
  }

  private requireDictType(dictId: number) {
    const record = this.state.dictTypes.find((item) => item.dictId === dictId);
    if (!record) {
      throw new Error(`字典类型不存在: ${dictId}`);
    }
    return record;
  }

  private requireDictData(dictCode: number) {
    const record = this.state.dictData.find((item) => item.dictCode === dictCode);
    if (!record) {
      throw new Error(`字典数据不存在: ${dictCode}`);
    }
    return record;
  }

  private requireConfig(configId: number) {
    const record = this.state.configs.find((item) => item.configId === configId);
    if (!record) {
      throw new Error(`参数不存在: ${configId}`);
    }
    return record;
  }

  private requireNotice(noticeId: number) {
    const record = this.state.notices.find((item) => item.noticeId === noticeId);
    if (!record) {
      throw new Error(`公告不存在: ${noticeId}`);
    }
    return record;
  }
}
