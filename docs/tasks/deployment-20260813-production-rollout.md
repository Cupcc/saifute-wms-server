# 2026-08-13 生产发布记录

## 发布结论

- 目标：本机 Mac mini 的 `com.saifute.wms` LaunchAgent，HTTP `:90`。
- 应用提交：`5d0b2e2`（`feat(reporting): refine material category monthly report`）。
- 版本：后端 `0.1.2`，前端 `1.0.6`。
- 发布结果：成功；服务以新 PID `68582` 运行，前端 `/`、API `/api/auth/captcha` 与新静态资源均返回 `200`。
- Git 状态：NAS Git 镜像的 `main` 已包含应用提交；GitHub PR [#39](https://github.com/Cupcc/saifute-wms-server/pull/39) 的保护检查全部通过，但仓库禁用 merge commit，保留待选 squash/rebase。

## 发布前验证

- Staged diff 空白与敏感信息扫描：通过；没有环境文件进入提交。
- 受影响的月报后端单测：`12/12` 通过。
- `test/batch-d-slice.e2e-spec.ts`：`17/17` 通过。
- 月报前端守卫测试：`13/13` 通过。
- TypeScript 类型检查与 Jest：`139/139` suites、`942/942` tests 通过。
- 后端 Prisma client + Nest production build：通过。
- 前端 Vite production build：通过。
- 本次变更文件 Biome 检查：通过，仅有 3 个既有文件长度警告。
- 全仓 Biome 仍有本次范围外的历史错误与警告，未作为本次发布阻断项。

## 数据与部署安全

- 本次没有 Prisma schema 变更，不需要数据库迁移、停写或数据回填。
- `.env.prod` 权限在发布前后均为 `600`。
- 部署脚本只同步 `dist/`、`generated/`、`node_modules/`、`web/dist/` 与根 `package.json`；没有修改 `.env.prod`、`storage/` 或 `logs/`。
- 发布前运行时快照：`/Users/sft/Projects/saifute-wms-deploy/rollback/pre-deploy-20260813T073943Z/`。
- 快照对应上一生产提交 `6743e4c`，后端 `0.1.1`、前端 `1.0.5`，并记录关键文件 SHA-256。

## 发布后验收

- `launchctl print gui/$(id -u)/com.saifute.wms`：`state = running`。
- `lsof -nP -iTCP:90 -sTCP:LISTEN`：仅新 Bun 进程监听。
- `GET /`：`200`。
- `GET /api/auth/captcha`：`200`。
- 新前端静态 JS 资源：`200`。
- 源码与部署目录的 `dist/`、`generated/`、`web/dist/` 逐文件一致，根 `package.json` 一致。
- 新启动日志包含 Redis `ready` 与 Nest application `successfully started`；`launchd.err.log` 没有新增内容。

## 非阻断观察与后续入口

- Jest 与 e2e 运行时仍会报告既有 `MaxListenersExceededWarning`，但所有相关测试通过。
- GitHub PR #39 当前全部检查通过且可合并；由于 merge commit 被仓库策略禁止，后续应明确选择 squash 或 rebase，再处理 GitHub 与 NAS 双 push URL 的历史对齐。
- 如需应用回滚，使用上述快照恢复 `dist/`、`generated/`、`node_modules/`、`web-dist/` 与 `package.json` 后重新启动 LaunchAgent；本次没有数据库回滚步骤。
