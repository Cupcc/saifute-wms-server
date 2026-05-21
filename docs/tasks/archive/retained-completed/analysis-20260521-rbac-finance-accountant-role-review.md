# RBAC 财务会计角色修复归档

- 日期：2026-05-21
- 范围：`finance-accountant` seed 角色、RBAC 启动修复、系统管理 / 月报相关文档
- 当前状态：`implemented`
- 归档分类：`retained-completed`

## 一句话结论

`财务会计` 已进入当前 seed 角色基线，定位为经营数据核对用的只读角色。启动修复现在只在角色缺失时补齐财务角色和对应菜单；如果管理员已经在系统里维护过这个角色，启动流程不会再把角色字段或菜单授权重置回 seed。

## 当前角色合同

`财务会计` 可以查看并导出经营核对所需数据，包括报表、库存余额 / 流水 / 来源使用、主数据只读清单，以及销售、车间、入库、RD 协同相关只读信息。

`财务会计` 不承担业务写入、审核、作废、库存操作、RD 小仓作业或系统管理职责。当前测试显式阻止 `create / update / delete / approve / void / resetPwd` 等写入或高风险权限进入该角色。

## 本次已完成

1. 新增财务会计 seed 角色：
   - 新增 `FINANCE_ACCOUNTANT_ROLE_KEY = "finance-accountant"`。
   - 新增 `FINANCE_ACCOUNTANT_PERMISSION_PRESET`，覆盖报表、库存、主数据、入库、车间、销售、RD 协同等只读权限。
   - 新增默认角色 `财务会计`，`dataScope = "1"`，部门范围覆盖 `研发部 / 采购部 / 仓库`。

2. 修复启动 seed repair 行为：
   - `ensureSeedRoles()` 现在只创建缺失的 seed 角色。
   - 已存在的 seed 角色被视为运行态系统数据，不再被启动修复覆盖。
   - 如果默认 `roleId` 已被其他角色占用，修复逻辑会分配新的可用 `roleId`。

3. 收紧 bootstrap 同步范围：
   - 启动时会确认 `finance-accountant` 是否缺失。
   - 只有财务角色本次被新建时，才补齐财务 preset 对应菜单。
   - 已存在的财务角色不会进入 `syncSeedRoleMenus()` 全量菜单重置。
   - `rd-operator` 原有月报权限修复路径保持不变。

4. 补齐测试：
   - 新增缺失财务角色重建测试，覆盖默认 `roleId` 被占用时的重建行为。
   - 新增 existing-role 测试，确认管理员调整过的 `roleName / status / dataScope / deptIds / remark / createdAt / menuIds` 不会被 seed repair 覆盖。
   - 新增 bootstrap 测试，确认财务角色已存在时只同步 `rd-operator`，不会同步财务角色菜单。
   - 新增财务会计权限推导测试，确认 preset 推导结果一致，且不包含业务写权限。
   - 危险后缀守卫已覆盖 `:resetPwd`，并显式断言不得拥有 `system:user:resetPwd`。

5. 同步文档口径：
   - 项目总纲已从四类主角色更新为 `系统管理员 / 仓库管理员 / 研发小仓管理员 / 采购人员 / 财务会计`。
   - `system-management` 需求与架构文档已明确：`财务会计` 是当前只读 seed 角色，`老板` 仍为后续预留管理查看角色。
   - 月报需求已明确：系统内 `财务会计` 可以查看 / 导出报表用于经营核对，但不录入财务侧数据，也不做自动对账。

## 历史问题与处理

### 1. 启动修复曾会覆盖已存在的财务角色配置

原风险：启动时如果 `finance-accountant` 已存在，旧实现会按 seed 定义重置角色字段和菜单授权，可能覆盖管理员在系统里调整过的状态、数据范围、部门范围、备注和授权菜单。

处理结果：`ensureSeedRoles()` 对已存在角色直接跳过，只确认角色存在，不覆盖运行态数据。bootstrap 也只在财务角色本次缺失并被新建时补齐财务 preset 菜单。

### 2. 测试曾缺少 existing-role 分支覆盖

原风险：测试只覆盖缺失角色重建，没有覆盖“角色已存在且被管理员调整过”的最高风险分支。

处理结果：已补 existing-role 测试，并断言自定义字段和菜单不会被覆盖。

### 3. 只读权限测试曾漏掉 `:resetPwd`

原风险：`system:user:resetPwd` 不是 `:reset` 结尾，原危险后缀列表不会拦住这类权限。

处理结果：已补 `:resetPwd` 后缀守卫，并在财务角色负向权限断言中显式加入 `system:user:resetPwd`。

## 验证记录

已执行并通过：

```bash
git diff --check
bun run test -- src/modules/rbac/bootstrap/system-management-bootstrap.service.spec.ts src/modules/rbac/infrastructure/rbac-seed-repair.repository.spec.ts src/modules/rbac/infrastructure/rbac-runtime.repository.spec.ts src/modules/rbac/infrastructure/rbac-finance-accountant-role.spec.ts
bun run typecheck
bunx biome check src/modules/rbac/bootstrap/system-management-bootstrap.service.ts src/modules/rbac/bootstrap/system-management-bootstrap.service.spec.ts src/modules/rbac/infrastructure/rbac-seed-repair.repository.ts src/modules/rbac/infrastructure/rbac-seed-repair.repository.spec.ts src/modules/rbac/infrastructure/rbac-runtime.repository.spec.ts src/modules/rbac/infrastructure/rbac-finance-accountant-role.spec.ts
```

结果：

- `4` 个 Jest suites / `16` 个 tests 通过。
- TypeScript typecheck 通过。
- 目标 RBAC 文件 Biome 检查通过。
- 文档与代码 diff 无尾随空白问题。

## 后续保留项

- `老板` 仍是后续预留管理查看角色，未在本次细化。
- `财务会计` 的字段级可见范围和导出审计可在报表验收阶段继续细化。
