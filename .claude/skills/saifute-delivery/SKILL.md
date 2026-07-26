---
name: saifute-delivery
description: Entry point for this repo's heavy delivery lane and the requirement→acceptance closed-loop workflow. Use when work is non-trivial, ambiguous, cross-cutting, high-risk, resumable, or migration-style; when the user wants delegation / subagents / parallel agent work; or when the user asks to run the automated build loop. Skip for tiny, clear, low-risk edits handled directly.
---

# Saifute Delivery (Claude Code)

This is the Claude Code entry point for the repository's heavy delivery lane. It does **not** redefine the rules — it points at the existing source of truth and adds how to run the closed-loop workflow.

## Sources of truth (read, don't duplicate)

- **Full orchestration design** (heavy-lane shape, role boundaries, per-role brief scaffolds, knowledge-routing-first): `.agents/skills/saifute-subagent-orchestration/SKILL.md`
- **Reusable orchestration experience**: `docs/playbooks/orchestration/playbook.md` (ORCH-001 fact-first ordering · ORCH-002 commit is not a default stage · ORCH-003 verify tests before labeling an env-gap)
- **Frozen constraints** (`alwaysApply`): `.cursor/rules/requirements-first-orchestration.mdc`, `.cursor/rules/batch-delivery-no-midstop.mdc`, `.cursor/rules/prisma-push-collation.mdc`, `.cursor/rules/dependency-docs-first.mdc`
- **Lifecycle indexes / resume truth**: `docs/requirements/REQUIREMENT_CENTER.md`, `docs/tasks/TASK_CENTER.md`, `docs/workspace/DASHBOARD.md`
- **Templates**: `docs/tasks/_template.md`, `docs/acceptance-tests/specs/_template.md`, `docs/requirements/domain/_template.md`

## Roles (Claude Code)

Runtime identities live in `.claude/agents/*.md` (ported from `.codex/agents/*.toml`):

- `saifute-planner` — durable handoff under `docs/tasks/**` only
- `saifute-coder` — implement inside explicit writable scope
- `saifute-code-reviewer` — read-only; bugs, regressions, contract drift, validation gaps
- `saifute-acceptance-qa` — read-only default; judge `[AC-*]`, issue accepted/rejected

Spawn them by `subagent_type` with the `Agent` tool, or let the workflow drive them.

## Knowledge routing first

Before choosing a lane or opening full docs, run one cheap catalog lookup:

```
node ./scripts/knowledge/search-doc-catalog.mjs --query "<request or scope>" --agent orchestrator --stage discovery --limit 5
```

Add `--surface <path>` for any already-known changed path. Open only the top 1–5 hits.

## Choose the lane

Stay on the **direct lane** for one-file / small-path, no cross-module design, no migration/backfill/cutover, no frozen-contract rewrite, no durable handoff needed.

Use the **heavy lane** (roles above, or the workflow below) when the task is non-trivial/ambiguous/cross-cutting/high-risk, the user asks to resume durable work, a task/review/acceptance loop is needed, or the work touches migration/backfill/reconciliation/staging/cutover.

Per ORCH-001 this is not a mandatory planner-first state machine: start where the current facts point (reuse the active task doc on resume).

## Automated closed loop

For end-to-end delivery of one requirement, run the workflow:

```
Workflow(name: 'saifute-delivery-loop', args: { goal: '<requirement text or docs/requirements/domain/*.md (Fx)>' })
```

Stages: discovery → planner → coder → code-reviewer (fix loop ≤2) → acceptance-qa. It reuses the catalog routing, `docs/tasks` handoff, and validation gates above.

**Two human gates remain (everything else is automatic):**

1. **Requirement confirmation** — a new requirement defaults to `needs-confirmation`; only the user promotes it to `confirmed` (`requirements-first-orchestration.mdc`). The loop pauses after discovery if the requirement is not confirmed.
2. **Irreversible ops** — `migration:*:execute`, `prisma:push`, `commit`, and release stay human. The loop runs dry-run/validate + acceptance judgment, then stops with a recommendation.
