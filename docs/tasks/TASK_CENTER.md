# 任务中心

`docs/tasks/**` 现在明确分成三层：

- `TASK_CENTER.md`：维护当前 task 文档清单、生命周期分类和清理候选的实时看板。
- `README.md`：说明目录机制、角色分工和编写规则。
- `task-*.md`：承载某一个具体 scope 的详细执行、review 和溯源记录。

需求侧对称看板：`docs/requirements/REQUIREMENT_CENTER.md`（活跃/归档需求与关联 task 索引）。

这份文档应保持简洁，只做索引和分类，不复制 task 文档里的长篇验收条件、review 记录或附录内容。

## 生命周期分类

- `active`：仍处于规划、编码、review、修复或续接状态。
- `retained-completed`：已完成，但仍需保留，原因可能是它仍然是稳定真源、重要基线，或仍被后续 task 引用。
- `cleanup-candidate`：后续可能可以清理，但当前只能列入候选，必须等用户明确确认后才能删除。
- 已被当前真源完全承接、且没有单独保留价值的旧 brief，不再单独设“已替代归档”分类；应在当前文档写明变更说明后直接删除。

## 归档目录布局

`docs/tasks/` 根目录只保留 `TASK_CENTER.md`、`README.md`、`_template.md` 和仍绑定 **`docs/requirements/req-*.md`（根目录、Lifecycle `active`）** 的 `active` task 文档。需求已闭环时应**归档**到 `docs/requirements/archive/**` 并更新引用路径，而不是删除；若需求文件已从仓库移除且未保留归档路径，则关联 task 不得留在根目录（应迁入 `archive/**` 或按治理删除）。需求侧索引见 `docs/requirements/REQUIREMENT_CENTER.md`。

- `docs/tasks/archive/retained-completed/`：存放已完成但仍需保留的稳定基线、治理溯源或上游真源 task 文档。
- `docs/tasks/archive/cleanup-candidate/`：存放当前只做保留归档、后续若用户明确确认才允许删除的候选 task 文档。

## 看板规则

- 跨 task 的实时总览统一维护在这里，不写回 `README.md`，也不要分散写在多个 task 文档里。
- 每条记录尽量保持一行理由，避免看板再次膨胀。
- 如果某个文档是否可清理存在歧义，优先归类为 `retained-completed`，不要激进推进清理。
- `cleanup-candidate` 只是建议分类；若尚未获得当前归档 scope 的用户明确确认，不得删除、重命名或移动相关 task 文档。即使已进入归档执行，删除仍需单独确认。
- 已被当前真源承接的旧 brief，默认不再保留单独目录或分类；如需说明差异，应写进当前 requirement / task 文档，而不是继续保留旧 brief。
- 较早的 task 文档可能还没有 `Lifecycle disposition` metadata 字段；在这些旧文档自然再次被修改前，以本看板作为当前分类真源。
- 根目录每一条活跃 task 须在 Metadata 中列出仍存在于 **`docs/requirements/` 根目录** 且 **`Lifecycle disposition` 为 `active`** 的 `Related requirement` 路径。需求归档时更新 task 与需求双向路径，并将已收口的 task 迁入 `docs/tasks/archive/**`；勿在根目录保留「仅绑定已归档或已删需求」的活跃 task。

## 活跃任务

| Task 文档 | 状态 | 说明 |
| --- | --- | --- |
| 当前无 | — | 根目录暂无绑定 **`docs/requirements/` 根目录** 且 **`Lifecycle disposition` 为 `active`** 的 requirement 的 task；已收口条目见下方归档表。 |

## 已完成但保留（归档至 `archive/retained-completed/`）

以下条目按生命周期已归为 `retained-completed`，并保留为稳定真源、执行 provenance 或后续切片依赖基线。

| Task 文档 | 保留原因 |
| --- | --- |
| `docs/tasks/archive/retained-completed/task-20260402-0048-ai-autonomous-delivery-governance.md` | 已完成“AI 自主交付 + 完整测试报告”治理落地：requirement / task / acceptance 模板、README 与 `autonomous-delivery` SOP 已同步升级，后续新切片可直接按 `[AC-*]` + `full` acceptance run 作为完整测试报告推进。 |
| `docs/tasks/archive/retained-completed/task-20260331-0914-rbac-role-permission-restore.md` | 已完成当前 RBAC 角色权限恢复：`warehouse-manager` 重新获得主仓业务组与必要 RD 协同入口，`rd-operator` 仍保持 RD 专属视角，且通过 focused RBAC tests 与前端构建验证。 |
| `docs/tasks/archive/retained-completed/task-20260331-0934-system-management-f4-persistence.md` | 记录旧 `system-management` `F4` snapshot 桥接方案的实现与验证；该方案现已废弃，保留为后续真实落库持久化重定义前的历史 provenance。 |
| `docs/tasks/archive/retained-completed/task-20260401-system-management-browser-repair.md` | 已完成一轮真实浏览器回归缺口修复：补齐 `system_management_snapshot` 缺表自愈、canonical `stock_scope / workshop` bootstrap，以及首页 `department` 展示对齐；保留为 `system-management` 运行态回归证据。 |
| `docs/tasks/archive/retained-completed/task-20260401-main-into-dev-merge-review.md` | 记录 `origin/main -> dev` 合并时的冲突判断、文件级处理原则与验证结果；保留为该次主线同步的执行 provenance。 |
| `docs/tasks/archive/retained-completed/task-20260331-0051-system-management-runtime-alignment.md` | 已完成 `system-management` 运行态对齐：当前样例部门 / 角色 / 账号矩阵已按 `V1` 基线收敛，`在线用户 / 登录日志 / 操作日志` 已在前端导航中归入 `系统管理`，并通过 focused tests 与前端构建验证。 |
| `docs/tasks/archive/retained-completed/task-20260331-0042-system-management-f2-f3-baseline.md` | 已完成 `system-management` 主题 `F2/F3` 收口：V1 组织与角色矩阵、平台审计与在线治理边界已正式同步到 topic、项目级需求、架构文档与 workspace 归档，后续 `F4/F5` 应另开新切片。 |
| `docs/tasks/archive/retained-completed/task-20260330-2235-stock-scope-nonempty-rehearsal.md` | 已完成非空历史数据 rehearsal：目标库已灌入最小代表性样本，并重新跑通 `stock-scope-phase2` 的 `seed-rehearsal`、`dry-run / execute / validate`；当前不仅验证了空库路径，也验证了最小非空数据路径。 |
| `docs/tasks/archive/retained-completed/task-20260330-2229-inbound-domain-fix.md` | 已完成 `inbound` review findings 修复：普通验收单/生产入库单现已强制归主仓，查询/详情/修改/作废按真实库存轴判断，对应测试已补齐，并通过 `swagger:metadata`、`typecheck`、`migration:typecheck` 与 `pnpm test`。 |
| `docs/tasks/archive/retained-completed/task-20260330-2220-inbound-domain-review.md` | 已完成 `inbound` review-only 切片：当前识别出 `3` 类主要问题，包括普通入库/生产入库缺少“必须归主仓”的强约束、查询/详情/修改/作废仍沿旧 `workshopId` 轴判断，以及缺少对应测试覆盖；若要修复 findings，应另开新的 `inbound` 实现切片。 |
| `docs/tasks/archive/retained-completed/task-20260330-2205-stock-scope-rd-persistence-followup.md` | 已完成 `rd-subwarehouse` 持久化轴补齐 follow-up：`rd_handoff_order`、`rd_procurement_request`、`rd_stocktake_order` 已补 `stockScope` 相关持久化字段、运行时代码与 tests，对应目标库 schema apply 和 `stock-scope-phase2` 的 `dry-run / execute / validate` 也已再次通过；若后续要验证非空历史数据回填，应另开新的 rehearsal scope。 |
| `docs/tasks/archive/retained-completed/task-20260330-1616-stock-scope-phase2-cutover.md` | 已完成 `stockScope` Phase 2 首波实现：Prisma schema 已补 `StockScope` / `stockScopeId`，首波 runtime 与 `stock-scope-phase2` migration 脚本已落地，并已在目标库 `saifute-wsm` 上通过安全 schema apply 与 `dry-run / execute / validate`；当前目标库首波相关表为 `0` 行，若后续要验证非空历史数据回填，应另开新的 rehearsal scope。 |
| `docs/tasks/archive/retained-completed/task-20260330-1419-stock-scope-alignment.md` | 已完成库存范围与归属口径对齐 Phase 1：canonical `stockScope` runtime contract、会话/RBAC 兼容边界、库存/报表/业务写路径收敛与 e2e stub 补齐已落地，并通过 `swagger:metadata`、`typecheck`、focused tests、`batch-d-slice.e2e`、`pnpm test` 与 closing review `No findings`；若后续继续推进真实库存维度切换，需另开 `Phase 2` cutover scope。 |
| `docs/tasks/archive/retained-completed/task-20260330-0129-rd-subwarehouse-phase4-phase5.md` | 已完成 `RD 小仓` `F4/F5` 收口：quantity-aware 物料状态链、RD 盘点/调整、动作级权限收紧与主仓验收联动展示已落地，并通过 focused tests、`pnpm test`、`web build:prod` 与 `rd-operator` / `admin` browser smoke。 |
| `docs/tasks/archive/retained-completed/task-20260328-1855-biome-lint-cleanup.md` | 已完成全仓 `pnpm lint` 收口：`scripts/src/test` 低风险格式/import 噪音与 `web` 结构/宽松比较错误已按真实失败面收口，closing review `No findings`，根目录 `pnpm lint` 返回 `0`；若后续要继续压平 warnings / infos，需另开新 scope。 |
| `docs/tasks/archive/retained-completed/task-20260328-1831-rd-procurement-main-acceptance-linkage.md` | 已完成 RD procurement/acceptance linkage foundation：RD 采购需求真源、主仓验收选择/带出、累计验收量保护、权限入口与前端页面已落地，并通过 closing review、`pnpm test` 与 `pnpm --dir web build:prod`。 |
| `docs/tasks/archive/retained-completed/task-20260326-0415-rd-subwarehouse-phase1-operating-foundation.md` | 已完成 RD Phase 1 operating foundation：研发独立工作台、固定仓别隔离、项目领用、本仓报废与研发侧库存/报表基础已落地，并通过 reviewer clean sign-off 与浏览器冒烟验证。 |
| `docs/tasks/archive/retained-completed/task-20260328-1640-rd-subwarehouse-main-to-rd-handoff-foundation.md` | 已完成 RD handoff foundation：窄化 `RD handoff` 真源文档、`main - / RD +` 过账、独立权限点与 RD 真实结果面已落地，并通过 full test / build / reviewer clean sign-off。 |
| `docs/tasks/archive/retained-completed/task-20260327-1845-redis-real-integration.md` | 已完成真实 Redis 接入：`shared/redis` 已切到 `ioredis`，`session` / `auth` 语义与 TTL/扫描/原子消费已对齐，真实 Redis 应用级 e2e、focused integration tests 与 `pnpm verify` 均通过，并经 closing re-review `No findings` sign-off。 |
| `docs/tasks/archive/retained-completed/task-20260327-1721-rbac-system-management-closure.md` | 已完成 RBAC system management closure：`admin` 恢复 `系统管理` 与 RD 入口可见性，`web/src/api/system/**` 与当前 NestJS `/api/system/*` 已对齐，`admin` / `operator` / `rd-operator` / `system-manager` 浏览器冒烟均通过，并经 closing re-review `No findings` sign-off。 |
| `docs/tasks/archive/retained-completed/task-20260326-0455-system-readiness-core-business-coverage.md` | 已完成 core business 页面群收口：`base/*`、`entry/*`、`take/*`、`stock/{inventory,log,used,scrap*,interval}` 菜单/主请求/关键过滤链路已对齐当前 NestJS，并通过 build + browser 定向验证。 |
| `docs/tasks/archive/retained-completed/task-20260326-1557-system-readiness-customer-sales-domain-coverage.md` | 已完成 `customer` / 销售域补齐：首页 `dashboard`、`销售管理` 菜单、四个页面与关键写按钮/弹窗入口已恢复，并通过 fresh backend + fresh frontend 浏览器验证。 |
| `docs/tasks/archive/retained-completed/task-20260326-1940-frontend-old-style-phase1-shell-integration.md` | 已完成第一阶段 shell integration：默认首页回归 dashboard 节奏、`销售管理/生产车间/研发协同` 分组收口、RD 直达 `workbench` 且不残留首页标签，并通过 admin/operator/rd 浏览器联调验证。 |
| `docs/tasks/archive/retained-completed/task-20260327-1000-frontend-home-legacy-chart-restore.md` | 已完成 `/index` 旧版图表首页：`LegacyHomeDashboard` + `api/system/home.js` reporting 适配，与 `reporting/home` 脱钩；keep-alive / 异步加载竞态与模板 `userStore` 已收口；`build:prod` + Biome 通过。 |
| `docs/tasks/archive/retained-completed/task-20260326-0205-system-readiness-legacy-monitor-coverage.md` | 已完成 legacy `monitor/*` 兼容切片：页面可达、主请求 `200`、scheduler 最小读链路已补齐，保留为本轮 readiness 扩面 provenance。 |
| `docs/tasks/archive/retained-completed/task-20260325-1740-agent-orchestration-completion-state.md` | 已完成 AI 编排完成态、归档协议、resume 真源与 `project` validate 假确认门修复，并以自身归档验证了新 completion-state 协议。 |
| `docs/tasks/archive/retained-completed/task-20260325-2355-outbound-customer-cutover.md` | 已完成 repo-owned `outbound` 兼容层切换与 reviewer sign-off；保留为本轮 `customer` cutover 的执行 provenance 真源。 |
| `docs/tasks/archive/retained-completed/task-20260323-1100-architecture-review-clarity.md` | 已完成 scoped architecture review，并产出 gap 与澄清结论；follow-up 已收口。 |
| `docs/tasks/archive/retained-completed/task-20260321-1140-architecture-migration-reference.md` | 已完成全量迁移 architecture reference 的 docs-only 交付与复审，并与已归档 migration requirement 保持稳定溯源关系。 |
| `docs/tasks/archive/retained-completed/task-20260323-1530-migration-project-material-resolution-readiness.md` | `project` 域迁移已完成：`5` 项目 / `138` 行全部准入 live，自动补建 `126` 条物料；inventory replay 完成后 validate 已改为基于下游证据判定，无残余假 blocker。 |
| `docs/tasks/archive/retained-completed/task-20260323-1310-customer-workshop-return-invariants.md` | 已完成 `customer` / `workshop-material` return invariant 修复与 Jest 证据；`reviewed-no-findings`。 |
| `docs/tasks/archive/retained-completed/task-20260323-1320-architecture-doc-clarity-followups.md` | 已完成 `README` / `project` / `reporting` / `master-data` 文档澄清；`reviewed-clean`。 |
| `docs/tasks/archive/retained-completed/task-20260317-1416-migration-outbound-base.md` | 已完成并在最新 DB-backed dry-run + batch-owned rows/maps 证据下确认收口；当前 `execute` / `validate` 非零来自后续已复审切片扩展 baseline，不再构成该 slice blocker。 |
| `docs/tasks/archive/retained-completed/task-20260319-1035-migration-outbound-sales-return-formal-admission.md` | 已 `reviewed-no-findings`，formal admission 结论稳定，保留为后续 customer-stock 家族迁移的 admitted baseline 与 provenance 真源。 |
| `docs/tasks/archive/retained-completed/task-20260319-1045-migration-workshop-return-formal-admission.md` | 已 `reviewed-no-findings`，formal admission 结论稳定，保留为后续 workshop-material 家族迁移的 admitted baseline 与 provenance 真源。 |
| `docs/tasks/archive/retained-completed/task-20260320-1244-task-doc-center-and-cleanup.md` | 已完成本轮 `docs/tasks/**` 治理机制落地，并作为新任务中心模型的溯源记录继续保留。 |
| `docs/tasks/archive/retained-completed/task-20260320-1343-task-doc-archival-cleanup.md` | 已完成首次 task 文档归档清理，并保留为 `archive/` 布局落地的治理记录。 |
| `docs/tasks/archive/retained-completed/task-20260320-1740-task-doc-obsolete-brief-removal.md` | 已完成机制简化：删除专门的“已替代归档”模块与对应旧 brief，并把变更说明收口到当前真源文档。 |
| `docs/tasks/archive/retained-completed/task-20260317-1745-migration-outbound-order-type4-reservations.md` | 已完成，但仍是后续 outbound reservation 相关迁移 slice 的稳定基线。 |
| `docs/tasks/archive/retained-completed/task-20260317-2035-migration-workshop-pick-base.md` | 已完成，但仍是后续 workshop return 工作依赖的 workshop pick admitted baseline。 |
| `docs/tasks/archive/retained-completed/task-20260319-1905-migration-master-plan-relocation.md` | 已完成，但仍是旧顶层迁移计划删除后的仓库级 migration master plan 真源。 |
| `docs/tasks/archive/retained-completed/task-20260319-1605-feishu-runtime-summary.md` | 已完成：`task_complete` 会话级运行时长与失败语义修复；需求文件已删，保留为 provenance。 |
| `docs/tasks/archive/retained-completed/task-20260319-1715-feishu-subagent-runtime-duration.md` | 已完成：`subagent_complete` 显式时长入参与规则/测试一致；保留为飞书通知合约变更真源。 |
| `docs/tasks/archive/retained-completed/task-20260326-0827-feishu-turn-runtime.md` | 已完成：主完成通知改为当前轮次 `worked for ...` 对齐的本轮对话时长，`complete` 别名与子代理显式计时约束已通过测试与 reviewer sign-off。 |
| `docs/tasks/archive/retained-completed/task-20260320-1400-architecture-doc-relocation.md` | 已完成架构文档目录迁移、说明补充与仓库级旧路径引用清理，并保留为本轮结构治理的执行与 review 记录。 |
| `docs/tasks/archive/retained-completed/task-20260319-1100-migration-return-family-shared-post-admission.md` | 已完成退货族准入后共享下游迁移（relation / replay / validate / readiness policy），复审通过与需求对齐，仍作为该 scope 的执行与 provenance 真源。 |

## 清理候选（归档至 `archive/cleanup-candidate/`）

当前无待处理条目。历史条目 `task-20260319-1632-req-interaction-layer.md` 已于 2026-03-20 经用户确认删除；`cleanup-candidate/` 目录保留供日后候选归档。

## 下一步

- 全域数据搬家 + 库存重放已完成。迁移工作结束，随时可切换到新系统。
- `task-20260323-1100` 的两条 follow-up 已由 `task-20260323-1310` 与 `task-20260323-1320` 收口并完成 reviewer sign-off；上述三条 task 已迁入 `docs/tasks/archive/retained-completed/`。
- `docs/tasks/TASK_CENTER.md` 与 requirement 进展同步仍由 parent 统一维护；若后续继续架构澄清，应另开新的 requirement / task，而不是复用已收口的切片。
- 已完成机制简化：不再为“已被替代但当前没有保留价值”的旧 brief 设单独归档模块；此类变更说明统一写入当前真源文档。
- `task-20260317-1416`、`task-20260319-1035`、`task-20260319-1045` 已全部迁入 `archive/retained-completed/`；当前只需在后续新需求出现时按新 requirement / task 锚点继续推进。
- 退货族迁移的人机交互锚点 `docs/requirements/archive/retained-completed/req-20260320-1830-migration-active-slices.md` 已完成闭环，并继续作为这些 retained-completed task 的 `Related requirement` 真源。
- 将需求迁入 `docs/requirements/archive/**` 或从仓库移除需求文件时，同步更新 `Related requirement` / `Related tasks` 全文路径，检查并迁出根目录上已无**活跃**需求绑定的 task；优先归档需求文件以保留可追溯链接（见 `docs/requirements/README.md`）。
- 今后若新增 `cleanup-candidate`，删除前须再次对全文做引用检索，并取得用户明确确认。
