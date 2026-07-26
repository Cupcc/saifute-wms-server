# 研发采购自由品项、BOM 目录与首次物料绑定

## Metadata

- Scope:
  - 研发采购需求允许录入不依赖物料主档的一次性自由品项；采购需求创建时不自动创建物料。
  - 采购录入阶段的可复用物料建议只来自当前研发项目 BOM 与其他有效研发项目 BOM，当前项目优先，BOM 之外的普通物料主档不得进入该建议目录。
  - 主仓验收单继续保持与 RD 采购需求无结构化关联；普通 `inbound` 自由录入及其自动库存物料身份能力保持原样。
  - RD 采购行若仍未绑定物料，只能在 `ACCEPTANCE_CONFIRMED` 时选择一个已经存在的物料身份完成首次绑定；状态动作不得创建物料，首次绑定后不得改绑、解绑或因状态回滚而漂移。
- Related requirement:
  - `docs/requirements/domain/rd-subwarehouse.md (F3,F4)`
  - `docs/requirements/domain/rd-project-management.md (F2)`
- Status: `planned`
- Review status: `not-reviewed`
- Delivery mode: `standard`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `saifute-planner`
- Coder:
- Reviewer:
- Acceptance QA:
- Last updated: `2026-07-12`
- Related checklist: `-`
- Related acceptance spec:
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
  - `docs/acceptance-tests/specs/rd-project.md`
- Related acceptance run: (optional)
- Related files:
  - `prisma/schema.prisma`
  - `scripts/migration/sql/20260712-rd-procurement-free-text-binding.sql`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/rd-project/**`
  - `src/modules/workshop-material/**`
  - `src/modules/inbound/**`（只做既有自由验收能力回归，不新增 RD 结构化关联）
  - `web/src/api/rd-subwarehouse.js`
  - `web/src/views/rd/procurement-requests/**`
  - `web/src/views/rd/inbound-results/index.vue`
  - `web/src/views/rd/scrap-orders/index.vue`
  - `docs/requirements/domain/rd-subwarehouse.md`
  - `docs/requirements/domain/rd-project-management.md`
  - `docs/architecture/modules/rd-subwarehouse.md`
  - `docs/architecture/modules/rd-project.md`
  - `docs/architecture/modules/master-data.md`
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
  - `docs/acceptance-tests/specs/rd-project.md`
  - `docs/acceptance-tests/cases/rd-subwarehouse.json`

## Requirement Alignment

- Domain capability:
  - `rd-subwarehouse (F3)` 继续承接研发采购需求与研发协同验收，但采购需求本身不产生库存，也不要求创建正式物料主档。
  - `rd-subwarehouse (F4)` 的状态链继续承接 `ACCEPTANCE_CONFIRMED`；本任务只在该动作上增加“首次确认物料身份”的前置不变量，不改变状态数量口径。
  - `rd-project-management (F2)` 的 BOM 是研发计划事实；本任务把“有效研发项目 BOM 中出现过的物料”定义为 RD 采购的可复用建议目录，而不是新建一套平行物料主档。
- User intent summary:
  - 研发早期采购经常出现只买一次、尚不值得进入正式物料目录的零散品项。系统应允许先按名称、规格、单位直接提出采购需求，避免为了填采购单而污染可复用物料搜索。
  - 真正需要复用的物料由 BOM 维护动作显式收录；实际货物验收入主仓时，普通验收流程可按现有能力形成库存物料身份，RD 再在验收确认时把采购行绑定到该既有身份。
- Frozen decisions:
  1. RD 采购需求仍必须关联一个有效研发项目，项目编码、项目名称和车间快照继续由研发项目真源提供。
  2. “可复用搜索目录”是有效研发项目 BOM 的派生只读目录，不新增独立 catalog 表，也不把全量 `material` 主档直接暴露为采购建议。
  3. 当前项目 BOM 命中项排在其他研发项目 BOM 之前；同一 `materialId` 去重，当前项目来源优先。
  4. 采购创建若选择 BOM 建议，保存现有 `materialId` 与物料快照；若自由填写，则保存名称 / 规格 / 单位快照并保持 `materialId = null`。
  5. 采购创建、采购状态动作都不得调用任何 `ensure/create/auto-create material` 路径。
  6. 主仓验收单不选择、不回填、不结构化关联 RD 采购需求；`stock_in_order.rd_procurement_request_id` 与 `stock_in_order_line.rd_procurement_request_line_id` 的新写入继续保持为空。
  7. 普通验收单的自由物料录入与自动库存物料身份由现有 `inbound` 能力负责；该身份在未进入任何有效研发项目 BOM 前，不得出现在 RD 采购可复用建议中。
  8. 未绑定采购行只能在 `ACCEPTANCE_CONFIRMED` 中选择一个已经存在的有效物料身份完成首次绑定。绑定与状态数量迁移必须同事务；事务失败时不得留下半绑定。
  9. 首次绑定后，后续部分验收、验收回滚、再次验收、交接、报废、退回和采购需求作废都不得改写或清空 `materialId`。
  10. 若该物料日后被显式加入任一有效研发项目 BOM，它自然进入 BOM 派生目录；不另设“加入目录”快捷写路径。
- Acceptance criteria carried into this task:
  - 见下方 `[AC-*]`。
- Requirement evidence expectations:
  - Prisma / DDL 迁移证据、focused 单元与集成测试、并发绑定对抗测试、全量类型与测试门禁、web build、scratch 环境 live API 与双角色浏览器验收、完整 acceptance run。
- Open questions requiring user confirmation:
  - 无。现有 requirement 中“主仓验收单不结构化关联 RD 采购需求”的边界继续生效；本任务不得以实现绑定为由恢复旧的 inbound ↔ RD 单据关联。

## Progress Sync

- Phase progress: `planning complete`
- Current state:
  - 当前 `RdProcurementRequestLine.materialId` 与 `materialCodeSnapshot` 均为必填，创建服务会对每行调用 `MasterDataService.getMaterialById`，前端创建表格也只支持从 `/api/master-data/materials` 选择，因此尚不能保存自由品项。
  - 当前采购物料搜索直接读取全量物料主档，不满足 BOM-only 目录口径。
  - 当前 `ACCEPTANCE_CONFIRMED` 只迁移状态数量，不承担物料首次绑定。
  - 普通 inbound 已具备自由录入并自动形成库存物料身份的能力；本任务只要求回归证明，不重写该能力。
- Acceptance state: `not-started`
- Blockers: `none`
- Next step: `single coder implements schema/API/backend invariants first, then frontend and acceptance evidence`

## Goal And Acceptance Criteria

- Goal:
  - 把“采购意图中的自由品项”“BOM 收录后的可复用品项”“库存链路必须拥有的物料身份”拆成清晰的三阶段语义，在不恢复主仓验收单与 RD 采购需求结构化关联的前提下，允许一次性采购，并保证物料首次绑定稳定、可审计、可并发安全地支撑后续交接与库存动作。
- Acceptance criteria:
  - `[AC-1]` 新建 RD 采购需求时，每行必须在两种互斥模式中二选一：选择 BOM 目录中的现有 `materialId`，或填写自由品项的 `materialName`（≤128）、可选 `specModel`（≤128）与 `unitCode`（≤32）；两种模式均继续校验数量、单价和备注边界。
  - `[AC-2]` 自由品项创建成功后，`rd_procurement_request_line.material_id` 与绑定审计字段为空，名称 / 规格 / 单位快照完整；创建前后 `material` 表数量不变，采购创建服务没有调用物料创建 / ensure 路径。
  - `[AC-3]` 采购创建页的物料建议搜索集合只包含有效研发项目 BOM 中的物料：当前项目 BOM 优先、其他有效研发项目 BOM 次之、同一 `materialId` 去重；普通物料主档、已作废项目 BOM、仅由 inbound 自动生成但尚未进入 BOM 的物料都不出现。物料从所有有效 BOM 移除后，不再供新采购选择，但历史采购绑定保持不变。
  - `[AC-4]` 通过 BOM 建议创建的采购行在创建时即绑定该现有物料，记录绑定来源 `BOM_CATALOG`；客户端伪造一个不属于有效研发项目 BOM 的 `materialId` 时，后端以 400 拒绝，不能绕过目录边界。
  - `[AC-5]` 普通主仓验收继续允许自由录入并按现有机制形成库存物料身份和 MAIN 库存；新建验收单头 / 行不写 RD 采购需求外键，且 RD 采购创建与状态动作都不创建物料。
  - `[AC-6]` 对未绑定采购行执行 `ACCEPTANCE_CONFIRMED` 时，用户必须从“已存在物料身份”选择一个 `materialId`；后端验证物料有效后，在同一事务内先完成首次绑定、再完成状态数量迁移。任一校验或状态迁移失败时，两者同时回滚。
  - `[AC-7]` 已绑定采购行再次执行验收确认时，只允许省略 `materialId` 或提交同一 `materialId`；不同 `materialId` 返回 409。验收动作回滚、采购需求作废、后续重新验收都不清空或改写首次绑定及其审计字段。
  - `[AC-8]` 并发对同一未绑定采购行用不同物料执行验收确认时，数据库行锁 + compare-and-set 只允许一个绑定提交；另一请求稳定返回 409，不出现最后写入覆盖、双重绑定或孤立新物料。相同物料并发仍受现有状态台账乐观并发守卫控制，不得超量迁移。
  - `[AC-9]` 交接、RD 报废、手工退回和项目补货聚合对 nullable `materialId` 安全：未绑定行不能进入任何库存写路径，并收到带行号 / 品项名称的中文错误；已绑定行继续沿用同一物料身份完成状态与库存追溯。
  - `[AC-10]` 采购列表、详情和状态动作 UI 能区分“自由品项 / 未绑定”“BOM 物料”“验收首次绑定”“历史绑定”，显示原始品项快照与最终绑定物料；内部数据库 ID、英文枚举和伪造物料编码不直接暴露给用户。
  - `[AC-11]` 迁移保留所有存量采购行、状态历史、交接 / 报废 / 退回与库存事实：存量非空 `materialId` 原样保留并标记为 `LEGACY`，不拆绑、不重算库存、不修改既有快照。
  - `[AC-12]` focused tests、并发 live probe、全量 typecheck / test、web build、双角色浏览器 walkthrough 与数据核对全部通过，并形成完整验收报告；浏览器证据必须同时覆盖“BOM 选择”和“自由品项 → 普通验收入库 → RD 验收绑定 → 交接”两条路径。

## Scope And Ownership

- Allowed code paths:
  - `prisma/schema.prisma`
  - `scripts/migration/sql/20260712-rd-procurement-free-text-binding.sql`
  - `src/modules/rd-subwarehouse/**`
  - `src/modules/rd-project/application/rd-project-lookup.service.ts`
  - `src/modules/rd-project/infrastructure/rd-project.repository.ts`
  - `src/modules/rd-project/application/rd-project-view.service.ts`
  - 对应 `src/modules/rd-project/**/*.spec.ts`
  - `src/modules/workshop-material/application/workshop-material-shared.service.ts`
  - `src/modules/workshop-material/application/workshop-material-scrap.service.ts`
  - 对应 `src/modules/workshop-material/**/*.spec.ts`
  - `src/modules/inbound/application/inbound-create-primary.service.spec.ts`（或现有等价验收创建 spec，仅补回归证据）
  - `web/src/api/rd-subwarehouse.js`
  - `web/src/views/rd/procurement-requests/**`
  - `web/src/views/rd/inbound-results/index.vue`
  - `web/src/views/rd/scrap-orders/index.vue`
  - 与本任务直接相关的 requirements / architecture / acceptance 文档
- Frozen or shared paths:
  - `docs/tasks/TASK_CENTER.md` 由 parent 统一维护，本任务 coder / planner 不得修改。
  - 当前工作区已有大量用户改动；不得 reset、checkout、覆盖或顺手格式化无关文件，动手前后必须用 `git diff -- <owned paths>` 核对范围。
  - `src/modules/inbound/**` 的生产实现冻结：不得恢复 `rdProcurementRequestId` / `rdProcurementRequestLineId` 新写入，不得增加 RD 专用选择器，不得把普通验收变成 RD 子流程。
  - `src/modules/inventory-core/**` 写合同冻结；本任务不新增库存操作类型，不旁路 `inventory-core`。
  - `material` 主表结构与全局 master-data 搜索合同冻结；BOM-only 是 RD 采购专用派生读模型，不通过全局物料可见性标志实现。
  - 现有项目、采购、状态、交接、报废权限码不变；本任务复用 `rd:procurement-request:list/create/status-action`，不改 seed。
- Task doc owner: `parent-orchestrator`
- Contracts that must not change silently:
  - RD 采购项目强关联和 `RD_SUB` 项目归属规则。
  - 主仓验收与 RD 采购不结构化关联。
  - BOM 保存本身不产生库存副作用。
  - `ACCEPTANCE_CONFIRMED` 的状态数量语义与现有可回滚能力。
  - `inventory-core` 是库存唯一写入口。
  - 物料绑定只允许 `null -> materialId` 单向发生一次；没有公开 update / unbind 合同。

## Target Contract And Data Model

### 1. 采购行双模式合同

`CreateRdProcurementRequestLineDto` 使用互斥条件校验：

- BOM 目录模式：
  - `materialId: number`
  - 服务端验证该 ID 至少存在于一个有效研发项目 BOM，并从现有物料真源冻结 code / name / spec / unit 快照。
  - 客户端携带的同名快照字段一律忽略，防止伪造。
- 自由品项模式：
  - `materialId` 不传。
  - `materialName` 必填，`specModel` 可选，`unitCode` 必填。
  - `materialCodeSnapshot = null`，不生成临时展示编码，不创建 `Material`。

两种模式都保留 `quantity / unitPrice / remark`；自由品项不是“脏数据”，而是采购意图的合法快照。

### 2. Prisma / DB 字段

`RdProcurementRequestLine`：

- `materialId Int?`，关系改为 `Material?`。
- `materialCodeSnapshot String?`；`materialNameSnapshot`、`materialSpecSnapshot`、`unitCodeSnapshot` 继续承接原始品项快照。
- 新增可空绑定审计：
  - `materialBindingSource RdProcurementMaterialBindingSource?`
  - `materialBoundAt DateTime?`
  - `materialBoundBy String?`
- `RdProcurementMaterialBindingSource`：
  - `BOM_CATALOG`：创建时选择 BOM 目录。
  - `ACCEPTANCE_CONFIRMED`：在 RD 验收确认时首次选择既有物料。
  - `LEGACY`：迁移前已经绑定的存量行。

不新增 catalog 表、采购品项表或物料可见性字段；BOM 目录由 `rd_project_bom_line -> rd_project(EFFECTIVE) -> material(ACTIVE)` 查询派生。

### 3. 状态与绑定顺序

| 时点 | 物料身份 | 允许动作 | 禁止动作 |
| --- | --- | --- | --- |
| 采购创建选择 BOM | 已绑定，来源 `BOM_CATALOG` | 正常推进采购状态 | 改绑到其他物料 |
| 采购创建自由填写 | 未绑定，保留品项快照 | 采购中 / 取消 | 交接、报废、退回、自动建物料 |
| 普通主仓验收 | inbound 独立创建或选用库存物料 | MAIN 入库 | 写 RD 采购外键 |
| RD `ACCEPTANCE_CONFIRMED` | 选择既有物料并首次绑定 | 同事务迁移验收数量 | 自动建物料、覆盖已有绑定 |
| 验收回滚 / 再验收 | 绑定保持不变 | 只回滚 / 重做状态数量 | 解绑或换绑 |
| 交接 / 报废 / 退回 | 必须已绑定 | 使用同一 `materialId` 写库存链路 | 从自由品项快照猜测物料 |

### 4. API 读写面

- 新增 `GET /api/rd-subwarehouse/procurement-requests/material-suggestions`：
  - 参数：`projectCode`、`keyword?`、`limit?`、`offset?`。
  - 返回：物料基本字段、`sourceScope = CURRENT_PROJECT | OTHER_RD_PROJECT`、命中项目摘要；当前项目优先并按 `materialId` 去重。
  - 只消费 BOM 派生目录；不调用通用 `/master-data/materials` 作为建议源。
- 新增 `GET /api/rd-subwarehouse/procurement-requests/acceptance-material-options`：
  - 受 `rd:procurement-request:status-action` 保护，仅返回验收绑定所需的已有有效物料基本字段。
  - 该查询是“绑定已有库存身份”专用选择器，不是可复用采购目录；允许搜索 inbound 自动形成的物料身份。
- 扩展 `POST /api/rd-subwarehouse/procurement-requests` 行合同以支持双模式。
- 扩展 `POST /api/rd-subwarehouse/procurement-requests/:id/status-actions`：
  - `ACCEPTANCE_CONFIRMED` 且行未绑定时 `materialId` 必填。
  - 行已绑定时，`materialId` 可省略或必须相同。
  - 其他状态动作携带 `materialId` 时拒绝或忽略必须统一为“拒绝”，避免客户端误以为可改绑。

## Data Migration And Compatibility Strategy

### Preflight

- 统计 `rd_procurement_request_line` 总数、现有 `material_id IS NULL` 数量、孤立物料外键数量、关联状态历史 / handoff / scrap / stock-in 事实数量。
- 预期迁移前所有采购行 `material_id` 非空；若已存在 null 或孤立引用，阻断 DDL 并先查明来源。
- 记录迁移前校验快照，至少包含每行 `id / request_id / material_id / material_*_snapshot / created_by / created_at` 哈希或行数汇总。

### Forward DDL And Backfill

1. 在版本化 SQL `scripts/migration/sql/20260712-rd-procurement-free-text-binding.sql` 中：
   - 把 `material_id` 改为 nullable，保留原外键。
   - 把 `material_code_snapshot` 改为 nullable。
   - 添加绑定来源、时间、操作人字段及必要索引。
2. 将所有存量 `material_id IS NOT NULL` 行回填为：
   - `material_binding_source = LEGACY`
   - `material_bound_at = created_at`
   - `material_bound_by = created_by`
3. 不修改 `material`、`inventory_balance`、`inventory_log`、状态账、交接、报废、退回或验收单据数据。
4. 同步 `prisma/schema.prisma` 并重新 generate；dev/scratch 可用 schema push，但 prod 必须执行版本化 DDL。

### Deploy Order

1. 停止或短暂冻结 RD 采购写流量。
2. 执行 preflight + DDL + legacy backfill + post-check。
3. 部署兼容 nullable 行的新后端。
4. 部署新 web。
5. 解除 RD 采购写流量并执行创建 / 绑定 smoke。

DDL 本身对旧写入是加法兼容，但一旦产生首条 `material_id = null` 自由采购行，旧后端不再具备安全读取能力；因此应用回滚受数据门禁约束，不能把“回滚二进制”当成无条件安全方案。

### Rollback / Recovery

- web 回滚：后端仍兼容旧页面只提交 `materialId`，但旧页面可能把 BOM 外物料提交给新后端并收到 400；仅作为临时降级，不是完整业务回滚。
- backend 回滚：只有在确认尚无自由采购行时才允许。已有自由行时优先 forward-fix；若必须回退，应先停写并由单独版本化补偿方案把每条自由行人工映射到既有物料，禁止在本任务正常状态动作中自动补建。
- schema 不做破坏性回滚；nullable 和审计字段可保留，避免丢失绑定证据。

### Post-migration Checks

- 所有 `material_id IS NOT NULL` 存量行都有 `material_binding_source`；所有新自由行必须是 `material_id / binding source / boundAt / boundBy` 同时为空。
- 不存在 `material_id IS NULL` 但已有 handoff / scrap / return 事实的采购行。
- 迁移前后采购行、状态历史、库存日志和来源使用数量不变。
- 采购创建与 RD 状态动作前后 `material` 表增量为 0；普通 inbound 自由验收仍可按既有行为产生物料增量。

## Backend File-Level Plan

### Schema And Migration

- `prisma/schema.prisma`
  - 增加 `RdProcurementMaterialBindingSource`。
  - 放宽采购行 `materialId / materialCodeSnapshot`，增加绑定审计字段，调整可空 relation。
- `scripts/migration/sql/20260712-rd-procurement-free-text-binding.sql`
  - 固化 preflight、DDL、legacy backfill 与 post-check；不得把 prod 变更留成手工临时 SQL。

### RD Procurement Contract And Orchestration

- `src/modules/rd-subwarehouse/dto/create-rd-procurement-request-line.dto.ts`
  - 增加自由品项字段与基于 `materialId` 的互斥校验；保持数量 / 单价位数上限。
- `src/modules/rd-subwarehouse/dto/apply-rd-procurement-status-action.dto.ts`
  - 增加可选 `materialId`；业务层按 actionType 和当前绑定状态执行条件必填，不把动态业务规则塞进 DTO。
- 新增 `src/modules/rd-subwarehouse/dto/query-rd-procurement-material-options.dto.ts`
  - 收口两个远程搜索接口的关键词、项目、limit / offset 边界。
- 新增 `src/modules/rd-subwarehouse/application/rd-procurement-item.service.ts`
  - 避免继续膨胀已超过 500 行的 `rd-procurement-request.service.ts`。
  - 负责 BOM 目录查询代理、创建行双模式解析、BOM 成员校验、已有物料绑定选项查询、首次绑定不变量。
  - 明确不注入或调用任何物料 create / ensure 能力。
- `src/modules/rd-subwarehouse/application/rd-procurement-request.service.ts`
  - 创建路径委托 item service 生成快照；自由行不调用 `getMaterialById`。
  - `ACCEPTANCE_CONFIRMED` 在现有事务内调用首次绑定，再调用状态迁移；失败整体回滚。
  - 其他状态动作拒绝 `materialId`；reverse 路径不触碰绑定字段。
- `src/modules/rd-subwarehouse/infrastructure/rd-procurement-request.repository.ts`
  - 增加事务内 `SELECT ... FOR UPDATE` 的行锁读取。
  - 增加 `materialId IS NULL` 条件的 compare-and-set 绑定方法，并检查 affected row count。
  - 所有 detail / list include 允许 `material` 为空，不以 relation 必存在为前提。
- `src/modules/rd-subwarehouse/controllers/rd-procurement-request.controller.ts`
  - 在动态 `:id` 路由之前增加 BOM suggestion 与 acceptance material option 静态路由。
  - 分别复用 list/create 与 status-action 权限，不新增权限种子。
- `src/modules/rd-subwarehouse/rd-subwarehouse.module.ts`
  - 注册 `RdProcurementItemService`，保持模块导入方向不引入新的 circular dependency。

### BOM-derived Catalog

- `src/modules/rd-project/infrastructure/rd-project.repository.ts`
  - 新增有效研发项目 BOM 物料查询：当前项目优先、其他项目次之、按 `materialId` 去重、关键词匹配 code / name / spec、稳定分页。
  - 查询只把 BOM membership 当目录资格，展示字段读取当前有效 material；排除 VOIDED 项目与失效 material。
- `src/modules/rd-project/application/rd-project-lookup.service.ts`
  - 暴露 suggestion 查询与 `assertMaterialInEffectiveBomCatalog(materialId)`，供 `rd-subwarehouse` shared module 使用。
- `src/modules/rd-project/application/rd-project-view.service.ts`
  - 聚合采购补货数量时跳过未绑定自由行；自由行不得用名称猜测合并到 BOM 台账。

### Downstream Guards

- `src/modules/rd-subwarehouse/application/rd-handoff.service.ts`
- `src/modules/rd-subwarehouse/application/rd-handoff-resolver.helper.ts`
  - 来源采购行未绑定时立即拒绝，并使用自由品项快照生成可定位的中文错误；已绑定时继续严格比对同一 `materialId`。
- `src/modules/rd-subwarehouse/application/rd-procurement-return.helper.ts`
  - 库存退回前显式断言物料已绑定，避免 nullable 值进入 `inventory-core`。
- `src/modules/rd-subwarehouse/application/rd-material-status-*.helper.ts`
  - 类型与错误标签兼容 nullable `materialId`，状态展示继续优先使用采购行快照。
- `src/modules/workshop-material/application/workshop-material-shared.service.ts`
- `src/modules/workshop-material/application/workshop-material-scrap.service.ts`
  - RD 报废来源行必须已绑定，并继续校验报废物料与首次绑定一致。

### Inbound Frozen-boundary Regression

- `src/modules/inbound/application/inbound-create-primary.service.spec.ts`（或现有等价 spec）
  - 只新增回归：普通验收自由录入仍调用既有 auto-material 路径、形成 MAIN 库存，且 `rdProcurementRequestId / rdProcurementRequestLineId` 保持 null。
  - 生产实现非必要不得修改；若回归失败，只修复被本任务 schema nullable 影响的类型兼容，不恢复 RD 结构化关联。

## Frontend File-Level Plan

- `web/src/api/rd-subwarehouse.js`
  - 新增 BOM suggestion 与 acceptance material option API。
  - `listRdMaterials` 不再作为采购创建建议源；若保留，只用于验收绑定既有身份或其他既有页面。
- 新增 `web/src/views/rd/procurement-requests/components/RdProcurementItemLinesEditor.vue`
  - 从已超过 1500 行的页面抽出采购明细编辑职责。
  - 支持 BOM 建议选择和自由品项录入，不使用 number/string 混合的 `allow-create` 模型；选择建议时保存 `materialId`，用户改动名称后明确切换为自由品项并清空绑定。
  - 展示“当前项目 BOM”“其他研发项目 BOM”“自由品项”标识，当前项目切换时重新查询但不静默覆盖已填行。
  - 自由品项显示并校验名称、规格、单位；BOM 选择自动带出只读快照。
- 新增 `web/src/views/rd/procurement-requests/components/RdProcurementAcceptanceBinding.vue`
  - 未绑定行执行验收确认时展示已有物料远程选择器及醒目说明：“仅绑定已验收入库的物料，不会新建物料，首次绑定后不可修改”。
  - 已绑定行展示锁定物料与绑定来源，不提供改选控件。
- `web/src/views/rd/procurement-requests/index.vue`
  - 接入两个组件，调整 payload、行校验、详情列、状态动作 payload 与绑定状态标签。
  - 详情始终展示原始采购快照；绑定后另列展示最终物料，避免用户误以为原始输入被覆盖。
  - 状态动作失败保持对话框与用户选择，409 显示“已由其他操作绑定，请刷新”。
- `web/src/views/rd/inbound-results/index.vue`
  - 交接来源选项排除未绑定采购行；若请求详情中存在未绑定行，显示“需先在采购需求登记验收并绑定物料”的提示。
- `web/src/views/rd/scrap-orders/index.vue`
  - RD 报废来源选项排除未绑定采购行，并与后端错误口径一致。
- `web/src/views/rd/projects/detail.vue`
  - 无必需生产改动；现有 BOM 编辑继续作为显式目录收录入口。浏览器验收需证明某 inbound 自动物料被加入 BOM 前不出现在采购建议、加入后才出现。

## Implementation Plan

- [ ] Step 1: 同步 requirement / architecture 中的新长期口径，明确覆盖旧的“采购行必有物料”假设，同时保留 inbound 非结构化边界。
- [ ] Step 2: 完成 Prisma nullable / 绑定审计设计与版本化 DDL，在 scratch DB 做 preflight、迁移、backfill、post-check rehearsal。
- [ ] Step 3: 实现有效研发项目 BOM 派生目录与后端 membership 守卫，补当前项目优先、全局去重、移出 BOM 即不再建议的测试。
- [ ] Step 4: 实现采购行双模式创建与查询展示；证明自由品项不会新增 `material`。
- [ ] Step 5: 实现 `ACCEPTANCE_CONFIRMED` 首次绑定的行锁 + CAS + 同事务状态迁移，并补回滚、重复、并发对抗测试。
- [ ] Step 6: 收口 handoff / scrap / return / rd-project 聚合对 nullable 物料的守卫与兼容；不得让未绑定行进入库存写路径。
- [ ] Step 7: 拆分并改造采购创建、详情和验收绑定前端；更新 handoff / scrap 来源提示，保持现有 dirty-form 与幂等提交体验。
- [ ] Step 8: 补 inbound 冻结边界回归、focused tests、全量门禁和 web build。
- [ ] Step 9: 在隔离 scratch 环境执行双角色 live API + browser walkthrough，冻结完整 acceptance run 与 AC 矩阵。

## Coder Handoff

- Execution brief:
  - 先实现 schema、BOM 目录和绑定不变量，再接 UI。不要从前端控件反推数据模型，也不要用“采购时先建一个临时 Material”规避 nullable 采购行。
  - BOM 目录资格必须由后端查询和创建守卫共同保证；仅前端过滤不算满足 `[AC-3]/[AC-4]`。
  - 绑定必须位于 `ACCEPTANCE_CONFIRMED` 的现有 transaction 中。绑定成功但状态迁移失败、或状态迁移成功但绑定失败，均不可提交。
  - 当前工作区非常脏；只在列出的 owned paths 上做最小差异，不得重置用户改动。
- Required source docs or files:
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/rd-subwarehouse.md`
  - `docs/architecture/modules/rd-project.md`
  - `docs/architecture/modules/master-data.md`
  - `docs/requirements/domain/rd-subwarehouse.md`
  - `docs/requirements/domain/rd-project-management.md`
  - `docs/tasks/analysis-20260710-rd-procurement-usability-review.md`
- Owned paths:
  - 同 `Allowed code paths`，但 `docs/tasks/TASK_CENTER.md` 永远 parent-owned。
- Forbidden shared files:
  - `.env*`
  - `docs/tasks/TASK_CENTER.md`
  - 与本任务无关的 dirty files
  - `inventory-core` 生产实现
  - inbound 的 RD 结构化关联生产改动
- Constraints and non-goals:
  - 不新增通用 catalog / SKU / PLM 模块。
  - 不把一次性采购品项自动提升为正式可复用物料。
  - 不让采购创建、RD 状态动作创建物料。
  - 不恢复主仓验收单选择 RD 采购需求。
  - 不按自由文本相似度自动合并或猜测物料；首次绑定必须由用户显式选择。
  - 不允许改绑 API、管理员绕过 API 或状态回滚解绑。
- Validation command for this scope:
  - `bun run prisma:validate`
  - `bun run prisma:generate`
  - `bun run typecheck`
  - `bun run test -- src/modules/rd-subwarehouse src/modules/rd-project src/modules/workshop-material src/modules/inbound/application/inbound-create-primary.service.spec.ts --runInBand`
  - `bun run test`
  - `pnpm --dir web build:prod`
  - 对 touched files 执行 Biome 检查；repo-wide lint 若有既有失败，必须记录基线且不得新增诊断。

## Reviewer Handoff

- Review focus:
  - 是否真的没有采购创建 / RD 状态动作物料创建路径，包括隐藏的 `ensureMaterial`、inbound auto repository 复用或前端预创建。
  - BOM-only 是否同时有读模型过滤和写端 membership 守卫，是否排除了 VOIDED 项目、处理了重复与稳定排序。
  - nullable `materialId` 是否在 handoff、scrap、return、project aggregation、list/detail 类型上全部安全，没有非空断言掩盖运行时风险。
  - 首次绑定是否与状态迁移同事务，是否使用行锁 + CAS，reverse / void 是否完全不触碰绑定字段。
  - 是否保持 inbound 非结构化边界，普通验收新单的 RD 外键是否仍为空。
  - 大文件治理：新职责应下沉到 item service / Vue 子组件，不继续无边界堆叠现有大文件。
- Requirement alignment check:
  - 对照 `[AC-1]` ~ `[AC-12]`，重点核对“自由采购不污染目录”“BOM 是唯一复用资格”“验收绑定不等于 inbound 关联”“首次绑定不可漂移”。
- Final validation gate:
  - migration rehearsal + post-check
  - focused + full tests
  - typecheck
  - web production build
  - 并发 live probe
  - 双角色 browser acceptance
  - complete acceptance run
- Required doc updates:
  - requirements / architecture 长期口径
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
  - `docs/acceptance-tests/specs/rd-project.md`
  - `docs/acceptance-tests/cases/rd-subwarehouse.json`
  - 本 task 的 Progress / Review / Acceptance / Final Status

### Acceptance Evidence Package

- Covered criteria: `[AC-1]` ~ `[AC-12]`
- Evidence pointers:
  - schema / DDL diff 与迁移前后 SQL 报告
  - focused spec 文件与全量 test 输出
  - 并发绑定 live probe 请求 / 响应 / 最终行快照
  - browser network log、关键页面截图和 acceptance run
- Evidence gaps, if any:
  - 任一以下证据缺失不得签收：采购创建 material 零增量、inbound RD 外键仍为空、不同 materialId 并发只有一个成功、reverse 后绑定不变、非 BOM 物料不出现在建议中。
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes`
- Irreversible or high-cost business effect: `yes`
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason:
- Related acceptance cases:
  - `rd-subwarehouse` 新增 free-text / BOM catalog / immutable binding cases
  - `rd-project` BOM 收录后进入采购建议的 cross-module case
- Related acceptance spec:
  - `docs/acceptance-tests/specs/rd-subwarehouse.md`
  - `docs/acceptance-tests/specs/rd-project.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags:
  - `rd-procurement-free-text`
  - `rd-bom-catalog`
  - `rd-material-binding`
  - `inbound-boundary`
  - `concurrency`
  - `inventory-traceability`
- Suggested environment / accounts:
  - 隔离 scratch MySQL + 独立 Redis DB；后端 / web 使用 `.env.dev` 等价配置但不得写共享正式库。
  - RD 采购创建 / 状态动作账号（如 `procurement` 或具备对应权限的 RD 账号）。
  - 主仓验收账号（如 `warehouse-manager` / `admin`）。
- Environment owner / setup source:
  - parent / acceptance QA；沿用仓库现有 scratch live 验证协议。

## Test And Browser Acceptance Plan

### Automated Tests

1. DTO / create service：
   - BOM materialId 模式成功。
   - 自由 name/spec/unit 模式成功。
   - 两种模式都缺失、自由模式缺 name/unit、伪造非 BOM materialId 均 400。
   - 自由创建不调用 master-data material lookup/create，持久化 null materialId 与正确快照。
2. BOM catalog repository / lookup：
   - 当前项目优先；其他有效项目补充；按 materialId 去重。
   - VOIDED 项目、非 BOM material、失效 material 排除。
   - 关键词与分页稳定；物料移出全部有效 BOM 后不再返回。
3. Acceptance binding：
   - 未绑定 + 有效既有 materialId 成功并记录 `ACCEPTANCE_CONFIRMED` 审计。
   - 未绑定 + 不存在 / 失效 materialId 失败且状态不迁移。
   - 已绑定 + 同 materialId 成功；已绑定 + 不同 materialId 409。
   - 状态数量不足导致动作失败时首次绑定一并回滚。
   - reverse acceptance 后绑定字段不变。
4. Concurrent binding：
   - 两个不同 materialId 并发：一个成功，一个 409，最终 ID 唯一。
   - 两个相同 materialId 并发：绑定不漂移，状态台账不超量，冲突按现有 409 语义返回。
5. Downstream：
   - 未绑定行 handoff / scrap / return 均被中文业务错误拒绝。
   - 绑定后所有路径继续严格使用同一 materialId。
   - rd-project 补货聚合跳过未绑定自由行，不按名称合并。
6. Inbound boundary：
   - 普通验收自由品项仍能自动形成物料与 MAIN 库存。
   - 新验收单及行的 RD 采购外键为空。

### Live API / Data Checks

- 使用 scratch DB，先建立：
  - 当前项目 BOM 物料 A。
  - 其他有效研发项目 BOM 物料 B。
  - 普通物料 C（不在任何 BOM）。
- 调 suggestion API：A 排在 B 前，C 不返回。
- 创建两条采购行：A（BOM 模式）与自由品项 D；核对 A 已绑定，D 未绑定，`material` 表无新增。
- 用普通 inbound 创建自由验收物料 D-inventory；核对 MAIN 库存增加、`material` 表只因 inbound 增加、RD 外键为空。
- 在 `ACCEPTANCE_CONFIRMED` 选择 D-inventory；核对 D 首次绑定、状态数量迁移、`material` 表不再增加。
- 发起不同 materialId 的并发验收绑定 probe；冻结一个成功 / 一个 409 与最终 DB 行。
- 回滚验收再重做，确认绑定不变；完成主仓交接并核对同一 materialId 的 MAIN 减 / RD_SUB 增与项目归属。
- 把 D-inventory 显式加入任一有效研发项目 BOM：加入前 suggestion 不返回，加入后返回；移出全部有效 BOM 后再次不返回。

### Browser Walkthrough

1. RD / 采购账号进入 `/rd/procurement-requests`：
   - 选择项目后，当前项目 BOM 分组优先；搜索可命中其他项目 BOM；物料 C 与 D-inventory（尚未进 BOM）不可见。
   - 同单新增 BOM 物料行和自由品项行，校验标记、快照、金额和防误关闭行为正常。
   - 提交后详情分别显示“BOM 物料 / 已绑定”和“自由品项 / 未绑定”。
2. 主仓账号进入 `/entry/order`：
   - 自由录入 D 并完成验收入库。
   - 页面不出现 RD 采购需求选择器；保存请求 payload 不含 RD 采购引用。
3. 回到 RD 采购需求：
   - 对 D 执行登记验收，必须选择刚形成的既有物料；文案明确不会新建且不可改绑。
   - 绑定后再次打开验收动作只显示锁定物料；通过篡改请求提交其他 materialId 得到 409 并保持原值。
4. `/rd/inbound-results`：
   - 未绑定来源不能选；绑定后的 D 可完成交接。
   - 详情、库存流水和研发项目台账使用同一物料与项目归属。
5. `/rd/projects/detail/:id`：
   - 将 D-inventory 加入 BOM 后返回采购页，D 才进入可复用建议；删除所有有效 BOM 引用后不再建议。

### Browser Evidence To Freeze

- 采购建议分组与非 BOM 排除截图。
- 自由品项创建前后详情截图。
- 主仓自由验收页面与请求 payload（无 RD 外键）。
- 验收首次绑定、锁定态和冲突提示截图。
- 交接成功、库存流水、项目台账同一物料追溯截图。
- BOM 加入前 / 后 suggestion API 响应对比。

## Runtime Concurrency Safety

- Current safety assessment: `unsafe until row-lock + CAS is implemented`
- Required transaction sequence for `ACCEPTANCE_CONFIRMED`:
  1. 在现有 `repository.runInTransaction` 内以 `SELECT ... FOR UPDATE` 锁定目标采购行。
  2. 重读 `materialId / binding audit / lifecycle / status ledger`。
  3. 若已绑定且请求 materialId 不同，立即 409；相同则复用现有绑定。
  4. 若未绑定，验证请求 materialId 指向一个已存在的有效物料。
  5. 执行 `UPDATE ... WHERE id = ? AND material_id IS NULL` 的 compare-and-set；affected rows 不为 1 时重读并按同值幂等 / 异值冲突处理。
  6. 执行现有状态数量迁移及乐观并发 update。
  7. 同一事务提交；任何步骤失败全部回滚。
- Why both mechanisms are required:
  - 行锁串行化同一采购行的首次绑定判断；CAS 防止未来调用方遗漏锁或事务边界变化时发生最后写入覆盖。
  - 本任务禁止状态动作创建物料，因此不存在并发 loser 留下孤立自动物料的问题。
  - 现有状态台账 guarded update 继续负责数量并发；物料绑定守卫不能替代数量守卫。
- Immutability rule:
  - repository 只暴露 `bindMaterialIfUnbound`，不暴露通用 `updateMaterialBinding` / `clearMaterialBinding`。
  - reverse / void / handoff / scrap / return 代码评审必须证明没有写绑定字段。

## Parallelization Safety

- Status: `not-safe`
- If safe, list the exact disjoint writable scopes: `-`
- If not safe, list the shared files or contracts that require a single writer:
  - `prisma/schema.prisma`、采购行 DTO、`rd-procurement-request.service/repository`、状态动作事务、BOM catalog query、前端 payload 共同定义一个紧耦合合同。
  - 当前工作区在这些路径上已有用户改动，多个 writer 极易覆盖或基于不同中间 schema 继续开发。
  - 建议单 writer 按 schema → backend → downstream guards → frontend 顺序实现；review 与 acceptance 可在代码冻结后并行只读执行。

## Review Log

- Validation results:
- Findings:
- Follow-up action:

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA:
- Acceptance date:
- Complete test report:

### Acceptance Checklist

- [ ] `[AC-1]` 双模式行合同与字段校验 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` 自由采购零物料创建、快照完整 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` BOM-only suggestion 及当前项目优先 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` BOM membership 写端守卫 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-5]` 普通 inbound 独立自由验收且 RD 外键为空 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-6]` 验收确认首次绑定与状态迁移同事务 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-7]` 绑定后不可改绑 / 解绑 / 回滚漂移 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-8]` 并发锁 + CAS 只允许一个首次绑定 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-9]` 未绑定行不进入库存写路径 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-10]` 用户界面区分快照、目录与最终绑定 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-11]` 存量数据与库存事实兼容迁移 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-12]` 自动化、并发、live 与 browser 完整证据 — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary:
- Report completeness check:
- If rejected or blocked: root cause（`requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`）+ 精确修复指引 / 环境修复指引
- If conditionally accepted: follow-up requirement / task:

## Final Status

- Outcome: `pending implementation`
- Requirement alignment:
  - 计划已冻结采购自由品项、BOM-only 目录、inbound 非结构化边界与首次绑定不可漂移四项核心合同。
- Residual risks or testing gaps:
  - nullable 采购行会影响多个历史上默认 `materialId` 非空的消费者，必须以全量 typecheck / test 与 live browser 共同收口，不能只验证创建页。
  - 应用回滚在产生自由行后受数据门禁约束，发布与回滚流程必须写入最终验收报告。
- Directory disposition after completion:
  - keep `active` until implementation, review and full acceptance complete; parent later decides retained-completed and syncs `docs/tasks/TASK_CENTER.md`.
- Next action: `coder`
