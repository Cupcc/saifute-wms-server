# 基础数据（master-data）验收规格

## 元数据


| 字段   | 值                                                  |
| ---- | -------------------------------------------------- |
| 模块   | master-data                                        |
| 需求源  | docs/requirements/domain/master-data-management.md |
| 最近更新 | 2026-04-06                                         |


## 能力覆盖


| 能力              | 说明              | 状态      |
| --------------- | --------------- | ------- |
| F1 物料分类 CRUD    | 分类树增删改查         | `已验收`   |
| F2 物料 CRUD      | 物料主档增删改查        | `已验收`   |
| F3 客户 CRUD      | 客户树增删改查         | `已验收`   |
| **F4 供应商 CRUD** | 供应商增删改查+停用+下拉过滤 | **已验收** |
| F5 人员 CRUD        | 人员增删改查          | `已验收`   |
| F6 车间 CRUD        | 车间增删改查          | `已验收`   |
| F7 库存范围 CRUD      | 库存范围增删改查        | `已验收`   |
| F8 主数据查询/快照服务   | active-only 下拉与快照能力 | `已验收`   |
| F9 物料库存预警配置     | 按库存范围维护阈值并输出预警   | `未开始`   |
| F10 主数据批量导入     | Excel 模板导入主数据   | `未开始`   |


## Phase 1 总体验收摘要

- **关联任务**：`docs/tasks/archive/retained-completed/task-20260402-1802-master-data-phase1-completion.md`
- **验收模式**：`full`
- **结论**：`accepted`
- **理由摘要**：
  - **行为与回归**：`master-data` 三层单测（repository / service / controller）76 条通过；消费者回归（inbound、customer、project、workshop-material、rd-procurement-request、rbac）66 条通过；全量 `pnpm verify` 在**正确测试环境**下通过（见下文「测试环境注意」）。
  - **HTTP e2e**：`pnpm test:e2e` **全量通过**（4 suites，23 tests，exit 0），含 `test/redis-real-integration.e2e-spec.ts`；其中 Redis 连接类日志为用例内**预期探测行为**，不视为环境缺口。
  - **供应商负向权限**：`test/master-data-supplier.e2e-spec.ts` 负向用例已改为使用 **`rd-operator`**（无 `master:supplier:create`），与 `warehouse-manager` / `operator` 含创建权限的预设区分，避免陈旧期望。
  - **前端**：`pnpm --dir web build:prod` 通过；`web/src/api/base/**` 对 Phase 1 实体使用真实 `/api/master-data/*` 路径；`permissionCompat.js` 覆盖 `master:*` 与 legacy `base:*` 别名。
  - **Browser QA 复验**：2026-04-06 使用 `agent-browser` 在 `http://localhost:90` 完成 `F4-BROWSER-1` 与 `F2-BROWSER-1`。其中 F4 验证供应商管理页新增/停用与 `验收单` 供应商下拉过滤；F2 在空 `material_category` 环境下首次新增返回 `500`，补最小分类 fixture 后复验通过，关键网络证据为 `POST /api/master-data/materials` = `201`、`PATCH /api/master-data/materials/6/deactivate` = `200`、`GET /api/master-data/materials?keyword=MAT-QA-20260406-001&limit=30&offset=0` = `{"items":[],"total":0}`。
  - **对齐修复复验**：同日后续切片 `task-20260406-0106` 已补齐 `物料分类管理` 页面、移除物料页默认 `categoryId=1` 并在后端收口非法分类错误语义；targeted browser 复验中，`POST /api/master-data/material-categories` = `201`、物料在“无分类选择”和“有效分类选择”两种路径下 `POST /api/master-data/materials` 均 = `201`，直接提交 `categoryId=999999` 返回 `400`，不再出现历史 `500`。
  - **非阻塞残留**：仓库级 `pnpm lint`（biome）仍因**既有**前端/工具链文件未净，**本轮变更的 master-data / RBAC / web 兼容路径无新增 lint 报告**。

### 测试环境注意（门禁可复现）

- 若 shell 已 `source .env.dev` 且其中 **`CAPTCHA_ENABLED=false`**，则带验证码登录链路的 HTTP 测试会得到 **400**（`LoginDto` 对空 `captchaId` 校验）。与 `docs/tasks/task-20260402-0139-system-management-f4-real-persistence.md` 一致，对 **stub 型 e2e / 单元测试中的 App 启动**，应对相关变量使用 `env -u CAPTCHA_ENABLED ...`（或等价方式）使 `CAPTCHA_ENABLED` 回落到默认 `true`，再跑 `pnpm test` / `pnpm test:e2e`。
- **本验收执行的 verify 命令**：`env -u CAPTCHA_ENABLED pnpm verify` → **exit 0**，553 tests passed。

### 验证摘要（Phase 1 收口）


| 时间         | 关联 task                         | 环境                               | 结果                    |
| ---------- | ------------------------------- | -------------------------------- | --------------------- |
| 2026-04-03 | task-20260402-1758（F4 基线）       | .env.dev；unit+e2e+build+browser（历史） | `passed`（F4 section 保留） |
| 2026-04-04 | task-20260402-1802（Phase 1 全量收口） | prisma validate/generate；`env -u CAPTCHA_ENABLED pnpm verify`；master-data + consumer tests；`web build:prod`；`pnpm test:e2e` 全绿；repo-wide lint 未净（非本改动引入） | `accepted` |
| 2026-04-06 | task-20260402-1758（F4 browser QA 复验） | `.env.dev`；backend `:8112` + web `:90`；`agent-browser` | `passed` |
| 2026-04-06 | task-20260402-1802（F2 browser QA 补证） | `.env.dev`；backend `:8112` + web `:90`；`agent-browser`；补最小 `material-category` fixture | `passed` |
| 2026-04-06 | task-20260406-0106（F1/F2 对齐修复复验） | `.env.dev`；backend `:8112` + web `:90`；`agent-browser`；真实登录 `admin` | `passed` |
| 2026-04-06 | task-20260406-0134（F1-F8 browser verification fix loop） | `.env.dev`；backend `:8112` + web `:90`；`agent-browser`；`pnpm --dir web build:prod`；master-data 三层回归 `3 suites / 80 tests` | `passed` |


---

## F4 供应商 CRUD

> 关联任务：`task-20260402-1758-master-data-f4-supplier-crud`（归档基线）  
> 未代码化 case（browser smoke）：`cases/master-data.json`

### 验收矩阵


| AC   | 描述                 | 结论    | 执行面                | 关键证据                                             | 备注                  |
| ---- | ------------------ | ----- | ------------------ | ------------------------------------------------ | ------------------- |
| AC-1 | 新增唯一性              | `met` | unit+e2e           | service.spec: ConflictException; e2e: 409        |                     |
| AC-2 | 修改与回读              | `met` | unit+e2e           | service.spec: update+NotFoundException; e2e: 200 |                     |
| AC-3 | 逻辑停用+active-only过滤 | `met` | unit+e2e+browser   | e2e: total=0/1; browser: dropdown empty（历史）          | 历史消费者已切到 opt-in 路径  |
| AC-4 | 停用后详情可读            | `met` | e2e                | e2e: status=DISABLED, 200                        |                     |
| AC-5 | AUTO_CREATED来源约束   | `met` | unit               | service.spec: provenance校验                       | 无真实调用方，待 inbound 接入 |
| AC-6 | 页面/API/权限兼容        | `met` | unit+build+browser | supplier.js真实请求; permissionCompat alias; build通过 |                     |


### 验证摘要


| 时间         | 关联task             | 环境                               | 结果       |
| ---------- | ------------------ | -------------------------------- | -------- |
| 2026-04-03 | task-20260402-1758 | .env.dev; unit+e2e+build+browser | `passed` |
| 2026-04-06 | task-20260402-1758 | `.env.dev`; `agent-browser`; `http://localhost:90` | `passed` |


### 证据索引


| 执行面     | 证据文件/命令                                                                 | 结果   |
| ------- | ----------------------------------------------------------------------- | ---- |
| unit    | `src/modules/master-data/application/master-data.service.spec.ts`       | pass |
| unit    | `src/modules/master-data/infrastructure/master-data.repository.spec.ts` | pass |
| unit    | `src/modules/master-data/controllers/master-data.controller.spec.ts`    | pass |
| unit    | `src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts`     | pass |
| e2e     | `test/master-data-supplier.e2e-spec.ts`（含 rd-operator 负向 403；CAPTCHA 环境见上）     | pass |
| e2e     | `pnpm test:e2e`（4 suites / 23 tests）                                        | pass |
| e2e     | `test/redis-real-integration.e2e-spec.ts`                                     | pass |
| build   | `pnpm --dir web build:prod`                                             | pass |
| build   | `pnpm verify`（`env -u CAPTCHA_ENABLED`）                                 | pass |
| browser | `docs/acceptance-tests/runs/run-20260406-0026-master-data-f4-browser-qa.md` | pass |


### 残余风险

- `ensureSupplier()` 仅有合同测试覆盖，无真实调用方；待 inbound 接入时补充集成测试


---

## F1 物料分类 CRUD

> 关联任务：`task-20260406-0106-master-data-material-category-alignment`（已归档）  
> Browser QA 补充证据：`docs/acceptance-tests/runs/run-20260406-0124-master-data-f1-f2-browser-alignment.md`

### 验收矩阵


| AC   | 描述                         | 结论  | 执行面 | 关键证据 |
| ---- | -------------------------- | --- | --- | ---- |
| TC-1 | 编码唯一                       | met | unit+browser | service.spec / repository.spec：重复编码 Conflict；browser：`POST /api/master-data/material-categories` = `201` |
| TC-2 | 树形查询                       | met | unit | 树构建与列表用例 |
| TC-3 | 停用前存在启用物料拦截                | met | unit | disable 守卫 |
| TC-4 | 停用前存在启用子分类拦截               | met | unit | 子节点校验 |
| TC-5 | 页面/API/权限兼容                | met | build+browser | `BaseMaterialCategory` 路由映射；`material-category` 页面真实可访问并回显新增分类 |

### 验证摘要

| 时间         | 关联 task              | 环境 | 结果 |
| ---------- | -------------------- | ---- | ---- |
| 2026-04-06 | `task-20260406-0106` | `.env.dev`; `agent-browser`; `/base/material-category` | `passed` |

### 证据索引

- `src/modules/master-data/application/master-data.service.spec.ts`
- `src/modules/master-data/infrastructure/master-data.repository.spec.ts`
- `src/modules/master-data/controllers/master-data.controller.spec.ts`
- `docs/acceptance-tests/runs/run-20260406-0124-master-data-f1-f2-browser-alignment.md`


---

## F2 物料 CRUD

### 验收矩阵


| AC   | 描述                    | 结论  | 执行面 | 关键证据 |
| ---- | --------------------- | --- | --- | ---- |
| TC-1 | 新增编码唯一                | met | unit | Conflict / 校验 |
| TC-2 | 停用前正余额行拦截             | met | unit | `countPositiveInventoryBalanceRows` |
| TC-3 | 停用前生效单据引用拦截           | met | unit | 生效引用计数 |
| TC-4 | AUTO_CREATED 审计字段完整   | met | unit | provenance |


### 验证摘要


| 时间         | 关联 task              | 环境 | 结果 |
| ---------- | -------------------- | ---- | ---- |
| 2026-04-06 | `task-20260402-1802` | `.env.dev`; `agent-browser`; 浏览器前置需至少 1 条 ACTIVE 物料分类，当前环境通过 API 补最小 fixture 后复验 | `passed` |
| 2026-04-06 | `task-20260406-0106` | `.env.dev`; `agent-browser`; `物料分类管理` 页面已补齐；物料在“无分类选择”与“有效分类选择”两种路径均可新增；非法 `categoryId` 返回 `400` | `passed` |


### 证据索引

- 同上 master-data `*.spec.ts`
- `docs/acceptance-tests/runs/run-20260406-0043-master-data-f2-browser-qa.md`
- `docs/acceptance-tests/runs/run-20260406-0124-master-data-f1-f2-browser-alignment.md`

### Browser 补充说明

- 本次 browser QA 验证了真实 UI 的新增、作废与 active-only 消费面过滤。
- 后续对齐修复已消除“页面默认提交 `categoryId=1` 导致空分类环境首次新增返回 `500`”的问题；当前页面已支持“不选分类”提交与“选择真实分类”提交两条路径。
- `TC-2` 正余额停用拦截与 `TC-3` 生效单据引用拦截仍以 unit / service 合同测试为准，本次未在浏览器层伪造这些阻断场景。


---

## F3 客户 CRUD

### 验收矩阵


| AC   | 描述           | 结论  | 执行面 | 关键证据 |
| ---- | ------------ | --- | --- | ---- |
| TC-1 | 编码唯一         | met | unit | 唯一性 |
| TC-2 | 树形层级         | met | unit | 树查询 |
| TC-3 | 停用前子客户拦截     | met | unit | 守卫 |
| TC-4 | 自动补建来源完整     | met | unit | AUTO_CREATED |


### 证据索引

- 同上；`web/src/api/base/customer.js` → `/api/master-data/customers`
- `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
| ---- | ---- | ---- | ---- |
| 2026-04-06 | `task-20260406-0134` | `.env.dev`; backend `:8112`; web `:90`; `agent-browser`; `admin` 已登录 | `passed` |

### Browser 补充说明

- 本轮在 `/base/customer` 完成新增、编辑与停用复验，编辑时编码字段保持只读。
- 客户名称修改后列表回显新值，停用后 active 列表不再展示该客户。
- 本轮 browser 证据与 run 冻结见 `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`。


---

## F5 人员 CRUD

### 验收矩阵


| AC   | 描述     | 结论  | 执行面 | 关键证据 |
| ---- | ------ | --- | --- | ---- |
| TC-1 | 编码唯一   | met | unit | 唯一性 |
| TC-2 | 停用后下拉过滤 | met | unit | active-only / list |
| TC-3 | 自动补建审计 | met | unit | 合同测试 |


### 证据索引

- `web/src/api/base/personnel.js`；master-data specs
- `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
| ---- | ---- | ---- | ---- |
| 2026-04-06 | `task-20260406-0134` | `.env.dev`; backend `:8112`; web `:90`; `agent-browser`; `admin` 已登录 | `passed` |

### Browser 补充说明

- 本轮在 `/base/personnel` 完成新增与停用复验，停用接口已切换为 `deactivate`。
- 停用后 active 列表中不再显示该人员。
- 本轮 browser 证据与 run 冻结见 `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`。


---

## F6 车间 CRUD

### 验收矩阵


| AC   | 描述      | 结论  | 执行面 | 关键证据 |
| ---- | ------- | --- | --- | ---- |
| TC-1 | 编码唯一    | met | unit | 唯一性 |
| TC-2 | 停用后下拉过滤 | met | unit | DISABLED 过滤 |
| TC-3 | 非独立库存池  | met | 设计+代码审阅 | 与 inventory 边界分离 |


### 证据索引

- `web/src/api/base/workshop.js`；service/repository specs
- `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
| ---- | ---- | ---- | ---- |
| 2026-04-06 | `task-20260406-0134` | `.env.dev`; backend `:8112`; web `:90`; `agent-browser`; `admin` 已登录 | `passed` |

### Browser 补充说明

- 本轮在 `/base/workshop` 完成新增、编辑与停用复验，编码字段保持只读。
- 页面契约已对齐到主数据主档，停用接口返回 `200`。
- 本轮 browser 证据与 run 冻结见 `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`。


---

## F7 库存范围 CRUD

### 验收矩阵


| AC   | 描述              | 结论  | 执行面 | 关键证据 |
| ---- | --------------- | --- | --- | ---- |
| TC-1 | 编码唯一            | met | unit | 唯一性 |
| TC-2 | 停用前正余额行拦截       | met | unit | `countPositiveStockScopeBalanceRows` |
| TC-3 | 停用后下拉不出现        | met | unit | active-only |


### 证据索引

- master-data specs；停用守卫与 canonical code lookup（DISABLED 拒绝）见 service 单测
- `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
| ---- | ---- | ---- | ---- |
| 2026-04-06 | `task-20260406-0134` | `.env.dev`; backend `:8112`; web `:90`; `agent-browser`; `admin` 已登录 | `passed` |

### Browser 补充说明

- 本轮在 `/base/stock-scope` 完成新增、编辑与停用复验，菜单“库存范围管理”已可见。
- 停用接口返回 `200`，编码字段保持只读。
- 本轮 browser 证据与 run 冻结见 `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`。


---

## F8 主数据查询/快照服务

### 验收矩阵


| AC   | 描述              | 结论  | 执行面 | 关键证据 |
| ---- | --------------- | --- | --- | ---- |
| TC-1 | 下拉仅 ACTIVE      | met | unit+消费者 | query 与消费者回归 |
| TC-2 | 快照由单据固化（契约稳定） | met | 模块边界 | 既有单据快照字段 + MasterDataService 消费稳定 |


### 证据索引

- `MasterDataService` 与消费者模块单测；controller 列表/详情 active 过滤
- `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
| ---- | ---- | ---- | ---- |
| 2026-04-06 | `task-20260406-0134` | `.env.dev`; backend `:8112`; web `:90`; `agent-browser`; `admin` 已登录 | `passed` |

### Browser 补充说明

- 本轮在 `/entry/order` 的新增验收单弹窗中复验了车间下拉的 active-only 语义。
- 搜索已停用车间“浏览器车间0202-改”时，下拉返回无数据，网络响应 `GET /api/master-data/workshops?keyword=浏览器车间0202-改&limit=100&offset=0` 为 `200` 且 `items=[]`。
- 本轮 browser 证据与 run 冻结见 `docs/acceptance-tests/runs/run-20260406-0134-master-data-f1-f8-browser-verification.md`。


---

## F9 物料库存预警配置

> Phase 2，未纳入本轮。

---

## F10 主数据批量导入

> Phase 3，未纳入本轮。
