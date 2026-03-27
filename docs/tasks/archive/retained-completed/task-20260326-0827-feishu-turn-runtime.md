# Feishu Turn Runtime Contract Alignment

## Metadata

- Scope: align Feishu completion notifications with Cursor's current-turn `worked for ...` runtime by switching `task_complete` / `complete` auto timing from session-scoped state to task-scoped start time, while preserving explicit subagent-duration semantics
- Related requirement: `docs/requirements/archive/retained-completed/req-20260326-0827-feishu-turn-runtime.md`
- Status: `completed`
- Review status: `reviewed-no-findings`
- Lifecycle disposition: `retained-completed`
- Planner: `assistant`
- Coder: `assistant`
- Reviewer: `code-reviewer`
- Last updated: `2026-03-26`
- Related checklist:
- Related files:
  - `docs/requirements/archive/retained-completed/req-20260326-0827-feishu-turn-runtime.md`
  - `docs/tasks/archive/retained-completed/task-20260319-1605-feishu-runtime-summary.md`
  - `docs/tasks/archive/retained-completed/task-20260319-1715-feishu-subagent-runtime-duration.md`
  - `.cursor/rules/feishu-agent-stop-notify.mdc`
  - `.cursor/hooks/task-start-notify.js`
  - `.cursor/hooks/session-start-runtime.js`
  - `scripts/notify-feishu.mjs`
  - `test/notify-feishu.spec.ts`

## Requirement Alignment

- Requirement doc: `docs/requirements/archive/retained-completed/req-20260326-0827-feishu-turn-runtime.md`
- User intent summary:
  - 主代理完成通知要显示与 Cursor `worked for ...` 一致的本轮对话时间，而不是会话累计时长
  - 子代理完成通知仍要显示子代理自身运行时间，且保持独立显式计时口径
  - 旧的 session-runtime 语义不再保留
- Acceptance criteria carried into this task:
  - `task_complete` / `complete` 自动计时改为读取 `current-task.json.startedAtMs`
  - 主代理完成通知文案改为 `本轮对话运行：...`
  - `subagent_complete` 继续只接受显式 `--duration-ms` / `--started-at-ms`
  - 规则文案、脚本实现与 focused tests 必须一致
- Open questions requiring user confirmation:
  - None.

## Requirement Sync

- Req-facing phase progress: 飞书通知计时口径已完成切换并通过复审
- Req-facing current state: 主代理完成通知已对齐 Cursor 当前轮次运行时长，子代理运行时长仍保持显式注入且与主代理标签分离
- Req-facing blockers: None
- Req-facing next step: 归档
- Requirement doc sync owner: `assistant`

## Goal And Acceptance Criteria

- Goal:
  - 让飞书主完成通知默认显示当前轮次 wall-clock runtime，并保留子代理独立精确计时，不再混入会话累计时间
- Acceptance criteria:
  - `scripts/notify-feishu.mjs` 对 `task_complete` / `complete` 的自动计时源切换到任务级状态
  - `task_complete` / `complete` 自动追加 `本轮对话运行：...`，不再出现旧的任务/会话累计标签
  - `subagent_complete` 仍只从显式 timing flags 注入 `本次子代理运行：...`
  - 若任务级状态缺失或损坏，主完成事件在发送 webhook 前显式失败
  - focused regression tests 覆盖主完成别名、任务级优先、session 非影响、子代理显式计时约束与标签隔离

## Scope And Ownership

- Allowed code paths:
  - `scripts/notify-feishu.mjs`
  - `.cursor/rules/feishu-agent-stop-notify.mdc`
  - `test/notify-feishu.spec.ts`
  - requirement/task docs and index boards for this scope
- Frozen or shared paths:
  - `.cursor/hooks/session-start-runtime.js`
  - `.cursor/hooks/task-start-notify.js`
  - `package.json`
  - any Feishu webhook secret or environment-specific configuration
- Task doc owner: `assistant`
- Contracts that must not change silently:
  - 主代理完成通知默认展示当前轮次运行时间，不再退回 session-runtime
  - 子代理运行时间只能来自显式 `--duration-ms` / `--started-at-ms`
  - 脚本仍是唯一运行时文案注入点，调用方不得手写运行时间

## Implementation Plan

- [x] Step 1: switch main completion auto timing from session state to task state and relabel the injected runtime as `本轮对话运行`.
- [x] Step 2: keep subagent runtime explicit-only and ensure session/task state cannot silently become a subagent timing source.
- [x] Step 3: update standing rule text and focused tests so `task_complete` / `complete` and `subagent_complete` document and prove the new contract.

## Coder Handoff

- Execution brief:
  - update the Feishu runtime contract with the smallest safe change: make main completion notifications use current-turn task runtime, keep subagent completion explicit-only, and align tests/rules to the new semantics
- Required source docs or files:
  - `docs/tasks/archive/retained-completed/task-20260319-1605-feishu-runtime-summary.md`
  - `docs/tasks/archive/retained-completed/task-20260319-1715-feishu-subagent-runtime-duration.md`
  - `.cursor/rules/feishu-agent-stop-notify.mdc`
  - `.cursor/hooks/task-start-notify.js`
  - `.cursor/hooks/session-start-runtime.js`
  - `scripts/notify-feishu.mjs`
  - `test/notify-feishu.spec.ts`
- Owned paths:
  - `scripts/notify-feishu.mjs`
  - `.cursor/rules/feishu-agent-stop-notify.mdc`
  - `test/notify-feishu.spec.ts`
  - requirement/task doc sync for this scope
- Forbidden shared files:
  - `.cursor/hooks/session-start-runtime.js`
  - `.cursor/hooks/task-start-notify.js`
  - `package.json`
- Constraints and non-goals:
  - do not invent a new implicit subagent runtime source
  - do not preserve the old session-runtime default for main completion events
  - do not broaden the scope into generic telemetry or webhook redesign
- Validation command for this scope:
  - `pnpm test -- --runTestsByPath test/notify-feishu.spec.ts`
  - `pnpm exec biome check "scripts/notify-feishu.mjs" ".cursor/rules/feishu-agent-stop-notify.mdc" "test/notify-feishu.spec.ts"`

## Reviewer Handoff

- Review focus:
  - confirm `task_complete` / `complete` now auto-read task-scoped start time
  - confirm session state no longer influences current-turn runtime calculation
  - confirm `subagent_complete` still rejects implicit timing even if task/session state exists
  - confirm labels stay separated as `本轮对话运行` vs `本次子代理运行`
- Requirement alignment check:
  - confirm the delivered behavior matches the user's request to replace session runtime with current-turn runtime and keep subagent runtime independent
- Final validation gate:
  - `pnpm test -- --runTestsByPath test/notify-feishu.spec.ts`
  - `pnpm exec biome check "scripts/notify-feishu.mjs" ".cursor/rules/feishu-agent-stop-notify.mdc" "test/notify-feishu.spec.ts"`
- Required doc updates:
  - sync requirement/task archive entries and update both centers

## Parallelization Safety

- Status: `not safe`
- If safe, list the exact disjoint writable scopes:
- If not safe, list the shared files or contracts that require a single writer:
  - `scripts/notify-feishu.mjs`
  - `.cursor/rules/feishu-agent-stop-notify.mdc`
  - `test/notify-feishu.spec.ts`
  - the shared Feishu runtime-message contract across main and subagent completion events

## Review Log

- Validation results:
  - Parent ran `pnpm test -- --runTestsByPath test/notify-feishu.spec.ts`; it passed with `14/14` tests green.
  - Parent ran `pnpm exec biome check "scripts/notify-feishu.mjs" ".cursor/rules/feishu-agent-stop-notify.mdc" "test/notify-feishu.spec.ts"`; it passed.
  - `code-reviewer` rereviewed `scripts/notify-feishu.mjs`, `.cursor/rules/feishu-agent-stop-notify.mdc`, and `test/notify-feishu.spec.ts` after follow-up fixes and reported no remaining actionable findings.
- Findings:
  - none; no `[blocking]` or `[important]` findings remain for this scoped contract change.
- Follow-up action:
  - none for this scope.

## Final Status

- Outcome:
  - Feishu 主完成通知已从会话累计计时切换为当前轮次计时，并与子代理显式计时契约分离，验证与复审均通过。
- Requirement alignment:
  - 与已确认需求一致：`task_complete` / `complete` 默认从 `current-task.json.startedAtMs` 计算 `本轮对话运行`，`subagent_complete` 仍仅接受显式 `--duration-ms` / `--started-at-ms` 计算 `本次子代理运行`。
- Residual risks or testing gaps:
  - focused suite 使用本地 webhook stub 验证发送/不发送路径，未直连真实飞书 webhook；这属于常规低风险残余，不影响本次 tooling contract 收口。
- Directory disposition after completion: `retained-completed`；该 task 保留为本轮 Feishu 运行时长口径切换的执行与 review 真源。
- Next action:
  - 无。
