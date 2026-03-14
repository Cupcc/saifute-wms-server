# `auth` 模块设计

## 模块目标与职责

负责登录、登出、验证码、登录前置校验、密码重试限制和认证事件发布。`auth` 只处理认证入口，不直接承载 Redis 会话存储细节。

## 原 Java 来源与映射范围

- `ruoyi-admin/.../SysLoginController.java`
- `ruoyi-admin/.../CaptchaController.java`
- `ruoyi-framework/.../SysLoginService.java`
- `ruoyi-framework/.../UserDetailsServiceImpl.java`
- `ruoyi-framework/.../SysPasswordService.java`
- `ruoyi-framework/.../SecurityConfig.java`

映射规则：

- Java `SysLoginController + CaptchaController + SysLoginService` -> NestJS `auth`
- 用户快照与会话恢复职责下沉到 `session`
- 菜单、权限、路由树查询下沉到 `rbac`

## 领域对象与核心用例

核心对象：

- `CaptchaTicket`
- `LoginAttempt`
- `AuthenticatedPrincipal`

核心用例：

- 生成验证码并一次性消费
- 用户名密码登录
- 登录前校验用户名长度、IP 黑名单、用户删除/停用状态
- 密码错误累计锁定与成功后重置
- 登出并发布认证审计事件

## Controller 接口草案

- `GET /auth/captcha`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/routes`

说明：

- `/auth/me` 返回当前用户、角色、权限摘要
- `/auth/routes` 实际委托 `rbac` 提供按用户过滤后的菜单树

## Application 层编排

- `GenerateCaptchaUseCase`
- `LoginUseCase`
- `LogoutUseCase`
- `GetCurrentUserUseCase`

`LoginUseCase` 编排顺序：

1. 校验验证码
2. 执行登录前置校验
3. 调用 `rbac`/用户查询服务加载用户快照
4. 校验密码重试策略
5. 调用 `session` 创建会话并签发 JWT
6. 发布登录成功或失败事件

## Domain 规则与约束

- 验证码必须一次性消费，校验后立即删除
- 登录失败次数达到阈值后锁定指定时间
- 删除态、停用态用户禁止登录
- 登录成功必须清理失败计数
- 不允许 `auth` 直接写菜单、角色、权限数据

## Infrastructure 设计

- Redis：保存验证码和密码错误计数
- JWT：只放最小声明，如 `sub`、`sid`、`username`
- Password Hash：兼容现有密码校验策略
- Event Bus：发布 `auth.login.succeeded`、`auth.login.failed`、`auth.logout`

## 与其他模块的依赖关系

- 依赖 `session`：创建/销毁会话
- 依赖 `rbac`：加载用户、角色、权限、路由树
- 依赖 `audit-log`：通过事件记录登录日志

## 事务边界与一致性要求

- 登录流程不使用数据库事务，但 Redis 写入和 JWT 签发必须视为同一成功单元
- 登录失败日志与失败计数允许最终一致

## 权限点、数据权限、审计要求

- 登录、验证码、登出接口匿名可访问
- `GET /auth/me` 需要有效会话
- 登录成功、失败、登出都必须产生审计事件
- `auth` 本身不处理数据权限

## 待补测试清单

- 验证码一次性消费测试
- 密码错误锁定与解锁测试
- 停用用户登录失败测试
- 登录成功后可读取当前用户与路由测试
- 登出后 token 立即失效测试

## 暂不实现范围

- 注册
- 第三方 OAuth
- MFA
- SSO
