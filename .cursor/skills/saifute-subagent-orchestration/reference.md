# Orchestration Quick Reference

Use this file as a pointer sheet, not as a second source of truth.

## Lane reminder

- `direct lane`: tiny, clear, low-risk work; parent reads the smallest relevant files, edits directly, runs focused validation, and stops
- `heavy lane`: non-trivial, ambiguous, cross-cutting, high-risk, resumable,  work; use durable task state and explicit subagent boundaries

For the actual lane-selection rule, follow [SKILL.md](SKILL.md).

## Main-agent autonomy

- The main agent chooses the sequence; `planner` is optional, not mandatory.
- On `continue` or `resume`, prefer the existing active `docs/tasks/*.md` as the runtime handoff.
- If the active task doc is still valid, continue from the next unfinished step instead of replanning.
- Create or replace a task doc only when no valid active one matches the scope, the current one is stale or contradictory, the scope materially changed, or the user explicitly asks to replan.

## Agent quick matrix

| Agent | Use for | Writable scope | Canonical details |
|---|---|---|---|
| `planner` | turn a non-trivial request into an execution-ready task doc | `docs/tasks/**` only | `.cursor/agents/planner.md` |
| `coder` | implement inside an explicitly assigned writable scope | owned paths only; `docs/tasks/**` stays read-only unless reassigned | `.cursor/agents/coder.md` |
| `code-reviewer` | find bugs, regressions, contract drift, and validation gaps | review-owned task-doc/checklist updates only when assigned | `.cursor/agents/code-reviewer.md` |
| `acceptance-qa` | independent requirement-level or user-flow verification | task-doc `## Acceptance`, linked domain status, `docs/acceptance-tests/**` | `.cursor/agents/acceptance-qa.md` |
| `explore` | readonly codebase discovery support | none | parent handoff only |

## Shared-file and parallel-writer reminders

- Use one writer by default.
- Launch multiple writer agents only when writable scopes are explicitly disjoint before launch.
- Keep shared files parent-owned by default unless one worker is explicitly named as sole owner.
- Do not run write-capable subagents in background mode.
- Re-read the latest file content before merging child output into a shared surface.

Typical parent-owned shared surfaces include:

- `src/app.module.ts`, `src/main.ts`, and broad `src/shared/**` surfaces
- `prisma/schema.prisma`
- route registries, permission registries, shared contracts, and active `docs/tasks/*.md`
- cross-module tests and shared contracts

## Knowledge map

- `docs/requirements/*.md`: user intent, status, blockers, next steps
- `docs/tasks/*.md`: execution brief, validation state, review loop, acceptance record
- `docs/workspace/**`: human decision support, drafts, trade-offs, and progress narrative
- `docs/playbooks/**`: reusable lessons, anti-patterns, and helper scripts that survive task archival
- `.cursor/rules/*.mdc`: frozen repo-wide constraints and durable orchestration rules

Do not put task-runtime state into rules or playbooks.

## Where the details live

- [SKILL.md](SKILL.md): trigger boundary, lane selection, heavy-lane flow, frozen guardrails
- `docs/tasks/README.md`: task-doc lifecycle, ownership, and `Acceptance mode` rules
- `.cursor/agents/planner.md`: planning output contract
- `.cursor/agents/coder.md`: implementation boundary and delivery contract
- `.cursor/agents/code-reviewer.md`: review priorities and evidence handoff
- `.cursor/agents/acceptance-qa.md`: acceptance judgment and writable scope
- `docs/playbooks/README.md`: retrospect and playbook-writing rules
- `docs/workspace/README.md`: workspace structure and parent-only write rules
- `.cursor/rules/requirements-first-orchestration.mdc`: direct lane vs requirement/task orchestration routing
- `.cursor/rules/subagent-context-boundaries.mdc`: layering rules for requirements, tasks, workspace, playbooks, and rules

## Minimal mental model

For non-trivial delivery work:

1. confirm requirement and active lifecycle truth
2. if a valid active task doc exists, resume from it; otherwise use `planner` to create or repair one
3. let `coder` implement inside explicit ownership boundaries
4. let `code-reviewer` drive the fix loop until blocking and important findings are clear
5. run `acceptance-qa` only when the selected acceptance path or user request requires it
6. archive and retrospect only after durable handoff is complete
