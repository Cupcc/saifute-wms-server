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

Active task docs live at the root alongside `TASK_CENTER.md`, `README.md`, and `_template.md`. Each root `task-*.md` lists a `Related requirement` pointing to a `docs/requirements/topics/*.md` capability (e.g., `docs/requirements/topics/system-management-module.md (F4)`). Task–requirement cross-links are also indexed in `docs/requirements/REQUIREMENT_CENTER.md`. Once a task is no longer active, move it into the appropriate `archive/` bucket in the same turn.

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
- `acceptance-qa` is invoked when `light` or `full` acceptance adds value; in `full` mode it maintains acceptance specs, updates `Latest Verification` as the default complete test report, writes the acceptance result back to the task doc, and updates the topic ability status in the linked `docs/requirements/topics/*.md` when an ability completes. A separate acceptance run is optional and used only when a standalone report is justified.
- The parent orchestrator decides whether to continue the fix loop, invoke `acceptance-qa`, or close and archive the scope once delivery evidence is sufficient.

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
- `## Progress Sync`
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

1. If an active root-level `task-*.md` already matches the scope, reuse it as the primary runtime handoff instead of creating a replacement task doc just because the chat is new.
2. Create a new task doc from `docs/tasks/_template.md` only when the task is not trivially small and no valid active task doc already covers the scope.
3. Update `TASK_CENTER.md` when a new active task doc is introduced or when a task clearly changes lifecycle bucket.
4. If the user is operating from a confirmed topic, have `planner` create or repair the task doc from one explicit unfinished topic capability only when planning is actually needed (no intermediate `req-*.md` needed).
5. Have `planner` fill the goal, requirement alignment, scope, implementation plan, coder handoff fields, validation expectations, and parallelization safety when the task doc needs planning work.
6. Have `planner` or `parent` choose `Acceptance mode: none | light | full` based on runtime impact, user risk, auditability need, and workflow cost. If the linked topic capability is in autonomous-delivery mode, or the user asked for a complete test report, default to `full` unless the scope is trivially small and docs-only.
7. If `Acceptance mode = full`, have `acceptance-qa` prepare or update the relevant acceptance spec early, ensuring each in-scope `[AC-*]` maps to at least one acceptance case.
8. If `Acceptance mode = light`, keep the default path lightweight and defer separate spec or run unless reuse, auditability, or complexity justifies them.
9. Have `coder` implement from the task doc instead of inventing a new execution scope.
10. Have `code-reviewer` record review status, validation, findings, and next action in the same task doc.
11. If review finds open `[blocking]` or `[important]` items, route the work back to `coder` and keep the task doc current.
12. If review passes and `Acceptance mode = none`, write `skipped` with rationale and close the task.
13. If review passes and `Acceptance mode = light`, prefer the lightest sufficient path: fill the task doc `## Acceptance`, add direct evidence, and only create spec or run if the work has already crossed into full-mode complexity.
14. If review passes and `Acceptance mode = full`, have `acceptance-qa` create or update the relevant acceptance spec, verify the minimum coverage baseline, and update `Latest Verification` as the default complete test report for the slice. Create a separate acceptance run only when a standalone report is justified.
15. In `full` mode, have `acceptance-qa` verify environment readiness before execution. If required accounts, data, permissions, endpoints, or dependencies are not ready, mark the current acceptance record `blocked`, record `environment-gap`, and route to the parent or environment owner without consuming a rejection round.
16. Have `acceptance-qa` execute acceptance testing, verify requirement alignment, fill the task doc `## Acceptance`, and update the topic capability status in the linked topic doc when an ability completes.
17. If `acceptance-qa` rejects, route to `planner` (`requirement-misunderstanding`) only when requirement or task-doc truth needs repair; otherwise route to `coder` (`implementation-gap`) or `code-reviewer` or parent (`evidence-gap`) and repeat from the appropriate step.
18. If `acceptance-qa` blocks, route to `parent` or environment owner (`environment-gap`) and resume acceptance after the environment is ready.
19. Default soft limit: 2 rejection rounds before escalating to user. If each loop is clearly converging and the fix cost remains low, the parent may continue beyond 2 rounds; otherwise escalate.
20. If the scoped work is accepted, conditionally accepted, or skipped, archive the task doc and update `TASK_CENTER.md` before ending the turn. Do not archive while the current acceptance record remains `blocked`.

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

1. The linked topic capability must already be `confirmed`.
2. The requirement must state `In scope`, `Out of scope / non-goals`, `[AC-*]`, evidence expectations, and a completion definition.
3. The task should default to `Acceptance mode = full` unless the scope is truly trivial and docs-only.
4. `acceptance-qa` must maintain or create an acceptance spec if reusable coverage is needed.
5. `acceptance-qa` must update the acceptance spec with `Latest Verification` as the default complete test report for sign-off. A separate acceptance run is optional when a standalone report is justified.
6. A task is not complete until every in-scope `[AC-*]` has one of: `met`, `not met`, `partially met`, or an explicit `blocked` explanation in the acceptance report.

Authoritative sources: `.cursor/skills/saifute-subagent-orchestration/SKILL.md` (orchestration workflow and completion protocol) and `.cursor/agents/acceptance-qa.md` (acceptance judgment semantics and report format).

## Topic-First Derivation

Use this when the user wants to maintain only `topics/*.md`, while delegating execution to AI.

Rules:

1. The topic must already be `confirmed`.
2. The planner picks one explicit unfinished topic capability and creates the task doc directly — no intermediate `req-*.md`.
3. The planner must inherit the topic contract mechanically: no new product semantics, no widened scope, no silent multi-capability bundling.
4. If the topic capability lacks `In scope`, `Out of scope / non-goals`, completion criteria, evidence expectation, or default acceptance mode, the planner must stop for clarification instead of improvising.
5. The task Metadata must include `Related requirement: docs/requirements/topics/*.md (Fx)` to preserve traceability.

## Maintenance Rules

- Keep durable repository rules in `.cursor/rules/*.mdc`.
- Keep per-task plans, status, review updates, and light-mode acceptance evidence in `docs/tasks/*.md` (root for active, `archive/` for historical).
- Use `docs/acceptance-tests/**` only when the task is `full` or when a `light` task has crossed into clear reuse or auditability needs. In autonomous-delivery mode, `full` should be the default for non-trivial scopes.
- Keep the live cross-task inventory and cleanup-candidate list only in `TASK_CENTER.md`.
- Use `docs/fix-checklists/*.md` only when the review needs a standalone checklist artifact in addition to the task doc.
- Do not treat task-doc creation by itself as task completion.
- Do not delete or rename any task doc unless the user explicitly confirms cleanup.
- When moving a task doc from root to `archive/`, update all in-`docs/tasks/**` path references to use the `docs/tasks/archive/<bucket>/` prefix, and report any remaining references outside `docs/tasks/**` as follow-up items for the parent orchestrator.
