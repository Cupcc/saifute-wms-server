# outbound → customer 域重命名

关联需求: `docs/requirements/archive/retained-completed/req-20260322-1354-outbound-customer-rename.md`
关联任务: `docs/tasks/archive/retained-completed/task-20260325-2355-outbound-customer-cutover.md`
阶段: 已归档
创建: 2026-03-22
最后更新: 2026-03-26

## 当前状况

repo 内 `outbound` 兼容层已清理完成：NestJS `customer` 控制器对外公开路由与权限前缀已统一，`migration:outbound*` 命令别名已移除，AI/context/form 相关 `/out/*` 引用已同步删除。

经代码检索确认，`web/src/views/out/**` 与 `web/src/api/out/**` 已无路由、菜单或组件引用，只构成互相依赖的死代码簇，因此本轮已直接删除而不是继续迁移。当前工作流保留为 cutover 结果与归档说明入口。

## 待决策项

当前无待决策项。

## 背景与上下文

本工作流只处理 repo-owned 命名与兼容层清理，不扩大为业务语义改造。真实“出库/销售退货”业务概念仍保留在 `CustomerStockOrderType.OUTBOUND`、报表统计字段和历史迁移 provenance 中。

若生产环境 DB 仍持有旧 `outbound:*` 权限码、旧菜单 path 或旧 component 字段，则需由部署方按环境数据单独切换；仓库内未发现可维护的 seed / migration 真源。

## 关键里程碑

| 时间 | 事件 |
|------|------|
| 2026-03-22 | requirement 确认：NestJS `outbound` 域统一更正为 `customer` |
| 2026-03-25 | 用户确认取消兼容层，要求前后端完全适配 |
| 2026-03-26 | 完成 backend route/permission cutover、migration alias 清理、AI/context/form 清理与 dead `web/src/views/out/**` / `web/src/api/out/**` 删除 |
| 2026-03-26 | reviewer 复核通过，工作流归档 |

## 本文件夹资产索引

| 文件 | 用途 |
|------|------|
| `README.md` | 本工作流归档说明与 cutover 结果摘要 |
