import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SessionService } from "../../session/application/session.service";
import { InMemoryRbacRepository } from "../infrastructure/in-memory-rbac.repository";

type CsvExportColumn = {
  header: string;
  value: (row: Record<string, unknown>) => unknown;
};

type CsvExportResult = {
  fileName: string;
  content: string;
  contentType: string;
};

@Injectable()
export class SystemManagementService {
  constructor(
    private readonly rbacRepository: InMemoryRbacRepository,
    private readonly sessionService: SessionService,
  ) {}

  listUsers(query: Record<string, string | undefined>) {
    return this.rbacRepository.listUsers(query);
  }

  exportUsers(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport(
      "system-users",
      this.extractRows(this.listUsers(this.withoutPagination(query))),
      [
        { header: "用户编号", value: (row) => row.userId },
        { header: "用户名称", value: (row) => row.userName },
        { header: "用户昵称", value: (row) => row.nickName },
        {
          header: "部门",
          value: (row) => this.pickNestedValue(row, "dept", "deptName"),
        },
        { header: "手机号码", value: (row) => row.phonenumber },
        { header: "邮箱", value: (row) => row.email },
        { header: "状态", value: (row) => row.status },
        { header: "创建时间", value: (row) => row.createTime },
      ],
    );
  }

  getUser(userId: number | null) {
    return this.rbacRepository.getUserForm(userId);
  }

  async createUser(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createUser(data),
    );
  }

  async updateUser(data: Record<string, unknown>) {
    const userId = this.requireNumber(data.userId);
    const result = await this.wrapPersistentMutation(() =>
      this.rbacRepository.updateUser(data),
    );
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return result;
  }

  async deleteUsers(userIds: number[]) {
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.deleteUsers(userIds),
    );
    await this.sessionService.invalidateSessionsByUserIds(userIds);
    return { msg: "删除成功" };
  }

  async resetUserPassword(userId: number, password: string) {
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.resetUserPassword(userId, password),
    );
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "密码重置成功" };
  }

  async changeUserStatus(userId: number, status: "0" | "1") {
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.changeUserStatus(userId, status),
    );
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "状态更新成功" };
  }

  getCurrentUserProfile(userId: number) {
    return this.wrapQuery(() =>
      this.rbacRepository.getCurrentUserProfile(userId),
    );
  }

  updateCurrentUserProfile(userId: number, data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.updateCurrentUserProfile(userId, {
        nickName: String(data.nickName ?? ""),
        phonenumber: String(data.phonenumber ?? ""),
        email: String(data.email ?? ""),
        sex: (data.sex as "0" | "1" | "2" | undefined) ?? "2",
      }),
    );
  }

  async updateCurrentUserPassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ) {
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.updateCurrentUserPassword(
        userId,
        oldPassword,
        newPassword,
      ),
    );
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "密码修改成功" };
  }

  getAuthRole(userId: number) {
    return this.wrapQuery(() => this.rbacRepository.getAuthRole(userId));
  }

  async updateAuthRole(data: Record<string, string | undefined>) {
    const userId = this.requireNumber(data.userId);
    const roleIds = this.toIdList(data.roleIds);
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.updateUserRoles(userId, roleIds),
    );
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "授权成功" };
  }

  getDeptTreeSelect() {
    return {
      data: this.rbacRepository.getDeptTreeSelect(),
    };
  }

  listRoles(query: Record<string, string | undefined>) {
    return this.rbacRepository.listRoles(query);
  }

  exportRoles(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport(
      "system-roles",
      this.extractRows(this.listRoles(this.withoutPagination(query))),
      [
        { header: "角色编号", value: (row) => row.roleId },
        { header: "角色名称", value: (row) => row.roleName },
        { header: "角色权限字符", value: (row) => row.roleKey },
        { header: "显示顺序", value: (row) => row.roleSort },
        { header: "状态", value: (row) => row.status },
        { header: "数据范围", value: (row) => row.dataScope },
        { header: "创建时间", value: (row) => row.createTime },
      ],
    );
  }

  getRole(roleId: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getRole(roleId)),
    };
  }

  async createRole(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createRole(data),
    );
  }

  async updateRole(data: Record<string, unknown>) {
    const roleId = this.requireNumber(data.roleId);
    const result = await this.wrapPersistentMutation(() =>
      this.rbacRepository.updateRole(data),
    );
    await this.invalidateRoleSessions([roleId]);
    return result;
  }

  async updateRoleDataScope(data: Record<string, unknown>) {
    const roleId = this.requireNumber(data.roleId);
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.updateRoleDataScope(data),
    );
    await this.invalidateRoleSessions([roleId]);
    return { msg: "数据权限更新成功" };
  }

  async changeRoleStatus(roleId: number, status: "0" | "1") {
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.changeRoleStatus(roleId, status),
    );
    await this.invalidateRoleSessions([roleId]);
    return { msg: "状态更新成功" };
  }

  async deleteRoles(roleIds: number[]) {
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.deleteRoles(roleIds),
    );
    await this.invalidateRoleSessions(roleIds);
    return { msg: "删除成功" };
  }

  listAllocatedUsers(query: Record<string, string | undefined>) {
    return this.rbacRepository.listAllocatedUsers(query);
  }

  listUnallocatedUsers(query: Record<string, string | undefined>) {
    return this.rbacRepository.listUnallocatedUsers(query);
  }

  async cancelAuthUser(data: Record<string, unknown>) {
    const roleId = this.requireNumber(data.roleId);
    const userId = this.requireNumber(data.userId);
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.cancelAuthUsers(roleId, [userId]),
    );
    await this.sessionService.invalidateSessionsByUserIds([userId]);
    return { msg: "取消授权成功" };
  }

  async cancelAuthUserAll(query: Record<string, string | undefined>) {
    const roleId = this.requireNumber(query.roleId);
    const userIds = this.toIdList(query.userIds);
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.cancelAuthUsers(roleId, userIds),
    );
    await this.sessionService.invalidateSessionsByUserIds(userIds);
    return { msg: "取消授权成功" };
  }

  async selectUsersToRole(query: Record<string, string | undefined>) {
    const roleId = this.requireNumber(query.roleId);
    const userIds = this.toIdList(query.userIds);
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.assignUsersToRole(roleId, userIds),
    );
    await this.sessionService.invalidateSessionsByUserIds(userIds);
    return { msg: "授权成功" };
  }

  getRoleMenuTree(roleId: number) {
    return this.wrapQuery(() => this.rbacRepository.getRoleMenuTree(roleId));
  }

  getRoleDeptTree(roleId: number) {
    return this.wrapQuery(() => this.rbacRepository.getDeptTree(roleId));
  }

  listMenus(query: Record<string, string | undefined>) {
    return {
      data: this.rbacRepository.listMenus(query),
    };
  }

  getMenu(menuId: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getMenu(menuId)),
    };
  }

  getMenuTreeSelect() {
    return {
      data: this.rbacRepository.getMenuTreeSelect(),
    };
  }

  async createMenu(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createMenu(data),
    );
  }

  async updateMenu(data: Record<string, unknown>) {
    const result = await this.wrapPersistentMutation(() =>
      this.rbacRepository.updateMenu(data),
    );
    await this.invalidateAllRoleSessions();
    return result;
  }

  async deleteMenus(menuIds: number[]) {
    await this.wrapPersistentMutation(() =>
      this.rbacRepository.deleteMenus(menuIds),
    );
    await this.invalidateAllRoleSessions();
    return { msg: "删除成功" };
  }

  listDepts(query: Record<string, string | undefined>) {
    return {
      data: this.rbacRepository.listDepts(query),
    };
  }

  listDeptExcludeChild(deptId: number) {
    return {
      data: this.wrapQuery(() =>
        this.rbacRepository.listDeptExcludeChild(deptId),
      ),
    };
  }

  getDept(deptId: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getDept(deptId)),
    };
  }

  async createDept(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createDept(data),
    );
  }

  async updateDept(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.updateDept(data),
    );
  }

  async deleteDepts(deptIds: number[]) {
    return this.wrapPersistentMutation(() => {
      this.rbacRepository.deleteDepts(deptIds);
      return { msg: "删除成功" };
    });
  }

  listPosts(query: Record<string, string | undefined>) {
    return this.rbacRepository.listPosts(query);
  }

  exportPosts(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport(
      "system-posts",
      this.extractRows(this.listPosts(this.withoutPagination(query))),
      [
        { header: "岗位编号", value: (row) => row.postId },
        { header: "岗位编码", value: (row) => row.postCode },
        { header: "岗位名称", value: (row) => row.postName },
        { header: "岗位排序", value: (row) => row.postSort },
        { header: "状态", value: (row) => row.status },
        { header: "备注", value: (row) => row.remark },
        { header: "创建时间", value: (row) => row.createTime },
      ],
    );
  }

  getPost(postId: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getPost(postId)),
    };
  }

  async createPost(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createPost(data),
    );
  }

  async updatePost(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.updatePost(data),
    );
  }

  async deletePosts(postIds: number[]) {
    return this.wrapPersistentMutation(() => {
      this.rbacRepository.deletePosts(postIds);
      return { msg: "删除成功" };
    });
  }

  listDictTypes(query: Record<string, string | undefined>) {
    return this.rbacRepository.listDictTypes(query);
  }

  exportDictTypes(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport(
      "system-dict-types",
      this.extractRows(this.listDictTypes(this.withoutPagination(query))),
      [
        { header: "字典编号", value: (row) => row.dictId },
        { header: "字典名称", value: (row) => row.dictName },
        { header: "字典类型", value: (row) => row.dictType },
        { header: "状态", value: (row) => row.status },
        { header: "备注", value: (row) => row.remark },
        { header: "创建时间", value: (row) => row.createTime },
      ],
    );
  }

  getDictType(dictId: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getDictType(dictId)),
    };
  }

  async createDictType(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createDictType(data),
    );
  }

  async updateDictType(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.updateDictType(data),
    );
  }

  async deleteDictTypes(dictIds: number[]) {
    return this.wrapPersistentMutation(() => {
      this.rbacRepository.deleteDictTypes(dictIds);
      return { msg: "删除成功" };
    });
  }

  refreshDictCache() {
    return { msg: "刷新成功" };
  }

  listDictTypeOptions() {
    return {
      data: this.rbacRepository.listDictTypeOptions(),
    };
  }

  listDictData(query: Record<string, string | undefined>) {
    return this.rbacRepository.listDictData(query);
  }

  exportDictData(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport(
      "system-dict-data",
      this.extractRows(this.listDictData(this.withoutPagination(query))),
      [
        { header: "字典编码", value: (row) => row.dictCode },
        { header: "字典标签", value: (row) => row.dictLabel },
        { header: "字典键值", value: (row) => row.dictValue },
        { header: "字典类型", value: (row) => row.dictType },
        { header: "排序", value: (row) => row.dictSort },
        { header: "默认", value: (row) => row.isDefault },
        { header: "状态", value: (row) => row.status },
        { header: "备注", value: (row) => row.remark },
        { header: "创建时间", value: (row) => row.createTime },
      ],
    );
  }

  getDictData(dictCode: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getDictData(dictCode)),
    };
  }

  getDicts(dictType: string) {
    return {
      data: this.wrapQuery(() =>
        this.rbacRepository.getDictDataByType(dictType),
      ),
    };
  }

  async createDictData(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createDictData(data),
    );
  }

  async updateDictData(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.updateDictData(data),
    );
  }

  async deleteDictData(dictCodes: number[]) {
    return this.wrapPersistentMutation(() => {
      this.rbacRepository.deleteDictData(dictCodes);
      return { msg: "删除成功" };
    });
  }

  listConfigs(query: Record<string, string | undefined>) {
    return this.rbacRepository.listConfigs(query);
  }

  exportConfigs(query: Record<string, string | undefined>): CsvExportResult {
    return this.buildCsvExport(
      "system-configs",
      this.extractRows(this.listConfigs(this.withoutPagination(query))),
      [
        { header: "参数主键", value: (row) => row.configId },
        { header: "参数名称", value: (row) => row.configName },
        { header: "参数键名", value: (row) => row.configKey },
        { header: "参数键值", value: (row) => row.configValue },
        { header: "系统内置", value: (row) => row.configType },
        { header: "备注", value: (row) => row.remark },
        { header: "创建时间", value: (row) => row.createTime },
      ],
    );
  }

  getConfig(configId: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getConfig(configId)),
    };
  }

  getConfigByKey(configKey: string) {
    const config = this.wrapQuery(() =>
      this.rbacRepository.getConfigByKey(configKey),
    );
    return {
      msg: config?.configValue ?? "",
    };
  }

  async createConfig(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createConfig(data),
    );
  }

  async updateConfig(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.updateConfig(data),
    );
  }

  async deleteConfigs(configIds: number[]) {
    return this.wrapPersistentMutation(() => {
      this.rbacRepository.deleteConfigs(configIds);
      return { msg: "删除成功" };
    });
  }

  refreshConfigCache() {
    return { msg: "刷新成功" };
  }

  listNotices(query: Record<string, string | undefined>) {
    return this.rbacRepository.listNotices(query);
  }

  getNotice(noticeId: number) {
    return {
      data: this.wrapQuery(() => this.rbacRepository.getNotice(noticeId)),
    };
  }

  async createNotice(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.createNotice(data),
    );
  }

  async updateNotice(data: Record<string, unknown>) {
    return this.wrapPersistentMutation(() =>
      this.rbacRepository.updateNotice(data),
    );
  }

  async deleteNotices(noticeIds: number[]) {
    return this.wrapPersistentMutation(() => {
      this.rbacRepository.deleteNotices(noticeIds);
      return { msg: "删除成功" };
    });
  }

  private async invalidateRoleSessions(roleIds: number[]) {
    const userIds = this.rbacRepository.findUserIdsByRoleIds(roleIds);
    if (userIds.length > 0) {
      await this.sessionService.invalidateSessionsByUserIds(userIds);
    }
  }

  private async invalidateAllRoleSessions() {
    const userIds = this.rbacRepository.findUserIdsByRoleIds(
      this.rbacRepository.listRoles({}).rows.map((role) => role.roleId),
    );
    if (userIds.length > 0) {
      await this.sessionService.invalidateSessionsByUserIds(userIds);
    }
  }

  private wrapQuery<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private wrapMutation<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private async wrapPersistentMutation<T>(action: () => T): Promise<T> {
    const result = this.wrapMutation(action);
    await this.rbacRepository.flushPersistence();
    return result;
  }

  private toHttpException(error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "系统管理操作失败";
    if (message.includes("不存在")) {
      return new NotFoundException(message);
    }
    return new BadRequestException(message);
  }

  private requireNumber(value: unknown) {
    const result = Number(value);
    if (!Number.isFinite(result)) {
      throw new BadRequestException("缺少必要的数字参数");
    }
    return result;
  }

  private toIdList(value: unknown) {
    if (!value) {
      return [];
    }
    return String(value)
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }

  private withoutPagination(query: Record<string, string | undefined>) {
    return {
      ...query,
      pageNum: undefined,
      pageSize: undefined,
    };
  }

  private extractRows(result: unknown): Record<string, unknown>[] {
    if (!result || typeof result !== "object") {
      return [];
    }

    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object",
      );
    }

    const data = (result as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object",
      );
    }

    return [];
  }

  private buildCsvExport(
    fileBaseName: string,
    rows: Record<string, unknown>[],
    columns: CsvExportColumn[],
  ): CsvExportResult {
    const csvLines = [
      columns.map((column) => this.escapeCsvValue(column.header)).join(","),
      ...rows.map((row) =>
        columns
          .map((column) => this.escapeCsvValue(column.value(row)))
          .join(","),
      ),
    ];

    return {
      fileName: `${fileBaseName}-${this.toDateOnly(new Date())}.csv`,
      content: `\uFEFF${csvLines.join("\n")}`,
      contentType: "text/csv; charset=utf-8",
    };
  }

  private escapeCsvValue(value: unknown): string {
    const stringValue =
      value === null || typeof value === "undefined" ? "" : String(value);
    const escaped = stringValue.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  }

  private pickNestedValue(
    row: Record<string, unknown>,
    parentKey: string,
    childKey: string,
  ) {
    const parent = row[parentKey];
    if (!parent || typeof parent !== "object") {
      return "";
    }
    return (parent as Record<string, unknown>)[childKey] ?? "";
  }

  private toDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
