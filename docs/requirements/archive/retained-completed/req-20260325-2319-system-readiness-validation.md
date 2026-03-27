# 系统运行与前后端联调验证

## Metadata

- ID: `req-20260325-2319-system-readiness-validation`
- Status: `confirmed`
- Lifecycle disposition: `retained-completed`
- Owner: `user`
- Related tasks:
  - `docs/tasks/archive/retained-completed/task-20260326-0205-system-readiness-legacy-monitor-coverage.md`
  - `docs/tasks/archive/retained-completed/task-20260326-0455-system-readiness-core-business-coverage.md`

## 用户需求

- [x] 暂不优先推进 `monthly-reporting`，先验证当前 NestJS 系统是否能在本机跑通。
- [x] 验证当前前端是否能与 NestJS 后端直接联调成功。
- [x] 若存在阻塞，先明确阻塞点属于运行环境问题、接口路径问题，还是前后端契约不兼容。
- [x] 继续全面适配，最终前端能看到所有核心业务页面。
- 前后端都可以修改优化变更。

## 当前进展

- 阶段进度: 已完成本机 smoke、报表/监控/core business 全链路联调验证，并将本轮 `system-readiness` 收口为归档完成态。
- 当前状态: `admin` fresh login 后已可见并进入 `基础数据`、`入库管理`、`领料管理`、`库存管理` 与 `monitor/*` 页面；`base/*`、`entry/*`、`take/*`、`stock/{inventory,log,used,scrap*,interval}` 主路径均已接到当前 NestJS 契约。`stock/interval` 默认读链路与受支持筛选链路均返回 `200`；`entry/order`、`take/pickOrder`、`stock/log`、`stock/inventory` 的查询过滤/分页兼容问题已修复并通过定向浏览器验证。
- 阻塞项: None。
- 下一步: 归档 / 等待新需求。

## 待确认

- None
