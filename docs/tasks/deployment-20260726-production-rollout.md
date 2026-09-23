# 2026-07-26 生产发布记录

## 发布结论

- 目标：本机 Mac mini 的 `com.saifute.wms` LaunchAgent，HTTP `:90`。
- 应用提交：`fd2bd2d`（`feat(wms): complete RD procurement and reporting delivery`）。
- 发布结果：成功；服务已恢复为 `running`，前端 `/` 与 API `/api/auth/captcha` 均返回 `200`。
- 工作区保留 `.env.dev` 的本机改动，未提交，避免把连接串带入 Git。

## 发布前验证

- Prisma schema validate：通过。
- TypeScript 类型检查：通过。
- Jest：`137/137` suites、`932/932` tests 通过。
- 后端 `dist` 与前端 `web/dist` production build：通过。
- Git staged secret scan：未发现私钥或环境凭据模式。
- `.env.prod` 权限：`600`；部署脚本不会同步 `.env.prod`、`storage/` 或 `logs/`。

## 数据安全与 schema 变更

发布前使用 `mysqldump --single-transaction --routines --triggers --events` 生成了两份 600 权限备份：

| 用途 | 文件 | SHA-256 |
| --- | --- | --- |
| 发布前 | `/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/saifute-wms-pre-deploy-2026-07-26T08-36-35-837Z.sql` | `319d30527e64f3f6a7a7fd150550c18d43d68383bf0f87da5a4aa9b1236ed0b7` |
| 停写/schema 前 | `/Users/sft/Projects/saifute-wms-deploy/storage/database-backups/saifute-wms-pre-schema-2026-07-26T08-44-10-192Z.sql` | `8dfba861d55f791ec1df17c023608e870742acf5b25751ac7a383c01df190f3a` |

执行顺序：

1. 卸载应用并确认 90 端口释放。
3. 执行 Prisma 对生产库生成的剩余 additive DDL（可空列、索引、`rd_project_change_log` 表和外键）。没有 `DROP`、`TRUNCATE` 或 `DELETE`。
5. 将停写备份恢复到临时验证库，关键表行数、ID 范围/总和/校验值与生产库完全一致；临时库已删除。

## 发布后验收

- `launchctl print gui/$(id -u)/com.saifute.wms`：`state = running`。
- `lsof -nP -iTCP:90 -sTCP:LISTEN`：仅生产 Bun 进程监听。
- `GET /`：`200`；`GET /api/auth/captcha`：`200`。
- 新前端静态 JS 资源：`200`。
- 部署目录与源码 `dist/src/main.js`、`web/dist/index.html` SHA-256 一致。
- schema diff 仍为空；RD 采购行数为 0、无 NULL/孤儿引用；关键业务表 ID 快照未变化。
- 启动日志无 stderr 错误，Redis 与 Nest application 均报告 ready/successfully started。

## 回滚入口

发布前运行时产物快照位于：

`/Users/sft/Projects/saifute-wms-deploy/rollback/pre-deploy-20260726T084253Z/`

快照包含旧版 `dist/`、`generated/`、`web/dist/`、`node_modules/` 和 `package.json`，不包含生产 env、数据库备份或日志。发生应用回归时，先 `launchctl bootout`，再将该快照恢复到部署目录并重新 `launchctl bootstrap`；不要执行数据库 reset/force-reset。新增 schema 保留即可，旧版本可读取这些可空/独立结构。

## 运维脚本备注

部署目录的 `redeploy.sh` 已直接修正：显式加载生产 env、使用 Bun 构建前端、校验 `.env.prod` 为 600、在 package.json 未变化时保留现有生产依赖、支持服务未加载时 bootstrap，并将健康检查固定为读取生产端口（当前 90）。该目录不属于本 Git 仓库，脚本改动以部署机现状为准。
