# 研发项目模块设计

## 模块目标与职责

`rd-project` 承接内部研发项目主档、BOM、缺料补货视图，以及研发项目领料 / 退料 / 报废动作。

## 需求真源

- 需求真源：`docs/requirements/domain/rd-project-management.md`
- 协同主题：`docs/requirements/domain/rd-subwarehouse.md`
- 对外销售项目真源：`docs/requirements/domain/sales-project-management.md`

## 当前代码合同

- 后端模块：`src/modules/rd-project`
- 前端入口：`/rd/projects`
- API 前缀：`/api/rd-projects`
- 权限前缀：`rd:project:*`

### 前端页面结构（2026-07-10 起）

- 列表页 `web/src/views/rd/projects/index.vue`：只承载查询、列表、作废与入口跳转。
- 详情页 `web/src/views/rd/projects/detail.vue`：二级全屏页面（`/rd/projects/detail/:projectId`），Excel 式就地编辑，不切换视图、不产生布局位移（descriptions 固定列宽/行高）。可编辑字段（项目名称/业务日期/备注）常显 ✎ 加虚线下划线标识，只读字段无标记。**双击字段就地出现编辑器**：Enter 触发二次确认框（展示旧值 → 新值），确认后才保存；失焦（点击其他区域）或 Esc 一律放弃修改，杜绝误操作。**双击 BOM 台账行整行进入编辑**（计划量/参考单价/厂家/链接/备注），行内保存需二次确认，行内删除带确认；台账表格下方按钮直接追加新 BOM 行（含物料远程搜索）。每次保存立即提交（头字段只发该字段，BOM 发整包 `bomLines`），对应一次 `revisionNo` 递增与一条变更记录。新增走 `/rd/projects/create` 复用同一页面（表单模式，底部悬浮栏保存、保存前弹确认框）。详情页头部只有返回/刷新，作废入口保留在列表页。
- 领料 / 退料 / 报废等短表单动作仍以弹窗形式在详情页内发起。
- 详情页「变更记录」标签页展示领域级变更时间线（`GET /api/rd-projects/:id/change-logs`）。

### 变更历史（rd_project_change_log）

- 专用表 `rd_project_change_log`：创建 / 修改 / 作废项目、新增 / 作废物料动作时在同一事务内追加，记录操作人、时间、revisionNo、摘要与**字段级 diff**（旧值→新值，含 BOM 行新增/删除/数量/单价/厂家/链接/备注变化）。
- diff 由 `rd-project.shared.ts` 的 `buildRdProjectHeaderChanges` / `buildRdProjectBomChanges` 纯函数在更新时刻用新旧值直接计算。
- 全局请求审计另有 `sys_oper_log`（写端点挂 `@AuditLog` 装饰器），与领域变更历史互不替代。

## 逻辑模型与物理映射

- 逻辑 Prisma 模型：`RdProject`、`RdProjectBomLine`、`RdProjectMaterialAction`、`RdProjectMaterialActionLine`
- 当前物理表：`rd_project`、`rd_project_bom_line`、`rd_project_material_action`、`rd_project_material_action_line`
- 库存动作类型：`RD_PROJECT_OUT`
- 统一目标维度：`project_target.targetType = RD_PROJECT`

## 关键约束

- 固定库存范围：`RD_SUB`
- 真实库存动作统一通过 `inventory-core` 记账
- 与 `sales-project` 分域，不共享外部销售项目语义
