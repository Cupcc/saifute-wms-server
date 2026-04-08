# 验收执行报告：Workshop Material F1-F3 Full Acceptance

## 元数据

| 字段 | 值 |
|------|------|
| 关联 spec | `docs/acceptance-tests/specs/workshop-material.md` |
| 关联 task | `docs/tasks/task-20260407-0929-workshop-material-f1-f3-autonomous-delivery.md` |
| 创建原因 | 冻结本轮 workshop-material F1-F3 full acceptance 的 live API + browser 结果 |
| 状态 | `failed` |
| 环境 | 仓库根目录 `.env.dev`；backend `http://127.0.0.1:8112`；web `http://localhost:90`；MySQL `saifute-wsm`；`chrome-devtools-mcp` |
| 被测提交 | `0eeec6f39ecec0ce946a2cf52f4080b0309c53e6` |
| 时间 | `2026-04-07` |

## 环境复核

- `.env.dev` 已显式作为本地验收基线；`GET /api/auth/captcha` 返回 `captchaEnabled=false`，可直接用 `admin / admin123` 登录。
- 父级已提供通过证据：
  - `pnpm test -- src/modules/workshop-material/application/workshop-material.service.spec.ts`
  - `pnpm typecheck`
  - `pnpm --dir web build:prod`
  - `set -a; source .env.dev; set +a; pnpm prisma:validate`
- 本轮另行确认：
  - `GET /api/health` -> `200`
  - backend / web 均可在本机连通
  - 浏览器 harness 起初被历史 `chrome-devtools-mcp` profile 占用；清理陈旧浏览器进程后可执行实际 UI 验收，不构成 repo 级 environment-gap

## 执行范围

- Live API:
  - `POST /api/inbound/into-orders`
  - `POST /api/workshop-material/pick-orders`
  - `POST /api/workshop-material/return-orders`
  - `POST /api/workshop-material/scrap-orders`
  - `PUT /api/workshop-material/{pick|return|scrap}-orders/:id`
  - `POST /api/workshop-material/{pick|return|scrap}-orders/:id/void`
  - `GET /api/inventory/logs`
  - `GET /api/inventory/source-usages`
- Browser walkthrough:
  - `/take/pickOrder`
  - `/take/returnOrder`
  - `/take/scrapOrder`
- DB evidence freeze:
  - `workshop_material_order`
  - `workshop_material_order_line`
  - `document_line_relation`
  - `inventory_log`
  - `inventory_source_usage`
  - `approval_document`

## Live API Evidence

### 1. 预置库存

- `POST /api/inbound/into-orders` -> `201`
- 关键结果：
  - `id=1`
  - `documentNo=INTO-QA-1775552343023`
  - 实际返回 `orderType=PRODUCTION_RECEIPT`
  - `inventory_log` 写入 `PRODUCTION_RECEIPT_IN`
  - `inventory_balance` 中 material `7` 的 MAIN 库存从 `0` 变为 `8`

### 2. 领料 create + source usage

- `POST /api/workshop-material/pick-orders` -> `201`
- 关键结果：
  - `id=1`
  - `documentNo=PICK-QA-1775552384856`
  - `revisionNo=1`
  - `inventory_log` 写入 `PICK_OUT`，`beforeQty=8` `afterQty=5`
  - `inventory_source_usage` 写入 `allocatedQty=3`，`status=ALLOCATED`

### 3. 退料 create + revise + 下游阻断

- `POST /api/workshop-material/return-orders` -> `201`
- 关键结果：
  - `id=2`
  - `sourceDocumentId=1`
  - `sourceDocumentLineId=1`
  - `document_line_relation` 写入 `WORKSHOP_RETURN_FROM_PICK`
- `PUT /api/workshop-material/pick-orders/1` -> `400`
  - 消息：`存在未作废的退料单下游，不能修改领料单`
- `PUT /api/workshop-material/return-orders/2` -> `200`
  - `revisionNo: 1 -> 2`
  - `inventory_log` 顺序出现：
    - `id=7 RETURN_IN changeQty=1`
    - `id=8 REVERSAL_OUT changeQty=1 reversalOfLogId=7`
    - `id=9 RETURN_IN changeQty=0.5`
  - 关联 pick 的 `inventory_source_usage` 变为 `releasedQty=0.5` `status=PARTIALLY_RELEASED`

### 4. 报废 create + revise

- `POST /api/workshop-material/scrap-orders`，`workshopId=2 (RD)` -> `400`
  - 消息：`RD 报废明细必须绑定采购需求行`
  - 说明：该数据集下 RD 报废存在额外业务约束；本轮改用 `MAIN` 车间验证通用补偿流
- `POST /api/workshop-material/scrap-orders`，`workshopId=1 (MAIN)` -> `201`
  - `id=3`
  - `documentNo=SCRAP-QA-1775552486995`
- `PUT /api/workshop-material/scrap-orders/3` -> `200`
  - `revisionNo: 1 -> 2`
  - `inventory_log` 顺序出现：
    - `id=10 SCRAP_OUT changeQty=1.5`
    - `id=11 REVERSAL_IN changeQty=1.5 reversalOfLogId=10`
    - `id=12 SCRAP_OUT changeQty=1`
  - `inventory_source_usage` 旧行 `id=3` 变 `RELEASED`，新行 `id=4` 保持 `ALLOCATED`

### 5. 三单 void

- `POST /api/workshop-material/return-orders/2/void` -> `201`
- `POST /api/workshop-material/pick-orders/1/void` -> `201`
- `POST /api/workshop-material/scrap-orders/3/void` -> `201`
- void 后关键结果：
  - 三单 `lifecycleStatus=VOIDED`
  - 三单 `inventoryEffectStatus=REVERSED`
  - `inventory_log` 新增：
    - `id=13 REVERSAL_OUT reversalOfLogId=9` for return
    - `id=14 REVERSAL_IN reversalOfLogId=6` for pick
    - `id=15 REVERSAL_IN reversalOfLogId=12` for scrap
  - `inventory_source_usage` 中 pick / scrap 相关记录全部 `releasedQty=allocatedQty` 且 `status=RELEASED`
  - 列表查询 `GET /api/workshop-material/{pick|return|scrap}-orders?limit=20&offset=0` 全部返回 `items=[]`

### 6. DB Frozen State

| 表 | 关键结果 |
|----|----------|
| `workshop_material_order` | pick=`VOIDED/REVERSED/NOT_REQUIRED/revisionNo=1`; return=`VOIDED/REVERSED/NOT_REQUIRED/revisionNo=2`; scrap=`VOIDED/REVERSED/NOT_REQUIRED/revisionNo=2` |
| `workshop_material_order_line` | return 行仍保留 `sourceDocumentId=1`, `sourceDocumentLineId=1` |
| `document_line_relation` | `WORKSHOP_RETURN_FROM_PICK` 关系仍存在：upstream `1/1` -> downstream `2/3` |
| `approval_document` | pick 文档 `auditStatus=NOT_REQUIRED`; return 文档 `auditStatus=NOT_REQUIRED`, `resetCount=1`, `lastResetAt=2026-04-07 09:00:39.693` |
| `inventory_source_usage` | 所有 workshop-material consumer 行最终均为 `RELEASED` |

## Browser Evidence

### `/take/pickOrder`

- 页面可打开并列出 live API 创建的领料单。
- 点击行内“修改”后失败：
  - network `GET /api/workshop-material/pick-orders/undefined` -> `400`
  - network `GET /api/audit/documents/detail?documentType=WorkshopMaterialOrder` -> `404`
  - 控制台堆栈指向 `pickOrder.js -> compat.js -> handleUpdate`
  - 弹窗内明细区域显示“暂无数据”
- 该缺陷直接阻断页面级真实改单闭环。

### `/take/returnOrder`

- 页面路由无法正常启动。
- 关键失败：
  - network `GET /src/api/audit/audit.js?t=*` -> `404`
  - console: `TypeError: Failed to fetch dynamically imported module: http://localhost:90/src/views/take/returnOrder/index.vue?...`
- 因为路由 bootstrap 即失败，退料页无法进行任何 create / query / update / void 用户流验证。

### `/take/scrapOrder`

- 页面成功打开并显示 live API 创建的 `SCRAP-QA-1775552486995`。
- 点击“修改”可打开弹窗并回显：
  - 单号
  - 日期
  - 经办人
  - 车间
  - 明细中的物料与数量
- 但单页成功不足以覆盖 pick / return 两页失败。

## 验收矩阵

| AC | 结论 | 关键证据 | 备注 |
|----|------|----------|------|
| AC-1 | `not-met` | unified API 家族成立，但 `/take/pickOrder` 修改失败、`/take/returnOrder` 路由失败 | 前端闭环未满足 |
| AC-2 | `met` | live API + `inventory_log` + `inventory_source_usage` + `document_line_relation` | create / revise / void 均经 inventory-core 落表 |
| AC-3 | `met` | pick revise `400` 阻断；return / scrap revise 均有 reversal + replay | scrap 的 RD 专属前置约束已记录 |
| AC-4 | `met` | `revisionNo`、relation、approval_document、source usage 与 void 后状态一致 | 后端状态满足 requirement |
| AC-5 | `not-met` | browser walkthrough 未通过，full acceptance 不能签收 | spec/cases/run 已补齐，但结果仍是 failed |

## 总结

- 建议：`reject`
- 根因类型：`implementation-gap`
- 需要修复的具体项：
  - 修复 `pickOrder` 修改流中把 document id 传成 `undefined` 的前端集成错误，并修正错误的 audit detail 请求。
  - 修复 `returnOrder` 对不存在模块 `src/api/audit/audit.js` 的引用或打包路径错误，恢复页面正常加载。
  - 修复后重新执行三页面真实 browser walkthrough，至少覆盖 pick / return / scrap 的 list + detail/edit + void。
