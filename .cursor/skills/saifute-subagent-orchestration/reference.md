# Subagent Matrix

## Planner agent

### readonly `planner`

- Best for: turning a user request into an implementation plan before any write step with the repo's dedicated planning worker
- Owns:
  - task decomposition
  - impacted file, module, schema, script, doc, and operational-surface discovery
  - validation planning
  - parallelization safety judgment
  - blocker and sign-off visibility
- Must not:
  - edit files
  - invent unsupported contracts
  - recommend parallel writers without naming disjoint writable scopes

Typical output:

- task goal and acceptance criteria
- impacted files, modules, shared surfaces, and operational targets
- ordered implementation steps
- likely risks and frozen-contract touchpoints
- recommended validation commands
- for migration, backfill, reconciliation, or cutover-prep work: staging-or-exclusion handling, replay-vs-copy judgment, deterministic generation rules, cutover blockers, sign-off or follow-up needs, and runtime-alignment checks for target constants or status semantics

## Delivery agent

### `execution-agent`

- Best for: scoped implementation, refactor, bug-fix, migration, backfill, reconciliation, cutover-prep, and related docs or tooling work
- Owns: one explicitly assigned writable scope at a time
- Typical files:
  - `src/modules/**`
  - related tests
  - `prisma/**`
  - `scripts/**`
  - `docs/**`
  - `src/shared/**`
  - `src/app*.ts`
  - module-local docs
  - narrow shared files or operational artifacts directly required by the task
- Must preserve:
  - documented module boundaries
  - `inventory-core` as the only stock write entry point
  - `workflow` as the owner of workflow behavior
  - JWT ticket plus Redis session model
  - RBAC ownership of permission and scope policy
  - AI as query-orchestration only

## Review agent

### `code-reviewer`

- Best for: reviewing correctness, regressions, test sufficiency, and validation completeness
- Typical files:
  - changed implementation files
  - related `*.spec.ts` files
  - e2e specs and fixtures when relevant
- Owns:
  - review findings
  - severity judgment
  - validation judgment
  - explicit fix requests for follow-up loops

Checks include:

- auth and session lifecycle where relevant
- inventory side effects and reverse operations
- workflow regressions
- transaction safety
- missing tests
- whether the executed validation actually matches the changed risk surface
- for migration-style work, staging or exclusion handling, replay-vs-copy fit, deterministic generation, runtime-alignment checks, and blocker visibility

## Parallel writer policy

- Multiple writer `execution-agent` workers are allowed only when their writable scopes are explicitly disjoint before launch
- Write-capable subagents should not run in background mode
- Shared files such as `src/app.module.ts`, `src/main.ts`, `src/shared/**`, `prisma/schema.prisma`, route or permission registries, shared docs or contracts, shared staging schemas, reconciliation outputs, cutover evidence, and cross-module tests stay parent-owned unless one worker is explicitly named as the sole owner
- Each writer handoff should list owned paths, forbidden shared files, and the validation command for that scope
- If overlapping child changes appear and the source is clearly an active child worker, the parent should re-read the latest content and merge on top of it instead of stopping immediately

## Rules vs runtime context

- Use `.cursor/rules/*.mdc` for durable facts and repository-wide constraints that future tasks should inherit
- Keep live execution state in the parent handoff or a temporary shared context artifact, not in rules
- Good rule candidates: verified dev environment facts, frozen workflow rules, repo-wide orchestration conventions
- Bad rule candidates: current task status, temporary blockers, one-off test failures, or branch-local workaround notes

## Suggested combinations

- Default task flow: readonly `planner` subagent -> `execution-agent` -> `code-reviewer` -> if any `[blocking]` or `[important]` finding remains, route back to `execution-agent` -> rerun `code-reviewer` -> parent commit step only if the user explicitly asked for a commit
- Multi-module task with safe disjoint scopes: readonly `planner` subagent -> parallel `execution-agent` workers with explicit boundaries -> `code-reviewer` -> fix loop as needed
- Review-heavy task: readonly `planner` subagent -> `code-reviewer`
- Small but non-trivial bugfix: readonly `planner` subagent -> `execution-agent` -> `code-reviewer` -> fix loop -> parent commit step only if the user explicitly asked for a commit

## Finalization ownership

- Commit creation belongs to the parent orchestrator only
- Do not let `execution-agent` or `code-reviewer` create the commit directly
- Only proceed to commit after required validation passes, review is clear of open `[blocking]` and `[important]` findings, and the user explicitly asked for a commit
- For delivery requests, review is not a stopping point; the parent should keep the repair loop moving until commit readiness or a real blocker
- Only stop early when the user explicitly asked for `plan-only`, `review-only`, or `docs-only`
- If the user says `no-commit`, finish the requested scope and review or fix loop, then stop without creating a commit

## Handoff format

Ask every subagent to report back in this shape:

```markdown
Summary:
- ...

Files, modules, or operational surfaces touched:
- ...

Contracts assumed or changed:
- ...

Tests run or still needed:
- ...

Risks, blockers, sign-off needs, or follow-up work:
- ...
```

Planner append:

```markdown
Implementation steps:
- ...

Validation plan:
- ...

Parallel writer safety:
- safe or unsafe, with the reason

Migration-style append when relevant:
- staging-or-exclusion handling
- replay-vs-copy judgment
- deterministic generation rules
- cutover blockers and runtime-alignment checks
- required sign-off or follow-up owner
```

Reviewer append:

```markdown
Findings:
- [blocking] ...
- [important] ...
- [minor] ...

Required fixes before commit:
- ...

Validation judgment:
- sufficient or insufficient, with the missing command if needed
```
