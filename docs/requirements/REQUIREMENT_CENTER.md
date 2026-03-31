# 需求中心

本文件只做索引看板，不重复需求正文、流程说明或归档规则。

看板口径：

- `PROJECT_REQUIREMENTS.md`：固定项目级需求真源。
- `topics/*.md`：主题级长期真源。
- 根目录 `req-*.md`：当前活跃切片需求。
- `archive/retained-completed/`：已闭环但保留溯源的需求。
- `archive/cleanup-candidate/`：待用户确认后可删除的需求。

详细规则见 `docs/requirements/README.md`。

## 固定项目需求

| 需求文档                      | 状态          | 说明                                                                                                                                                                                               |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PROJECT_REQUIREMENTS.md` | `confirmed` | 固定项目需求真源；当前核心需求已收敛为“清晰易维护的 NestJS WMS、贴合小型仓库场景、按业务域迁移、保证库存与追溯语义正确”，并已补充真实环境、流程与统计口径：约 `3` 人、`Excel + 手工记账`、职责未分化、审核不阻塞落库、人工月盘，以及“主仓 + 研发小仓”是真实库存范围、车间只做领退料归属与成本核算、同物料不同入库批次可能不同单价且需按来源层追踪成本等长期口径。 |

## 主题需求

| 需求文档 | 状态 | 说明 |
| --- | --- | --- |
| `topics/inbound-business-module.md` | `needs-confirmation` | `inbound` 入库业务模块主题真源；长期保留验收单/生产入库单统一家族模型、主仓准入、`inventory-core` 过账、真实库存轴访问控制等约束，后续入库扩展或优化应从该 topic 新开切片。 |
| `topics/system-management-module.md` | `confirmed` | `system-management` 系统管理模块主题真源；当前已确认 `V1` 组织与角色矩阵，以及“纳入在线用户 / 登录日志 / 操作日志、暂不纳入调度 / AI 支持”的长期边界，后续持久化与邻接能力继续从该 topic 新开切片。 |
| `topics/rd-subwarehouse.md` | `confirmed` | `RD 小仓` 主题真源；长期保留“同平台协同、受限子仓模型、库存统一走 inventory-core、RD 是真实库存范围而车间不是库存池、角色边界”等约束，并维护能力清单与阶段路线图。已完成切片统一挂到该主题下管理。 |
| `topics/monthly-reporting.md` | `confirmed` | 月度报表主题真源；长期保留“固定正式月报 + 人工重算 + 日期范围报表”“整体 / 车间 / 销售域 / 研发项目四类视角”“系统查看 + Excel 导出”等约束，并维护后续实施路线图。 |
| `topics/frontend-old-style-adaptation.md` | `confirmed` | 前端旧风格回归主题真源；长期保留“只回归表现层、不回退后端契约”“保留销售 / 车间 / RD 真实业务分组”“按阶段推进壳层、首页、业务页细化”等约束，并维护阶段路线图。 |

## 活跃需求

| 需求文档                                                 | 状态                   | 说明                                                                                          |
| ---------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
后续若继续推进 `rd-subwarehouse`、`monthly-reporting` 或 `frontend-old-style-adaptation` 的其它独立范围，应从对应 `topics/*.md` 新开具体切片 requirement，而不是复用旧总入口。

## 已归档（`archive/retained-completed/`）

| 需求文档 | 保留原因 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `archive/retained-completed/req-20260331-0914-rbac-role-permission-restore.md` | 已完成当前 RBAC 角色权限恢复：`warehouse-manager` 不再被误收窄到只剩研发协同入口，业务权限已按角色预设重新收口，`rd-operator` 的 RD 专属视角保持不变，并通过 focused RBAC tests 与前端构建验证。 |
| `archive/retained-completed/req-20260331-0934-system-management-f4-persistence.md` | 已完成 `system-management` 主题 `F4` 收口：当前 `rbac / system-management` 初始化状态已迁到 Prisma 持久化快照，业务权限已切到菜单/角色数据驱动，并通过 Prisma 生成/校验、typecheck 与 focused RBAC tests。 |
| `archive/retained-completed/req-20260331-0051-system-management-runtime-alignment.md` | 已完成 `system-management` 运行态对齐：当前样例部门 / 角色 / 账号矩阵已按 `V1` 基线收敛，`在线用户 / 登录日志 / 操作日志` 已在前端导航中归入 `系统管理`，并通过 focused tests 与前端构建验证。 |
| `archive/retained-completed/req-20260331-0042-system-management-f2-f3-baseline.md` | 已完成 `system-management` 主题 `F2/F3` 收口：真实部门、主角色、预留查看角色、账号维护职责，以及 `在线用户 / 登录日志 / 操作日志` 的主题归属与验收口径已正式沉淀到 topic、项目级需求、架构文档与归档 workspace。 |
| `archive/retained-completed/req-20260330-2235-stock-scope-nonempty-rehearsal.md` | 已完成非空历史数据 rehearsal：目标库已灌入最小代表性样本，并重新跑通 `stock-scope-phase2` 的 `seed-rehearsal`、`dry-run / execute / validate`；当前不仅验证了空库路径，也验证了最小非空数据路径。 |
| `archive/retained-completed/req-20260330-2229-inbound-domain-fix.md` | 已完成 `inbound` review findings 修复：普通验收单/生产入库单现已强制归主仓，查询/详情/修改/作废按真实库存轴判断，对应测试已补齐，并通过 `swagger:metadata`、`typecheck`、`migration:typecheck` 与 `pnpm test`。 |
| `archive/retained-completed/req-20260330-2220-inbound-domain-review.md` | 已完成 `inbound` review：当前识别出 `3` 类主要问题，包括普通入库/生产入库缺少“必须归主仓”的强约束、查询/详情/修改/作废仍沿旧 `workshopId` 轴判断，以及缺少对应测试覆盖；若要修复 findings，应另开新的 `inbound` 实现切片。 |
| `archive/retained-completed/req-20260330-2205-stock-scope-rd-persistence-followup.md` | 已完成 `rd-subwarehouse` 持久化轴补齐 follow-up：`rd_handoff_order`、`rd_procurement_request`、`rd_stocktake_order` 已补 `stockScope` 相关持久化字段、运行时代码与 tests，对应目标库 schema apply 和 `stock-scope-phase2` 的 `dry-run / execute / validate` 也已再次通过；若后续要验证非空历史数据回填，应另开新的 rehearsal scope。 |
| `archive/retained-completed/req-20260330-1616-stock-scope-phase2-cutover.md` | 已完成 `stockScope` Phase 2 首波实现：Prisma schema 已补 `StockScope` / `stockScopeId`，首波 runtime 与 `stock-scope-phase2` migration 脚本已落地，并已在目标库 `saifute-wsm` 上通过安全 schema apply 与 `dry-run / execute / validate`；当前目标库首波相关表为 `0` 行，若后续要验证非空历史数据回填，应另开新的 rehearsal scope。 |
| `archive/retained-completed/req-20260330-1419-stock-scope-alignment.md` | 已完成库存范围与归属口径对齐 Phase 1：canonical `stockScope` runtime contract、会话/RBAC 兼容边界、库存/报表/业务写路径收敛与 e2e stub 补齐已落地，并通过 `swagger:metadata`、`typecheck`、focused tests、`batch-d-slice.e2e`、`pnpm test` 与 closing review `No findings`；若后续继续推进真实库存维度切换，需另开 `Phase 2` cutover requirement。 |
| `archive/retained-completed/req-20260328-1855-biome-lint-cleanup.md` | 已完成全仓 `pnpm lint` 收口：根目录 `pnpm lint` 返回 `0`，`web` Biome error 校验通过，closing review 已关闭日期范围守卫的 open finding 并达到 `reviewed-no-findings`；若后续要继续收口全仓 warnings / infos，需另开新 scope。 |
| `archive/retained-completed/req-20260326-1900-frontend-old-style-adaptation.md` | 前端旧风格回归主题的已完成阶段基线：Phase 1 `shell integration` 与 Phase 2 `/index` 旧版图表首页回归已收口，长期约束与后续路线图见 `topics/frontend-old-style-adaptation.md`；继续推进时应另开新的前端切片。 |
| `archive/retained-completed/req-20260323-0910-monthly-reporting.md` | 月度报表主题的口径确认记录：月报范围、生成方式、导出形式与补录重算追溯要求已确认，长期约束与阶段路线图见 `topics/monthly-reporting.md`；真正进入设计或实现时应另开新的月报切片。 |
| `archive/retained-completed/req-20260330-0127-rd-subwarehouse-phase4-phase5.md` | `RD 小仓` 主题下已完成 `F4 + F5` 收口：RD 物料独立状态链与 RD 小仓盘点 / 库存调整能力已落地，并已完成 focused tests、全量测试、web build 与 `rd-operator` / `admin` browser smoke；若后续继续扩展 RD 流程，应另开新切片。 |
| `archive/retained-completed/req-20260328-1831-rd-procurement-main-acceptance-linkage.md` | `RD 小仓` 主题下已完成 Phase 3 切片：RD 采购需求录入与主仓验收联动已落地，库存仍先入主仓；后续 RD 物料状态链、小仓盘点/调整与最终 smoke 需另开新切片。 |
| `archive/retained-completed/req-20260321-1109-architecture-review-clarity.md` | 业务域与 shared core 架构 review 已按确认口径闭环；详细 findings 与 follow-up 见 `docs/tasks/archive/retained-completed/task-20260323-1100-architecture-review-clarity.md` 及同批归档 task。 |
| `archive/retained-completed/req-20260328-1640-rd-subwarehouse-main-to-rd-handoff-foundation.md` | `RD 小仓` 主题下已完成 Phase 2 切片：主仓发料 / 调拨到 RD 后的自动交接能力已落地，小仓无需二次收货确认；后续采购链路、状态链与盘点/调整需另开新切片。 |
| `archive/retained-completed/req-20260326-0048-rd-subwarehouse.md` | `RD 小仓` 主题下已完成 Phase 1 切片：独立工作台、固定仓别隔离、项目领用、本仓报废与研发侧报表基础已落地；当前继续保留角色/库存责任/架构矩阵，作为后续 RD 切片的详细基线，主题分类与阶段路线图见 `topics/rd-subwarehouse.md`。 |
| `archive/retained-completed/req-20260319-1300-return-post-admission.md`   | 需求 ID 溯源；正文已合并至 `archive/retained-completed/req-20260320-1830-migration-active-slices.md`                                          |
| `archive/retained-completed/req-20260327-1840-redis-real-integration.md` | 已完成真实 Redis 接入：`shared/redis` 已切到 `ioredis`，`REDIS_*` 配置、启动 fail-fast、验证码一次性消费、密码失败窗口并发正确性与会话真源语义均已收口，并与归档 task `task-20260327-1845-redis-real-integration.md` 保持闭环溯源。 |
| `archive/retained-completed/req-20260327-1604-rbac-implementation.md` | 已完成 RBAC system management closure：`admin` 恢复 `系统管理` 与 RD 入口可见性，`system/*` 八类页面的前端 `/api/system/*` 与当前 NestJS 承接已对齐，`admin` / `operator` / `rd-operator` / `system-manager` 浏览器冒烟均通过，并与归档 task `docs/tasks/archive/retained-completed/task-20260327-1721-rbac-system-management-closure.md` 保持闭环溯源。 |
| `archive/retained-completed/req-20260320-1830-migration-active-slices.md` | 覆盖 `outbound-base`、销售退货 formal admission、车间退料 formal admission 与退货族 shared post-admission 的统一交互锚点；当前切片均已收口，保留为本轮迁移 requirement 真源。 |
| `archive/retained-completed/req-20260321-1100-java-to-nestjs-data-migration.md` | Java 源库到 NestJS 目标库的全量业务域数据迁移需求已闭环；全域数据搬家 + 库存重放已完成（733 logs / 428 balances / 验证 0 blocker），现保留为迁移结果与切换说明真源。 |
| `archive/retained-completed/req-20260322-1354-outbound-customer-rename.md` | 已完成 repo-owned `outbound` 兼容层切换：后端 route/permission、migration alias、活跃架构文档与前端死兼容代码已收口；保留为本轮 cutover requirement 真源。 |
| `archive/retained-completed/req-20260325-1730-agent-orchestration-completion-state.md` | 已完成 AI 编排完成态、归档协议、resume 真源与 `project` validate 假确认门修复；保留为本轮治理修正的 requirement 真源。 |
| `archive/retained-completed/req-20260325-2319-system-readiness-validation.md` | 已完成系统运行与前后端联调 readiness：浏览器 fresh login 后已验证 `monitor/*` 与 `base/*`、`entry/*`、`take/*`、`stock/{inventory,log,used,scrap*,interval}` 核心页面可见可进，重要过滤兼容问题已收口。 |
| `archive/retained-completed/req-20260326-1556-system-readiness-customer-sales-domain-coverage.md` | 已完成 `customer` / 销售域最后缺口补齐：首页恢复真实 `dashboard`，`销售管理` 菜单组与四个页面全部可见可进，关键写按钮与联调入口已恢复显示，并通过 fresh login 浏览器验证。 |
| `archive/retained-completed/req-20260326-0827-feishu-turn-runtime.md` | 已完成飞书通知运行时长口径切换：主完成通知改为当前轮次 `worked for ...` 对齐的本轮对话时长，子代理完成通知继续使用显式子代理运行时长。 |
| `archive/retained-completed/req-20260322-1452-frontend-web-path.md`       | 前端工程统一为仓库内 `web/`；工作区与文档路径引用已同步；保留为路径口径溯源。                                                                                         |

## 清理候选（`archive/cleanup-candidate/`）

当前无条目。删除前须用户明确确认，并对仓库内引用做全文检索。

## 维护

- 新增或调整 `PROJECT_REQUIREMENTS.md` 的项目级主题时，同步更新“固定项目需求”说明。
- 新增或调整 `topics/*.md` 的主题级真源时，同步更新“主题需求”说明。
- 新增、归档、迁移或删除需求时，同步更新对应看板行。
- task 绑定、归档与命名等规则统一以 `docs/requirements/README.md` 为准。
