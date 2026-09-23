# `rbac` 模块设计

## 模块目标与职责

负责用户、角色、部门、菜单、权限字符串、角色菜单关系、用户角色关系和数据权限策略。该模块还负责向前端输出路由树，并向守卫输出权限判定结果，是 `system-management` 主题下授权真源的统一收口点。

## 当前实现与目标范围

**当前实现**：

- `src/modules/rbac` 已同时承接 `RbacService` 与 `SystemManagementService`，现有 `/system/user`、`/system/role`、`/system/dept`、`/system/menu`、`/system/post`、`/system/dict`、`/system/config`、`/system/notice` 控制器都共置在该模块内。
- 部门树、角色数据权限、菜单权限字符串、当前用户路由树和会话用户快照都已由 `rbac` 运行态仓储输出；运行态快照存放在 Redis，规范化 MySQL 表仍是持久化真源。
- 这种共置说明当前实现把 `system-management` 的大部分管理面放在 `rbac` 中，并不意味着 `岗位 / 字典 / 参数 / 通知` 都应成为 RBAC 长期核心真源。

**目标范围**：

- `rbac` 长期只负责用户、角色、部门、菜单、权限字符串、角色菜单关系、数据权限与路由树这些授权真源。
- `system-management` 主题可以继续复用 `rbac` 的管理面与仓储实现，但不能在前后端额外复制第二套权限 / 路由 / 数据权限真源。
- `岗位 / 字典 / 参数 / 通知` 即使物理上继续与 `rbac` 共置实现，也应被视为 `system-management` 主题下的平台辅助对象，而不是授权真源的中心定义。


## 领域对象与核心用例

核心对象：

- `User`
- `Role`
- `Department`
- `Menu`
- `PermissionGrant`
- `DataScopePolicy`

核心用例：

- 查询用户角色与权限集
- 构建当前用户菜单树和前端路由
- 判断接口权限字符串是否命中
- 解析并应用数据权限策略
- 维护用户、角色、部门、菜单及授权关系
- 向 `system-management` 管理面提供部门树与角色数据范围选择能力

## Controller 接口草案

- `GET /rbac/routes/current`
- `GET /rbac/permissions/current`
- `POST /rbac/users/:id/roles`
- `POST /rbac/roles/:id/menus`
- `POST /rbac/roles/:id/data-scope`

说明：

- 当前代码中的 `/system/*` 管理控制器仍共置在 `src/modules/rbac`；它们属于 `system-management` 管理面，不改变 `rbac` 作为授权真源的边界。
- `rbac` 对外暴露的是“谁可见什么、谁拥有什么权限、查询应套什么数据范围”的统一判定能力。

## Application 层编排

- `GetUserPermissionSetUseCase`
- `BuildCurrentRoutesUseCase`
- `AssignUserRolesUseCase`
- `AssignRoleMenusUseCase`
- `ResolveDataScopeUseCase`
- `MaintainDepartmentTreeUseCase`

`ResolveDataScopeUseCase` 输出统一查询条件对象，由业务模块查询层消费，而不是在 Guard 中直接拼 SQL。

## Domain 规则与约束

- 权限模型以权限字符串为准，不以角色码直接代替接口权限
- 超级管理员语义保留，默认 `userId=1` 拥有全量权限
- 数据权限至少兼容：全部、自定义部门、本部门、本部门及子部门、仅本人
- 部门树是组织归属与数据权限边界，不是库存范围或 RD 固定范围的替身
- 当数据权限未命中时，默认返回空结果，不得放宽
- `consoleMode` 只影响壳层视角；固定 `stockScope / workshopScope` 仍属于独立业务范围约束，不由 `rbac` 偷换语义

## Infrastructure 设计

- 用户、角色、部门、菜单基础 CRUD 持久化使用 Prisma，运行态通过 Redis `rbac:system-management:state` 快照读取
- Redis 快照包含规范化表版本摘要；检测到 MySQL 源版本变化时，`rbac` 从规范化表重建快照，避免进程内状态滞后
- 菜单树、权限汇总、角色部门关系、数据权限联查优先 raw SQL
- `@Permissions()` + `PermissionsGuard` 取代 `@PreAuthorize`
- `@DataScope()` 只声明策略，真正 where 条件由 `DataScopePolicyService` 生成
- 角色、用户、部门等影响授权结果的变更需要向 `system-management` / `session` 提供会话失效联动点

## 与其他模块的依赖关系

- 被 `auth` 依赖：登录时加载用户快照
- 被 `session` 依赖：写入会话权限快照
- 被 `system-management` 依赖：承接用户 / 角色 / 部门 / 菜单管理面的授权真源
- 被所有业务模块依赖：接口权限与数据权限策略

## 事务边界与一致性要求

- 用户角色、角色菜单、角色部门范围、部门树变更必须在同一数据库事务内提交
- 权限变更后允许已有会话权限快照短暂滞后，但后台应提供强退或刷新机制

## 权限点、数据权限、审计要求

- 系统管理接口全部需要明确 `Permissions`
- 数据权限仅作用于查询接口，不直接作用于命令接口
- 用户、角色、菜单、部门、授权关系的变更必须记录操作审计

## 待补测试清单

- 权限字符串判定测试
- 超级管理员放行测试
- 路由树过滤测试
- 部门树与角色部门范围测试
- 五类数据权限查询测试
- 角色菜单变更后的会话一致性测试

## 暂不实现范围

- 组织机构重构
- 更细粒度字段级权限
- ABAC
