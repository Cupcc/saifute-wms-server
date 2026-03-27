# outbound 域重命名为 customer

## Metadata

- ID: `req-20260322-1354-outbound-customer-rename`
- Status: `confirmed`
- Lifecycle disposition: `retained-completed`
- Owner: `user`
- Related tasks:
  - `docs/tasks/archive/retained-completed/task-20260325-2355-outbound-customer-cutover.md`

## 用户需求

- [x] `outbound` 域在 NestJS 中属于客户收发家族，当前命名不准确，应统一改为 `customer`。
- [x] 同步修改所有相关代码、测试、脚本、Swagger 元数据、模块命名与架构文档，避免残留旧命名。
- [x] 本轮目标是修正命名，不扩大为新的业务语义调整或流程改造。
- [x] 清理 repo-owned `outbound` 兼容层，完成前后端活跃引用对齐。

## 当前进展

- 阶段进度: 已完成 repo 内 `outbound` -> `customer` cutover，并通过 reviewer 复核。
- 当前状态: 后端公开路由与权限码已切到 `customer`；`package.json` 中 `migration:outbound*` 兼容命令别名已删除；活跃架构文档已同步；AI/context/form 相关 `/out/*` 引用与无路由支撑的 `web/src/views/out/**`、`web/src/api/out/**` 死代码簇已清理。
- 阻塞项: None. 若生产环境仍保留 DB-backed RBAC / menu 数据中的旧 `outbound:*` 或旧页面 path / component，需要部署时单独切换，但不构成当前 repo slice 的 blocker。
- 下一步: None（已归档）。

## 待确认

- None
