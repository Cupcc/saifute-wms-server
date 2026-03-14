# `rbac` 模块设计

## 模块目标与职责

负责用户、角色、菜单、权限字符串、角色菜单关系、用户角色关系和数据权限策略。该模块还负责向前端输出路由树，并向守卫输出权限判定结果。

## 原 Java 来源与映射范围

- `ruoyi-framework/.../PermissionService.java`
- `ruoyi-framework/.../SysPermissionService.java`
- `ruoyi-framework/.../PermissionContextHolder.java`
- `ruoyi-framework/.../DataScopeAspect.java`
- `ruoyi-common/.../annotation/DataScope.java`
- `ruoyi-system/.../SysUserServiceImpl.java`
- `ruoyi-system/.../SysRoleServiceImpl.java`
- `ruoyi-system/.../SysMenuServiceImpl.java`
- `ruoyi-system/resources/mapper/system/*.xml`

## 领域对象与核心用例

核心对象：

- `User`
- `Role`
- `Menu`
- `PermissionGrant`
- `DataScopePolicy`

核心用例：

- 查询用户角色与权限集
- 构建当前用户菜单树和前端路由
- 判断接口权限字符串是否命中
- 解析并应用数据权限策略
- 维护用户、角色、菜单、授权关系

## Controller 接口草案

- `GET /rbac/users`
- `GET /rbac/roles`
- `GET /rbac/menus/tree`
- `GET /rbac/routes/current`
- `POST /rbac/users/:id/roles`
- `POST /rbac/roles/:id/menus`

说明：

- 具体系统管理 CRUD 可后续拆子控制器，但权限判定服务统一在 `rbac`

## Application 层编排

- `GetUserPermissionSetUseCase`
- `BuildCurrentRoutesUseCase`
- `AssignUserRolesUseCase`
- `AssignRoleMenusUseCase`
- `ResolveDataScopeUseCase`

`ResolveDataScopeUseCase` 输出统一查询条件对象，由业务模块查询层消费，而不是在 Guard 中直接拼 SQL。

## Domain 规则与约束

- 权限模型以权限字符串为准，不以角色码直接代替接口权限
- 超级管理员语义保留，默认 `userId=1` 拥有全量权限
- 数据权限至少兼容：全部、自定义部门、本部门、本部门及子部门、仅本人
- 当数据权限未命中时，默认返回空结果，不得放宽

## Infrastructure 设计

- 用户、角色、菜单基础 CRUD 可用 Prisma
- 菜单树、权限汇总、数据权限联查优先 raw SQL
- `@Permissions()` + `PermissionsGuard` 取代 `@PreAuthorize`
- `@DataScope()` 只声明策略，真正 where 条件由 `DataScopePolicyService` 生成

## 与其他模块的依赖关系

- 被 `auth` 依赖：登录时加载用户快照
- 被 `session` 依赖：写入会话权限快照
- 被所有业务模块依赖：接口权限与数据权限策略

## 事务边界与一致性要求

- 用户角色、角色菜单变更必须在同一数据库事务内提交
- 权限变更后允许已有会话权限快照短暂滞后，但后台应提供强退或刷新机制

## 权限点、数据权限、审计要求

- 系统管理接口全部需要明确 `Permissions`
- 数据权限仅作用于查询接口，不直接作用于命令接口
- 用户、角色、菜单、授权关系的变更必须记录操作审计

## 待补测试清单

- 权限字符串判定测试
- 超级管理员放行测试
- 路由树过滤测试
- 五类数据权限查询测试
- 角色菜单变更后的会话一致性测试

## 暂不实现范围

- 组织机构重构
- 更细粒度字段级权限
- ABAC
