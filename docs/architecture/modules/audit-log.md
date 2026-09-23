# `audit-log` 模块设计

## 模块目标与职责

负责登录日志、操作日志和统一审计字段处理，兼容原系统 `@Log + AOP + 异步落库` 的行为语义。


## 领域对象与核心用例

核心对象：

- `OperLogRecord`
- `LoginLogRecord`
- `AuditActor`

核心用例：

- 记录登录成功、失败、登出、验证码错误、黑名单拒绝
- 记录声明式操作日志
- 统一填充 `createBy/createTime/updateBy/updateTime`
- 脱敏敏感参数、过滤大对象与文件对象

## Controller 接口草案

- `GET /audit/login-logs`
- `GET /audit/oper-logs`
- `DELETE /audit/login-logs`
- `DELETE /audit/oper-logs`

## Application 层编排

- `WriteLoginLogUseCase`
- `WriteOperLogUseCase`
- `FillAuditFieldsPolicy`
- `ListAuditLogsUseCase`

实现建议：

- 登录日志通过认证事件异步写入
- 操作日志通过 `AuditLogInterceptor` 配合 `@AuditLog()` 装饰器写入

## Domain 规则与约束

- 不是所有接口都记录操作日志，只有显式声明的接口才记录
- 成功和异常路径都要记录
- 密码、token、文件流、超大响应体必须脱敏或过滤
- 审计日志失败不能阻断主业务

## Infrastructure 设计

- 日志表结构延续现有 `sys_oper_log`、`sys_logininfor`
- 通过事件队列或异步任务写库
- 使用拦截器采集 URL、方法、耗时、请求参数、响应摘要、异常信息

## 与其他模块的依赖关系

- 依赖 `auth`、`session` 的认证事件
- 被所有模块复用以记录操作审计

## 事务边界与一致性要求

- 审计写入默认异步，不纳入主事务
- 关键业务即使日志写入失败也不能回滚主事务

## 与单据变更历史的边界

- `sys_oper_log` 是接口操作日志，负责回答“谁在什么时间调用了哪个接口、结果如何”，保留现有敏感字段脱敏、深度和长度保护；车间领料单的 create / update / void 通过 `@AuditLog` 显式接入。
- 领料单完整前后快照、逐字段差异、稳定明细映射和库存流水关联属于业务一致性数据，写入 `document_change_log` 及其关联表，不依赖操作日志的嵌套参数序列化。
- 单据变更历史在改单事务内同步写入；若历史写入失败，改单与库存副作用一并回滚。操作日志仍按成功 / 失败路径异步记录，不能用其替代业务历史。
- 两类记录共享 request ID、操作账号、时间和 IP 以便联查，但不得把“领料人 / 经办人”误当成实际操作账号。

## 权限点、数据权限、审计要求

- 日志查询和清理接口需要系统权限
- 日志列表通常受数据权限限制较弱，可按管理员权限控制
- 该模块本身是审计底座，必须保证记录不可被普通用户伪造

## 待补测试清单

- 登录成功/失败日志测试
- 声明式操作日志测试
- 敏感字段脱敏测试
- 日志异常不影响主流程测试

## 暂不实现范围

- 审计日志归档
- 外部 SIEM 对接
