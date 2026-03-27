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

Active task docs live at the root alongside `TASK_CENTER.md`, `README.md`, and `_template.md`. Each root `task-*.md` **must** list a `Related requirement` path to a file that still exists at **`docs/requirements/req-*.md`（根目录，且需求 Metadata 中 `Lifecycle disposition` 为 `active`）**. Completed requirements should be **moved** to `docs/requirements/archive/**` (not deleted) so archived tasks can keep stable provenance links; update those task docs to the archived full path when moving the requirement. If a requirement file is removed from the repository without archival, the task **must not** remain at the root (archive to `archive/retained-completed/` for provenance, or delete after explicit user confirmation per cleanup policy). Task–requirement cross-links are also indexed in `docs/requirements/REQUIREMENT_CENTER.md`. Once a task is no longer active, it moves into the appropriate `archive/` bucket in the same turn; do not keep a root task doc as a fake `continue` anchor after the scoped work is objectively complete. Filenames and content are preserved; only the directory path changes.

## Layering

- `TASK_CENTER.md`: the live board for current task-doc inventory, lifecycle classification, and cleanup candidates.
- `README.md`: the folder protocol for how task docs are authored, owned, and maintained.
- `task-*.md`: the detailed execution, review, and provenance record for one scope.
- `docs/requirements/REQUIREMENT_CENTER.md`: requirement-side mirror for active/archived requirements and task bindings.

Keep those layers separate so the board stays short, the README stays stable, and individual task docs can carry long history without becoming the only entrypoint.

## Purpose

- Give each non-trivial task a durable execution brief under `docs/tasks/**`.
- Keep task-scoped runtime context out of `.cursor/rules/*.mdc`.
- Let `planner`, `coder`, and `code-reviewer` share one source of truth across the delivery loop.

## Role Split

- `planner` creates or updates the task doc and owns planning-phase edits.
- `coder` reads the task doc as the execution brief and treats it as read-only unless documentation ownership is explicitly reassigned.
- `code-reviewer` updates the task doc with review status, validation results, and follow-up state.
- The parent orchestrator decides whether to continue the fix loop or create a commit when the user explicitly asks for one.

## Lifecycle Guidance

- `active`: still open for planning, implementation, review, repair, or resume.
- `retained-completed`: completed, but intentionally kept because it is still a durable source of truth or a useful upstream reference.
- `cleanup-candidate`: appears removable later, but remains list-only until the user explicitly confirms cleanup.
- If an old brief is fully replaced and no longer worth retaining, write the change explanation in the current source-of-truth doc and delete the obsolete brief instead of creating a dedicated archive bucket for it.
- `TASK_CENTER.md` is the lifecycle truth for resume. Archived task docs remain readable provenance, but should not be treated as active handoff sources unless the user explicitly reopens that scope.

Maintain the live directory-wide classification in `TASK_CENTER.md`, not in this README. If a task doc is older than the lifecycle field in the template, classify it in the board instead of rewriting history just for metadata backfill.

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
- `## Final Status`

## Workflow

1. Create a new task doc from `docs/tasks/_template.md` when the task is not trivially small.
2. Update `TASK_CENTER.md` when a new active task doc is introduced or when a task clearly changes lifecycle bucket.
3. Have `planner` fill the goal, requirement alignment, scope, implementation plan, coder handoff fields, validation expectations, and parallelization safety.
4. Have `coder` implement from the task doc instead of inventing a new execution scope.
5. Have `code-reviewer` record review status, validation, findings, and next action in the same task doc.
6. If review finds open `[blocking]` or `[important]` items, route the work back to `coder` and keep the task doc current.
7. If the scoped work is complete and no real active follow-up remains, archive the task doc and update `TASK_CENTER.md` before ending the turn.

## Task-Doc Field Expectations

- `## Metadata` should include an explicit `Review status` field so repair loops can tell whether the latest review passed, failed, or is blocked.
- `## Metadata` should include `Lifecycle disposition`, which starts as `active` and should move to `retained-completed` or `cleanup-candidate` when the task is no longer active.
- `## Coder Handoff` should record `owned paths`, `forbidden shared files`, and the `validation command for that scope`.
- If the planner marks `## Parallelization Safety` as safe, the task doc should add one handoff subsection per writer with those same fields.
- `## Final Status` should explain why a completed task should stay retained or become a cleanup candidate.

## Maintenance Rules

- Keep durable repository rules in `.cursor/rules/*.mdc`.
- Keep per-task plans, status, and review updates in `docs/tasks/*.md` (root for active, `archive/` for historical).
- Keep the live cross-task inventory and cleanup-candidate list only in `TASK_CENTER.md`.
- Use `docs/fix-checklists/*.md` only when the review needs a standalone checklist artifact in addition to the task doc; delete completed `review-*.md` files per `docs/fix-checklists/README.md` and drop stale paths from task metadata.
- Do not treat task-doc creation by itself as task completion.
- Do not delete or rename any task doc unless the user explicitly confirms cleanup.
- Do not create a dedicated archive bucket for fully replaced briefs; explain the replacement in the current truth doc, then remove the obsolete brief when cleanup is confirmed.
- When moving a task doc from root to `archive/`, update all in-`docs/tasks/**` path references to use the `docs/tasks/archive/<bucket>/` prefix, and report any remaining references outside `docs/tasks/**` as follow-up items for the parent orchestrator.
