# Outbound Compatibility Cutover To Customer

## Metadata

- Scope: remove the repo-owned `outbound` compatibility layer across backend public routes and permissions, frontend stale compatibility surfaces, migration command aliases, and active docs while preserving real outbound business semantics
- Related requirement: `docs/requirements/archive/retained-completed/req-20260322-1354-outbound-customer-rename.md`
- Status: `completed`
- Review status: `reviewed-no-findings`
- Lifecycle disposition: `retained-completed`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Last updated: `2026-03-26`
- Related checklist:
- Related files:
  - `docs/requirements/archive/retained-completed/req-20260322-1354-outbound-customer-rename.md`
  - `package.json`
  - `src/modules/customer/controllers/customer.controller.ts`
  - `src/swagger-metadata.ts`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/20-wms-business-flow-and-optimized-schema.md`
  - `docs/architecture/modules/customer.md`
  - `web/src/constants/formSchemas.js`
  - `web/src/components/AiAssistant/index.vue`
  - `web/src/api/ai/chat.js`
  - `web/docs/AI-DESIGN.md`
  - `web/docs/ai-assistant-design.md`
  - deleted: `web/src/views/out/**`
  - deleted: `web/src/api/out/**`

## Requirement Alignment

- Requirement doc: `docs/requirements/archive/retained-completed/req-20260322-1354-outbound-customer-rename.md`
- User intent summary:
  - remove the remaining external `outbound` compatibility layer instead of keeping it for later cleanup
  - fully align repo-owned backend, frontend active references, scripts, and active architecture docs to the canonical `customer` surface
  - do not widen into new business semantics or over-rename true outbound concepts
- Acceptance result:
  - `CustomerController` route prefix changed from `outbound` to `customer`
  - controller permission annotations changed from `outbound:*` to `customer:*`
  - `migration:outbound*` aliases removed from `package.json`
  - active architecture docs now describe `customer` as the current external route/permission surface
  - active AI/context/form/design docs no longer document deleted `/out/*` form routes as supported
  - repo-owned dead `web/src/views/out/**` and `web/src/api/out/**` cluster was removed after search showed no route/menu/component references outside that cluster
  - business-semantic outbound concepts such as `CustomerStockOrderType.OUTBOUND` and reporting outbound metrics were intentionally preserved

## Execution Summary

### Backend cutover

- Updated `src/modules/customer/controllers/customer.controller.ts`
  - `@Controller("outbound")` -> `@Controller("customer")`
  - all `@Permissions("outbound:*")` -> `customer:*`
- Removed all `migration:outbound*` aliases from `package.json`
- Regenerated `src/swagger-metadata.ts`

### Frontend active-surface cleanup

- Removed stale `/out/*` support from:
  - `web/src/constants/formSchemas.js`
  - `web/src/components/AiAssistant/index.vue`
  - `web/src/api/ai/chat.js`
- Synchronized design docs:
  - `web/docs/AI-DESIGN.md`
  - `web/docs/ai-assistant-design.md`

### Dead code removal

- Repo-wide search showed no route/menu/component references to:
  - `web/src/views/out/outboundOrder/index.vue`
  - `web/src/views/out/outboundDetail/index.vue`
  - `web/src/views/out/salesReturnOrder/index.vue`
  - `web/src/views/out/salesReturnDetail/index.vue`
  - `web/src/api/out/outboundOrder.js`
  - `web/src/api/out/outboundDetail.js`
  - `web/src/api/out/salesReturnOrder.js`
  - `web/src/api/out/salesReturnDetail.js`
- Because the `views/out` and `api/out` files only referenced each other and had no live repo-owned route/menu wiring, the cluster was deleted instead of migrated to avoid leaving dead `outbound` remnants in the frontend tree.

### Active docs alignment

- Updated:
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/20-wms-business-flow-and-optimized-schema.md`
  - `docs/architecture/modules/customer.md`
- Compatibility-period wording for `/outbound` and `outbound:*` was removed from active architecture docs.

## Validation

- `pnpm swagger:metadata` — passed
- `pnpm exec biome check package.json src/modules/customer/controllers/customer.controller.ts docs/architecture/00-architecture-overview.md docs/architecture/20-wms-business-flow-and-optimized-schema.md docs/architecture/modules/customer.md web/src/constants/formSchemas.js web/src/components/AiAssistant/index.vue web/src/api/ai/chat.js web/docs/AI-DESIGN.md web/docs/ai-assistant-design.md docs/tasks/archive/retained-completed/task-20260325-2355-outbound-customer-cutover.md` — passed with 11 pre-existing warnings only
- `pnpm typecheck` — passed
- `pnpm --dir web build:prod` — passed after deleting `web/src/views/out/**` and `web/src/api/out/**`

## Review Conclusion

- Reviewer result: `reviewed-no-findings`
- No remaining `[blocking]` or `[important]` findings in the scoped diff.
- Reviewer agreed the deleted `views/out` + `api/out` cluster was safe to remove based on repo evidence:
  - no route/menu/component references in `web/src/router/index.js`, `web/src/store/modules/permission.js`, `web/src`, active `src`, or active architecture docs
  - no dead `/customer/*` route was invented
  - remaining `outbound` hits in reporting/home statistics are business metrics, not compatibility routes

## Final Status

- Outcome:
  - repo-owned `outbound` compatibility surfaces were removed and the cutover completed
- Residual risks or testing gaps:
  - live DB-backed RBAC/menu rows may still require deployment-time `outbound:*` -> `customer:*` and stale path/component updates; no repo-managed seed or migration file exists for that environment data
  - Biome still reports 11 pre-existing warnings in `web/src/api/ai/chat.js` and `web/src/components/AiAssistant/index.vue`
- Archive reason:
  - completed execution + reviewer sign-off; retained as the execution provenance record for the cutover
