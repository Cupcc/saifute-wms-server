# Fix Checklists

This directory stores review outputs written by the `code-reviewer` agent.

Purpose:

- Persist actionable review findings so execution work can continue without depending on chat history.
- Supplement the primary task doc under `docs/tasks/**` with durable review findings when a standalone checklist artifact is useful.
- Keep one markdown file per review scope or repair loop, then reuse and update that file until the loop is closed.

In requested-scope delivery orchestration, generating a checklist is not a terminal state. The orchestrator should route actionable items back to `coder`, rerun review as needed, then update the task doc and checklist with evidence before final sign-off and closure.

Recommended filename pattern:

- `review-YYYYMMDD-HHMM-<scope>.md`
- If the scope is unclear, use `review-YYYYMMDD-HHMM-general.md`

Recommended file structure:

- `### Review Scope`
- `### Fix Checklist`
- `### Validation Results`
- `### Open Questions`
- `### Residual Risks Or Testing Gaps`
- `### Short Summary`

Checklist rules:

- Every actionable finding should be written as `- [ ]`.
- Keep severity labels such as `[blocking]` and `[important]` in the checklist item text.
- If a review has no actionable findings, record `- [x] No actionable findings from this review.`

Lifecycle:

- When every checklist item is closed and the repair loop is done, the standalone `review-*.md` file may be deleted to reduce noise. Findings that matter long term should already live in the linked `docs/tasks/**` brief, and version history still preserves the removed checklist when needed.
