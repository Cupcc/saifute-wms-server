# 前端旧风格回归与新后端适配

## Metadata

- ID: `req-20260326-1900-frontend-old-style-adaptation`
- Status: `confirmed`
- Lifecycle disposition: `active`
- Owner: `user`
- Related tasks:
  - `docs/tasks/archive/retained-completed/task-20260326-1940-frontend-old-style-phase1-shell-integration.md`

## 用户需求

- [x] 现有 `web/` 前端首页与整体表达偏离原项目，不满足需求。
- [x] 以原前端 `E:/Projects/saifute-wms-vue3` 为视觉与交互基线，在当前 `E:/Projects/saifute-wms-server-nestjs/web` 上重构，不直接切回旧工程。
- [x] 首页 `/index` 回归原项目风格的后台首页，不再以“首页工作台 + 快捷入口卡片”为主表达。
- [x] 前端回归只回归表现层风格，不回退当前 NestJS 后端架构与接口能力。
- [x] `customer` / 销售域能力必须保留，并且前端上应回归为老风格“销售管理”一级业务组，和“入库管理”处于同一级别。
- [x] `rd-subwarehouse` 模式与相关页面必须保留，并为研发小仓提供贴近原风格的专属首页。
- [x] 新的权限、菜单、会话模型必须保留，前端只能适配，不得回退到旧权限逻辑。
- [x] 新的报表、监控、审计等能力必须保留，原则上新后端已提供的能力都要保留，只调整前端呈现。
- [x] 不再保留泛化的“领料管理”前端分组；原先被笼统归到 `take` 的能力，要按真实业务语义拆分到生产车间域和研发项目 / RD 域。
- [x] 生产车间相关能力需要独立为一级业务组，承接生产领料、退料、报废等真实事务，保持老系统“查询 + 表格 + 操作”的主节奏。
- [x] 研发项目域与研发小仓不做一体化单视角，也不做主仓 / 小仓完全镜像的两套菜单；采用“非镜像双视角”方案：主仓侧保留轻量研发协同入口，小仓侧保留独立 RD 首页与菜单。
- [x] 大仓只看大仓职责，小仓只看小仓职责；主仓侧至少需要可见并处理研发物料验收入库、研发领料出库记录及必要的研发项目查询，小仓侧承担研发项目相关的日常操作面。
- [x] 第一阶段优先回归登录页、Layout、首页 `/index`、顶部/侧边栏/标签页。
- [x] 交付节奏采用分阶段推进，先把骨架和高频入口做对，再逐步扩展到各业务模块。

## 当前进展

- 阶段进度: 已完成第一阶段 `shell integration` 切片并归档 task：默认首页回归 dashboard 节奏，`销售管理` 与 `入库管理` 同级，泛化“领料管理”已拆成 `生产车间` 与 `研发协同 / 研发小仓` 双视角，同时保持现有 NestJS 权限、菜单、会话与 RD scope 契约。
- 当前状态 1: admin 登录后默认进入 `/index`，首页不再显示“首页工作台 + 快捷入口卡片”；一级菜单已收口为 `基础数据 / 入库管理 / 销售管理 / 生产车间 / 库存管理 / 研发协同 / 系统监控 / 报表中心`，且 `生产报废单` 已归入 `生产车间`。
- 当前状态 2: operator 这类缺少完整 reporting 权限的普通账号访问 `/index` 时，已降级为基础概览视图，不再因报表接口权限不足出现 `403` 或白屏。
- 当前状态 3: `rd-operator` 现可直接进入 `/rd/workbench`，固定仓别查询已恢复，`小仓库存 / 项目领用 / 本仓报废` 页面首屏请求返回 `200`，标签栏不再残留 `/index` 首页标签。
- 当前状态 4: 本轮 reviewer 已复核无残留 `[blocking]` 或 `[important]` finding；`pnpm swagger:metadata && pnpm typecheck`、`pnpm --dir web build:prod`、RBAC 相关 scoped tests 与 admin/operator/rd fresh browser smoke 已通过。
- 阻塞项: None。
- 下一步: 本 requirement 仍保持 active；后续如继续推进，应新开下一条前端切片，聚焦各业务列表页、详情页和编辑流的旧风格节奏细化，而不是继续复用已完成的 shell integration task。

## 待确认

- None
