# 验收执行报告：Master Data F6 Workshop Runtime Compatibility

## 元数据

| 字段 | 值 |
|------|------|
| 关联 spec | `docs/acceptance-tests/specs/master-data.md` |
| 关联 task | `docs/tasks/archive/retained-completed/task-20260408-1842-master-data-f6-workshop-runtime-compatibility.md` |
| 创建原因 | 冻结本轮 `F6` 车间运行时兼容修复的 targeted runtime / browser / review 收口结果 |
| 状态 | `passed` |
| 环境 | 仓库根目录 `.env.dev`；backend `http://127.0.0.1:8113`；web `http://127.0.0.1:5174`；`agent-browser` |
| 验证时间 | `2026-04-08 19:07` |
| 环境复核 | authenticated API smoke + browser smoke → `passed` |
| 聚焦自动化 | parent evidence: `pnpm test -- src/modules/master-data/controllers/master-data.controller.spec.ts src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts`、`pnpm typecheck`、`pnpm build`、`pnpm --dir web build:prod` → `passed` |
| Review gate | parent `saifute-code-reviewer` → `approved`，`findings: none` |

## 执行范围

- 本轮 targeted runtime/browser case：
  - `F6-RUNTIME-1`：`/base/workshop` 首屏列表恢复
  - `F6-CONTRACT-1`：`Workshop` 运行时合同仍为 `workshopCode + workshopName`
  - `F8-CONSUMER-1`：`/entry/order` 车间消费者保持 active-only 查询
- 对齐基线：
  - `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`
- 账号：
  - `admin / admin123`

## 环境观察

- 验收环境按 `.env.dev` 显式口径执行；backend `:8113` 与 web `:5174` 均可访问。
- 直接匿名访问 `GET /api/master-data/workshops?...` 返回 `401`，说明本轮 API 证据必须基于真实登录态，不用匿名请求误判业务回归。
- 浏览器登录后，`/base/workshop` 与 `/entry/order` 均正常加载，网络面未再出现历史 `500`。

## 执行结果

| Case | 结果 | 证据 |
|------|------|------|
| `F6-RUNTIME-1` | pass | `POST /api/auth/login` `200`；`GET /api/master-data/workshops?limit=30&offset=0` `200`；`/base/workshop` 首屏渲染 `装备车间`、`主仓`、`研发小仓` |
| `F6-CONTRACT-1` | pass | API 返回项包含 `workshopCode`、`workshopName`；编辑弹窗中 `车间编码` disabled、`车间名称` 可编辑；scoped grep 未发现 workshop CRUD path 仍依赖 `handlerPersonnelId` |
| `F8-CONSUMER-1` | pass | `/entry/order` 新增弹窗打开“关联部门”时 `GET /api/master-data/workshops?limit=100&offset=0` `200`；搜索停用车间 `浏览器车间0202-改` 时 `GET /api/master-data/workshops?keyword=浏览器车间0202-改&limit=100&offset=0` `200`，authenticated API cross-check `items=[]` |
| `REVIEW-GATE-1` | pass | parent `saifute-code-reviewer` handoff: `approved`、`findings: none`、`next_step: acceptance-qa` |

## 关键证据

| 证据 | 结果 |
|------|------|
| `POST /api/auth/login` | `200` |
| `GET /api/master-data/workshops?limit=30&offset=0` | `200`，`items` 含 `workshopCode` / `workshopName` |
| `GET /api/master-data/workshops?keyword=浏览器车间0202-改&limit=100&offset=0` | `200`，`items=[]`，`total=0` |
| browser: `/base/workshop` | 首屏列表正常，无 `500` |
| browser: `/base/workshop` 编辑弹窗 | `车间编码` disabled，`车间名称` 可编辑 |
| browser: `/entry/order` 新增弹窗 | 关联部门下拉仍只返回 active workshops；停用车间搜索为空 |
| parent review handoff | `approved`，无 scoped findings |

## 验收矩阵

| AC | 结论 | 关键证据 | 备注 |
|----|------|----------|------|
| AC-1 | `met` | authenticated API smoke + `/base/workshop` browser smoke | 历史 `500` 已关闭 |
| AC-2 | `met` | API 返回字段、编辑弹窗字段、scoped contract grep | 合同恢复到 accepted `workshopCode + workshopName` |
| AC-3 | `met` | parent focused automation + `/entry/order` consumer rerun | `F8` active-only 语义保持 |
| AC-4 | `met` | parent review handoff `approved` + 本 run 冻结结果 | 接受门禁完成 |

## 总结

- 建议：`accept`
- Acceptance QA 判断：`passed`
- 残余风险：本 run 是 targeted runtime/browser 收口，不替代 `2026-04-06` 的 full baseline；后续若再改 workshop contract，仍需重新验证 `F6` 管理页与 `F8` 消费者路径。
