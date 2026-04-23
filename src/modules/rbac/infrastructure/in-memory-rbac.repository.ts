import { Injectable } from "@nestjs/common";
import type { ManagedUserRecord, RbacUserRecord, RouteNode } from "../domain/rbac.types";
import { RbacDictConfigRepository } from "./rbac-dict-config.repository";
import { RbacPersistenceRepository } from "./rbac-persistence.repository";
import { RbacResourceRepository } from "./rbac-resource.repository";
import { RbacRoutesRepository } from "./rbac-routes.repository";
import { RbacSeedRepairRepository } from "./rbac-seed-repair.repository";
import { RbacUserRepository } from "./rbac-user.repository";

@Injectable()
export class InMemoryRbacRepository {
  constructor(
    private readonly userRepo: RbacUserRepository,
    private readonly resourceRepo: RbacResourceRepository,
    private readonly dictConfigRepo: RbacDictConfigRepository,
    private readonly routesRepo: RbacRoutesRepository,
    private readonly persistenceRepo: RbacPersistenceRepository,
    private readonly seedRepairRepo: RbacSeedRepairRepository,
  ) {}

  hasPersistenceAdapter(): boolean { return this.persistenceRepo.hasPersistenceAdapter(); }
  async flushPersistence(): Promise<void> { return this.persistenceRepo.flushPersistence(); }
  async getNormalizedBaseCounts() { return this.persistenceRepo.getNormalizedBaseCounts(); }
  async loadFromNormalizedTables(): Promise<void> { return this.persistenceRepo.loadFromNormalizedTables(); }
  ensureSeedPermissionMenus(roleKeys: string[], permissionKeys: string[]): boolean { return this.seedRepairRepo.ensureSeedPermissionMenus(roleKeys, permissionKeys); }
  syncSeedRoleMenus(roleKeys: string[]): boolean { return this.seedRepairRepo.syncSeedRoleMenus(roleKeys); }
  async persistState(): Promise<void> { return this.persistenceRepo.persistState(); }

  async getRoutes(): Promise<RouteNode[]> { return this.routesRepo.getRoutes(); }

  async findUserByUsername(username: string): Promise<RbacUserRecord | null> { return this.userRepo.findUserByUsername(username); }
  async findUserById(userId: number): Promise<RbacUserRecord | null> { return this.userRepo.findUserById(userId); }
  async updateUserAvatar(userId: number, avatarUrl: string | null) { const result = await this.userRepo.updateUserAvatar(userId, avatarUrl); this.persistenceRepo.queuePersistence(); return result; }
  verifyPassword(rawPassword: string, passwordHash: string): boolean { return this.userRepo.verifyPassword(rawPassword, passwordHash); }
  listUsers(query: Record<string, string | undefined>) { return this.userRepo.listUsers(query); }
  getUserForm(userId: number | null) { return this.userRepo.getUserForm(userId); }
  createUser(data: Record<string, unknown>) { const result = this.userRepo.createUser(data); this.persistenceRepo.queuePersistence(); return result; }
  updateUser(data: Record<string, unknown>) { const result = this.userRepo.updateUser(data); this.persistenceRepo.queuePersistence(); return result; }
  deleteUsers(userIds: number[]) { this.userRepo.deleteUsers(userIds); this.persistenceRepo.queuePersistence(); }
  resetUserPassword(userId: number, password: string) { this.userRepo.resetUserPassword(userId, password); this.persistenceRepo.queuePersistence(); }
  changeUserStatus(userId: number, status: "0" | "1") { this.userRepo.changeUserStatus(userId, status); this.persistenceRepo.queuePersistence(); }
  getCurrentUserProfile(userId: number) { return this.userRepo.getCurrentUserProfile(userId); }
  updateCurrentUserProfile(userId: number, data: Pick<ManagedUserRecord, "nickName" | "phonenumber" | "email" | "sex">) { const result = this.userRepo.updateCurrentUserProfile(userId, data); this.persistenceRepo.queuePersistence(); return result; }
  updateCurrentUserPassword(userId: number, oldPassword: string, newPassword: string) { this.userRepo.updateCurrentUserPassword(userId, oldPassword, newPassword); this.persistenceRepo.queuePersistence(); }
  getAuthRole(userId: number) { return this.userRepo.getAuthRole(userId); }
  updateUserRoles(userId: number, roleIds: number[]) { this.userRepo.updateUserRoles(userId, roleIds); this.persistenceRepo.queuePersistence(); }
  findUserIdsByRoleIds(roleIds: number[]) { return this.userRepo.findUserIdsByRoleIds(roleIds); }
  listAllocatedUsers(query: Record<string, string | undefined>) { return this.userRepo.listAllocatedUsers(query); }
  listUnallocatedUsers(query: Record<string, string | undefined>) { return this.userRepo.listUnallocatedUsers(query); }
  cancelAuthUsers(roleId: number, userIds: number[]) { this.userRepo.cancelAuthUsers(roleId, userIds); this.persistenceRepo.queuePersistence(); }
  assignUsersToRole(roleId: number, userIds: number[]) { this.userRepo.assignUsersToRole(roleId, userIds); this.persistenceRepo.queuePersistence(); }

  listRoles(query: Record<string, string | undefined>) { return this.resourceRepo.listRoles(query); }
  getRole(roleId: number) { return this.resourceRepo.getRole(roleId); }
  createRole(data: Record<string, unknown>) { const result = this.resourceRepo.createRole(data); this.persistenceRepo.queuePersistence(); return result; }
  updateRole(data: Record<string, unknown>) { const result = this.resourceRepo.updateRole(data); this.persistenceRepo.queuePersistence(); return result; }
  updateRoleDataScope(data: Record<string, unknown>) { this.resourceRepo.updateRoleDataScope(data); this.persistenceRepo.queuePersistence(); }
  changeRoleStatus(roleId: number, status: "0" | "1") { this.resourceRepo.changeRoleStatus(roleId, status); this.persistenceRepo.queuePersistence(); }
  deleteRoles(roleIds: number[]) { this.resourceRepo.deleteRoles(roleIds); this.persistenceRepo.queuePersistence(); }
  getRoleMenuTree(roleId: number) { return this.resourceRepo.getRoleMenuTree(roleId); }
  listMenus(query: Record<string, string | undefined>) { return this.resourceRepo.listMenus(query); }
  getMenu(menuId: number) { return this.resourceRepo.getMenu(menuId); }
  getMenuTreeSelect() { return this.resourceRepo.getMenuTreeSelect(); }
  createMenu(data: Record<string, unknown>) { const result = this.resourceRepo.createMenu(data); this.persistenceRepo.queuePersistence(); return result; }
  updateMenu(data: Record<string, unknown>) { const result = this.resourceRepo.updateMenu(data); this.persistenceRepo.queuePersistence(); return result; }
  deleteMenus(menuIds: number[]) { this.resourceRepo.deleteMenus(menuIds); this.persistenceRepo.queuePersistence(); }
  listDepts(query: Record<string, string | undefined>) { return this.resourceRepo.listDepts(query); }
  listDeptExcludeChild(deptId: number) { return this.resourceRepo.listDeptExcludeChild(deptId); }
  getDept(deptId: number) { return this.resourceRepo.getDept(deptId); }
  createDept(data: Record<string, unknown>) { const result = this.resourceRepo.createDept(data); this.persistenceRepo.queuePersistence(); return result; }
  updateDept(data: Record<string, unknown>) { const result = this.resourceRepo.updateDept(data); this.persistenceRepo.queuePersistence(); return result; }
  deleteDepts(deptIds: number[]) { this.resourceRepo.deleteDepts(deptIds); this.persistenceRepo.queuePersistence(); }
  getDeptTree(roleId?: number) { return this.resourceRepo.getDeptTree(roleId); }
  getDeptTreeSelect() { return this.resourceRepo.getDeptTreeSelect(); }
  listPosts(query: Record<string, string | undefined>) { return this.resourceRepo.listPosts(query); }
  getPost(postId: number) { return this.resourceRepo.getPost(postId); }
  createPost(data: Record<string, unknown>) { const result = this.resourceRepo.createPost(data); this.persistenceRepo.queuePersistence(); return result; }
  updatePost(data: Record<string, unknown>) { const result = this.resourceRepo.updatePost(data); this.persistenceRepo.queuePersistence(); return result; }
  deletePosts(postIds: number[]) { this.resourceRepo.deletePosts(postIds); this.persistenceRepo.queuePersistence(); }

  listDictTypes(query: Record<string, string | undefined>) { return this.dictConfigRepo.listDictTypes(query); }
  getDictType(dictId: number) { return this.dictConfigRepo.getDictType(dictId); }
  createDictType(data: Record<string, unknown>) { const result = this.dictConfigRepo.createDictType(data); this.persistenceRepo.queuePersistence(); return result; }
  updateDictType(data: Record<string, unknown>) { const result = this.dictConfigRepo.updateDictType(data); this.persistenceRepo.queuePersistence(); return result; }
  deleteDictTypes(dictIds: number[]) { this.dictConfigRepo.deleteDictTypes(dictIds); this.persistenceRepo.queuePersistence(); }
  listDictTypeOptions() { return this.dictConfigRepo.listDictTypeOptions(); }
  listDictData(query: Record<string, string | undefined>) { return this.dictConfigRepo.listDictData(query); }
  getDictData(dictCode: number) { return this.dictConfigRepo.getDictData(dictCode); }
  getDictDataByType(dictType: string) { return this.dictConfigRepo.getDictDataByType(dictType); }
  createDictData(data: Record<string, unknown>) { const result = this.dictConfigRepo.createDictData(data); this.persistenceRepo.queuePersistence(); return result; }
  updateDictData(data: Record<string, unknown>) { const result = this.dictConfigRepo.updateDictData(data); this.persistenceRepo.queuePersistence(); return result; }
  deleteDictData(dictCodes: number[]) { this.dictConfigRepo.deleteDictData(dictCodes); this.persistenceRepo.queuePersistence(); }
  listConfigs(query: Record<string, string | undefined>) { return this.dictConfigRepo.listConfigs(query); }
  getConfig(configId: number) { return this.dictConfigRepo.getConfig(configId); }
  getConfigByKey(configKey: string) { return this.dictConfigRepo.getConfigByKey(configKey); }
  createConfig(data: Record<string, unknown>) { const result = this.dictConfigRepo.createConfig(data); this.persistenceRepo.queuePersistence(); return result; }
  updateConfig(data: Record<string, unknown>) { const result = this.dictConfigRepo.updateConfig(data); this.persistenceRepo.queuePersistence(); return result; }
  deleteConfigs(configIds: number[]) { this.dictConfigRepo.deleteConfigs(configIds); this.persistenceRepo.queuePersistence(); }
  listNotices(query: Record<string, string | undefined>) { return this.dictConfigRepo.listNotices(query); }
  getNotice(noticeId: number) { return this.dictConfigRepo.getNotice(noticeId); }
  createNotice(data: Record<string, unknown>) { const result = this.dictConfigRepo.createNotice(data); this.persistenceRepo.queuePersistence(); return result; }
  updateNotice(data: Record<string, unknown>) { const result = this.dictConfigRepo.updateNotice(data); this.persistenceRepo.queuePersistence(); return result; }
  deleteNotices(noticeIds: number[]) { this.dictConfigRepo.deleteNotices(noticeIds); this.persistenceRepo.queuePersistence(); }
}
