# 基础数据 F4 供应商 CRUD

## Metadata

- Scope: 完成 `docs/requirements/topics/master-data-management.md` 中最小且可闭环的显式能力 `F4`。补齐供应商新增、修改、逻辑停用、默认 `ACTIVE` 列表/搜索、受控自动补建，以及供应商管理页/API/权限兼容的最小收口；不把 `F1/F2/F3/F5/F6/F7/F8/F9/F10` 静默并入本 task。
- Related requirement: `docs/requirements/topics/master-data-management.md` (F4)
- Status: `accepted`
- Review status: `reviewed-clean`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `accepted`
- Complete test report required: `yes`
- Lifecycle disposition: `retained-completed`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Acceptance QA: `acceptance-qa`
- Last updated: `2026-04-04`
- Related checklist: `None`
- Related acceptance spec: `docs/acceptance-tests/specs/master-data.md`
- Related acceptance case: `docs/acceptance-tests/cases/master-data.json`

## Requirement Alignment

- Topic capability:
  - `docs/requirements/topics/master-data-management.md` (F4)
- User intent summary:
  - 用户要求在 confirmed 的 `master-data` topic 上继续推进，遇到问题自行解决，不在中间里程碑停下，并最终达到“所有测试通过、完成交付、可以 commit”的标准。
  - 该 topic 同时包含 Phase 1 多条未完成能力，以及明确属于未来阶段的 `F9` / `F10`；本 task 仅切取 `F4` 作为最小安全交付切片。
  - 当前运行时真源保持 `supplierCode`、`supplierName`、`status` 与 provenance 字段，本 task 明确不为追旧 UI 而无依据扩写 `supplier` schema。
- Acceptance criteria carried into this task:
  - `[AC-1]` 新增供应商时，`supplierCode` 全局唯一；重复编码返回明确冲突错误。
  - `[AC-2]` 修改供应商时，保持当前运行时正式字段合同，至少支持 `supplierCode`、`supplierName` 的新增与修改；如修改编码，仍需满足唯一性校验。
  - `[AC-3]` 停用供应商采用逻辑停用（沿用当前 `MasterDataStatus.DISABLED` 语义），不做物理删除；停用后默认列表 / 搜索与新单据供应商下拉中不再出现该供应商。
  - `[AC-4]` `getSupplierById()` 继续保持按 `id` 的 status-agnostic 详情读取语义，以兼容历史快照读取与详情回读。
  - `[AC-5]` 受控自动补建供应商时，`creationMode = AUTO_CREATED` 且 `sourceDocumentType`、`sourceDocumentId` 必填。
  - `[AC-6]` 当前供应商管理页与兼容层恢复可用：`web/src/api/base/supplier.js` 不再抛 `unsupportedBaseAction(...)`，权限 alias 补齐，页面不再依赖未进入正式运行时合同的 legacy 字段持久化，且 `pnpm --dir web build:prod` 通过。
  - `[AC-7]` `full` 模式验收覆盖供应商管理页和至少一个真实供应商下拉消费面，并在 `spec` 中维护最近一次验证结果。
- Open questions requiring user confirmation:
  - None.

## Delivery Summary

- Backend:
  - `src/modules/master-data/**` 已补齐 supplier create / update / deactivate 写路径、默认 `ACTIVE` 列表/搜索、status-agnostic detail 与 provenance 约束。
  - shared supplier lookup 已拆分为两条清晰合同：默认 operational dropdown 保持 active-only；历史 / 报表路径通过 `includeDisabled` + `listSupplierByKeywordIncludingDisabled()` 显式查询停用供应商。
- Permissions and compatibility:
  - `src/modules/rbac/infrastructure/in-memory-rbac.repository.ts` 与 `web/src/utils/permissionCompat.js` 已补齐 `master:supplier:create/update/deactivate` 与旧前端 `base:supplier:add/edit/remove` 的兼容链路。
  - `web/src/api/base/supplier.js` 与 `web/src/api/base/compat.js` 已改为真实请求和运行时合同映射，不再停留在 unsupported stub。
- Frontend:
  - `web/src/views/base/supplier/index.vue` 已收口到当前 runtime 合同（`supplierCode` / `supplierName` / `status`），不再依赖 legacy source-only 字段。
- Testing and evidence:
  - `test/prisma-e2e-stub.ts` 与 `test/master-data-supplier.e2e-spec.ts` 已形成 focused supplier CRUD 证据闭环。
  - 验收规格与未代码化 browser smoke 用例已分别写入 `docs/acceptance-tests/specs/master-data.md` 与 `docs/acceptance-tests/cases/master-data.json`。

## Validation

- Automated validation passed:
  - `pnpm typecheck`
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts`
  - `pnpm test:e2e -- test/master-data-supplier.e2e-spec.ts`
  - `pnpm test:e2e`
  - `pnpm verify`
  - `pnpm --dir web build:prod`
- Reviewer spot-check passed:
  - `pnpm test -- src/modules/master-data/application/master-data.service.spec.ts`
  - `pnpm test:e2e -- test/master-data-supplier.e2e-spec.ts`
- Browser acceptance passed:
  - `agent-browser` on `http://localhost:90`
  - 供应商管理页 POST 201 新增成功
  - 供应商停用 PATCH 200 成功
  - `/entry/order` 下拉搜索停用供应商返回 `items=[]`、`total=0`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA: `acceptance-qa`
- Acceptance date: `2026-04-03`
- Complete test report: `docs/acceptance-tests/specs/master-data.md`
- Acceptance checklist:
  - [x] `[AC-1]` 新增供应商唯一性成立
  - [x] `[AC-2]` 修改供应商后列表 / 详情 / 页面回读一致
  - [x] `[AC-3]` 逻辑停用后默认搜索与新单据下拉不再出现该供应商
  - [x] `[AC-4]` `getSupplierById()` 与历史快照语义保持不变
  - [x] `[AC-5]` 自动补建来源字段约束成立
  - [x] `[AC-6]` 供应商页/API/权限兼容恢复且前端构建通过
  - [x] `browser/full` 供应商管理页 + 入库单下拉消费者 smoke 通过
- Acceptance notes:
  - `[AC-1]` ~ `[AC-7]` 已由 unit / e2e / build / browser 组合证据覆盖。
  - `docs/acceptance-tests/specs/master-data.md` 的 `Latest Verification` 已更新为 `2026-04-03`，总体结果为 `passed`。

## Final Status

- Outcome:
  - `master-data` `F4` 供应商 CRUD 已完成交付、复核与 full-mode 验收，本 task 于归档时从 `active` 收口为 `retained-completed`。
- Requirement alignment:
  - 交付范围严格锁定在 `F4`，未将其余 Phase 1 能力、`F8` 统一查询服务或 legacy schema widening 静默并入。
  - 最终行为与 requirement 中“停用后新单据不可选、历史语义仍可追溯”的预期一致。
- Residual risks or testing gaps:
  - `ensureSupplier()` 目前仅有合同测试覆盖，无真实调用方；待 `inbound` 接入时补充集成验证。
  - browser 面未单独覆盖 edit 流程，但 unit + e2e 已覆盖更新合同。
- Next action:
  - None. 已归档，后续如继续推进 `master-data` topic，请从 `F1/F2/F3/F5/F6/F7/F8` 中创建新 task。
