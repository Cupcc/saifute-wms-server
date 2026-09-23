# 研发采购公共需求池

## Metadata

- Scope: cross-cutting backend schema/API + RD procurement workbench frontend
- Related requirement: `docs/requirements/domain/研发采购申请需求规格说明_v1.0.md`
- Status: `ready-for-coder`
- Review status: `not-reviewed`
- Delivery mode: `autonomous`
- Acceptance mode: `full`
- Acceptance status: `not-assessed`
- Complete test report required: `yes`
- Lifecycle disposition: `active`
- Planner: `saifute-planner`
- Coder: `saifute-coder`
- Reviewer: `saifute-code-reviewer`
- Acceptance QA: `saifute-acceptance-qa`
- Last updated: `2026-09-20`
- Related checklist: -
- Related acceptance spec: `docs/acceptance-tests/specs/rd-procurement-demand-pool.md`
- Related acceptance run: -
- Related files: `src/modules/rd-subwarehouse/**`, `web/src/views/rd/procurement-requests/**`, `prisma/schema.prisma`

## Requirement Alignment

- Domain capability: the linked v1.0 requirement defines a public, cumulative demand table with batch multi-line submission, per-line RD project, applicant/department snapshots, supplier/link/text+image notes, owner/admin edit/delete, and audit fields.
- User intent summary: implement the confirmed “研发采购申请” scope through the public summary table boundary.
- Acceptance criteria carried into this task: AC-01 through AC-08 in the linked requirement.
- Requirement evidence expectations: API/service tests for transaction and ownership rules; frontend build; full acceptance of the visible create/edit/delete/view flow.
- Open questions requiring user confirmation: none for this slice. Procurement status, purchasing execution, receipt, inventory posting, and future deletion lock timing remain out of scope.

## Progress Sync

- Phase progress: planning complete; implementation pending
- Current state: existing `RdProcurementRequest` is a project-level order with status-chain/handoff dependencies and does not match the new public-pool semantics.
- Acceptance state: not assessed
- Blockers: none
- Next step: coder implements the independent public-pool model and workbench.

## Goal And Acceptance Criteria

- Goal: add a public RD procurement demand pool whose row is one independent material demand, while preserving the existing `RdProcurementRequest` contract used by handoff, acceptance, return, and material-status flows.
- Acceptance criteria:
  - `[AC-1]` A user with list permission sees all effective demand rows, with applicant as a column and project/material fields visible.
  - `[AC-2]` One batch submission atomically creates all rows; rows may reference different effective RD projects and retain their own project snapshots.
  - `[AC-3]` The default list is grouped or sorted by applicant and remains stable after reload.
  - `[AC-4]` An applicant can edit their own row and the response records the last editor/time.
  - `[AC-5]` A non-owner cannot edit or delete another applicant’s row; the API rejects the attempt even if the UI is bypassed.
  - `[AC-6]` A user with the administrator/manage permission can edit any row and the audit fields identify that user.
  - `[AC-7]` Text notes and uploaded image metadata are saved and viewable in list/detail/edit flows using existing file storage.
  - `[AC-8]` Supplier free text and purchase URL are persisted, rendered, and the URL is safely openable/copyable.

## Scope And Ownership

- Allowed code paths: `prisma/schema.prisma`; generated Prisma output only through the repository’s generation command; `src/modules/rd-subwarehouse/**`; relevant RBAC route/permission seed files; `web/src/api/rd-subwarehouse.js`; `web/src/views/rd/procurement-requests/**`; focused tests.
- Frozen or shared paths: existing `RdProcurementRequest` status/history/handoff contracts; `src/modules/rd-subwarehouse/application/rd-handoff-resolver.helper.ts`; inventory and inbound modules; the linked requirement document.
- Task doc owner: parent
- Contracts that must not change silently: existing `/rd-subwarehouse/procurement-requests` semantics used by handoff/acceptance; no procurement status machine or inventory side effect may be added to the new demand pool.

## Implementation Plan

- [ ] Add an independent `RdProcurementDemand`/line-level persistence model with applicant user/dept snapshots, effective RD project reference and snapshots, need date, material fields, supplier text, purchase URL, note text, image metadata, soft-delete/audit fields.
- [ ] Add DTOs, repository, application service, and controller for paged public listing, batch create, row detail, row update, and soft delete. Enforce applicant ownership server-side and administrator/manage permission for cross-user mutation.
- [ ] Make batch create transactional and idempotent where a client request key is supplied; validate positive quantity, strict date, URL, project validity, and each line with a Chinese row-specific error.
- [ ] Add route permissions/menu wiring without altering the old status-action permissions. Reuse `FileStorageService` upload responses; persist only safe metadata/URLs in the demand row.
- [ ] Replace or adapt the RD procurement page into the public summary workbench with applicant/dept/date/project/material/supplier/link/note/image columns, batch drawer, row edit/delete, owner/admin action visibility, and stable applicant ordering.
- [ ] Add focused backend tests for AC-02/AC-05/AC-06 and frontend build/type validation. Run Prisma validation/generation and repository gates.

## Coder Handoff

- Execution brief: implement only the independent public demand pool described above. Do not mutate old `RdProcurementRequest` fields or downstream status/handoff behavior.
- Required source docs or files: linked requirement; `docs/requirements/domain/rd-subwarehouse.md`; `docs/architecture/modules/rd-subwarehouse.md`; `docs/architecture/00-architecture-overview.md`; `docs/architecture/20-wms-database-tables-and-schema.md`; `docs/acceptance-tests/README.md`.
- Owned paths: paths listed under allowed code paths, excluding the task doc and frozen files.
- Forbidden shared files: old request/handoff/status service contracts, inventory/inbound schemas, and unrelated frontend modules.
- Constraints and non-goals: no purchasing workflow/status, no receipt/inventory posting, no unrestricted shared-cell editing, no physical deletes that erase history.
- Validation command for this scope: `bun run prisma:validate && bun run prisma:generate && bun run typecheck && bun run test -- --runInBand src/modules/rd-subwarehouse && bun --cwd web run build:prod`.

## Reviewer Handoff

- Review focus: data ownership/permission enforcement, transaction atomicity, snapshot integrity, safe attachment persistence, preservation of old request/handoff contracts, and frontend AC coverage.
- Requirement alignment check: compare AC-01..08 against the new demand-pool endpoint and visible workbench.
- Final validation gate: Prisma validation/generation, focused backend tests, typecheck, frontend production build.
- Required doc updates: review findings in this task doc; acceptance QA fills the Acceptance section.

### Acceptance Evidence Package

- Covered criteria: AC-01 through AC-08
- Evidence pointers: service/controller tests, generated API contract or manual API responses, frontend production build, browser/manual run for the workbench.
- Evidence gaps, if any: browser credentials/runtime may need `.env.dev` and seeded users with owner/admin permissions.
- Complete test report requirement: `yes`

### Acceptance Test Expectations

- Acceptance mode: `full`
- User-visible flow affected: `yes`
- Cross-module write path: `yes` (RBAC/file storage/project lookup), but no inventory write
- Irreversible or high-cost business effect: `no` (soft delete and demand metadata only)
- Existing automated user-flow coverage: `no`
- Browser test required: `yes`
- Browser waiver reason: -
- Related acceptance cases: create/update `docs/acceptance-tests/cases/rd-procurement-demand-pool.json`
- Related acceptance spec: `docs/acceptance-tests/specs/rd-procurement-demand-pool.md`
- Separate acceptance run required: `yes`
- Complete test report required: `yes`
- Required regression / high-risk tags: `permission`, `transaction`, `attachment`, `project-snapshot`, `legacy-contract`
- Suggested environment / accounts: `.env.dev`; one normal applicant, one second applicant, one RD procurement administrator
- Environment owner / setup source: repository `.env.dev` and RBAC seed/runtime state

## Parallelization Safety

- Status: `not-safe`
- If safe, list the exact disjoint writable scopes: -
- If not safe, list the shared files or contracts that require a single writer: Prisma schema, rd-subwarehouse controller/module, RBAC route seed, and the procurement workbench are shared contracts; one coder owns the implementation.

## Review Log

- Validation results: pending coder
- Findings: pending reviewer
- Follow-up action: pending reviewer/acceptance

## Acceptance

- Acceptance status: `not-assessed`
- Acceptance QA: `saifute-acceptance-qa`
- Acceptance date: -
- Complete test report: pending

### Acceptance Checklist

- [ ] `[AC-1]` Public list — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-2]` Atomic multi-line batch with per-line project — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-3]` Applicant ordering/grouping — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-4]` Owner edit with audit — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-5]` Cross-user mutation rejection — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-6]` Administrator edit with audit — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-7]` Text + image metadata — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`
- [ ] `[AC-8]` Supplier/link persistence — Evidence: pending — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- Acceptance path used: `full`
- Acceptance summary: pending
- Report completeness check: pending
- If rejected or blocked: -
- If conditionally accepted: -

## Final Status

- Outcome: implementation pending
- Requirement alignment: planned
- Residual risks or testing gaps: browser seed/runtime and attachment URL verification
- Directory disposition after completion: keep `active` while open
- Next action: coder
