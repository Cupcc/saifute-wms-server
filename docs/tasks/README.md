# Task Docs

This directory stores planner-authored task docs for delivery work in this repository.

## Directory Layout

```text
docs/tasks/
├── TASK_CENTER.md                     # live board: inventory, lifecycle, cleanup candidates
├── README.md                          # this file: folder protocol and authoring rules
├── _template.md                       # template for new task docs
├── task-*.md                          # active task docs (in-progress, planned, ready-for-coder)
└── archive/
    ├── retained-completed/            # completed but still needed as stable baselines or upstream references
    └── cleanup-candidate/             # provisional; do not delete until user explicitly confirms
```

Active task docs live at the root alongside `TASK_CENTER.md`, `README.md`, and `_template.md`. Each root `task-*.md` must list a `Related requirement` path to a file that still exists at `docs/requirements/req-*.md`（根目录，且需求 Metadata 中 `Lifecycle disposition` 为 `active`）. Completed requirements should be moved to `docs/requirements/archive/**` so archived tasks can keep stable provenance links; update those task docs to the archived full path when moving the requirement. If a requirement file is removed from the repository without archival, the task must not remain at the root. Task–requirement cross-links are also indexed in `docs/requirements/REQUIREMENT_CENTER.md`. Once a task is no longer active, move it into the appropriate `archive/` bucket in the same turn.

## Layering

- `TASK_CENTER.md`: the live board for current task-doc inventory, lifecycle classification, and cleanup candidates.
- `README.md`: the folder protocol for how task docs are authored, owned, and maintained.
- `task-*.md`: the detailed execution, review, acceptance, and provenance record for one scope.
- `docs/requirements/REQUIREMENT_CENTER.md`: requirement-side mirror for active and archived requirements and task bindings.
- `docs/acceptance-tests/**`: full-mode acceptance assets when task-doc evidence is no longer enough.

Keep those layers separate so the board stays short, the README stays stable, and individual task docs can carry long history without becoming the only entrypoint.

## Purpose

- Give each non-trivial task a durable execution brief under `docs/tasks/**`.
- Keep task-scoped runtime context out of `.cursor/rules/*.mdc`.
- Let `planner`, `coder`, `code-reviewer`, and `acceptance-qa` share one source of truth across the delivery loop.
- Preserve the lightest sufficient acceptance path instead of forcing all tasks through one heavy workflow.

## Role Split

- `planner` creates or updates the task doc and owns planning-phase edits.
- `coder` reads the task doc as the execution brief and treats it as read-only unless documentation ownership is explicitly reassigned.
- `code-reviewer` updates the task doc with review status, validation results, follow-up state, and the acceptance-ready evidence handoff.
- `acceptance-qa` is invoked when `light` or `full` acceptance adds value; in `full` mode it maintains acceptance specs, executes acceptance runs, and writes the acceptance result back to task and requirement docs. The acceptance run is the complete test report for that slice.
- The parent orchestrator decides whether to continue the fix loop, invoke `acceptance-qa`, or create a commit; commit remains a parent-owned action and should follow the current user ask or workflow policy.

## Lifecycle Guidance

- `active`: still open for planning, implementation, review, acceptance, repair, or resume.
- `retained-completed`: completed, but intentionally kept because it is still a durable source of truth or a useful upstream reference.
- `cleanup-candidate`: appears removable later, but remains list-only until the user explicitly confirms cleanup.
- `TASK_CENTER.md` is the lifecycle truth for resume. Archived task docs remain readable provenance, but should not be treated as active handoff sources unless the user explicitly reopens that scope.

Maintain the live directory-wide classification in `TASK_CENTER.md`, not in this README.

## Recommended Filename Pattern

- `task-YYYYMMDD-HHMM-[scope].md`
- If the scope is unclear, use `task-YYYYMMDD-HHMM-general.md`

## Required Structure

- `## Metadata`
- `## Requirement Alignment`
- `## Requirement Sync`
- `## Goal And Acceptance Criteria`
- `## Scope And Ownership`
- `## Implementation Plan`
- `## Coder Handoff`
- `## Reviewer Handoff`
- `## Parallelization Safety`
- `## Review Log`
- `## Acceptance`
- `## Final Status`

## Workflow

1. Create a new task doc from `docs/tasks/_template.md` when the task is not trivially small.
2. Update `TASK_CENTER.md` when a new active task doc is introduced or when a task clearly changes lifecycle bucket.
3. Have `planner` fill the goal, requirement alignment, scope, implementation plan, coder handoff fields, validation expectations, and parallelization safety.
4. Have `planner` or `parent` choose `Acceptance mode: none | light | full` based on runtime impact, user risk, auditability need, and workflow cost. If the linked requirement is in autonomous-delivery mode, or the user asked for a complete test report, default to `full` unless the scope is trivially small and docs-only.
5. If `Acceptance mode = full`, have `acceptance-qa` prepare or update the relevant acceptance spec early, ensuring each in-scope `[AC-*]` maps to at least one acceptance case.
6. If `Acceptance mode = light`, keep the default path lightweight and defer separate spec or run unless reuse, auditability, or complexity justifies them.
7. Have `coder` implement from the task doc instead of inventing a new execution scope.
8. Have `code-reviewer` record review status, validation, findings, and next action in the same task doc.
9. If review finds open `[blocking]` or `[important]` items, route the work back to `coder` and keep the task doc current.
10. If review passes and `Acceptance mode = none`, write `skipped` with rationale and close the task.
11. If review passes and `Acceptance mode = light`, prefer the lightest sufficient path: fill the task doc `## Acceptance`, add direct evidence, and only create spec or run if the work has already crossed into full-mode complexity.
12. If review passes and `Acceptance mode = full`, have `acceptance-qa` create or update an acceptance run from the relevant spec, freeze the selected case snapshot, verify the minimum coverage baseline, and treat that run as the complete test report for the slice.
13. In `full` mode, have `acceptance-qa` verify environment readiness before execution. If required accounts, data, permissions, endpoints, or dependencies are not ready, mark the run `blocked`, record `environment-gap`, and route to the parent or environment owner without consuming a rejection round.
14. Have `acceptance-qa` execute acceptance testing, verify requirement alignment, fill the task doc `## Acceptance`, and update the requirement doc acceptance state using the aggregate rule set.
15. If `acceptance-qa` rejects, route to `planner` (`requirement-misunderstanding`), `coder` (`implementation-gap`), or `code-reviewer` or parent (`evidence-gap`) and repeat from the appropriate step.
16. If `acceptance-qa` blocks, route to `parent` or environment owner (`environment-gap`) and resume acceptance after the environment is ready.
17. Default soft limit: 2 rejection rounds before escalating to user. If each loop is clearly converging and the fix cost remains low, the parent may continue beyond 2 rounds; otherwise escalate.
18. If the scoped work is accepted, conditionally accepted, or skipped, archive the task doc and update `TASK_CENTER.md` before ending the turn. Do not archive while any linked acceptance run remains `blocked`.

## Task-Doc Field Expectations

- `## Metadata` should include an explicit `Review status` field so repair loops can tell whether the latest review passed, failed, or is blocked.
- `## Metadata` should include `Delivery mode`, `Acceptance mode` with `none | light | full`, whether a complete test report is required, plus optional `Related acceptance spec` and `Related acceptance run` references.
- `## Metadata` should include `Lifecycle disposition`, which starts as `active` and should move to `retained-completed` or `cleanup-candidate` when the task is no longer active.
- `## Coder Handoff` should record `owned paths`, `forbidden shared files`, and the `validation command for that scope`.
- `## Reviewer Handoff` should record the `Acceptance evidence package`, whether a complete test report is required, and the `Acceptance test expectations`.
- `## Acceptance` should record the chosen path, criterion-by-criterion evidence, and the final acceptance verdict.
- If the planner marks `## Parallelization Safety` as safe, the task doc should add one handoff subsection per writer with those same fields.
- `## Final Status` should explain why a completed task should stay retained or become a cleanup candidate.

## Autonomous Delivery Mode

Use this mode when the user wants AI to finish a scope end-to-end and judge completion with a durable report rather than an informal summary.

Rules:

1. The linked requirement must already be `confirmed`.
2. The requirement must state `In scope`, `Out of scope / non-goals`, `[AC-*]`, evidence expectations, and a completion definition.
3. The task should default to `Acceptance mode = full` unless the scope is truly trivial and docs-only.
4. `acceptance-qa` must maintain or create an acceptance spec if reusable coverage is needed.
5. `acceptance-qa` must produce an acceptance run. That run is the complete test report for sign-off.
6. A task is not complete until every in-scope `[AC-*]` has one of: `met`, `not met`, `partially met`, or an explicit `blocked` explanation in the acceptance report.

Reference SOP: `docs/playbooks/orchestration/ai-autonomous-delivery-sop.md`

## Maintenance Rules

- Keep durable repository rules in `.cursor/rules/*.mdc`.
- Keep per-task plans, status, review updates, and light-mode acceptance evidence in `docs/tasks/*.md` (root for active, `archive/` for historical).
- Use `docs/acceptance-tests/**` only when the task is `full` or when a `light` task has crossed into clear reuse or auditability needs. In autonomous-delivery mode, `full` should be the default for non-trivial scopes.
- Keep the live cross-task inventory and cleanup-candidate list only in `TASK_CENTER.md`.
- Use `docs/fix-checklists/*.md` only when the review needs a standalone checklist artifact in addition to the task doc.
- Do not treat task-doc creation by itself as task completion.
- Do not delete or rename any task doc unless the user explicitly confirms cleanup.
- When moving a task doc from root to `archive/`, update all in-`docs/tasks/**` path references to use the `docs/tasks/archive/<bucket>/` prefix, and report any remaining references outside `docs/tasks/**` as follow-up items for the parent orchestrator.
