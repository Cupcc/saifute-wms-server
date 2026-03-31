# 系统管理 F4 持久化与初始化

## Metadata

- ID: `req-20260331-0934-system-management-f4-persistence`
- Status: `confirmed`
- Lifecycle disposition: `retained-completed`
- Owner: `user`
- Topic requirement:
  - `docs/requirements/topics/system-management-module.md`
- Related tasks:
  - `docs/tasks/archive/retained-completed/task-20260331-0934-system-management-f4-persistence.md`

## 用户需求

- [x] 继续完成 `system-management` 主题 `F4`，把当前平台初始化与持久化方案真正落地，而不是停留在规划口径。
- [x] 让业务域权限不再主要依赖 TypeScript 常量里的角色预设，改为能被系统管理数据承接的可持久化配置。
- [x] 尽量自主决策完成本轮范围，并在验证通过后及时提交 commit。

## 当前进展

- 阶段进度: 已完成 `system-management` 主题 `F4` 收口：当前 `rbac / system-management` 初始化状态已迁到 Prisma 持久化快照，业务权限也已切到菜单/角色数据驱动。
- 当前状态: `InMemoryRbacRepository` 现支持应用启动时从 `SystemManagementSnapshot` 恢复状态、首次无数据时自动写入默认初始化快照，并在用户/角色/菜单/部门/岗位/字典/参数/通知变更后持久化落盘；`warehouse-manager / rd-operator / procurement` 的业务权限已不再依赖运行态角色预设硬编码。
- 阻塞项: None
- 下一步: None；若后续继续推进 `system-management` 主题 `F5` 或把当前 JSON 快照进一步拆为规范化平台表，应另开新切片。

## 待确认

- None
