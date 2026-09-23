---
name: saifute-subagent-orchestration
description: Orchestrate non-trivial delivery work in the Saifute NestJS WMS repository with durable handoffs and repo-specific guardrails. Use for domain-driven execution or resume/continue requests where the main agent should autonomously decide whether to use `planner`, `coder`, `code-reviewer`, `acceptance-qa`, and `retrospect`; skip this skill for small, clear, low-risk edits that can be handled directly by the parent.
---

# Saifute Subagent Orchestration

Use this skill only for the repository's heavy delivery lane.

Prefer the parent-only direct lane for tiny, clear, low-risk work. Use this skill when the request needs durable task state, explicit subagent coordination, or repo-specific delivery guardrails.

## Main-agent autonomy

The main agent owns orchestration. Do not treat this skill as a fixed planner-first state machine.

- let the main agent decide whether to work directly, resume from an existing task doc, call `planner`, call `coder`, run review, run acceptance, and when to retrospect
- do not launch `planner` just because the task is non-trivial or because a previous flow happened to start there
- when the user says `continue`, `resume`, or `pick this up`, first check whether an active task doc already exists for the scope and use it as the primary runtime handoff
- if that active task doc is still valid, continue from the next unfinished step instead of replanning
- create a new task doc or restart planning only when no active task doc matches the scope, the current task doc is stale or contradictory, the scope materially changed, or the user explicitly asks to replan

## Choose the lane

Stay on the lightweight direct lane when most of these are true:

- the change is limited to one file or a very small path set
- no cross-module design choice is needed
- no cross-module design choice is needed
- no frozen or shared contract is being rewritten
- no durable `docs/tasks/*.md` handoff is needed for resume
- focused local validation is enough

On the lightweight direct lane:

- edit directly in the parent
- read only the smallest relevant files
- do not create `docs/tasks/*.md` or `docs/requirements/*.md` by default
- do not launch `planner` or `code-reviewer` just for process symmetry
- run the narrowest useful validation
- escalate to the heavy lane immediately if hidden complexity appears

Use the heavy lane when any of these are true:

- the task is non-trivial, ambiguous, cross-cutting, or high-risk
- the user asks to continue, resume, or pick up durable work
- the task needs a task doc, review loop, or acceptance loop to resume safely later
- the work needs explicit subagent ownership boundaries
- the work needs explicit subagent ownership boundaries

## Read the minimum source of truth first

Before delegating, read the smallest relevant source of truth for the task:

- the relevant domain capability in `docs/requirements/domain/*.md` when the task is driven by a requirement
- `docs/tasks/TASK_CENTER.md`, `docs/requirements/REQUIREMENT_CENTER.md`, and `docs/workspace/DASHBOARD.md` when resuming or continuing
- the active `docs/tasks/*.md` for the still-active scope, if one exists
- the relevant workspace under `docs/workspace/<workflow>/` when the workflow has one
- `docs/architecture/00-architecture-overview.md`
- the relevant module docs under `docs/architecture/modules/`
- the files directly related to the task
- the relevant `docs/playbooks/*/playbook.md` when the task type already has one

When inventory, workflow, reporting, document relations, reservation semantics, or business-state semantics are affected, also read `docs/architecture/20-wms-database-tables-and-schema.md` and the relevant runtime surfaces.

If the domain capability is unconfirmed, unclear, or missing contract data needed to plan safely, stop and ask the user before planning or coding.

Treat archived task docs as provenance only. Do not revive archived scope unless the user explicitly reopens it.

## Run the heavy lane adaptively

When planning is actually needed, the common heavy-lane shape is:

1. `planner`
2. `coder`
3. `code-reviewer`
4. `fix` loop until blocking or important findings are cleared
5. `acceptance-qa` when the chosen acceptance path or user request requires it
6. `retrospect` for completed non-trivial work

This is a common flow, not a mandatory start state.

- start at `coder` when an existing active task doc already provides a clear execution brief
- start at `code-reviewer` when the user asks for review or when code changed and only an independent review pass is missing
- start at `acceptance-qa` only when the selected acceptance path or user request actually requires it
- return to `planner` only when requirement understanding, scope, or task-doc truth needs to be repaired

Do not stop heavy-lane delivery after only planning, one code pass, one review pass, or one targeted validation run unless the user explicitly asked for `plan-only`, `review-only`, or `docs-only`.

Use the task doc as the durable runtime handoff for heavy-lane work. Follow `docs/tasks/README.md` for task-doc structure, lifecycle, and acceptance-mode rules.

## Delegate with strict role boundaries

Use the smallest useful set of workers:

- `planner`: scope the task, align it to the requirement, identify risks and validation, decide whether parallel writers are safe, and create or update `docs/tasks/**`
- `coder`: implement within explicit writable scope using the assigned task doc as the execution brief
- `code-reviewer`: review correctness, regressions, missing tests, contract drift, and validation sufficiency
- `acceptance-qa`: verify requirement-level or user-flow completion when the selected acceptance path needs an independent pass or the user explicitly asks for it
- `explore`: use only for readonly discovery support

Enforce these role rules:

- let `planner` edit only `docs/tasks/**`
- treat `docs/tasks/**` as read-only for `coder` unless documentation ownership was explicitly reassigned
- route any open `[blocking]` or `[important]` review finding back to `coder`, then rerun `code-reviewer`
- use `acceptance-qa` when `Acceptance mode = full`, when independent browser or business verification is needed, or when the user explicitly asks for end-to-end confirmation
- allow multiple writer agents only when writable scopes are explicitly disjoint before launch
- keep shared files parent-owned by default unless one worker is explicitly named as sole owner

For the quick role matrix, shared-file reminders, and doc pointers, read [reference.md](reference.md).

## Respect repository-wide frozen constraints

Never let subagents bypass these repository rules:

- `inventory-core` is the only stock write entry point
- `workflow` owns audit-document behavior and review-state semantics
- `session` uses JWT as a session ticket, with Redis as the session source of truth
- `rbac` owns permission strings, route trees, and data-scope policies
- `ai-assistant` may query and orchestrate tools, but must not write business data directly

Keep durable repository rules in `.cursor/rules/*.mdc`. Keep live execution state in `docs/tasks/**`, workspace files, and current handoff artifacts instead of promoting temporary observations into rules.


## Close the loop before stopping

Before ending a non-trivial task, write continuation-critical state to durable docs instead of relying on chat memory alone.

Make sure the handoff captures:

- current status
- what changed this turn
- validation run and result
- remaining blockers, risks, sign-off needs, or pending gates
- the next recommended step
- exact commands, report paths, or artifacts the next chat should read or run first

When a workspace exists for the workflow, also sync decision-relevant findings there instead of leaving them only in chat history.

If the scope is complete, update lifecycle state and archive placement according to `docs/tasks/README.md` instead of leaving stale active anchors behind.

After a non-trivial task completes, run a lightweight retrospect and append durable lessons to the relevant `docs/playbooks/{domain}/playbook.md`. Skip retrospect for lightweight direct-lane work unless the user explicitly asks for it.

## Additional reference

Read these files only when needed:

- [reference.md](reference.md) for the quick agent matrix, shared-file reminders, and canonical doc pointers
- `docs/tasks/README.md` for task-doc ownership, lifecycle, and acceptance-mode rules
- `.cursor/agents/planner.md`, `.cursor/agents/coder.md`, `.cursor/agents/code-reviewer.md`, and `.cursor/agents/acceptance-qa.md` for role-specific output expectations
