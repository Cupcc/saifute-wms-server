# 全仓 `pnpm lint` 收口修复

## Metadata

- ID: `req-20260328-1855-biome-lint-cleanup`
- Status: `confirmed`
- Lifecycle disposition: `active`
- Owner: `parent-orchestrator`
- Related tasks: `docs/tasks/task-20260328-1855-biome-lint-cleanup.md`

## 用户需求

- [x] 修复当前仓库内导致 `pnpm lint` 失败的问题，并让该命令恢复可通过状态。

## 当前进展

- 阶段进度: 已完成 lint 收口 planning，并建立执行 task 与活跃任务索引。
- 当前状态: 根目录 `pnpm lint` 当前失败；已按真实错误面拆出修复顺序，主错误集中在 `web/`。
- 阻塞项: None
- 下一步: 按“先 `scripts/src/test` 格式与 import，后 `web/` 结构正确性，最后 `web/` 宽松相等判断”的顺序执行修复，并回归根目录 `pnpm lint`。

## 待确认

- None
