---
name: saifute-subagent-orchestration
description: Orchestrates planner, execution, review, and commit phases for scoped work in the Saifute NestJS WMS repository, including implementation, refactors, bug fixes, migrations, backfills, reconciliations, and cutover-prep. Use when work needs a `plan -> code -> review -> fix -> commit` flow with blocker-aware handoffs.
---

# Saifute Subagent Orchestration

Use this skill when repository work is large enough to benefit from delegated subagents, or when the user wants a structured delivery flow instead of ad hoc edits. This includes migration, backfill, reconciliation, and cutover-prep work, not only feature delivery.

Default orchestration order:

1. `plan`
2. `code`
3. `review`
4. `fix`
5. `commit`

Do not skip forward unless the user explicitly narrows the scope, or the step is not applicable. Migration-style work keeps the same order, but it requires stricter context, staging or exclusion handling, deterministic generation, replay-vs-copy judgment, and blocker-aware validation.

## Required context

Read the smallest relevant source of truth before assigning work:

- `docs/00-architecture-overview.md`
- the specific module docs in `docs/modules/`
- the files directly related to the task

For migration, backfill, reconciliation, or cutover-prep work, also read:

- `docs/30-data-migration-plan.md`
- `docs/20-wms-business-flow-and-optimized-schema.md` when the work touches inventory, workflow, reporting, document relations, reservation semantics, or business-state semantics
- the relevant `prisma/**`, `scripts/**`, `docs/**`, or module surfaces that define the current schema and runtime behavior

Treat those docs and files as the source of truth for module boundaries, dependencies, transaction rules, testing scope, runtime semantics, staging expectations, and cutover constraints.

If legacy data and the current runtime disagree, adapt the legacy data to the current runtime and schema unless the user explicitly expands scope to change runtime behavior.

## Intent mapping

Interpret these requests as delivery requests unless the user explicitly narrows scope:

- `implement this`
- `finish this task`
- `complete this`
- `fix this issue`
- `continue`
- `deliver this`
- `prepare this migration`
- `write the backfill`
- `reconcile this legacy data`
- `make this cutover-ready`
- `finish the migration script`

For delivery requests, do not stop after only planning, one implementation pass, one review pass, or one targeted validation run. Keep the `review -> fix` loop moving until the scoped work is ready for handoff or a real blocker requires user direction.

## Subagent roles

Choose the smallest useful set:

- `planner`: use the repo's dedicated readonly `planner` subagent to scope the task, identify impacted files, surface risks, propose validation, and decide whether parallel writers are safe
- `execution-agent`: implementation and refactor worker for explicitly assigned files, modules, scripts, schema surfaces, or docs
- `code-reviewer`: review worker for correctness, regressions, missing tests, contract drift, and validation sufficiency

Use `explore` only as a supporting readonly discovery worker when the planner needs fast codebase search.

## Migration and backfill guardrails

Use these durable rules for migration-style orchestration:

- adapt legacy data to the current runtime and schema; do not widen runtime semantics by default
- isolate uncertain, conflicting, or incomplete records into explicit staging or exclusion paths instead of forcing them into live tables
- keep generated identifiers, renumbering, ordering, derived dates, and mapping outputs deterministic so reruns produce the same result
- prefer replay for derived or operational state such as inventory and similar projections; use direct copy only when the target is not derived and the plan explicitly supports it
- do not invent relations, audit outcomes, or stock effects from ambiguous legacy signals; unresolved records stay pending, archived, or excluded until safely resolved
- do not silently drop unmapped legacy fields; archive them, carry them through an explicit schema change, or require explicit sign-off that they are intentionally discarded
- do not claim cutover readiness while pending relation work, unresolved exclusions, or required business sign-off are still hidden in the workflow

## Default workflow

### 1. Plan

Start with the readonly `planner` subagent unless the task is trivially scoped or the user explicitly says to skip planning.

Ask the planner to return:

- goal and acceptance criteria
- impacted files, modules, or operational surfaces
- proposed implementation steps
- likely risks and contract-sensitive areas
- required validation commands
- whether multiple writer agents are safe

For migration-style tasks, also require:

- staging-or-exclusion handling for ambiguous, conflicting, or out-of-scope records
- replay-vs-copy judgment for each derived or operational target
- deterministic generation rules for identifiers, ordering, renumbering, or derived dates
- blocker list, sign-off needs, and cutover-readiness gates

The `planner` subagent is readonly and must not edit files.

### 2. Code

Use `execution-agent` for implementation after the plan is clear.

Each writer handoff must include:

- owned paths
- forbidden shared files
- task goal
- validation command for that scope
- any frozen contracts that must not change silently

For migration-style handoffs, also include:

- whether the scope owns staging structures, mapping outputs, reconciliation queries, or cutover-prep artifacts
- which records are allowed into runtime tables versus required to stay staged or excluded
- the deterministic generation rules the writer must preserve
- whether the work is replay, direct copy, reconciliation-only, or readiness-only

One writer is the default. Use multiple writer agents only when their writable scopes are explicitly disjoint before launch. Shared staging schemas, reconciliation outputs, and cutover-readiness artifacts default to single-owner.

### 3. Review

Run `code-reviewer` after substantive edits.

The reviewer should focus on:

- bugs and behavioral regressions
- missing or weak tests
- contract drift
- auth, workflow, inventory, and transaction safety where relevant
- whether the selected validation is sufficient for the affected scope
- for migration-style work, silent runtime widening, missing staging or exclusion handling, non-deterministic generation, replay-vs-copy mismatch, and hidden blockers

### 4. Fix

If `code-reviewer` reports any open `[blocking]` or `[important]` finding, route the findings back to `execution-agent` for fixes, then rerun `code-reviewer`.

Treat review as a repair loop, not a stopping point.

### 5. Commit

Commit creation is a parent-orchestrator step only.

Only proceed to commit when all of the following are true:

1. The required validation passed for the scoped work.
2. `code-reviewer` reports no remaining open `[blocking]` or `[important]` findings.
3. There is no unresolved shared-contract or ownership blocker.
4. The user explicitly asked for a commit.
5. For migration-style work, unresolved staged or excluded records are either handled within scope or explicitly reported with the required sign-off or follow-up owner.

Do not let subagents create the commit directly.

## Launch rules

1. Default to at most 4 concurrent subagents.
2. The `planner` subagent must run in readonly mode.
3. Multiple writer subagents are allowed only when their writable scopes are explicitly disjoint before launch; shared staging schemas, mapping tables, reconciliation reports, and cutover evidence stay single-owner.
4. Do not run write-capable subagents in background mode.
5. Shared files default to parent ownership unless one worker is explicitly named as the sole owner.
6. Before finalizing substantive work, involve `code-reviewer`.
7. If the task is ambiguous or has meaningful trade-offs, either switch to Plan Mode first or use the readonly `planner` subagent before any write step.

## Frozen repo constraints

Never let a subagent bypass these repository rules:

- `inventory-core` is the only stock write entry point
- `workflow` owns audit-document behavior and review-state semantics
- `session` uses JWT as a session ticket, with Redis as the session source of truth
- `rbac` owns permission strings, route trees, and data-scope policies
- `ai-assistant` may query and orchestrate tools, but must not write business data directly
- migration and backfill work must adapt legacy data to the current runtime and schema unless the user explicitly approves a runtime or contract change

## Shared knowledge layers

The parent orchestrator owns the distinction between durable rules and runtime context.

- put stable, reusable facts in `.cursor/rules/*.mdc`
- do not write temporary runtime observations into rules
- put task-scoped runtime context in the parent handoff, or in a clearly temporary shared context artifact when multiple subagents need the same live status
- before promoting a new observation into rules, confirm that it is likely to remain valid across future tasks and does not contain secrets

## File ownership guidance

The `execution-agent` may edit:

- its owned module directories under `src/modules/<module>/`
- tests for those modules
- module-local docs that describe its owned contracts or behavior
- explicitly assigned `prisma/**`, `scripts/**`, `docs/**`, `src/shared/**`, `src/app*.ts`, or other shared surfaces directly required by the task
- narrow shared files that are directly required by the task
- parallel-owned scopes only when the parent explicitly assigned a disjoint writable boundary

The `execution-agent` must avoid:

- unapproved edits to another module's internal repository or table access
- new cross-module dependencies that are not documented
- silent changes to shared contracts without updating docs when needed
- touching parent-owned shared files unless the handoff explicitly made that worker the sole owner

The `planner` subagent must avoid:

- file edits
- speculative contract rewrites
- calling for parallel writers without naming disjoint scopes
- calling migration work cutover-ready without naming remaining blockers and sign-off needs

The `code-reviewer` owns:

- review findings and severity
- validation judgment
- test coverage feedback
- blocker visibility and readiness judgment for migration-style work

## Parent merge behavior

When parallel writers were active:

- re-read the latest file content before any parent merge or shared-file edit
- auto-reconcile overlapping child changes only when the source is attributable to active child agents and the frozen boundaries are still respected
- stop and ask the user only if the source may be a real user edit, ownership is ambiguous, or the overlap crosses an unapproved shared boundary

## Required handoff from every subagent

Ask each subagent to return:

- a concise summary of what it changed or proposes
- files, modules, or operational surfaces touched
- shared contracts assumed or changed
- tests or validation run, plus what still needs to run
- risks, blockers, sign-off needs, and follow-up work

Additionally require:

- planner: implementation steps, validation plan, and parallelization safety
- planner for migration-style work: staging-or-exclusion plan, replay-vs-copy judgment, deterministic generation rules, cutover blockers, and current-runtime alignment checks for target constants or status semantics
- code-reviewer: findings ordered by severity, plus clear fix actions for any `[blocking]` or `[important]` item

## Validation rules

Use the narrowest useful validation command during iteration, but do not declare the task complete without the validation appropriate for the affected surface.

Typical gates include:

- `pnpm lint`
- targeted `pnpm test -- <scope>`
- `pnpm test`
- `pnpm test:e2e`
- migration dry-runs, repeatable script output checks, and scoped reconciliation queries or reports

For migration-style work, validation must cover:

- deterministic rerun behavior for mappings, ordering, renumbering, or derived dates
- alignment with current target constants, enum values, status strings, and runtime semantics so deterministic but wrong output still fails validation
- staging-or-exclusion handling for unresolved records
- replay-vs-copy justification for derived or operational tables
- blocker-aware reconciliation and cutover-readiness evidence instead of a single green script

Choose the smallest command that credibly proves the change during iteration, then run the broader gate that matches the final risk surface before review sign-off or commit readiness. For migration-style work, do not call the task complete just because one import or replay pass finished; require evidence that unresolved records, exclusions, and sign-off needs are surfaced.

## Completion protocol

Treat commit readiness as the end of the orchestration loop, not as a side effect of file edits.

Stop only when one of these is true:

1. The scoped task completed its `plan -> code -> review -> fix` loop and, if requested, the final commit was created.
2. The user explicitly asked for `plan-only`, `review-only`, or `docs-only`.
3. A real blocker remains that requires user direction.

For migration, backfill, reconciliation, or cutover-prep work, "ready" means:

- deterministic generation rules are defined and preserved
- unresolved records are staged, archived, or excluded instead of silently dropped or guessed
- unmapped legacy fields are archived, mapped through an approved schema change, or explicitly signed off as intentionally discarded
- replay-vs-copy decisions are explicit for derived or operational tables
- remaining blockers, sign-offs, or cutover gates are named in the handoff

Use this blocker bar:

- real blocker: user-edit conflict, frozen-boundary ownership ambiguity, contradictory architecture truth, missing required credentials or resources, an unresolved product choice that cannot be decided safely alone, a data-shape conflict that would widen runtime semantics, or remaining exclusions that need business sign-off before cutover
- not a real blocker: a partial implementation is stable, one test passed, a review found issues, or the parent simply wants to pause and summarize

If the user says `no-commit`, finish the requested scope and review or fix loop, then stop without creating a commit.

## Additional reference

- See [reference.md](reference.md) for the recommended agent matrix and handoff templates.
