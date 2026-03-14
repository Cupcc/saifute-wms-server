---
name: saifute-subagent-orchestration
description: Orchestrates project-specific subagents for the Saifute NestJS WMS migration. Use when implementing, refactoring, reviewing, or parallelizing work in this repo across auth/session/rbac, shared business core, transactional document modules, platform services, or their integration tests.
---

# Saifute Subagent Orchestration

Use this skill when work in this repository is large enough to benefit from delegated subagents or when a request spans multiple modules.

## Required context

Read these before assigning work:

- `docs/00-architecture-overview.md`
- `docs/10-subagent-build-batches.md`
- The specific module docs in `docs/modules/`

Treat those docs as the source of truth for module boundaries, dependencies, transaction rules, and testing scope.

## Batch order

Respect the documented dependency order:

1. Batch A: `auth`, `session`, `rbac`
2. Batch B: `master-data`, `inventory-core`, `workflow`
3. Batch C: `inbound`, `outbound`, `workshop-material`, `project`
4. Batch D: `audit-log`, `reporting`, `file-storage`, `scheduler`, `ai-assistant`

Do not start downstream implementation until upstream prerequisites are satisfied, unless the task is explicitly docs-only.

## Subagent selection

Choose the smallest useful set:

- `auth-foundation`: authentication, sessions, online users, RBAC, route trees, permission and data-scope foundations
- `shared-core`: master data, inventory center, workflow, and shared business contracts needed by downstream modules
- `document-flows`: transactional document modules that change stock or depend on workflow
- `platform-services`: audit logging, reporting, file storage, scheduler, and AI assistant orchestration
- `architecture-guardian`: boundary review, transaction review, dependency drift detection, and shared-contract checks
- `integration-test-reviewer`: test strategy, missing coverage, and command selection for the touched batches

## Launch rules

1. Default to at most 4 concurrent worker subagents.
2. For cross-module work, include `architecture-guardian` early.
3. Before finalizing substantive work, involve `integration-test-reviewer`.
4. If a task touches shared contracts, update docs first or stop and ask for direction.
5. Never let a subagent bypass these frozen rules:
   - `inventory-core` is the only stock write entry point.
   - `workflow` owns audit-document workflow behavior.
   - `session` uses JWT as a session ticket, with Redis as the session source of truth.
   - `rbac` owns permission strings, route trees, and data-scope policies.
   - `ai-assistant` may query and orchestrate tools, but must not write business data directly.

## File ownership guidance

Each delivery subagent may edit:

- Its owned module directories under `src/modules/<module>/`
- Tests for those modules
- Narrow shared files that are directly required by the task

Each delivery subagent must avoid:

- Unapproved edits to another module's internal repository or table access
- New cross-module dependencies that are not documented
- Silent changes to shared contracts without updating docs

## Required handoff from every subagent

Ask each subagent to return:

- A concise summary of what it changed or proposes
- Files or modules touched
- Shared contracts assumed or changed
- Tests run or still needed
- Risks, blockers, and follow-up work

## Validation gates

- Batch A work: `pnpm lint && pnpm test:e2e`
- Batch B work: `pnpm lint && pnpm test`
- Batch C work: `pnpm lint && pnpm test`
- Batch D work: `pnpm lint && pnpm test`

Use narrower test commands when appropriate during iteration, but do not skip the documented gate for the affected batch before declaring the work complete.

## Additional reference

- See [reference.md](reference.md) for the recommended subagent matrix and ownership details.
