# 系统管理模块主题探索

关联需求: `docs/requirements/archive/retained-completed/req-20260331-0042-system-management-f2-f3-baseline.md`
关联任务: `docs/tasks/archive/retained-completed/task-20260331-0042-system-management-f2-f3-baseline.md`
阶段: 已归档完成
创建: 2026-03-30
最后更新: 2026-04-01

## 当前状况

本工作流已完成 `system-management` 主题 `F2 / F3` 收口，并归档为后续切片的基线说明。当前已确认：真实部门按 `研发部 / 采购部 / 仓库` 三个一级部门处理；当前主角色按 `系统管理员 / 仓库管理员 / 研发小仓管理员 / 采购人员` 设计，`老板 / 财务` 仅保留预留查看角色；岗位当前不单独维护；`在线用户 / 登录日志 / 操作日志` 纳入 `system-management` 第一版长期主题，`调度 / AI 支持` 维持 topic 外邻接关系。相关长期口径不仅已同步到 topic、项目级需求、架构文档与看板索引，也已进一步落到当前运行态样例部门 / 角色 / 账号矩阵与前端治理菜单分组。

在此基线之上，`2026-04-01` 已完成一轮后续运行态加固与真实 Chrome 回归：本地启动不再因 `system_management_snapshot` 缺表失败；canonical `stock_scope` 与 `workshop` 基础数据会在启动时幂等补齐；首页已正确承接 `/api/auth/me` 的 `department` 并显示真实部门；`admin / operator / rd-operator / procurement` 四类账号的菜单收口与页面访问路径已再次通过浏览器实测。

## 待决策项

当前无待决策项。本工作流已归档；后续若继续推进 `F4 / F5`，应另开新的 requirement / task / workspace。

## 草稿入口

见 [draft.md](draft.md)：保留 `F2 / F3` 收敛前的事实快照、V1 角色矩阵脑暴和对话留痕，供后续追溯。

## 背景与上下文

- 主题真源入口：`docs/requirements/topics/system-management-module.md`
- 后续运行态修复任务：
  - `docs/tasks/task-20260401-system-management-browser-repair.md`
- 已归档阶段基线：
  - `docs/requirements/archive/retained-completed/req-20260327-1604-rbac-implementation.md`
  - `docs/requirements/archive/retained-completed/req-20260331-0042-system-management-f2-f3-baseline.md`
- 已归档执行与验证：
  - `docs/tasks/archive/retained-completed/task-20260327-1721-rbac-system-management-closure.md`
  - `docs/tasks/archive/retained-completed/task-20260331-0042-system-management-f2-f3-baseline.md`
- 架构边界参考：
  - `docs/requirements/PROJECT_REQUIREMENTS.md`
  - `docs/architecture/00-architecture-overview.md`
  - `docs/architecture/modules/rbac.md`
  - `docs/architecture/modules/system-management.md`

## 关键里程碑

| 时间 | 事件 |
| --- | --- |
| 2026-03-30 | 新建 `system-management-module` 工作流，并启用 `draft.md` 收集系统管理主题所需背景资料与待确认问题 |
| 2026-03-30 | 用户确认真实组织先按 `研发部 / 采购部 / 仓库` 三部门、四个主角色设计，岗位当前非必需 |
| 2026-03-30 | AI 给出 `V1` 角色矩阵与 topic 范围建议 |
| 2026-03-31 | 用户要求直接实现 `F2 / F3`；相关口径被正式同步到 topic、项目级需求、架构文档、索引与归档 workspace |
| 2026-03-31 | 当前运行态样例部门 / 角色 / 账号矩阵与前端 `在线用户 / 登录日志 / 操作日志` 菜单分组已完成代码对齐，并通过 focused tests 与前端构建 |
| 2026-04-01 | 真实 Chrome 回归暴露出本地启动与基础数据初始化缺口；随后已补齐 `system_management_snapshot` 缺表自愈、canonical `stock_scope / workshop` bootstrap，以及首页 `department` 用户态映射 |
| 2026-04-01 | `admin / operator / rd-operator / procurement` 四角色再次通过浏览器实测：系统管理入口、RD 入口、首页部门展示与非管理员 `system/*` 404 收口均符合预期 |

## 本文件夹资产索引

| 文件 | 用途 |
| --- | --- |
| `README.md` | 本工作流归档说明与 `F2 / F3` 收口摘要 |
| `draft.md` | 探索期事实快照、V1 角色矩阵草稿、对话留痕，以及 `2026-04-01` 后续运行态修复追记 |
