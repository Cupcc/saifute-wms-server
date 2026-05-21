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
| `task-20260515-1626-sales-project-legacy-admission-split-repair.md` | `in-progress` | 历史销售项目物料验收 / 占用拆分修复：旧过度生成 `YS-PROJ-PRJ-LEGACY-*` 单据 `21` 张 / `675` 行已删除，accepted-only 项目验收入库现为 `148` 张 / `501` 行，最新 accepted-inbound dry-run 为 `blockers=[]`、`wouldCreateOrders=0`、`wouldCreateLines=0`，`inventory-replay:validate` 为 `validationIssues=[]`；后续继续 `255` 行未验收项目占用 / 出库候选模型、一键出库实时校验，以及 post-repair audit gate 刷新。 |
| `task-20260513-1605-sales-project-live-forward-repair.md` | `planned` | 正式库在线前向修复任务：把 2026-05-11 误写入 `rd_project` 的 `21` 条 legacy 销售项目迁正到 `sales_project`，保留上线后新增的 `stock_in_order` / `sales_stock_order` 真源，先做 shadow rehearsal，再在维护窗口内只重建 `inventory_balance` / `inventory_log` / `inventory_source_usage`；禁止 full reset 或旧库覆盖 live target DB。 |
| `task-20260509-full-legacy-import-reset-and-replay.md` | `replay-executed-validated` | 2026-05-11 已按当前 `.env.dev` 重新执行 `LEGACY_DATABASE_URL` -> `DATABASE_URL` 全量导入到目标库 snake_case schema：已 seed `stock_scope`、初始化 staging、导入主数据与业务单据、补齐月报物料分类快照，并完成 `inventory-replay:dry-run -> return-source-links:execute -> dry-run -> execute -> validate`；目标库名以 `DATABASE_URL` 为准；已补充并执行 4 个仓库管理员系统账号迁移入口；当前 replay blocker 为 0，validate 仅剩 `420` 个最终负库存盘点 warning。 |
| `task-20260508-inbound-supplier-return.md` | `implemented` | 入库管理新增“退给厂家 / 供应商退货”切片：复用 `stock_in_order` 家族承载退货单，新增来源绑定的 `SUPPLIER_RETURN_OUT` 库存扣减与作废释放回滚；验收单页保留退厂发起和可退来源预览，入库管理二级页面新增 `退货单` / `退货单明细` 用于列表、明细和作废；报表已按入库域 OUT 纳入；自动化验证已通过，目标库 enum SQL 已应用，受控 live API / DB trace 已通过，待补新页面 browser acceptance。 |
| `task-20260417-1702-material-category-single-level-system-unification.md` | `accepted` | 在 `monthly-reporting F9` 单层分类基线上，把全系统 `material-category` 真源统一为单层分类；`MaterialCategory.parentId` 已从 Prisma schema 与相关合同删除，`master-data` 文档/API/UI、inbound/sales 写侧快照与 focused validation 已完成并收口通过。 |
| `task-20260417-0930-monthly-reporting-material-category-single-level-alignment.md` | `accepted` | 月度对账 `F9` 物料分类视角 requirement change：取消父级汇总 / 树形路径语义，改为仅按单据行稳定叶子分类快照单层聚合；shared truth、`reporting`、月报前端、导出与 focused validation 已完成，父级手动 review 收口通过。 |
| `task-20260411-1105-monthly-reporting-domain-first-redesign.md` | `reviewing` | 在 accepted `monthly-reporting Phase 1` 基线上，已完成月度对账领域优先重切实现：先回答仓库总入 / 总出 / 净发生，再按入库、车间、销售、研发项目、RD小仓展开操作、销售项目与主仓到RD交接汇总，当前进入 review / acceptance 收口。 |
| `task-20260414-1418-rd-sub-project-attribution-and-reporting-alignment.md` | `planned` | 围绕新确认规则收口 `RD_SUB` 项目化归属、主仓到小仓交接项目绑定、库存事实 project attribution、月报 viewpoint 重算，以及 local/test 冲突数据可受控清理重注的实施与 QA 计划。 |
| `task-20260407-0929-workshop-material-f1-f3-autonomous-delivery.md` | `planned` | 车间物料 `F1/F2/F3` 端到端自治交付：沿用统一后端家族模型与三个既有前端页面，补齐改单补偿、主仓库存 / 来源追溯、前端 API 接通与 full acceptance；明确排除 `F4` 报表 / 净耗用 / 导出。 |
| `analysis-20260519-monthly-reporting-material-category-abnormal-documents.md` | `implemented` | 物料分类月报异常列处理：业务确认补录和跨月退回都按业务日期归属月份，不再作为异常展示；已移除物料分类视角页面 / 导出中的 `异常单据数`、`异常标识` 和异常筛选；当前月报真源也不再要求普通月度对账保留异常 / 纠偏展示。 |
| `analysis-20260518-project-pause-decision-report.md` | `draft` | 项目暂停 / 继续决策报告：面向管理层说明当前不是单纯开发延期，而是历史数据核验、库存来源链修复、月报性能收口共同构成的决策问题；已同步 2026-05-19 `yf57` 日期修复、定向库存重建和 `004` 单据价修复后，初始 `44` 行价格层漂移已全部闭环，建议暂停新增功能，保留 `5 ~ 10` 个工作日数据冻结、性能基线和核验清单收口窗口。 |
| `analysis-20260517-workshop-selected-price-layer-drift-blocked-44.md` | `resolved` | 车间领料 / 报废单据价格层漂移确认清单：初始 `44` 行未自动修复，`zjq113`、`zjq031`、`dz3`、`033`、`yh1`、`jg6`、`yf12`、`lb004`、`lb005`、`yh10`、`zjq106`、`yf42`、`zjq042`、`cp032`、`zjq149`、`yf81`、`yf2`、`cp001`、`yf57`、`004` 已按业务事实 / 仓库确认价 / 说明字段拆分 / 日期修复和定向重建收口；另已统一 `lb007` 当前价格，最终通用 drift dry-run 为 `planned=0, blocked=0`。 |

## 已完成（`archive/retained-completed/`）

| Task 文档 | 状态 | 说明 |
| --- | --- | --- |
| `archive/retained-completed/analysis-20260521-rbac-finance-accountant-role-review.md` | `implemented` | RBAC 财务会计只读角色已完成并归档：新增 `finance-accountant` seed 角色和只读权限 preset；启动修复只补缺失角色，不覆盖已存在运行态角色配置；相关系统管理 / 月报文档已同步，focused RBAC 测试、typecheck、Biome 与 diff 检查通过。 |
| `archive/retained-completed/analysis-20260520-monthly-reporting-domain-review.md` | `implemented` | 普通月度对账报表完善已完成并归档：数量统一 2 位；普通月报单据类型筛选改为 `topicKey`；销售域在原 `领域汇总`区域新增固定销售列，不新增独立销售汇总区；`单据类型汇总`保留销售退货 0 行用于筛选和钻取；汇总层 `总成本`已删除，销售项目金额拆分为销售价金额 / 成本价金额。 |
| `archive/retained-completed/task-20260501-construct-correct-price-layer-replay.md` | `accepted` | 价格层重建已在 configured target `saifute-wms` 执行、验证并归档：最终 dry-run `blockers=[]`；execute 删除旧余额 `835`、孤儿来源占用 `1897`，插入 `inventory_log=4546`、`inventory_source_usage=2637`、`inventory_balance=1230`；validate `0` blocker issue。历史允许负库存、乱序和无来源的出库 / 领料均以明确 warning 留痕，`cp002` / `jg36` 最终负库存转为后续盘库调整 warning。 |
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
