# workshop-material F1-F3 验收执行报告

## 元数据

| 字段 | 值 |
|------|------|
| 关联spec | specs/workshop-material.md |
| 关联task | task-20260407-0929-workshop-material-f1-f3-autonomous-delivery |
| 创建原因 | full-mode 验收收口与阻塞证据冻结 |
| 状态 | `blocked` |
| 环境 | `.env.dev`; backend existing instance on `:8112`; web dev on `http://localhost:91` |
| 被测提交 | working tree |
| 时间 | 2026-04-07 |

## 验收矩阵

| AC | 结论 | 关键证据 | 备注 |
|----|------|----------|------|
| AC-1 | `partially-met` | 页面/API 接线代码；`pnpm --dir web build:prod`; browser 打开 `/take/pickOrder` 与 `/take/scrapOrder` | 未执行真实写路径提交 |
| AC-2 | `met` | `pnpm test -- src/modules/workshop-material/application/workshop-material.service.spec.ts` | focused 自动化通过 |
| AC-3 | `met` | revise / void focused tests + code review | 仍缺浏览器改单提交 |
| AC-4 | `met` | approval/source/revision focused tests + code review | 仍缺人工回读 |
| AC-5 | `blocked` | 缺完整 browser create/update/void walkthrough | 当前环境未提供明确的写安全 QA 数据边界 |

## 浏览器执行摘要

- 登录 `http://localhost:91/login`：`admin / admin123` 成功。
- `/take/pickOrder`：页面成功渲染，现有记录行展示 `修改` / `作废` 按钮。
- `/take/scrapOrder`：页面成功渲染；新增弹窗中已存在必填 `车间` 选择器，证明本轮修复已进入前端运行面。
- 未执行真实 create / update / void 提交：
  - 当前后端连接真实本地数据与库存副作用；
  - 本次会话未掌握可安全回滚的专用 QA 数据集或重置方案。

## 自动化执行摘要

- `pnpm test -- src/modules/workshop-material/application/workshop-material.service.spec.ts` -> `24 passed`
- `pnpm typecheck` -> `pass`
- `pnpm --dir web build:prod` -> `pass`
- `set -a && source .env.dev && set +a && pnpm prisma:validate` -> `pass`

## 总结

- 建议：`block`
- 阻塞原因：
  - full acceptance 需要真实 browser create/update/void/list/get walkthrough；
  - 当前环境缺少明确的写安全 QA 数据边界，无法在不影响现有库存/单据数据的前提下完成该部分验证。
- 已完成的收口：
  - 后端 revise/update/void 语义与 focused tests 已补齐；
  - 前端三页已接入真实 API；
  - 权限 seed / alias 与兼容分页截断问题已在代码层修复。
