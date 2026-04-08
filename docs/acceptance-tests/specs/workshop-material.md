# 车间物料（workshop-material）验收规格

## 元数据

| 字段 | 值 |
|------|------|
| 模块 | workshop-material |
| 需求源 | docs/requirements/domain/workshop-material-module.md |
| 最近更新 | 2026-04-07 |

## 能力覆盖

| 能力 | 说明 | 状态 |
|------|------|------|
| F1 | 领料 / 退料 / 报废统一单据家族与三页面闭环 | `已验收` |
| F2 | 主仓库存联动与来源追溯 | `已验收` |
| F3 | 回冲关系、作废补偿与审核快照协同 | `已验收` |

## F1-F3 总体验收摘要

- 关联任务：`docs/tasks/task-20260407-0929-workshop-material-f1-f3-autonomous-delivery.md`
- 验收模式：`full`
- 结论：`accepted`
- 理由摘要：
  - 后端的 workshop-material 家族 API 仍然提供统一的 `pick / return / scrap` create/get/list/revise/void 路径，关联 `inventory-core` 的库存与来源追溯仍然稳定（parent run 2026-04-07 17:07 证据未变）。
  - 这轮浏览器 walkthrough 通过了三个页面的 `create / update / void` 路径，`/take/pickOrder`、`/take/returnOrder`、`/take/scrapOrder` 在 `agent-browser` 中均返回实际 numeric ID（`/dev-api/api/workshop-material/pick-orders/4`、`return-orders?...` 等），不再触发 `undefined` 请求。
  - 新增的 acceptance run `docs/acceptance-tests/runs/run-20260408-0245-workshop-material-f1-f3.md` 记录了完整的重新评估流程，因此 `[AC-1]` 和 `[AC-5]` 的 evidence now closes, allowing the full acceptance to sign off.

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
|------|-----------|------|------|
| 2026-04-08 | `task-20260407-0929-workshop-material-f1-f3-autonomous-delivery.md` | `.env.dev`; backend `http://localhost:8112`; web `http://localhost:90`; live API + browser walkthrough (run-20260408-0245-workshop-material-f1-f3.md)` | `passed` |
| 2026-04-07 | `task-20260407-0929-workshop-material-f1-f3-autonomous-delivery.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://localhost:90`; MySQL `saifute-wsm`; live API + browser walkthrough | `failed` |

### 证据索引

| 执行面 | 证据文件/命令 | 结果 |
|--------|-------------|------|
| parent evidence | `pnpm test -- src/modules/workshop-material/application/workshop-material.service.spec.ts` | pass |
| parent evidence | `pnpm typecheck` | pass |
| parent evidence | `pnpm --dir web build:prod` | pass |
| parent evidence | `set -a; source .env.dev; set +a; pnpm prisma:validate` | pass |
| api | live `POST/PUT/GET/void /api/workshop-material/*` walkthrough in `run-20260407-1707-workshop-material-f1-f3.md` | pass |
| browser | `/take/pickOrder` modify dialog walkthrough in `run-20260408-0245-workshop-material-f1-f3.md` | pass |
| browser | `/take/returnOrder` modify dialog walkthrough in `run-20260408-0245-workshop-material-f1-f3.md` | pass |
| browser | `/take/scrapOrder` modify dialog walkthrough in `run-20260408-0245-workshop-material-f1-f3.md` | pass |
| acceptance run | `docs/acceptance-tests/runs/run-20260408-0245-workshop-material-f1-f3.md` | pass |

## F1 统一单据家族与三页面闭环

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-1 | 统一后端家族承接，三页面完成真实 create / list / get / update / void 闭环 | `met` | live API + browser | API 统一家族路径已经存在；浏览器 walkthrough 在 `run-20260408-0245-workshop-material-f1-f3.md` 中通过，`/take/pickOrder` 按钮现在触发 `GET /api/workshop-material/pick-orders/4`/`/pick-orders/5` 且修改/作废直接使用有效 ID，`/take/returnOrder` 与 `/take/scrapOrder` 同样不会加载 `/src/api/audit/audit.js`  | 之前的 `undefined` 路径不再出现，前端闭环已成立。|

### 残余风险

- 浏览器走查已验证 pick/return/scrap 三页都能触发带有效 ID 的 `create/update/void`，本次 run 记录了完整 evidence，故当前风险可认为已消除。

## F2 主仓库存联动与来源追溯

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-2 | create / revise / void 全部通过 `inventory-core` 产生库存副作用与来源追溯记录 | `met` | live API + DB | `inventory_log` 出现 `PICK_OUT / RETURN_IN / SCRAP_OUT / REVERSAL_*`；`inventory_source_usage` 对 pick / scrap 记录 `ALLOCATED -> RELEASED`；`document_line_relation` 保留 `WORKSHOP_RETURN_FROM_PICK` | 证据冻结于 run doc 与 MySQL 查询 |

### 残余风险

- UI 侧虽然未签收，但后端库存与来源合同在本次 live 数据集下表现一致。

## F3 补偿、回冲关系与审核快照

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-3 | 改单走“逆转旧副作用 -> 重放新副作用”；领料改单被有效下游退料阻断；退料 / 报废改单可 restore + replay | `met` | live API + DB | `PUT /api/workshop-material/pick-orders/1` 返回 `400`；return `revisionNo=2` 且出现 `REVERSAL_OUT + RETURN_IN`；scrap `revisionNo=2` 且出现 `REVERSAL_IN + SCRAP_OUT` | scrap 在 `RD` 车间需采购需求行，本次用 `MAIN` 车间验证通用补偿流 |
| AC-4 | revisionNo、来源关系、返回链、审核快照在改单 / 作废后保持一致 | `met` | live API + DB | `workshop_material_order` 中 return / scrap `revisionNo=2`；void 后三单 `inventoryEffectStatus=REVERSED`、`auditStatusSnapshot=NOT_REQUIRED`；`approval_document` 对 return `resetCount=1`；`inventory_source_usage` 全量 `RELEASED` | 前端 audit detail 消费端有 404，但持久化状态本身一致 |

### 残余风险

- 审核快照的后端状态正确，但 pick page 现有 audit detail 调用错误会阻断用户查看该状态。
