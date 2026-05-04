# 任务中心

三层结构：`TASK_CENTER.md`（看板）、`README.md`（规则）、`task-*.md`（执行记录）。

需求侧看板：`docs/requirements/REQUIREMENT_CENTER.md`。

需求真源统一维护在 `docs/requirements/domain/*.md`，不使用切片 `req-*.md`。task 的 `Related requirement` 指向对应 domain 能力（如 `docs/requirements/domain/system-management-module.md (F4)`）。

## 生命周期分类

- `active`：仍在规划、编码、review、修复或续接中。
- `retained-completed`：已完成，保留为稳定基线或 provenance。
- `cleanup-candidate`：候选清理，须用户明确确认后才能删除。

## 归档目录

- `docs/tasks/archive/retained-completed/`：已完成但保留的 task 文档。
- `docs/tasks/archive/cleanup-candidate/`：候选清理的 task 文档。

根目录只保留 `active` task。task 完成后迁入 `archive/`。

## 活跃任务

| Task 文档 | 状态 | 说明 |
| --- | --- | --- |
| `task-20260501-construct-correct-price-layer-replay.md` | `planned` | 价格层 replay 已进入 configured-target dry-run 修复阶段：无候选但有正成本的车间退料已按独立来源留痕处理，当前仍被 `51` 个 blocker 正确拦截，剩余 `13` 条退货 / 退料缺来源、`14` 条消费来源不足、`8` 条重放负库存、`13` 条价格层余额差异、`2` 条已关联但原单不可释放和 `1` 条延期 stock-in offset。 |
| `task-20260417-1702-material-category-single-level-system-unification.md` | `accepted` | 在 `monthly-reporting F9` 单层分类基线上，把全系统 `material-category` 真源统一为单层分类；`MaterialCategory.parentId` 已从 Prisma schema 与相关合同删除，`master-data` 文档/API/UI、inbound/sales 写侧快照与 focused validation 已完成并收口通过。 |
| `task-20260417-0930-monthly-reporting-material-category-single-level-alignment.md` | `accepted` | 月度对账 `F9` 物料分类视角 requirement change：取消父级汇总 / 树形路径语义，改为仅按单据行稳定叶子分类快照单层聚合；shared truth、`reporting`、月报前端、导出与 focused validation 已完成，父级手动 review 收口通过。 |
| `task-20260411-1105-monthly-reporting-domain-first-redesign.md` | `reviewing` | 在 accepted `monthly-reporting Phase 1` 基线上，已完成月度对账领域优先重切实现：先回答仓库总入 / 总出 / 净发生，再按入库、车间、销售、研发项目、RD小仓展开操作、销售项目与主仓到RD交接汇总，当前进入 review / acceptance 收口。 |
| `task-20260414-1418-rd-sub-project-attribution-and-reporting-alignment.md` | `planned` | 围绕新确认规则收口 `RD_SUB` 项目化归属、主仓到小仓交接项目绑定、库存事实 project attribution、月报 viewpoint 重算，以及 local/test 冲突数据可受控清理重注的实施与 QA 计划。 |
| `task-20260407-0929-workshop-material-f1-f3-autonomous-delivery.md` | `planned` | 车间物料 `F1/F2/F3` 端到端自治交付：沿用统一后端家族模型与三个既有前端页面，补齐改单补偿、主仓库存 / 来源追溯、前端 API 接通与 full acceptance；明确排除 `F4` 报表 / 净耗用 / 导出。 |

## 已完成（`archive/retained-completed/`）

| Task 文档 | 状态 | 说明 |
| --- | --- | --- |
| `archive/retained-completed/task-20260429-1342-openapi-contract-governance.md` | `accepted` | OpenAPI / Swagger 契约治理 Phase 0 + Phase 1 已完成：新增可复用 audit 基线脚本，移除 Swagger 公开接口 / no-envelope 手工 path 表，改由 `@Public()` / `@SkipResponseEnvelope()` metadata 驱动，补齐上传 multipart、下载 / 导出 binary response 和统一错误响应 schema；响应 DTO、summary、query/path 描述与 CI 阈值留到后续阶段。 |
| `archive/retained-completed/task-20260411-0301-monthly-reporting-phase1-delivery.md` | `accepted` | 月度报表 `Phase 1` 已完成实现、review fix loop、RBAC seed 漂移修复、focused 自动化验证与 live full acceptance；`F1-F5` 现已作为 accepted 基线归档，`F6/F7` 继续保留后续阶段。 |
| `archive/retained-completed/task-20260416-1017-monthly-reporting-material-category-view.md` | `accepted` | 月度对账 `F9` 物料分类视角已完成实现、review fix loop、migration batching hardening、focused 自动化验证、live API / browser acceptance 与归档收口；当前 accepted baseline 覆盖 `验收入库 / 生产入库 / 销售出库 / 销售退货`。 |
| `archive/retained-completed/task-20260410-1700-sales-project-phase1-phase2-delivery.md` | `accepted` | 销售项目 `Phase 1/2` 已完成实现、local review fix loop、focused 自动化验证、`agent-browser` full acceptance 与归档收口；`F5` 项目分配 / 预留继续保留为后续阶段能力。 |
| `archive/retained-completed/task-20260409-0056-rd-project-phase1-phase2-delivery.md` | `accepted` | `rd-project` `Phase 1/2` 已完成实现、review、full acceptance 与归档收口；当前研发项目真源以 `docs/requirements/domain/rd-project-management.md` 为准，销售项目真源独立维护在 `docs/requirements/domain/sales-project-management.md`。 |
| `archive/retained-completed/task-20260407-0033-approval-rename-two-phase-plan.md` | `accepted` | `approval` 语义重命名与最终清理已完成并归档：代码/API/权限/模块统一收口到 `approval`，target DB 只保留 `approval_document` 真源，业务审核 `audit` 兼容层已移除。 |
| `archive/retained-completed/task-20260408-1842-master-data-f6-workshop-runtime-compatibility.md` | `accepted` | `master-data` `F6` 车间管理回归修复已完成：运行时合同恢复到 accepted `workshopCode + workshopName` 基线，review clean，targeted `F6/F8` QA run 已冻结。 |
| `archive/retained-completed/task-20260406-0134-master-data-phase1-browser-verification-fix-loop.md` | `accepted` | `master-data` `Phase 1` `F1`~`F8` 的继续浏览器实测、缺陷修复回环、review 与 acceptance evidence 更新已完成；`F3/F5/F6/F7/F8` 新证据已冻结到 `spec/cases/run`，并保留 `customer/material/personnel` pre-dirty 页面既有修改。 |
| `archive/retained-completed/task-20260406-0106-master-data-material-category-alignment.md` | `accepted` | `master-data` 物料分类前后端真源对齐、F1 页面补齐与 F2 浏览器失败修复已完成；focused 自动化验证与 `agent-browser` targeted browser QA 均通过。 |
| `archive/retained-completed/task-20260405-2136-price-layer-outbound-and-inbound-price-correction.md` | `accepted` | `sales` `F2/F3` 与 `inbound` `F8` 的跨域价格层出库 / 入库调价切片已完成实现、review 修复、light acceptance 与归档收口；自动化 gate 为 `4` suites / `64` tests 通过。 |
| `archive/retained-completed/task-20260404-1315-inbound-phase2-fifo-costing.md` | `accepted` | `inbound-business-module` `Phase 2`（`F4`/`F5`）已完成实现、review、full acceptance 与归档收口；FIFO、来源成本追溯与 RD 成本桥接已作为 accepted 基线保留。 |
| `archive/retained-completed/task-20260402-1802-master-data-phase1-completion.md` | `accepted` | `master-data` `Phase 1`（`F1`~`F8`）已完成实现、review、full acceptance 与归档收口；`F4` 供应商 CRUD 继续作为上游已验收基线保留。 |
| `archive/retained-completed/task-20260402-1758-master-data-f4-supplier-crud.md` | `accepted` | `master-data` `F4` 供应商 CRUD 已通过自动化验证与 `agent-browser` full acceptance，并已完成归档收口。 |

## 清理候选（`archive/cleanup-candidate/`）

| Task 文档 | 状态 | 说明 |
| --- | --- | --- |
| `-` | `-` | 当前无 cleanup-candidate task。 |
