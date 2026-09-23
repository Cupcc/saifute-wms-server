# `session` 模块设计

## 模块目标与职责

负责“JWT 票据 + Redis 会话”的登录态管理，包括会话创建、恢复、滑动续期、在线用户查询、强制下线和注销失效。


## 领域对象与核心用例

核心对象：

- `UserSession`
- `SessionClaims`
- `OnlineSessionView`

核心用例：

- 创建会话并签发 token
- 从 token 恢复 Redis 会话
- 根据剩余有效期执行滑动续期
- 查询在线用户列表
- 强制下线指定用户会话
- 注销时删除 Redis 会话

## Controller 接口草案

- `GET /sessions/online`
- `DELETE /sessions/:sessionId`

说明：

- 业务登录入口仍由 `auth` 暴露
- 在线用户管理接口保留系统管理能力

## Application 层编排

- `CreateSessionUseCase`
- `ResolveSessionUseCase`
- `RefreshSessionUseCase`
- `ListOnlineSessionsUseCase`
- `ForceLogoutUseCase`

请求链路：

1. `JwtAuthGuard` 解析 Bearer token
2. `ResolveSessionUseCase` 从 Redis 读取 `UserSession`
3. 如果临近过期，调用 `RefreshSessionUseCase`
4. 将当前会话挂到请求上下文

## Domain 规则与约束

- JWT 只作为会话索引，不作为用户真实状态来源
- Redis 中的会话对象必须包含用户、角色、权限、部门、登录时间、设备信息
- 删除 Redis 会话即视为立即失效
- 会话刷新不能改变原始登录身份

## Infrastructure 设计

- Redis 访问边界：`session` 只通过 `shared/redis` 提供的 `RedisStoreService` 读写会话，不自行创建客户端连接
- Redis Key：`login_tokens:{sid}`
- JWT Secret、Redis 连接参数、`SESSION_TTL_SECONDS`、`SESSION_MAX_TTL_SECONDS`、`SESSION_REFRESH_THRESHOLD_SECONDS` 统一放在 `shared/config` / `AppConfigService`
- 会话序列化对象需要版本字段，避免后续结构漂移
- 在线用户列表优先基于 `RedisStoreService.listByPrefix()` 构建；真实 Redis 实现必须使用增量扫描，不使用 `KEYS`
- 真实 Redis 连接生命周期由 `RedisModule` 管理；应用启动阶段若 Redis 连接或探测失败，服务直接启动失败，不允许会话层以内存回退继续工作

## 与其他模块的依赖关系

- 被 `auth` 依赖：创建、销毁会话
- 被 `rbac` 间接依赖：从会话读取权限快照
- 向 `audit-log` 发布强退、过期、注销事件
- 依赖 `shared/redis`：会话真源、TTL、在线会话扫描
- 依赖 `shared/config`：JWT、会话 TTL 与续期阈值配置

## 事务边界与一致性要求

- 创建会话时，Redis 写入成功后才返回 token
- 强退和注销的判定依据是 Redis 删除成功
- 续期允许最终一致，但不能越过最大存活时间约束
- Redis 的剩余 TTL 读取结果必须先适配为仓库约定，再交给 `session` 判断是否续期或失效

## 权限点、数据权限、审计要求

- 在线用户查询和强退需要系统权限
- 会话接口不参与数据权限
- 强退、注销、续期异常都应留下审计线索

## 待补测试清单

- token 恢复会话测试
- Redis 会话缺失时鉴权失败测试
- 滑动续期测试
- 强退后立即失效测试
- 在线用户列表查询测试

## 暂不实现范围

- 多端会话互斥策略
- 分布式会话广播
- 设备指纹风控
