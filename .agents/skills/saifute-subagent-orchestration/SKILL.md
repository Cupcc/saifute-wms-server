---
name: saifute-subagent-orchestration
description: Orchestrate non-trivial delivery work in the Saifute NestJS WMS repository with Codex-style subagents and durable handoffs. Use when work is ambiguous, cross-cutting, high-risk, resumable, migration-style, or when the user explicitly wants delegation, parallel agent work, or subagents. Skip this skill for tiny, clear, low-risk edits that can be handled directly in the parent.
---

# Saifute Subagent Orchestration

Use this skill for the repository's heavy delivery lane.

Stay on the direct lane for tiny, clear, low-risk edits. Use this skill when the task needs durable task state, explicit role boundaries, or Codex subagent coordination.

This skill is the entrypoint.

Runtime role definitions live under `.codex/agents/*.toml`:

- `.codex/agents/saifute-planner.toml`
- `.codex/agents/saifute-coder.toml`
- `.codex/agents/saifute-code-reviewer.toml`
- `.codex/agents/saifute-acceptance-qa.toml`

When the user explicitly asks for subagents:

- prefer the matching project-scoped custom agent as the runtime identity
- pass only the task-local subset into the child
- do not treat the handoff text itself as the source of role identity

The custom agent TOML files are the source of truth for model, reasoning, sandbox, and stable role instructions. Do not duplicate those settings in handoff prose unless the user explicitly overrides them for the current run.

## Codex-specific rules

- Only use `spawn_agent` when the user explicitly asks for subagents, delegation, or parallel agent work.
- Prefer the matching project-scoped custom agent definition under `.codex/agents/*.toml`.
- If the active Codex runtime only exposes built-in `default`, `worker`, or `explorer` shells, use the nearest built-in shell only as a temporary transport and keep the repository-specific role definition in the custom agent TOML plus the task-local brief drafted from this skill.
- Keep the critical path local. Do not delegate the immediate blocking step if the parent can do it directly faster.
- Default `fork_context` to `false`. Only inherit the parent thread when the child truly needs exact conversation state that cannot be distilled into refs, owned paths, and a narrow brief.
- Prefer `worker` for planner and coder work that truly needs workspace writes.
- Prefer read-only reviewer and acceptance lanes. Do not let review or acceptance rely on broad inherited writable state.
- Prefer `explorer` or `default` for readonly discovery and for informational review passes when the runtime shell choice matters.
- Launch multiple writers only when writable scopes are explicitly disjoint before launch.
- Keep shared files parent-owned by default unless one worker is explicitly assigned sole ownership.

## Knowledge routing first

Before choosing a lane or opening full docs, always run one cheap catalog lookup for every task:

- `node ./scripts/knowledge/search-doc-catalog.mjs --query "<user request or current scope>" --agent orchestrator --stage discovery --limit 5`
- add `--surface <path>` for any already-known changed path, schema file, module path, or doc path

Use the top `1~5` hits as the initial knowledge refs. Open only the matched docs, not broad doc trees.

Route those refs by role:

- if `planner` is used, pass the matched refs to `planner`
- if `planner` is skipped, pass the matched refs directly to `coder`
- let `code-reviewer` and `acceptance-qa` do a stage-local lookup only when the parent refs are missing or clearly insufficient

If the task later proves that a doc should have matched but did not, classify the miss as `catalog_missing`, `metadata_weak`, or `routing_wrong`, then repair `docs/catalog/catalog.jsonl` or the routing prompt in the retrospect.

## Choose the lane

Stay on the lightweight direct lane when most of these are true:

- the change is limited to one file or a very small path set
- no cross-module design choice is needed
- no migration, backfill, reconciliation, or cutover semantics are involved
- no frozen or shared contract is being rewritten
- no durable `docs/tasks/*.md` handoff is needed for resume
- focused local validation is enough

Use the heavy lane when any of these are true:

- the task is non-trivial, ambiguous, cross-cutting, or high-risk
- the user asks to continue, resume, or pick up durable work
- the task needs a task doc, review loop, or acceptance loop
- the work touches migration, backfill, reconciliation, staging, or cutover readiness
- the user explicitly asks for delegation, subagents, or parallel agent work

## Read the minimum source of truth first

Before delegating, read only the smallest relevant set:

- `docs/catalog/README.md` and `docs/catalog/catalog.jsonl`
- relevant requirement docs under `docs/requirements/**`, when requirement-driven
- `docs/tasks/TASK_CENTER.md`, `docs/requirements/REQUIREMENT_CENTER.md`, and `docs/workspace/DASHBOARD.md` when resuming
- the active `docs/tasks/*.md` for the current scope, when present
- `docs/architecture/00-architecture-overview.md`
- relevant module docs under `docs/architecture/modules/**`
- directly related code, schema, scripts, config, or tests

For migration, backfill, reconciliation, or cutover-prep work, also read:

- `docs/architecture/30-java-to-nestjs-data-migration-reference.md`
- `docs/architecture/20-wms-database-tables-and-schema.md` when inventory, workflow, reporting, reservation, or business-state semantics are affected

## Heavy-lane shape

Use only the stages the task actually needs:

1. `planner`
2. `coder`
3. `code-reviewer`
4. fix loop until blocking and important findings are cleared
5. `acceptance-qa` when independent requirement or user-flow verification is needed

This is not a mandatory planner-first state machine.

- Start at `coder` when an active task doc already gives a clear execution brief.
- Start at `code-reviewer` when the user asks for review or only an independent review pass is missing.
- Start at `acceptance-qa` only when the selected acceptance path or the user request needs it.
- Return to `planner` only when the requirement, scope, or task-doc truth needs repair.

## Role boundaries

- `planner`: create or repair a durable handoff under `docs/tasks/**`
- `coder`: implement inside explicit writable scope
- `code-reviewer`: find bugs, regressions, contract drift, and validation gaps
- `acceptance-qa`: verify requirement-level or user-flow completion from a read-only default lane
- `explorer`: readonly discovery support only

Enforce these rules:

- let `planner` edit only `docs/tasks/**`
- treat `docs/tasks/**` as read-only for `coder` unless ownership was explicitly reassigned
- route any open blocking or important review finding back to `coder`, then rerun `code-reviewer`
- use `acceptance-qa` for `Acceptance mode = full`, independent browser verification, or explicit end-to-end confirmation
- keep acceptance-doc recording parent-owned by default; only open a writable documentation lane explicitly when the task really requires it

## Parent Brief Scaffolds

Use the following role-specific scaffolds while drafting a task-local brief for the child. These bullets are for the parent agent only. Do not ask the child to read an extra template file to discover its role.

### Planner Brief

Include:

- planning problem to solve
- active task doc path, if any
- parent-provided refs
- explicit writable boundary: `docs/tasks/**` only
- frozen or parent-owned shared files
- required deliverable

Keep out:

- long repository backstory
- generic role definition already covered by `saifute-planner.toml`
- duplicated model, sandbox, or stable identity text

Suggested output sections:

- `Goal And Acceptance Criteria`
- `Requirement Alignment`
- `Task Doc Path`
- `Acceptance Planning`
- `Referenced Docs`
- `Impacted Scope`
- `Proposed Implementation Plan`
- `Risks And Parallelization Safety`
- `Structured Result`

### Coder Brief

Include:

- exact task goal
- owned writable paths
- forbidden or parent-owned paths
- task doc path, if any
- parent-provided refs
- specific deliverables
- required validation

Keep out:

- generic coder role rules already covered by `saifute-coder.toml`
- unnecessary repository backstory
- duplicated model, sandbox, or identity text

Suggested output sections:

- `Task Doc`
- `Summary`
- `Requirement Alignment`
- `Referenced Docs`
- `Files Or Paths Touched`
- `Contracts Assumed Or Changed`
- `Validation Run Or Still Needed`
- `Checklist Items Addressed`
- `Risks Or Blockers`
- `Structured Result`

### Code Reviewer Brief

Include:

- review target
- changed paths or diff focus
- parent-provided refs
- validation already run
- specific review concerns, if any
- explicit statement that the lane is read-only

Keep out:

- generic reviewer role rules already covered by `saifute-code-reviewer.toml`
- duplicated findings-first identity text
- unrelated project background

Suggested output sections:

- `Findings`
- `Validation Results`
- `Task Doc Updates`
- `Acceptance Handoff`
- `Referenced Docs`
- `Residual Risks Or Testing Gaps`
- `Short Summary`
- `Structured Result`

### Acceptance QA Brief

Include:

- verification target
- AC set to judge
- delivered behavior surface
- parent-provided refs
- evidence already available
- environment and credentials, if needed
- explicit statement that the lane is read-only

Keep out:

- generic acceptance role rules already covered by `saifute-acceptance-qa.toml`
- duplicated read-only identity text
- long repository backstory

Suggested output sections:

- `Domain Capability`
- `Acceptance Mode`
- `Acceptance Spec`
- `Acceptance Run`
- `Referenced Docs`
- `Verification Results`
- `Acceptance Judgment`
- `Rejection Or Blocking Details`
- `Structured Result`

## Close the loop

Before stopping a non-trivial task, capture continuation-critical state in durable docs instead of chat memory alone.

Make sure the handoff records:

- current status
- what changed this turn
- validation run and result
- remaining blockers, risks, sign-off needs, or pending gates
- the next recommended step
