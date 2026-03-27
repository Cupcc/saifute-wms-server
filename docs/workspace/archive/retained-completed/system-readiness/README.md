# 系统运行与联调 readiness

关联需求:

- `docs/requirements/archive/retained-completed/req-20260325-2319-system-readiness-validation.md`
- `docs/requirements/archive/retained-completed/req-20260326-1556-system-readiness-customer-sales-domain-coverage.md`

关联任务:

- `docs/tasks/archive/retained-completed/task-20260326-0205-system-readiness-legacy-monitor-coverage.md`
- `docs/tasks/archive/retained-completed/task-20260326-0455-system-readiness-core-business-coverage.md`
- `docs/tasks/archive/retained-completed/task-20260326-1557-system-readiness-customer-sales-domain-coverage.md`

阶段: 已归档完成
创建: 2026-03-25
最后更新: 2026-03-26

## 当前状况

本轮 `system-readiness` 已完成从本机 smoke、登录联调、报表/监控页、core business 页面群，到最后 `customer` / 销售域页面补齐的完整收口。浏览器 fresh login 后，`admin` 已可见并进入 `基础数据`、`入库管理`、`领料管理`、`库存管理`、`销售管理`、`系统监控` 与 `报表中心`；核心页面主查询与详情链路均已对齐当前 NestJS 契约并通过浏览器验证。

## 完成结论

- `monitor/*` 兼容切片已完成
- `base/*`、`entry/*`、`take/*`、`stock/{inventory,log,used,scrap*,interval}` 页面可见性与主路径已完成
- `customer` / 销售域最后缺口已关闭：首页已恢复为真实 `dashboard`，`销售管理` 菜单组及 `出库单`、`出库明细`、`销售退货单`、`销售退货明细` 已挂载并联调到 `/api/customer/**`
- `customer` 页面关键按钮已恢复显示：`出库单` 已开放 `新增 / 修改 / 作废` 弹窗入口，`销售退货单` 已开放 `新增 / 作废` 弹窗入口
- Vite dev proxy 现支持通过 `VITE_PROXY_TARGET` 覆盖本地后端目标，便于后续对 fresh backend 实例做定向联调验证

## 残余非阻塞事项

- `customer` 写路径已恢复首轮 UI 与接口联调入口，但更深的真实业务录单场景仍可在后续需求中继续补充回归
- `stock/inventory` 的 `规格型号` 过滤仍是“全量 summary 抓取后本地过滤”，当前数据量可接受，但后续若库存规模明显扩大可能需要进一步后端化
- navbar websocket 关闭告警仍存在，但不影响本轮已验证页面
