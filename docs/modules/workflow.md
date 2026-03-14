# `workflow` 模块设计

## 模块目标与职责

第一阶段作为“轻量审核域”而不是 BPM 引擎，统一收口当前 `audit_document` 模式下的审核记录、审核状态查询和改单重置逻辑。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/audit`
- `business/src/main/resources/mapper/audit`
- 各单据 XML 中对 `saifute_audit_document` 的联表查询

## 领域对象与核心用例

核心对象：

- `AuditDocument`
- `AuditStatus`
- `DocumentAuditReference`

核心用例：

- 创建审核记录
- 更新审核状态
- 重置审核状态
- 查询单据审核状态
- 校验下游依赖是否允许作废或变更

## Controller 接口草案

- `GET /workflow/audits`
- `POST /workflow/audits`
- `POST /workflow/audits/:id/approve`
- `POST /workflow/audits/:id/reject`
- `POST /workflow/audits/:id/reset`

说明：

- 业务模块不直接访问审核底表，统一通过 `WorkflowService` 协作

## Application 层编排

- `CreateAuditDocumentUseCase`
- `ApproveDocumentUseCase`
- `RejectDocumentUseCase`
- `ResetAuditStatusUseCase`
- `ValidateDownstreamDependencyUseCase`

## Domain 规则与约束

- 第一阶段只兼容当前三态：待审、通过、拒绝
- 单据修改后是否重置审核由业务规则决定，但统一经 `workflow` 执行
- 审核记录是单据的横切投影，不替代业务单据主状态
- 下游依赖校验结果必须明确失败原因

## Infrastructure 设计

- 审核记录 CRUD 可用 Prisma
- 单据列表联表查询可继续使用 raw SQL 或只读 query service
- 可通过领域事件通知 `audit-log` 记录审核操作

## 与其他模块的依赖关系

- 被 `inbound`、`outbound`、`workshop-material` 等单据模块依赖
- 依赖 `rbac` 做审核权限控制
- 依赖 `audit-log` 记录审核操作审计

## 事务边界与一致性要求

- 单据创建与审核记录创建优先保持同事务
- 单据修改触发审核重置时，改单与重置必须同事务提交
- 作废前的下游依赖校验必须发生在命令执行前

## 权限点、数据权限、审计要求

- 审核动作需要显式 `Permissions`
- 审核列表可按单据类型和操作者做数据权限控制
- 审核通过、拒绝、重置都必须记录审计

## 优化后表设计冻结

- 对应核心表：`workflow_audit_document`
- 审核表保存当前有效审核投影，不替代业务单据主状态
- 单据表仅保留 `auditStatusSnapshot` 方便列表查询，真实审核状态以 `workflow` 为准
- `workflow` 不直接建立指向各单据表的多态外键，避免共享核心反向耦合业务模块
- 详细业务流程与字段建议见 `docs/20-wms-business-flow-and-optimized-schema.md`

## 待补测试清单

- 创建审核记录测试
- 审核通过/拒绝测试
- 改单后重置待审测试
- 下游依赖阻止作废测试

## 暂不实现范围

- BPMN
- 多级审批流
- 撤回、加签、转办
