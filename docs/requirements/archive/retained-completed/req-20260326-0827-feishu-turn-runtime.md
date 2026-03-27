# 飞书通知本轮对话与子代理运行时长

## Metadata

- ID: `req-20260326-0827-feishu-turn-runtime`
- Status: `confirmed`
- Lifecycle disposition: `retained-completed`
- Owner: `user`
- Related tasks:
  - `docs/tasks/archive/retained-completed/task-20260326-0827-feishu-turn-runtime.md`

## 用户需求

- [x] 主代理每轮对话结束时，飞书通知需要显示与 Cursor `worked for ...` 一致的本轮对话运行时间，而不是会话累计运行时间。
- [x] 飞书通知需要保留子代理独立运行时间，口径为子代理启动到子代理结束。
- [x] 主代理完成通知改用新口径后，不保留旧的会话累计计时语义。

## 当前进展

- 阶段进度: 已完成通知脚本、规则文案、回归测试与独立 review 收口。
- 当前状态: `task_complete` / `complete` 现默认从 `current-task.json.startedAtMs` 计算并追加 `本轮对话运行：...`；`subagent_complete` 仍仅接受显式 `--duration-ms` / `--started-at-ms`，并追加 `本次子代理运行：...`。
- 阻塞项: None
- 下一步: 归档

## 待确认

- None
