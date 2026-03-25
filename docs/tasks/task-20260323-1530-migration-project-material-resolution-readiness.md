# Migration Project Material Resolution Readiness

## Metadata

- Scope: implement the `batch2b-project` migration slice so the `project` domain keeps an auditable `migrated / pending-material-resolution / structural-excluded` contract, and when a line truly has no corresponding target material, deterministically auto-creates one instead of leaving the real dataset permanently blocked
- Related requirement: `docs/requirements/req-20260321-1100-java-to-nestjs-data-migration.md`
- Status: `implemented`
- Review status: `reviewed-no-findings`
- Lifecycle disposition: `active`
- Planner: `planner`
- Coder: `coder`
- Reviewer: `code-reviewer`
- Last updated: `2026-03-25`
- Related files:
  - `docs/requirements/req-20260321-1100-java-to-nestjs-data-migration.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/20-wms-business-flow-and-optimized-schema.md`
  - `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
  - `docs/tasks/archive/retained-completed/task-20260319-1905-migration-master-plan-relocation.md`
  - `scripts/migration/project/legacy-reader.ts`
  - `scripts/migration/project/types.ts`
  - `scripts/migration/project/transformer.ts`
  - `scripts/migration/project/writer.ts`
  - `scripts/migration/project/execute-guard.ts`
  - `scripts/migration/project/cutover-readiness.ts`
  - `scripts/migration/project/migrate.ts`
  - `scripts/migration/project/validate.ts`
  - `test/migration/project.spec.ts`
  - `test/migration/project-execute-guard.spec.ts`
  - `scripts/migration/reports/project-execute-report.json`
  - `scripts/migration/reports/project-validate-report.json`

## Requirement Alignment

- Requirement doc: `docs/requirements/req-20260321-1100-java-to-nestjs-data-migration.md`
- User intent summary:
  - build a real migration implementation for the `project` domain based on the frozen requirement and architecture docs
  - keep live-vs-staging boundaries explicit
  - keep material resolution deterministic, auditable, and non-fuzzy
  - make `excluded / pending / validate / cutover gate` visible instead of hiding unresolved backlog behind a green script
- Acceptance criteria carried into this task:
  - preserve header all-or-nothing admission
  - write live rows only to `project`, `project_material_line`, and `map_project*`
  - move recoverable backlog into `pending_relations` plus audit evidence instead of `excluded_documents`
  - expose `cutoverReady`, `cutoverBlockers`, pending counts, and downstream readiness status in validate output
- Open questions requiring user confirmation:
  - None.

## Requirement Sync

- Req-facing phase progress: the `project` migration slice implementation, auto-created-material extension, and DB-backed validation loop are complete
- Req-facing current state: `scripts/migration/project/**` now supports three-state admission, deterministic fallback, deterministic `AUTO_CREATED` material upsert, auto-created-material audit payloads, and blocker-aware validate/cutover readiness output
- Req-facing blockers: the real dataset no longer has material-resolution backlog; `cutoverReady = false` remains only because inventory replay confirmation is still pending
- Req-facing next step: sync the requirement/workspace docs, confirm inventory replay readiness, then continue `scrap` and global cutover work
- Requirement doc sync owner: `parent-orchestrator`

## Goal And Acceptance Criteria

- Goal: make the `project` migration slice safe, deterministic, auditable, and blocker-aware without widening runtime semantics
- Acceptance criteria:
  - the slice must distinguish `migrated`, `pending-material-resolution`, and `structural-excluded`
  - material resolution must remain deterministic and auditable; no fuzzy matching or weak inference
  - `pending_relations`, `archived_field_payload`, and `excluded_documents` must match the deterministic plan and be validated by content
  - `cutoverReady` must only become `true` when pending backlog, unsigned structural exclusions, and required downstream readiness blockers are actually cleared

## Scope And Ownership

- Allowed code paths:
  - `scripts/migration/project/**`
  - `test/migration/project.spec.ts`
  - `test/migration/project-execute-guard.spec.ts`
- Frozen or shared paths:
  - `docs/requirements/**`
  - `docs/architecture/**`
  - `scripts/migration/sql/000-create-migration-staging.sql`
  - `prisma/schema.prisma`
  - `src/**`
  - `scripts/migration/shared/**`
  - other migration family directories
- Task doc owner: `planner` for initial brief, `coder` for execution-state updates, `code-reviewer` for review outcome
- Contracts that must not change silently:
  - `project` live admission stays header all-or-nothing
  - `inventory-core` remains the only stock-write entry point; this slice does not write inventory, relation, workflow, or reservation live tables
  - `map_project*` remains live-only mapping evidence
  - `pending_relations` remains a staging-only expression of unresolved `legacy project line -> target material`

## Implementation Summary

- Implemented behavior:
  - added three-state plan structures in `types.ts` and `transformer.ts`
  - added deterministic rule ids for direct map, exact normalized name/spec/unit fallback, and pending reasons
  - changed `classifyLine()` so structural invalidity is checked before pending-material logic
  - added deterministic project auto-created-material planning keyed by normalized `material_name + specification + unit`
  - added `material` upsert + archived payload writes for auto-created project materials before line upsert
  - added validate coverage for auto-created material rows and their archived payload evidence
  - added pending header summary evidence and batch-owned `pending_relations` cleanup/write behavior in `writer.ts`
  - added content-level validation for `pending_relations.relation_type`, `pending_reason`, and `payload_json`
  - extracted cutover gating into `cutover-readiness.ts`
- Explicit gate toggles:
  - `PROJECT_INVENTORY_REPLAY_CONFIRMED=true`
  - `PROJECT_STRUCTURAL_EXCLUSIONS_ACKNOWLEDGED=true`
  - both toggles remain visible in validate reports as auditable flags

## Coder Handoff

- Execution brief:
  - implementation is complete
  - current real data now fully admits the `project` slice by auto-creating deterministic materials where no corresponding target material exists
- Validation command for this scope:
  - `pnpm migration:typecheck`
  - `pnpm test -- --runTestsByPath test/migration/project.spec.ts test/migration/project-execute-guard.spec.ts`
  - `pnpm migration:project:dry-run`
  - `pnpm migration:project:execute`
  - `pnpm migration:project:validate`

## Reviewer Handoff

- Review focus:
  - confirm three-state admission
  - confirm all-or-nothing behavior
  - confirm deterministic and auditable fallback behavior
  - confirm content-level validation for `pending_relations`, `archived_field_payload`, and `excluded_documents`
  - confirm `cutoverReady` is blocked only by real backlog or explicit readiness gates
- Final validation gate:
  - complete `typecheck`, focused tests, dry-run, execute, and validate rereview completed successfully

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
- If not safe, list the shared files or contracts that require a single writer:
  - `scripts/migration/project/**`, focused tests, report schema, reason codes, and cleanup contracts must stay single-writer to avoid execute/validate drift

## Execution State

- Phase: `implemented-and-reviewed-clean; important-finding-fixed`
- Executed: `2026-03-25`
- Executed by: `coder`

### Validation Results

- `pnpm migration:typecheck`: PASS
- `pnpm test -- --runTestsByPath test/migration/project.spec.ts test/migration/project-execute-guard.spec.ts`: PASS (`39` tests)
- `pnpm migration:project:dry-run`: PASS
- `pnpm migration:project:execute`: PASS
- `pnpm migration:project:validate`: PASS, `validationIssues: []`
- `pnpm migration:project:export-pending-template`: PASS (`0` pending projects, `0` pending lines, rule breakdown `{}`, `status: "OK"`, `globalBlockers: []`)

### Dry-Run / Execute / Validate Summary

```text
counts.projects: { source: 5, migrated: 5, pending: 0, excluded: 0 }
counts.lines:    { source: 138, migrated: 138, pending: 0, excluded: 0 }
autoCreatedMaterialCount: 126
pendingRelationCount: 0
cutoverReady: false
cutoverBlockers: ["5 admitted project(s) require inventory replay and downstream readiness confirmation before cutover. Set PROJECT_INVENTORY_REPLAY_CONFIRMED=true to acknowledge once replay is complete."]
structuralExcludedProjectCount: 0
structuralExclusionsAcknowledged: false
inventoryReplayConfirmed: false
downstreamConsumerCounts: all 0
validationIssues: []
```

### Runtime Interpretation

- the current real dataset now fully exercises the auto-created-material path: `126` target `material` rows are inserted/updated with deterministic `materialCode`
- grouped reuse is active: `126` auto-created materials cover `134` formerly pending lines because identical normalized `name + spec + unit` lines now share the same target material
- the current real dataset does not exercise the structural-exclusion acknowledgement path; that path is still covered by focused tests
- pending template export remains deterministic and rerunnable, but the current baseline now exports an empty template because no residual pending lines remain

## Review Log

- Validation results:
  - reviewer reread the task doc, requirement doc, focused `scripts/migration/project/**`, synced workspace docs, and the regenerated `project` reports
  - reran `pnpm migration:typecheck`, focused tests, `pnpm migration:project:dry-run`, `pnpm migration:project:execute`, `pnpm migration:project:validate`, and `pnpm migration:project:export-pending-template`; all passed and reproduced `5` migrated projects, `138` migrated lines, `126` auto-created materials, `0` pending projects, `0` pending lines, `0` `pending_relations`, and `validationIssues: []`
  - confirmed `buildCutoverReadiness()` now counts only truly unresolved pending lines and no longer treats replay-generated downstream consumer rows as permanent cutover blockers; rerun safety remains enforced by `execute-guard`
  - confirmed execute cleanup now removes stale `ProjectAutoCreatedMaterial` rows before rerun, while validate rejects any extra project auto-created materials outside the deterministic plan
  - confirmed workspace/task/requirement docs and generated reports now agree on the real-data result set
- Findings:
  - No remaining `[blocking]` or `[important]` findings in this scope.
- Follow-up action:
  - no further coder repair is required in this scope; `parent-orchestrator` can continue inventory replay confirmation plus the remaining `scrap` / global cutover work

## Final Status

- Outcome:
  - the `project` migration slice now fully admits the real dataset and preserves deterministic auditability for both reused and auto-created materials
- Requirement alignment:
  - the delivered code still matches the intended three-state admission, staging/live boundary, deterministic fallback, pending evidence, and cutover blocker visibility contract; it now additionally honors the confirmed rule that truly missing materials are auto-created instead of staying in manual backlog
- Residual risks or testing gaps:
  - `cutoverReady = false` remains expected until inventory replay is confirmed
  - the blocked export branch was verified by code inspection rather than a DB-backed failing baseline, because the current environment reports `globalBlockers: []`
  - the structural-exclusion acknowledgement path is covered by focused unit tests rather than the current DB-backed dataset
- Directory disposition after completion:
  - keep `active` until parent syncs the linked requirement doc and decides whether this slice should stay as an active backlog anchor or move to retained evidence
- Next action:
  - `parent-orchestrator` can sync requirement/workspace status and move on to inventory replay confirmation plus the remaining `scrap` / global cutover work
