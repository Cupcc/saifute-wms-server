# 需求中心

本文件只做索引看板，不重复需求正文、流程说明或归档规则。

看板口径：

- `PROJECT_REQUIREMENTS.md`：固定项目级需求真源。
- 根目录 `req-*.md`：当前活跃需求。
- `archive/retained-completed/`：已闭环但保留溯源的需求。
- `archive/cleanup-candidate/`：待用户确认后可删除的需求。

详细规则见 `docs/requirements/README.md`。

## 固定项目需求

| 需求文档                      | 状态          | 说明                                                                                                                                                                                               |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PROJECT_REQUIREMENTS.md` | `confirmed` | 固定项目需求真源；当前核心需求已收敛为“清晰易维护的 NestJS WMS、贴合小型仓库场景、按业务域迁移、保证库存与追溯语义正确”，并已补充真实环境、流程与统计口径：约 `3` 人、单仓起步、无码物料、`Excel + 手工记账`、职责未分化、审核不阻塞落库、实时库存 + 月盘；同时已按模块分组整理平台、业务、分析与辅助模块的项目级默认需求，明确第一阶段 `项目/研发` 模块范围，新增“系统自动生成月度报表、覆盖整体/车间/销售域/研发项目”的项目级报表诉求，并补充“主仓 + 研发小仓受限协同”的长期口径。 |

## 活跃需求

| 需求文档                                                 | 状态                   | 说明                                                                                          |
| ---------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `req-20260327-1317-migration-stage-planning.md`      | `needs-confirmation` | 新增“迁移开发阶段规划与阶段性交付展示”需求：已完成 `workspace draft` 机制首轮落地，并把当前工作流改造成“决策 + 草稿”样板；当前待确认阶段划分应更偏 `业务价值可见性` / `技术底座先行` / `需求确认→实现→验收` / `混合口径`。 |
| `req-20260328-1831-rd-procurement-main-acceptance-linkage.md` | `confirmed` | RD 下一活跃切片已切到“研发采购需求与主仓验收联动 foundation”：目标是把 RD 采购需求落成真实上游事实，并让主仓验收可直接选取/带出对应采购信息；研发物料状态链、小仓盘点/调整与最终 smoke 继续留在后续 RD 收口。 |
| `req-20260326-1900-frontend-old-style-adaptation.md` | `confirmed`          | 已确认前端进入“旧壳新核 + 业务域重分组”阶段；`shell integration` 与 `/index` 旧版图表首页（`task-20260327-1000` 归档）已落地，`销售管理` / `生产车间` / `研发协同` 分域与 RD 直达 `workbench` 行为保持。后续可按新切片细化各业务页旧风格节奏，同时保留现有后端权限/菜单/会话与报表监控能力。 |
| `req-20260323-0910-monthly-reporting.md`            | `confirmed`          | 系统自动生成月度报表需求已完成口径确认：指标范围与销售域统计均按“全包含”处理，采用“每月固定正式月报 + 人工触发重算 + 可选日期范围生成报表”，交付形式为系统查看 + Excel 导出，并允许月后补录后重算且需保证追溯。 |

## 已归档（`archive/retained-completed/`）

| 需求文档 | 保留原因 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `archive/retained-completed/req-20260328-1855-biome-lint-cleanup.md` | 已完成全仓 `pnpm lint` 收口：根目录 `pnpm lint` 返回 `0`，`web` Biome error 校验通过，closing review 已关闭日期范围守卫的 open finding 并达到 `reviewed-no-findings`；若后续要继续收口全仓 warnings / infos，需另开新 scope。 |
| `archive/retained-completed/req-20260321-1109-architecture-review-clarity.md` | 业务域与 shared core 架构 review 已按确认口径闭环；详细 findings 与 follow-up 见 `docs/tasks/archive/retained-completed/task-20260323-1100-architecture-review-clarity.md` 及同批归档 task。 |
| `archive/retained-completed/req-20260328-1640-rd-subwarehouse-main-to-rd-handoff-foundation.md` | 已完成 RD handoff foundation：窄化 `RD handoff` 真源文档、`main - / RD +` 交接过账、独立权限点与 RD 真实结果面均已落地，并经 reviewer clean sign-off；后续 RD 采购链路、状态链与盘点/调整需另开新切片。 |
| `archive/retained-completed/req-20260326-0048-rd-subwarehouse.md` | 已完成 RD Phase 1 operating foundation：受限子仓模型、角色/库存责任矩阵与模块边界已澄清，研发独立工作台、固定仓别隔离、项目领用、本仓报废与研发侧报表基础已落地；后续主仓到 RD 自动交接、研发采购链路、物料状态链与盘点/调整需另开新切片。 |
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
- 新增、归档、迁移或删除需求时，同步更新对应看板行。
- task 绑定、归档与命名等规则统一以 `docs/requirements/README.md` 为准。
