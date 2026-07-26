# 研发项目采购员全流程走查与修复汇报

## Metadata

- Scope: 以采购员视角走通「研发项目 → RD 采购需求 → 采购状态链 → 主仓验收 → 主仓交接 → 项目领料」全链路，确认并修复流程问题。
- Related requirement:
  - `docs/requirements/domain/rd-project-management.md`
  - `docs/requirements/domain/rd-subwarehouse.md`
- Status: `completed`
- Last updated: `2026-07-09`

## 验证方式

- 按 live 验证协议使用一次性 scratch 库（`saifute_wms_verify`，整库复制自共享库）+ 隔离 env（端口 3999、REDIS_DB=14、调度/备份关闭），**未向 91 端口共享库写入任何数据**，验证完成后 scratch 库已删除。
- 账号：`procurement`（采购人员，仓别/车间均为 ALL 权限）。
- 走查路径：新增研发项目 → 新增 RD 采购需求 → 推进采购中 → 登记验收 → 主仓验收单入库（ACCEPTANCE）→ 主仓交接单（交接入项目）→ 研发项目领料 → 核对项目台账 / 库存流水 / 状态账。

## 发现的问题与修复

### 1.（用户报告）新增研发项目可任选业务车间 — 已修复

- 现象：新增/编辑研发项目弹窗中"业务车间"是全量车间下拉（默认车间、装备车间、餐厅、门卫……15 个全列出）；后端同样接受任意 `workshopId`，实测成功创建了归属"装备车间"的研发项目。
- 影响：研发项目车间是交接、盘点校验（`研发项目与盘点业务车间不一致`）的锚点，错车间会污染整条归属链。
- 修复：
  - 后端 `rd-project-master.service.ts`：创建/修改时由服务端按名称解析固定车间"研发技术"（常量 `RD_PROJECT_WORKSHOP_NAME`，位于 `rd-project.shared.ts`），DTO 移除 `workshopId` 字段，接口收到该字段直接 400。
  - 修改时若存量项目车间 ≠ 研发技术，自动归一；但已有采购关联或物料动作的项目保留原有防护（拒绝改车间）。
  - 前端 `web/src/views/rd/projects/index.vue`：车间字段改为只读展示"研发技术"，删除车间下拉与加载逻辑。
- 验证：UI 新建项目 YFXMBH-37 落库 `workshop=研发技术`；API 强塞 `workshopId:3` 返回 `property workshopId should not exist`。

### 2.（阻断级）"新增采购需求"按钮对所有账号均不可见 — 已修复

- 现象：按钮显示条件是"账号绑定固定仓别 **且** 固定车间"，但库内**所有用户**（含 rd-operator、procurement、admin）`workshopScope.workshopId` 均为 null——整条 RD 采购链路在 UI 上无人能发起。后端 `requireWorkshopId` 同样会拒绝不带车间的请求。
- 修复：
  - 前端 `procurement-requests/index.vue`：按钮改为按权限 `rd:procurement-request:create` 判定（`checkPermi`），移除 `workshopId` 表单规则与提交字段。
  - 后端 `rd-procurement-request.service.ts`：删除 `requireWorkshopId`，车间改为取自关联研发项目（见问题 3），DTO 移除 `workshopId`。
- 验证：采购员登录后按钮可见，UI 全流程创建 RQ20260709003 成功，落库车间=研发技术。

### 3.（数据完整性）采购需求项目编码为自由文本，可挂不存在项目 — 已修复

- 现象：项目编码/名称是手输文本，实测成功创建了挂在 `YFXMBH-99999`（不存在）上的需求单；错误要到主仓交接时才爆炸，采购员手误会造成断链。
- 修复：
  - 前端：项目编码改为从有效研发项目下拉选择（本地过滤，可按编码/名称搜索），项目名称选中后自动带出、只读。
  - 后端：创建时经 `RdProjectLookupService.requireEffectiveProjectByCode` 校验项目存在且有效，编码/名称/车间快照一律取自项目主档，`projectName` 入参降级为可选（忽略）。
- 验证：API 提交不存在编码返回 `RD 采购需求项目编码未映射到研发项目: YFXMBH-88888`；UI 下拉选择 + 自动带出名称正常。

### 4.（账实一致）主仓交接单总金额恒为 0 — 已修复

- 现象：交接单列表/头部"总金额"取录入价（前端不传价格 → 0），而实际 FIFO 结算成本正确记在行级 `cost_*` 字段与库存流水中（实测流水 5×10=50，单头显示 0）。
- 修复：`rd-handoff.service.ts` 在库存过账完成后，把各行 FIFO 结算成本汇总回写单头 `totalAmount`，返回值同步为回写后的单据。
- 验证：修复后新交接单 RH20260709002（1 套 @12）单头总金额=12，与库存流水一致。

### 5.（观察项，未改动）RD 工作台 / RD 盘点单在默认控制台无入口

- 采购人员角色拥有 `rd:workbench:view`、`rd:stocktake-order:*` 权限，后端路由也已下发，但前端 `permission.js` 将这两个页面标记为仅 RD 控制台模式可见（`visibleInModes: [RD]`），默认控制台用户直接访问 URL 得 404。
- 这可能是"RD 专属控制台"的有意设计，但与角色授权矛盾；如需放开，把 `RdWorkbench` / `RdStocktakeOrders` 的 `visibleInModes` 加上 `DEFAULT` 即可。**本次未改**，请确认预期后再处理。

## 链路正确性确认（修复后走查结果）

| 环节 | 结果 |
| --- | --- |
| 研发项目创建 | ✓ 编码 `YFXMBH-37` 自动生成，车间固定研发技术 |
| RD 采购需求 | ✓ RQ20260709003，项目下拉选择，车间/名称取自项目 |
| 状态链 待采购→采购中→已验收 | ✓ 状态分布、状态历史、撤销按钮均正常 |
| 主仓验收入库 | ✓ YS20260709006，MAIN 库存 +1（成本 12） |
| 主仓交接入项目 | ✓ RH20260709002，MAIN→RD_SUB，流水带项目归属，单头金额=12 |
| 项目领料 | ✓ 领 2 套成本 20，台账「交接入 50 / 已领 20 / 在库 30 / 净耗用 20」账实一致 |
| 状态账回写 | ✓ 需求行 `handedOffQty` 正确累计 |

## 代码变更清单

- 后端：`rd-project.shared.ts`（新增固定车间常量）、`rd-project-master.service.ts`、`create/update-rd-project.dto.ts`、`rd-project.controller.ts`、`rd-procurement-request.service.ts`、`create-rd-procurement-request.dto.ts`、`rd-procurement-request.controller.ts`、`rd-handoff.service.ts`
- 前端：`web/src/views/rd/projects/index.vue`、`web/src/views/rd/procurement-requests/index.vue`
- 测试：`rd-project-master.service.spec.ts`、`rd-project.spec-helpers.ts`、`rd-procurement-request.service.spec.ts`（新增"项目不存在拒绝"用例）、`rd-handoff.service.spec.ts`（新增总金额回写断言）
- 文档：`rd-project-management.md`、`rd-subwarehouse.md` 补充固定车间与项目关联口径

## 验证记录

- `bun run typecheck` ✓
- `bun run test` 135 suites / 895 tests 全绿 ✓
- lint：触达文件无新增 error（仓库存量 10 error 为既有基线；`rd-handoff.service.spec.ts` 因新增用例超 500 行产生 1 个既有规则 warn）
- 浏览器 E2E（scratch 环境）：上表全链路走通 ✓

## 遗留事项

- 问题 5（工作台/盘点单控制台可见性）待确认预期。
- 历史数据中若存在非"研发技术"车间的研发项目（生产库当前为 0 条，无实际影响），编辑保存时会自动归一到研发技术。
