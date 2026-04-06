# 验收执行报告：Master Data F1-F8 Browser Verification Fix Loop

## 元数据

| 字段 | 值 |
|------|------|
| 关联 spec | `docs/acceptance-tests/specs/master-data.md` |
| 关联 task | `docs/tasks/archive/retained-completed/task-20260406-0134-master-data-phase1-browser-verification-fix-loop.md` |
| 创建原因 | 冻结本轮 `master-data` Phase 1 full browser verification / fix loop 的收口结果 |
| 状态 | `passed` |
| 环境 | 仓库根目录 `.env.dev`；backend `http://127.0.0.1:8112`；web `http://localhost:90`；`agent-browser` |
| 验证时间 | 2026-04-06 |
| 环境复核 | `pnpm --dir web build:prod` → `passed` |
| 三层回归 | `pnpm test -- src/modules/master-data/controllers/master-data.controller.spec.ts src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts` → `passed`（3 suites, 80 tests） |

## 执行范围

- 本轮新增 browser/manual case：
  - `F3-BROWSER-1`
  - `F5-BROWSER-1`
  - `F6-BROWSER-1`
  - `F7-BROWSER-1`
  - `F8-BROWSER-1`
- 既有 browser 基线保留：
  - `docs/acceptance-tests/runs/run-20260406-0043-master-data-f2-browser-qa.md`
  - `docs/acceptance-tests/runs/run-20260406-0124-master-data-f1-f2-browser-alignment.md`
  - `docs/acceptance-tests/runs/run-20260406-0026-master-data-f4-browser-qa.md`
- 账号：`admin / admin123`
- 主要浏览器入口：
  - `/base/customer`
  - `/base/personnel`
  - `/base/workshop`
  - `/base/stock-scope`
  - `/entry/order`

## 环境观察

- 验收环境按 `.env.dev` 口径运行，backend `:8112` 与 web `:90` 可连通。
- 本轮补充复核的前端构建命令 `pnpm --dir web build:prod` 已通过。
- 本轮补充复核的 master-data 三层回归命令已通过，覆盖 controller / service / repository 的核心合同。
- 本次收口重点是 `F3 / F5 / F6 / F7 / F8` 的浏览器证据冻结，`F1 / F2 / F4` 继续沿用既有 browser baseline。

## 执行结果

| Case | 结果 | 证据 |
|------|------|------|
| `F3-BROWSER-1` | pass | `/base/customer` 新增 `201`；编辑时 code 字段 disabled；`PATCH /api/master-data/customers/2` `200`；`PATCH /api/master-data/customers/2/deactivate` `200`；停用后列表消失 |
| `F5-BROWSER-1` | pass | `/base/personnel` 新增 `201`；`PATCH /api/master-data/personnel/2/deactivate` `200`；active 列表中不再显示该条 |
| `F6-BROWSER-1` | pass | `/base/workshop` 新增 `201`；编辑时 code 字段 disabled；`PATCH /api/master-data/workshops/153` `200`；`PATCH /api/master-data/workshops/153/deactivate` `200` |
| `F7-BROWSER-1` | pass | `/base/stock-scope` 新增 `201`；编辑时 code 字段 disabled；`PATCH /api/master-data/stock-scopes/153` `200`；`PATCH /api/master-data/stock-scopes/153/deactivate` `200`；菜单“库存范围管理”可见 |
| `F8-BROWSER-1` | pass | `/entry/order` 新增验收单弹窗搜索已停用车间“浏览器车间0202-改”时 tooltip 显示“无数据”；`GET /api/master-data/workshops?keyword=浏览器车间0202-改&limit=100&offset=0` `200` |

## 关键网络证据

| 请求 | 结果 |
|------|------|
| `POST /api/master-data/customers` | `201` |
| `PATCH /api/master-data/customers/2` | `200` |
| `PATCH /api/master-data/customers/2/deactivate` | `200` |
| `POST /api/master-data/personnel` | `201` |
| `PATCH /api/master-data/personnel/2/deactivate` | `200` |
| `POST /api/master-data/workshops` | `201` |
| `PATCH /api/master-data/workshops/153` | `200` |
| `PATCH /api/master-data/workshops/153/deactivate` | `200` |
| `POST /api/master-data/stock-scopes` | `201` |
| `PATCH /api/master-data/stock-scopes/153` | `200` |
| `PATCH /api/master-data/stock-scopes/153/deactivate` | `200` |
| `GET /api/master-data/workshops?keyword=浏览器车间0202-改&limit=100&offset=0` | `200`，`items=[]`，`total=0` |
| `pnpm --dir web build:prod` | `passed` |
| `pnpm test -- src/modules/master-data/controllers/master-data.controller.spec.ts src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts` | `passed`，3 suites / 80 tests |

## 验收矩阵

| AC | 结论 | 关键证据 | 备注 |
|----|------|----------|------|
| AC-1 | `met` | `F3-BROWSER-1`、`F5-BROWSER-1`、`F6-BROWSER-1`、`F7-BROWSER-1` 的真实新增 / 修改 / 停用复验；`F1 / F2 / F4` 继续沿用既有 browser baseline | 本轮 focus 在 F3/F5/F6/F7 |
| AC-2 | `met` | `F8-BROWSER-1`：`/entry/order` 车间下拉搜索停用车间返回无数据 | active-only consumer smoke 通过 |
| AC-3 | `met` | 本轮 in-scope 修复已完成并复验；web build 通过；相关 browser 复测无新增阻塞 | reviewer 未给出新增 actionable finding |
| AC-4 | `met` | pre-dirty surfaces 未被回退或覆盖，仍按既有修改保留 | 以 reviewer / diff 结论为准 |
| AC-5 | `met` | review clean，未保留 actionable finding | 复验后可签收 |
| AC-6 | `met` | `docs/acceptance-tests/specs/master-data.md`、`docs/acceptance-tests/cases/master-data.json`、本 run 均已更新；`pnpm --dir web build:prod` 通过 | complete report frozen |

## 总结

- 建议：`accept`
- Acceptance QA 判断：`passed`
- 残余风险：本轮新增的是 browser smoke / manual evidence，不替代既有 unit / service / consumer contract 证据；历史 baseline 继续保留。
