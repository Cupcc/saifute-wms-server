# 系统管理（system-management）验收规格

## 元数据


| 字段   | 值                                                    |
| ---- | ---------------------------------------------------- |
| 模块   | system-management                                    |
| 需求源  | docs/requirements/topics/system-management-module.md |
| 最近更新 | 2026-04-02                                           |


## 能力覆盖


| 能力             | 说明                                  | 状态      |
| -------------- | ----------------------------------- | ------- |
| **F4 规范化真实落库** | sys_* 表真源切换 + auth/rbac/session 全链路 | **已验收** |


---

## F4 规范化真实落库

> 关联任务：`task-20260402-0139-system-management-f4-real-persistence`
> 未代码化 case（browser smoke）：`cases/system-management.json`

### 验收矩阵


| AC   | 描述                  | 结论    | 执行面              | 关键证据                                                                 | 备注                                |
| ---- | ------------------- | ----- | ---------------- | -------------------------------------------------------------------- | --------------------------------- |
| AC-1 | 规范化表真源              | `met` | unit+db/schema   | repository单测(seed/backfill/load); prisma db push                     | 空表seed、snapshot backfill、已有数据直接加载 |
| AC-2 | 重启后状态保留             | `met` | unit             | repository单测(backfill+load+mixed-state)                              | 混合状态保护已验证                         |
| AC-3 | auth/me+routes+角色边界 | `met` | e2e+unit+browser | app.e2e admin/operator; rbac.service.spec rd-operator; browser 4账号冒烟 |                                   |
| AC-4 | 会话失效策略              | `met` | e2e              | app.e2e: session delete→401; redis-real: TTL lifecycle               |                                   |
| AC-5 | 完整测试报告              | `met` | spec             | 本节全量覆盖                                                               |                                   |


### 验证摘要


| 时间         | 关联task             | 环境                                        | 结果       |
| ---------- | ------------------ | ----------------------------------------- | -------- |
| 2026-04-02 | task-20260402-0139 | .env.dev + MySQL 8.0 + Redis 7.x + Chrome | `passed` |


### 证据索引


| 执行面           | 证据文件/命令                                                             | 结果   |
| ------------- | ------------------------------------------------------------------- | ---- |
| static/schema | `pnpm prisma:validate` + `pnpm prisma:generate` + `pnpm typecheck`  | pass |
| db/schema     | `prisma db push --schema prisma/schema.prisma`                      | pass |
| unit          | `src/modules/rbac/infrastructure/in-memory-rbac.repository.spec.ts` | pass |
| unit          | `src/modules/rbac/application/rbac.service.spec.ts`                 | pass |
| unit          | `src/modules/rbac/controllers/system-config.controller.spec.ts`     | pass |
| e2e           | `test/app.e2e-spec.ts`                                              | pass |
| e2e           | `test/batch-d-slice.e2e-spec.ts`                                    | pass |
| e2e           | `test/redis-real-integration.e2e-spec.ts`                           | pass |
| browser       | Chrome冒烟: admin/operator/rd-operator/procurement                    | pass |


### 残余风险

- procurement 的 AI 子路由未单独点击验证（`/api/auth/routes` 已返回 `AiAssistant`）

