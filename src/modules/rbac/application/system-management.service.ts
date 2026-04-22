import { Injectable } from "@nestjs/common";
import { SystemDictConfigService } from "./system-dict-config.service";
import { SystemResourceService } from "./system-resource.service";
import { SystemUserService } from "./system-user.service";

@Injectable()
export class SystemManagementService {
  constructor(
    private readonly user: SystemUserService,
    private readonly resource: SystemResourceService,
    private readonly dictConfig: SystemDictConfigService,
  ) {}

  listUsers(query: Record<string, string | undefined>) { return this.user.listUsers(query); }
  exportUsers(query: Record<string, string | undefined>) { return this.user.exportUsers(query); }
  getUser(userId: number | null) { return this.user.getUser(userId); }
  createUser(data: Record<string, unknown>) { return this.user.createUser(data); }
  updateUser(data: Record<string, unknown>) { return this.user.updateUser(data); }
  deleteUsers(userIds: number[]) { return this.user.deleteUsers(userIds); }
  resetUserPassword(userId: number, password: string) { return this.user.resetUserPassword(userId, password); }
  changeUserStatus(userId: number, status: "0" | "1") { return this.user.changeUserStatus(userId, status); }
  getCurrentUserProfile(userId: number) { return this.user.getCurrentUserProfile(userId); }
  updateCurrentUserProfile(userId: number, data: Record<string, unknown>) { return this.user.updateCurrentUserProfile(userId, data); }
  updateCurrentUserPassword(userId: number, oldPassword: string, newPassword: string) { return this.user.updateCurrentUserPassword(userId, oldPassword, newPassword); }
  getAuthRole(userId: number) { return this.user.getAuthRole(userId); }
  updateAuthRole(data: Record<string, string | undefined>) { return this.user.updateAuthRole(data); }

  getDeptTreeSelect() { return this.resource.getDeptTreeSelect(); }
  listRoles(query: Record<string, string | undefined>) { return this.resource.listRoles(query); }
  exportRoles(query: Record<string, string | undefined>) { return this.resource.exportRoles(query); }
  getRole(roleId: number) { return this.resource.getRole(roleId); }
  createRole(data: Record<string, unknown>) { return this.resource.createRole(data); }
  updateRole(data: Record<string, unknown>) { return this.resource.updateRole(data); }
  updateRoleDataScope(data: Record<string, unknown>) { return this.resource.updateRoleDataScope(data); }
  changeRoleStatus(roleId: number, status: "0" | "1") { return this.resource.changeRoleStatus(roleId, status); }
  deleteRoles(roleIds: number[]) { return this.resource.deleteRoles(roleIds); }
  listAllocatedUsers(query: Record<string, string | undefined>) { return this.resource.listAllocatedUsers(query); }
  listUnallocatedUsers(query: Record<string, string | undefined>) { return this.resource.listUnallocatedUsers(query); }
  cancelAuthUser(data: Record<string, unknown>) { return this.resource.cancelAuthUser(data); }
  cancelAuthUserAll(query: Record<string, string | undefined>) { return this.resource.cancelAuthUserAll(query); }
  selectUsersToRole(query: Record<string, string | undefined>) { return this.resource.selectUsersToRole(query); }
  getRoleMenuTree(roleId: number) { return this.resource.getRoleMenuTree(roleId); }
  getRoleDeptTree(roleId: number) { return this.resource.getRoleDeptTree(roleId); }
  listMenus(query: Record<string, string | undefined>) { return this.resource.listMenus(query); }
  getMenu(menuId: number) { return this.resource.getMenu(menuId); }
  getMenuTreeSelect() { return this.resource.getMenuTreeSelect(); }
  createMenu(data: Record<string, unknown>) { return this.resource.createMenu(data); }
  updateMenu(data: Record<string, unknown>) { return this.resource.updateMenu(data); }
  deleteMenus(menuIds: number[]) { return this.resource.deleteMenus(menuIds); }
  listDepts(query: Record<string, string | undefined>) { return this.resource.listDepts(query); }
  listDeptExcludeChild(deptId: number) { return this.resource.listDeptExcludeChild(deptId); }
  getDept(deptId: number) { return this.resource.getDept(deptId); }
  createDept(data: Record<string, unknown>) { return this.resource.createDept(data); }
  updateDept(data: Record<string, unknown>) { return this.resource.updateDept(data); }
  deleteDepts(deptIds: number[]) { return this.resource.deleteDepts(deptIds); }
  listPosts(query: Record<string, string | undefined>) { return this.resource.listPosts(query); }
  exportPosts(query: Record<string, string | undefined>) { return this.resource.exportPosts(query); }
  getPost(postId: number) { return this.resource.getPost(postId); }
  createPost(data: Record<string, unknown>) { return this.resource.createPost(data); }
  updatePost(data: Record<string, unknown>) { return this.resource.updatePost(data); }
  deletePosts(postIds: number[]) { return this.resource.deletePosts(postIds); }

  listDictTypes(query: Record<string, string | undefined>) { return this.dictConfig.listDictTypes(query); }
  exportDictTypes(query: Record<string, string | undefined>) { return this.dictConfig.exportDictTypes(query); }
  getDictType(dictId: number) { return this.dictConfig.getDictType(dictId); }
  createDictType(data: Record<string, unknown>) { return this.dictConfig.createDictType(data); }
  updateDictType(data: Record<string, unknown>) { return this.dictConfig.updateDictType(data); }
  deleteDictTypes(dictIds: number[]) { return this.dictConfig.deleteDictTypes(dictIds); }
  refreshDictCache() { return this.dictConfig.refreshDictCache(); }
  listDictTypeOptions() { return this.dictConfig.listDictTypeOptions(); }
  listDictData(query: Record<string, string | undefined>) { return this.dictConfig.listDictData(query); }
  exportDictData(query: Record<string, string | undefined>) { return this.dictConfig.exportDictData(query); }
  getDictData(dictCode: number) { return this.dictConfig.getDictData(dictCode); }
  getDicts(dictType: string) { return this.dictConfig.getDicts(dictType); }
  createDictData(data: Record<string, unknown>) { return this.dictConfig.createDictData(data); }
  updateDictData(data: Record<string, unknown>) { return this.dictConfig.updateDictData(data); }
  deleteDictData(dictCodes: number[]) { return this.dictConfig.deleteDictData(dictCodes); }
  listConfigs(query: Record<string, string | undefined>) { return this.dictConfig.listConfigs(query); }
  exportConfigs(query: Record<string, string | undefined>) { return this.dictConfig.exportConfigs(query); }
  getConfig(configId: number) { return this.dictConfig.getConfig(configId); }
  getConfigByKey(configKey: string) { return this.dictConfig.getConfigByKey(configKey); }
  createConfig(data: Record<string, unknown>) { return this.dictConfig.createConfig(data); }
  updateConfig(data: Record<string, unknown>) { return this.dictConfig.updateConfig(data); }
  deleteConfigs(configIds: number[]) { return this.dictConfig.deleteConfigs(configIds); }
  refreshConfigCache() { return this.dictConfig.refreshConfigCache(); }
  listNotices(query: Record<string, string | undefined>) { return this.dictConfig.listNotices(query); }
  getNotice(noticeId: number) { return this.dictConfig.getNotice(noticeId); }
  createNotice(data: Record<string, unknown>) { return this.dictConfig.createNotice(data); }
  updateNotice(data: Record<string, unknown>) { return this.dictConfig.updateNotice(data); }
  deleteNotices(noticeIds: number[]) { return this.dictConfig.deleteNotices(noticeIds); }
}
