# Material Category Single-Level System Unification

## Metadata

- Scope:
  - 在已完成的 `monthly-reporting F9` 单层分类基线上，把全系统 `material-category` 真源统一为单层分类。
  - 取消 `master-data` 物料分类中的父子层级语义；新增、修改、列表、详情、页面与写侧快照都不再接受或生成多级分类。
  - 保留 `未分类` 默认分类与历史快照稳定性，不在本轮删除 schema 字段或回写历史业务单据。
- Related requirement: `docs/requirements/domain/master-data-management.md (F1)`; `docs/requirements/domain/monthly-reporting.md (F9)`
- Status: `accepted`
- Review status: `approved`
- Delivery mode: `standard`
- Acceptance mode: `light`
- Acceptance status: `accepted`
- Complete test report required: `no`
- Lifecycle disposition: `active`
- Planner: `parent-orchestrator`
- Coder: `parent-orchestrator`
- Reviewer: `parent-orchestrator`
- Acceptance QA: `parent-orchestrator`
- Last updated: `2026-04-17`
- Related checklist: `-`
- Related acceptance spec: `docs/acceptance-tests/specs/master-data.md`; `docs/acceptance-tests/specs/monthly-reporting.md`
- Related acceptance run: (optional)
- Related files:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/tasks/TASK_CENTER.md`
  - `src/modules/master-data/**`
  - `src/modules/inbound/**`
  - `src/modules/sales/**`
  - `scripts/migration/monthly-reporting-material-category-snapshot/migrate.ts`
  - `web/src/api/base/material-category.js`
  - `web/src/views/base/material-category/index.vue`

## Requirement Alignment

- Domain capability:
  - `master-data F1` 不再承载物料分类树，只保留单层分类 CRUD。
  - `monthly-reporting F9` 已要求按稳定最终分类单层聚合，本 task 把该语义回推到主数据真源与写侧快照。
- User intent summary:
  - 用户要求“全系统统一”，不仅月报不要多级分类，物料管理中的物料分类也必须取消多级分类。
- Acceptance criteria carried into this task:
  - `[AC-1]` `master-data` 物料分类 create/update/list/detail 不再接受或暴露父级分类语义。
  - `[AC-2]` `base/material-category` 页面不再显示“上级分类”，新增/修改都只维护单层分类。
  - `[AC-3]` 新写入的 inbound/sales 物料分类快照为单节点最终分类快照，不再沿父链生成路径。
  - `[AC-4]` requirement/spec/task 与 focused tests 同步改为单层分类真源。
- Requirement evidence expectations:
  - focused `master-data` / `inbound` / `sales` / `reporting` tests 与 web build 需要证明无层级语义残留。
  - browser smoke 可选；本轮优先 automated evidence。
- Open questions requiring user confirmation:
  - `none`

## Progress Sync

- Phase progress:
  - `delivery closed`
- Current state:
  - `master-data` requirement、repository、service、页面和写侧快照都已统一到单层分类语义。
  - `MaterialCategory.parentId` 已从 Prisma schema、DTO、repository、前端 API 与页面合同中删除。
  - 本地 `.env.dev` 已执行 `prisma db push --accept-data-loss`，`material_category.parentId` 已从本地数据库结构中删除。
  - inbound/sales 新写入的分类快照已改成单节点最终分类；旧历史快照不回写。
- Acceptance state:
  - `light acceptance completed`
- Blockers:
  - `none`
- Next step:
  - `none`

## Goal And Acceptance Criteria

- Goal:
  - 让物料分类在全系统内只存在“单层最终分类”这一种语义，不再由不同模块分别维护树形与单层两套规则。
- Acceptance criteria:
  - `[AC-1]` `master-data` F1 文档与 API 合同改为单层分类 CRUD。
  - `[AC-2]` `master-data` 物料分类管理页去掉上级分类与父级展示。
  - `[AC-3]` inbound/sales 新写入的 `materialCategoryPathSnapshot` 仅保存单节点最终分类。
  - `[AC-4]` focused automated validation 通过且未发现与现有物料管理/分类月报冲突的回归。

## Scope And Ownership

- Allowed code paths:
  - `docs/requirements/domain/master-data-management.md`
  - `docs/requirements/REQUIREMENT_CENTER.md`
  - `docs/acceptance-tests/specs/master-data.md`
  - `docs/tasks/TASK_CENTER.md`
  - `src/modules/master-data/**`
  - `src/modules/inbound/**`
  - `src/modules/sales/**`
  - `scripts/migration/monthly-reporting-material-category-snapshot/migrate.ts`
  - `web/src/api/base/material-category.js`
  - `web/src/views/base/material-category/index.vue`
  - focused tests for the paths above
- Frozen or shared paths:
  - `docs/tasks/archive/**` 只读引用
  - `prisma/schema.prisma` 本轮不动；取消多级分类通过合同与运行时收口，不做 schema 删除
  - `web/src/views/reporting/monthly-reporting/index.vue` 与 `src/modules/reporting/**` 已在前一 task 收口，除非被验证阻塞，否则不重复改写
- Task doc owner:
  - `parent orchestrator`
- Contracts that must not change silently:
  - `未分类` 继续作为默认稳定分类存在。
  - 物料仍然只能属于一个分类。
  - 历史业务单据不因本轮变更而回写重算。

## Implementation Plan

- [x] Step 1: 更新 `master-data` shared truth 与 task tracking。
- [x] Step 2: 收口 `master-data` 物料分类 DTO / service / repository / 页面合同为单层分类。
- [x] Step 3: 收口 inbound/sales 物料分类快照构造为单节点最终分类。
- [x] Step 4: 更新 focused tests、构建与任务状态。

## Review Log

- Validation results:
  - `bun run test -- src/modules/master-data/application/master-data.service.spec.ts src/modules/master-data/infrastructure/master-data.repository.spec.ts src/modules/master-data/controllers/master-data.controller.spec.ts src/modules/inbound/application/inbound.service.spec.ts src/modules/sales/application/sales.service.spec.ts` => `pass`
  - `bun run prisma:generate` => `pass`
  - `set -a && source .env.dev && set +a && bunx prisma db push --accept-data-loss` => `pass`
  - `bun run typecheck` => `pass`
  - `bun run migration:typecheck` => `pass`
  - `pnpm --dir web build:prod` => `pass`
- Findings:
  - `none`
- Follow-up action:
  - `none`

## Acceptance

- Acceptance status: `accepted`
- Acceptance QA:
  - `parent orchestrator`
- Acceptance date:
  - `2026-04-17`
- Complete test report:
  - `not required`
