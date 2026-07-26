# RD 小仓（rd-subwarehouse）验收规格

## 元数据

| 字段 | 值 |
|------|------|
| 模块 | rd-subwarehouse |
| 需求源 | docs/requirements/domain/rd-subwarehouse.md |
| 最近更新 | 2026-04-14 |

## 历史说明

- 当前仓库此前没有独立的 `rd-subwarehouse` 验收规格文件；本 spec 从 `2026-04-14` 起承接新确认的“RD_SUB 项目化归属与交接” follow-on 能力。
- 已上线的 `F1`~`F5` 历史实现仍以相应需求文档、task 归档和代码基线为准；本文件优先跟踪新的项目化归属切片及其 QA 计划。

## 能力覆盖

| 能力 | 说明 | 状态 |
|------|------|------|
| F6 | RD 小仓项目化归属与交接 | `已验收` |

## F6 RD 小仓项目化归属与交接

> 未代码化 case（browser/manual plan）：`docs/acceptance-tests/cases/rd-subwarehouse.json`

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-1 | 每条 `MAIN -> RD_SUB` 交接明细都绑定研发项目，并在库存事实层保留项目归属 | `met` | focused tests + live API + browser | `docs/acceptance-tests/runs/run-20260414-1620-rd-sub-project-attribution-and-reporting-alignment.md`; `GET /api/rd-subwarehouse/handoff-orders`; `/rd/inbound-results` detail | live handoff line 已含 `rdProjectId / rdProjectCodeSnapshot / rdProjectNameSnapshot` |
| AC-2 | `RD_SUB` 不再允许长期存在无项目归属物料；若数据冲突，存在受控清理 / 重注或回填路径 | `met` | parent reset evidence + live API | 同 run；parent `.env.dev` DB rebuild + `reset-and-seed-test-data.ts`；invalid stocktake create `400` | local/test 可清理重注，持久环境仍应 guarded backfill |
| AC-3 | RD 盘点 / 调整、研发项目领退报废与来源追溯不会打断项目归属 | `met` | live API + browser + focused tests | 同 run；有效盘点写入 `projectTargetId`；`rd-project` detail `currentAvailableQty` 随盘点与作废回滚；`/rd/stocktake-orders` detail 显示项目编码和库存前后 | 盘点闭环与项目台账已对齐 |
| AC-4 | 月报可按主仓 / RD / 研发项目视角解释同一笔 handoff，不再把交接和项目入账割裂 | `met` | live API + browser | 同 run；`monthly-reporting/details` 在 `MAIN` 返回 `OUT`、在 `RD_SUB` 返回 `IN`；项目关键字 detail 同时看到 handoff 与项目领用 | admin 浏览器页验证了新的领域说明文案；RD 视角以 live API 为主证据 |
| AC-5 | QA 方案包含 schema 同步、受控 reset/reseed、focused 自动化验证、浏览器 walkthrough 和完整 run 记录 | `met` | parent evidence + acceptance run | 同 run；task doc acceptance section；`bun run typecheck`；focused specs；`pnpm --dir web build:prod`；browser CDP walkthrough | 本轮已形成完整 run 记录 |

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
|------|----------|------|------|
| 2026-04-14 | `task-20260414-1418-rd-sub-project-attribution-and-reporting-alignment.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:90`; headless Chrome CDP browser + live API + parent automated evidence; local/test reset/reseed allowed | `passed` |

### 证据索引

| 执行面 | 证据文件/命令 | 结果 |
|--------|-------------|------|
| acceptance run | `docs/acceptance-tests/runs/run-20260414-1620-rd-sub-project-attribution-and-reporting-alignment.md` | pass |
| parent automated evidence | `pnpm prisma:generate`; `bun run typecheck`; focused specs; `pnpm --dir web build:prod`; `bun run test:e2e -- test/batch-d-slice.e2e-spec.ts` | pass |
| reset / reseed | parent `.env.dev` DB rebuild + `prisma db push` + `bun --env-file .env.dev scripts/dev/reset-and-seed-test-data.ts` | pass |
| live API | `GET /api/rd-subwarehouse/handoff-orders`; `POST /api/rd-subwarehouse/stocktake-orders`; `POST /api/rd-subwarehouse/stocktake-orders/:id/void`; `GET /api/reporting/monthly-reporting/details`; `GET /api/rd-projects/1` | pass |
| browser | headless Chrome CDP walkthrough：`/reporting/monthly-reporting`、`/rd/inbound-results`、`/rd/stocktake-orders`、`/rd/projects` | pass |
| cases | `docs/acceptance-tests/cases/rd-subwarehouse.json` | planned artifact; run evidence frozen separately |

### 残余风险

- `rd-operator` 浏览器直连 `/rd/monthly-reporting` 本轮未形成稳定主证据：headless smoke 中出现前端权限提示且 summary 未稳定回出 seeded 数据；因此本轮用管理员页面 + RD 作用域 live API 替代。
- `rd-operator` 浏览器直连 `/rd/monthly-reporting` 的页面壳层权限提示仍建议后续单独补一轮 smoke，但当前 live API 与管理员页面证据已经证明项目化口径本身成立。
- `2026-07-09` 复核补记：
  - `F6-BROWSER-1/2/3` 仍为 planned / 未代码化，手工 CDP 证据冻结在 `run-20260414-1620-rd-sub-project-attribution-and-reporting-alignment.md`。
  - `rd-operator` 直连 `/rd/monthly-reporting` 的 smoke 自 `2026-04-14` 重构以来一直未补。
  - 旧 run 引用的 fixture 种子脚本 `scripts/dev/reset-and-seed-test-data.ts` 已不存在；后续代码化上述 case 需先建立新的 fixture 路径。
  - 新增 UI 面待补浏览器验收：交接创建 / 作废（`/rd/inbound-results` 页面）、手工状态动作撤销、项目台账交接入 / 在库成本列。
