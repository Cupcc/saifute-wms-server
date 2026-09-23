# Deploy 构建产物一致性门禁

## Metadata

- Status: `accepted`
- Scope: `redeploy.sh`、Deploy 运维规范、构建产物校验
- Trigger: 90 端口库存日志接口曾因 `dist` 与 `inventory-log-query.repository` 版本不一致返回 HTTP 500。

## Rule

生产发布只能使用同一次构建产生的四类产物：

- 后端 `dist/`
- Prisma `generated/`
- 前端 `web/dist/`
- 根 `package.json`

源码、schema、前后端 package 文件或任一产物变化后，必须重新构建全套产物。禁止手动复制单个后端模块、单个 Prisma Client 目录或单个前端文件。

## Implementation

`scripts/check-deploy-artifacts.mjs` 在构建后写入 `dist/.deploy-manifest.json`，记录：

- 源码指纹：`src`、`web/src`、`prisma/schema.prisma`、两个 package 文件
- 后端、Prisma、前端和 package 产物指纹
- package 版本与 Git commit

`/Users/sft/Projects/saifute-wms-deploy/redeploy.sh` 在重启前执行校验。以下任一条件失败，发布立即停止：

- 构建后源码发生变化
- Deploy 清单与源码构建清单不一致
- Deploy 的 `dist`、`generated`、`web/dist` 或 package 指纹不一致
- package 版本不一致

## Evidence

- 正常 fixture 校验通过。
- 人为修改 Deploy `dist/src.js` 后，校验拒绝发布并返回非零退出码。
- 规范已同步到 `docs/playbooks/deployment/playbook.md` 和 Deploy 目录的 `运维手册.md`。
