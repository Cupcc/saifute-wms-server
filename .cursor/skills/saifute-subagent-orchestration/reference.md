# Subagent Matrix

## Delivery agents

### `auth-foundation`

- Owns: `auth`, `session`, `rbac`
- Typical files: `src/modules/auth/**`, `src/modules/session/**`, `src/modules/rbac/**`
- Shared files allowed when needed: `src/shared/guards/**`, `src/shared/decorators/**`, `src/shared/events/**`, auth/session config
- Must preserve: JWT ticket plus Redis session model, permission-string checks, route-tree building, data-scope behavior

### `shared-core`

- Owns: `master-data`, `inventory-core`, `workflow`
- Typical files: `src/modules/master-data/**`, `src/modules/inventory-core/**`, `src/modules/workflow/**`
- Shared files allowed when needed: `src/shared/prisma/**`, transaction wrappers, shared query DTOs, typed constants for workflow or stock semantics
- Must preserve: `inventory-core` as the only stock write entry, stock-log plus source-tracking semantics, lightweight `workflow` model instead of BPM

### `document-flows`

- Owns: `inbound`, `outbound`, `workshop-material`, `project`
- Typical files: `src/modules/inbound/**`, `src/modules/outbound/**`, `src/modules/workshop-material/**`, `src/modules/project/**`
- Shared files allowed when needed: downstream DTO contracts, test fixtures, batch-C-only query adapters
- Must preserve: explicit detail diffs, workflow reset semantics, stock side effects through `inventory-core`, downstream validation before void/reverse

### `platform-services`

- Owns: `audit-log`, `reporting`, `file-storage`, `scheduler`, `ai-assistant`
- Typical files: `src/modules/audit-log/**`, `src/modules/reporting/**`, `src/modules/file-storage/**`, `src/modules/scheduler/**`, `src/modules/ai-assistant/**`
- Shared files allowed when needed: interceptors, event adapters, SSE contracts, static-resource config
- Must preserve: async audit behavior, reporting as read-only, `/profile/**` file semantics, DB-defined scheduler jobs, AI as query-orchestration only

## Cross-cutting agents

### `architecture-guardian`

- Best for: large refactors, shared-contract changes, or parallel tasks that risk boundary drift
- Default mode: review-first; readonly unless explicitly asked to patch
- Checks:
  - module boundaries align with docs
  - transaction ownership stays in application layer
  - controllers stay thin and DTO-driven
  - no accidental direct table reach-through across modules
  - permission, session, and stock semantics are preserved

### `integration-test-reviewer`

- Best for: deciding missing tests, writing or fixing test coverage, and selecting final validation commands
- Typical files: `test/**`, module `*.spec.ts`, e2e specs, fixtures
- Checks:
  - auth/session lifecycle
  - inventory side effects and reverse operations
  - workflow resets and downstream-void rules
  - scheduler execution logging
  - AI SSE protocol and tool-call boundaries

## Suggested combinations

- Auth changes: `auth-foundation` + `integration-test-reviewer`
- Shared contracts or transactions: `shared-core` + `architecture-guardian`
- Batch C implementation: `document-flows` + `shared-core` + `integration-test-reviewer`
- Batch D implementation: `platform-services` + `architecture-guardian` + `integration-test-reviewer`
- Large end-to-end feature: one delivery agent for the main batch, plus both cross-cutting agents

## Handoff format

Ask every subagent to report back in this shape:

```markdown
Summary:
- ...

Files or modules touched:
- ...

Contracts assumed or changed:
- ...

Tests run or still needed:
- ...

Risks or blockers:
- ...
```
