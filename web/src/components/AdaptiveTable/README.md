# AdaptiveTable

`AdaptiveTable` 是 Element Plus `el-table` 的统一适配层，负责视口高度和可选的列偏好能力。页面模板中的 `el-table-column` 是列定义的唯一真源。

## 职责边界

- `AdaptiveTable`：发现运行时列、应用显隐与顺序、处理表头拖动和竖线列宽调整。
- `ColumnSettings`：提供列设置界面，并按用户和表格作用域持久化偏好。
- `RightToolbar`：只负责搜索条件开关和刷新，不管理表格列。
- 页面：声明业务列；需要列偏好时仅开启 `column-preferences`。

选择列、序号列、展开列、固定列和标题为“操作”的列不会进入列设置。编辑器、选择弹窗、详情核对等固定语义表格可以不启用列偏好，这不是另一套列配置协议。

启用列偏好后，每个可调整宽度的表头右侧会常驻显示竖线。拖动表头主体调整列顺序，拖动竖线调整列宽，两种手势互不干扰；该能力不要求业务表格开启整表边框。

## 基本用法

```vue
<adaptive-table
  ref="tableRef"
  column-preferences
  border
  stripe
  v-loading="loading"
  :data="rows"
>
  <el-table-column type="selection" width="55" />
  <el-table-column label="物料编码" prop="materialCode" />
  <el-table-column label="物料名称" prop="materialName" />
  <el-table-column label="备注" prop="remark" />
  <el-table-column label="操作" fixed="right">
    <!-- 操作按钮 -->
  </el-table-column>
</adaptive-table>
```

不要再为显隐或排序维护页面级 `columns` 数组，也不要给 `el-table-column` 添加 `columns[index].visible`。

## 默认隐藏列

使用字段名或列标题声明少量默认隐藏列，不复制完整列配置：

```vue
<adaptive-table
  column-preferences
  :data="rows"
  :default-hidden-columns="['createBy', '备注']"
>
  <el-table-column label="创建人" prop="createBy" />
  <el-table-column label="备注" prop="remark" />
</adaptive-table>
```

“恢复默认”会回到模板顺序和这里声明的默认显隐状态。

## 同一路由多张表

默认使用当前路由作为偏好作用域。同一路由有多张表时，每张表必须提供稳定且唯一的 `table-key`：

```vue
<adaptive-table
  column-preferences
  :table-key="`${route.path}#domain-summary`"
  :data="domainRows"
>
  <!-- 列定义 -->
</adaptive-table>

<adaptive-table
  column-preferences
  :table-key="`${route.path}#details`"
  :data="detailRows"
>
  <!-- 列定义 -->
</adaptive-table>
```

偏好键按用户和 `table-key` 隔离。新增列会采用模板中的默认位置和显隐状态；已有列继续复用用户偏好。

## 动态列

业务条件仍直接写在模板列上：

```vue
<el-table-column
  v-if="showSourceOutbound"
  label="来源出库 ID"
  prop="sourceOutboundOrderId"
/>
```

组件会在动态列挂载或卸载后重新发现列，不需要页面同步配置数组。

## Props

除下列扩展属性外，其他属性和事件会透传给 `el-table`：

- `column-preferences: boolean = false`：启用列拖动、显隐和持久化。
- `default-hidden-columns: string[] = []`：默认隐藏的字段名或列标题。
- `table-key: string = ''`：可选偏好作用域；为空时使用当前路由。
- `fit-viewport: boolean = true`：没有显式高度时自动计算可用高度。

## Ref

底层表格实例通过 `tableRef` 暴露：

```js
tableRef.value.tableRef.clearSelection();
tableRef.value.refreshHeight();
```

公共架构守卫位于 `web/src/utils/tableColumnCoverage.test.js`，会阻止 `auto-columns`、`column-config`、`RightToolbar :columns` 和页面级 `columns[index].visible` 重新出现。
