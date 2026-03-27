# 系统运行与前后端联调验证补齐 customer / 销售域

## Metadata

- ID: `req-20260326-1556-system-readiness-customer-sales-domain-coverage`
- Status: `confirmed`
- Lifecycle disposition: `retained-completed`
- Owner: `user`
- Related tasks:
  - `docs/tasks/archive/retained-completed/task-20260326-1557-system-readiness-customer-sales-domain-coverage.md`

## 用户需求

- [x] 继续全面适配，最终前端能看到所有核心业务页面。
- [x] 当前 `customer` / 销售域页面未显示，不接受把 `system-readiness` 提前当作完成态。
- [x] 首页 `dashboard`、菜单入口、页面操作按钮等前端元素要先恢复完整显示，不因后端接口未接入而被隐藏。
- [x] 这是正常开发过程：先把前端页面和元素开发完整，再接接口做联合调试。
- [x] 不需要用“禁用态 / 空状态 / 占位兜底”来替代原有页面元素显示。
- [x] 没完成所有适配，不要停。
- 前后端都可以修改优化变更。

## 当前进展

- 阶段进度: 已完成 `customer` / 销售域最后缺口补齐，并把本轮 `system-readiness` 收口为归档完成态。
- 当前状态: `admin` fresh login 后首页已恢复为真实 `dashboard` + 业务入口，不再停在占位页；`销售管理` 菜单组及 `出库单`、`出库明细`、`销售退货单`、`销售退货明细` 四个页面均可见可进。`出库单` 页面已恢复 `新增 / 修改 / 作废` 入口与编辑弹窗，`销售退货单` 页面已恢复 `新增 / 作废` 入口与来源出库联调弹窗；主查询、详情与首轮写接口入口均已接到当前 NestJS `/api/customer/**` 契约并通过浏览器验证。
- 阻塞项: None。
- 下一步: 归档 / 等待新需求。

## 待确认

- None
