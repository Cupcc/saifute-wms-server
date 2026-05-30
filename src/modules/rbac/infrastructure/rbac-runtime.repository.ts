import { Injectable } from "@nestjs/common";
import type {
  ManagedMenuRecord,
  ManagedUserRecord,
  RbacUserRecord,
  RouteNode,
} from "../domain/rbac.types";
import { RbacDictConfigRepository } from "./rbac-dict-config.repository";
import { RbacPersistenceRepository } from "./rbac-persistence.repository";
import { RbacResourceRepository } from "./rbac-resource.repository";
import { RbacRoutesRepository } from "./rbac-routes.repository";
import { RbacSeedRepairRepository } from "./rbac-seed-repair.repository";
import { RbacUserRepository } from "./rbac-user.repository";

type StateAction<T> = () => T | Promise<T>;

@Injectable()
export class RbacRuntimeRepository {
  constructor(
    private readonly userRepo: RbacUserRepository,
    private readonly resourceRepo: RbacResourceRepository,
    private readonly dictConfigRepo: RbacDictConfigRepository,
    private readonly routesRepo: RbacRoutesRepository,
    private readonly persistenceRepo: RbacPersistenceRepository,
    private readonly seedRepairRepo: RbacSeedRepairRepository,
  ) {}

  hasPersistenceAdapter(): boolean {
    return this.persistenceRepo.hasPersistenceAdapter();
  }
  async flushPersistence(): Promise<void> {
    return this.persistenceRepo.flushPersistence();
  }
  async getNormalizedBaseCounts() {
    return this.persistenceRepo.getNormalizedBaseCounts();
  }
  async loadFromNormalizedTables(): Promise<void> {
    return this.persistenceRepo.loadFromNormalizedTables();
  }
  async ensureSeedRoles(roleKeys: string[]): Promise<boolean> {
    return this.mutateState(() =>
      this.seedRepairRepo.ensureSeedRoles(roleKeys),
    );
  }
  async ensureSeedPermissionMenus(
    roleKeys: string[],
    permissionKeys: string[],
  ): Promise<boolean> {
    return this.mutateState(() =>
      this.seedRepairRepo.ensureSeedPermissionMenus(roleKeys, permissionKeys),
    );
  }
  async syncSeedRoleMenus(roleKeys: string[]): Promise<boolean> {
    return this.mutateState(() =>
      this.seedRepairRepo.syncSeedRoleMenus(roleKeys),
    );
  }
  async ensureSeedConfigs(configKeys: string[]): Promise<boolean> {
    await this.persistenceRepo.loadRuntimeState();
    const changed = this.seedRepairRepo.ensureSeedConfigs(configKeys);
    if (changed) {
      this.persistenceRepo.queuePersistence();
    }
    return changed;
  }
  async repairSeedMenuDisplayMetadata(): Promise<boolean> {
    return this.mutateState(() =>
      this.seedRepairRepo.repairSeedMenuDisplayMetadata(),
    );
  }
  async persistState(): Promise<void> {
    return this.persistenceRepo.persistState();
  }

  async getRoutes(): Promise<RouteNode[]> {
    return this.readState(async () => {
      const routes = await this.routesRepo.getRoutes();
      return this.applyMenuMetadata(routes);
    });
  }

  async findUserByUsername(username: string): Promise<RbacUserRecord | null> {
    return this.readState(() => this.userRepo.findUserByUsername(username));
  }
  async findUserById(userId: number): Promise<RbacUserRecord | null> {
    return this.readState(() => this.userRepo.findUserById(userId));
  }
  async updateUserAvatar(userId: number, avatarUrl: string | null) {
    return this.mutateState(() =>
      this.userRepo.updateUserAvatar(userId, avatarUrl),
    );
  }
  verifyPassword(rawPassword: string, passwordHash: string): boolean {
    return this.userRepo.verifyPassword(rawPassword, passwordHash);
  }
  async listUsers(query: Record<string, string | undefined>) {
    return this.readState(() => this.userRepo.listUsers(query));
  }
  async getUserForm(userId: number | null) {
    return this.readState(() => this.userRepo.getUserForm(userId));
  }
  async createUser(data: Record<string, unknown>) {
    return this.mutateState(() => this.userRepo.createUser(data));
  }
  async updateUser(data: Record<string, unknown>) {
    return this.mutateState(() => this.userRepo.updateUser(data));
  }
  async deleteUsers(userIds: number[]) {
    return this.mutateState(() => this.userRepo.deleteUsers(userIds));
  }
  async resetUserPassword(userId: number, password: string) {
    return this.mutateState(() =>
      this.userRepo.resetUserPassword(userId, password),
    );
  }
  async changeUserStatus(userId: number, status: "0" | "1") {
    return this.mutateState(() =>
      this.userRepo.changeUserStatus(userId, status),
    );
  }
  async getCurrentUserProfile(userId: number) {
    return this.readState(() => this.userRepo.getCurrentUserProfile(userId));
  }
  async updateCurrentUserProfile(
    userId: number,
    data: Pick<ManagedUserRecord, "nickName" | "phonenumber" | "email" | "sex">,
  ) {
    return this.mutateState(() =>
      this.userRepo.updateCurrentUserProfile(userId, data),
    );
  }
  async updateCurrentUserPassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ) {
    return this.mutateState(() =>
      this.userRepo.updateCurrentUserPassword(userId, oldPassword, newPassword),
    );
  }
  async getAuthRole(userId: number) {
    return this.readState(() => this.userRepo.getAuthRole(userId));
  }
  async updateUserRoles(userId: number, roleIds: number[]) {
    return this.mutateState(() =>
      this.userRepo.updateUserRoles(userId, roleIds),
    );
  }
  async findUserIdsByRoleIds(roleIds: number[]) {
    return this.readState(() => this.userRepo.findUserIdsByRoleIds(roleIds));
  }
  async listAllocatedUsers(query: Record<string, string | undefined>) {
    return this.readState(() => this.userRepo.listAllocatedUsers(query));
  }
  async listUnallocatedUsers(query: Record<string, string | undefined>) {
    return this.readState(() => this.userRepo.listUnallocatedUsers(query));
  }
  async cancelAuthUsers(roleId: number, userIds: number[]) {
    return this.mutateState(() =>
      this.userRepo.cancelAuthUsers(roleId, userIds),
    );
  }
  async assignUsersToRole(roleId: number, userIds: number[]) {
    return this.mutateState(() =>
      this.userRepo.assignUsersToRole(roleId, userIds),
    );
  }

  async listRoles(query: Record<string, string | undefined>) {
    return this.readState(() => this.resourceRepo.listRoles(query));
  }
  async getRole(roleId: number) {
    return this.readState(() => this.resourceRepo.getRole(roleId));
  }
  async createRole(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.createRole(data));
  }
  async updateRole(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.updateRole(data));
  }
  async updateRoleDataScope(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.updateRoleDataScope(data));
  }
  async changeRoleStatus(roleId: number, status: "0" | "1") {
    return this.mutateState(() =>
      this.resourceRepo.changeRoleStatus(roleId, status),
    );
  }
  async deleteRoles(roleIds: number[]) {
    return this.mutateState(() => this.resourceRepo.deleteRoles(roleIds));
  }
  async getRoleMenuTree(roleId: number) {
    return this.readState(() => this.resourceRepo.getRoleMenuTree(roleId));
  }
  async listMenus(query: Record<string, string | undefined>) {
    return this.readState(() => this.resourceRepo.listMenus(query));
  }
  async getMenu(menuId: number) {
    return this.readState(() => this.resourceRepo.getMenu(menuId));
  }
  async getMenuTreeSelect() {
    return this.readState(() => this.resourceRepo.getMenuTreeSelect());
  }
  async createMenu(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.createMenu(data));
  }
  async updateMenu(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.updateMenu(data));
  }
  async deleteMenus(menuIds: number[]) {
    return this.mutateState(() => this.resourceRepo.deleteMenus(menuIds));
  }
  async listDepts(query: Record<string, string | undefined>) {
    return this.readState(() => this.resourceRepo.listDepts(query));
  }
  async listDeptExcludeChild(deptId: number) {
    return this.readState(() => this.resourceRepo.listDeptExcludeChild(deptId));
  }
  async getDept(deptId: number) {
    return this.readState(() => this.resourceRepo.getDept(deptId));
  }
  async createDept(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.createDept(data));
  }
  async updateDept(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.updateDept(data));
  }
  async deleteDepts(deptIds: number[]) {
    return this.mutateState(() => this.resourceRepo.deleteDepts(deptIds));
  }
  async getDeptTree(roleId?: number) {
    return this.readState(() => this.resourceRepo.getDeptTree(roleId));
  }
  async getDeptTreeSelect() {
    return this.readState(() => this.resourceRepo.getDeptTreeSelect());
  }
  async listPosts(query: Record<string, string | undefined>) {
    return this.readState(() => this.resourceRepo.listPosts(query));
  }
  async getPost(postId: number) {
    return this.readState(() => this.resourceRepo.getPost(postId));
  }
  async createPost(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.createPost(data));
  }
  async updatePost(data: Record<string, unknown>) {
    return this.mutateState(() => this.resourceRepo.updatePost(data));
  }
  async deletePosts(postIds: number[]) {
    return this.mutateState(() => this.resourceRepo.deletePosts(postIds));
  }

  async listDictTypes(query: Record<string, string | undefined>) {
    return this.readState(() => this.dictConfigRepo.listDictTypes(query));
  }
  async getDictType(dictId: number) {
    return this.readState(() => this.dictConfigRepo.getDictType(dictId));
  }
  async createDictType(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.createDictType(data));
  }
  async updateDictType(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.updateDictType(data));
  }
  async deleteDictTypes(dictIds: number[]) {
    return this.mutateState(() => this.dictConfigRepo.deleteDictTypes(dictIds));
  }
  async listDictTypeOptions() {
    return this.readState(() => this.dictConfigRepo.listDictTypeOptions());
  }
  async listDictData(query: Record<string, string | undefined>) {
    return this.readState(() => this.dictConfigRepo.listDictData(query));
  }
  async getDictData(dictCode: number) {
    return this.readState(() => this.dictConfigRepo.getDictData(dictCode));
  }
  async getDictDataByType(dictType: string) {
    return this.readState(() =>
      this.dictConfigRepo.getDictDataByType(dictType),
    );
  }
  async createDictData(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.createDictData(data));
  }
  async updateDictData(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.updateDictData(data));
  }
  async deleteDictData(dictCodes: number[]) {
    return this.mutateState(() =>
      this.dictConfigRepo.deleteDictData(dictCodes),
    );
  }
  async listConfigs(query: Record<string, string | undefined>) {
    return this.readState(() => this.dictConfigRepo.listConfigs(query));
  }
  async getConfig(configId: number) {
    return this.readState(() => this.dictConfigRepo.getConfig(configId));
  }
  async getConfigByKey(configKey: string) {
    return this.readState(() => this.dictConfigRepo.getConfigByKey(configKey));
  }
  async createConfig(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.createConfig(data));
  }
  async updateConfig(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.updateConfig(data));
  }
  async deleteConfigs(configIds: number[]) {
    return this.mutateState(() => this.dictConfigRepo.deleteConfigs(configIds));
  }
  async listNotices(query: Record<string, string | undefined>) {
    return this.readState(() => this.dictConfigRepo.listNotices(query));
  }
  async getNotice(noticeId: number) {
    return this.readState(() => this.dictConfigRepo.getNotice(noticeId));
  }
  async createNotice(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.createNotice(data));
  }
  async updateNotice(data: Record<string, unknown>) {
    return this.mutateState(() => this.dictConfigRepo.updateNotice(data));
  }
  async deleteNotices(noticeIds: number[]) {
    return this.mutateState(() => this.dictConfigRepo.deleteNotices(noticeIds));
  }

  private async readState<T>(action: StateAction<T>): Promise<T> {
    await this.persistenceRepo.loadRuntimeState();
    return action();
  }

  private async mutateState<T>(action: StateAction<T>): Promise<T> {
    await this.persistenceRepo.loadRuntimeState();
    const result = await action();
    this.persistenceRepo.queuePersistence();
    return result;
  }

  private applyMenuMetadata(routes: RouteNode[]): RouteNode[] {
    const menuByRouteName = new Map(
      this.resourceRepo
        .listMenus({})
        .filter((menu) => menu.routeName && menu.menuType !== "F")
        .map((menu) => [menu.routeName, menu]),
    );

    return this.decorateRoutes(routes, menuByRouteName);
  }

  private decorateRoutes(
    routes: RouteNode[],
    menuByRouteName: Map<string, ManagedMenuRecord>,
  ): RouteNode[] {
    return routes
      .map((route) => this.decorateRoute(route, menuByRouteName))
      .filter((route): route is RouteNode => Boolean(route))
      .sort(compareRoutesByMenuOrder);
  }

  private decorateRoute(
    route: RouteNode,
    menuByRouteName: Map<string, ManagedMenuRecord>,
  ): RouteNode | null {
    const menu = menuByRouteName.get(route.name);
    if (!menu) {
      return null;
    }

    const children = route.children
      ? this.decorateRoutes(route.children, menuByRouteName)
      : undefined;
    const meta = menu
      ? {
          ...(route.meta ?? {}),
          title: menu.menuName,
          icon: menu.icon,
          orderNum: menu.orderNum,
        }
      : route.meta;

    return {
      ...route,
      ...(menu?.visible === "1" || menu?.status === "1"
        ? { hidden: true }
        : {}),
      ...(menu?.query ? { query: menu.query } : {}),
      ...(meta ? { meta } : {}),
      ...(children?.length ? { children } : {}),
    };
  }
}

function compareRoutesByMenuOrder(left: RouteNode, right: RouteNode) {
  const leftOrder = left.meta?.orderNum;
  const rightOrder = right.meta?.orderNum;
  if (typeof leftOrder === "number" && typeof rightOrder === "number") {
    return leftOrder - rightOrder;
  }
  if (typeof leftOrder === "number") {
    return -1;
  }
  if (typeof rightOrder === "number") {
    return 1;
  }
  return 0;
}
