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
| `task-20260407-0929-workshop-material-f1-f3-autonomous-delivery.md` | `planned` | 车间物料 `F1/F2/F3` 端到端自治交付：沿用统一后端家族模型与三个既有前端页面，补齐改单补偿、主仓库存 / 来源追溯、前端 API 接通与 full acceptance；明确排除 `F4` 报表 / 净耗用 / 导出。 |

## 已完成（`archive/retained-completed/`）

| Task 文档 | 状态 | 说明 |
| --- | --- | --- |
| `archive/retained-completed/task-20260407-0033-approval-rename-two-phase-plan.md` | `accepted` | `approval` 语义重命名与最终清理已完成并归档：代码/API/权限/模块统一收口到 `approval`，target DB 只保留 `approval_document` 真源，业务审核 `audit` 兼容层已移除。 |
| `archive/retained-completed/task-20260408-1842-master-data-f6-workshop-runtime-compatibility.md` | `accepted` | `master-data` `F6` 车间管理回归修复已完成：运行时合同恢复到 accepted `workshopCode + workshopName` 基线，review clean，targeted `F6/F8` QA run 已冻结。 |
| `archive/retained-completed/task-20260406-0134-master-data-phase1-browser-verification-fix-loop.md` | `accepted` | `master-data` `Phase 1` `F1`~`F8` 的继续浏览器实测、缺陷修复回环、review 与 acceptance evidence 更新已完成；`F3/F5/F6/F7/F8` 新证据已冻结到 `spec/cases/run`，并保留 `customer/material/personnel` pre-dirty 页面既有修改。 |
| `archive/retained-completed/task-20260406-0106-master-data-material-category-alignment.md` | `accepted` | `master-data` 物料分类前后端真源对齐、F1 页面补齐与 F2 浏览器失败修复已完成；focused 自动化验证与 `agent-browser` targeted browser QA 均通过。 |
| `archive/retained-completed/task-20260405-2136-price-layer-outbound-and-inbound-price-correction.md` | `accepted` | `customer` `F2/F3` 与 `inbound` `F8` 的跨域价格层出库 / 入库调价切片已完成实现、review 修复、light acceptance 与归档收口；自动化 gate 为 `4` suites / `64` tests 通过。 |
| `archive/retained-completed/task-20260404-1315-inbound-phase2-fifo-costing.md` | `accepted` | `inbound-business-module` `Phase 2`（`F4`/`F5`）已完成实现、review、full acceptance 与归档收口；FIFO、来源成本追溯与 RD 成本桥接已作为 accepted 基线保留。 |
| `archive/retained-completed/task-20260402-1802-master-data-phase1-completion.md` | `accepted` | `master-data` `Phase 1`（`F1`~`F8`）已完成实现、review、full acceptance 与归档收口；`F4` 供应商 CRUD 继续作为上游已验收基线保留。 |
| `archive/retained-completed/task-20260402-1758-master-data-f4-supplier-crud.md` | `accepted` | `master-data` `F4` 供应商 CRUD 已通过自动化验证与 `agent-browser` full acceptance，并已完成归档收口。 |

## 清理候选（`archive/cleanup-candidate/`）

| Task 文档 | 状态 | 说明 |
| --- | --- | --- |
| `-` | `-` | 当前无 cleanup-candidate task。 |
