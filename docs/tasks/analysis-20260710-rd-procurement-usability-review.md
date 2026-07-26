# 研发采购功能可用性专项评审报告

## Metadata

- Scope: 研发采购全链路可用性与工程质量评审 —— 研发项目主档/BOM → RD 采购需求（状态链）→ 主仓交接（自动入库）→ 工作台 / 库存台账，前端 4 页 + 后端 4 个核心服务。
- Related requirement:
  - `docs/requirements/domain/rd-project-management.md`
  - `docs/requirements/domain/rd-subwarehouse.md`
- Related tasks:
  - `task-20260709-1700-rd-procurement-flow-walkthrough-and-fixes.md`（流程级走查，已修 4 个阻断问题）
  - `task-20260710-1104-rd-console-default-visibility.md`（导航可见性，已修）
- Status: `fixed`（2026-07-10 当日完成全量修复，见文末「修复执行记录」）
- Last updated: `2026-07-10`

## 背景与评审方法

- 起因：用户报告"新增研发项目被强制要求填物料""项目名称无必填标记"等基础可用性问题，判断该板块未达可用标准。
- 方法：4 路并行评审（采购需求页 / 研发项目页 / 下游查看页×3 / 后端服务与 DTO 层），每条结论要求 文件:行号 证据；评审后对 5 条最高严重级结论逐一人工复核，**5/5 实锤**（下文标 ✓）。
- 基准：需求文档口径（采购需求必须挂有效项目、状态链七态、验收/交接语义）+ "一个正常可用的采购功能"的行业常识。
- 评审对象：
  - 前端：`web/src/views/rd/{projects,procurement-requests,inbound-results,workbench,inventory-logs}/index.vue`、`web/src/api/rd-subwarehouse.js`
  - 后端：`rd-procurement-request.service.ts`、`rd-project-master.service.ts`、`rd-project-material-action.service.ts`、`rd-handoff.service.ts` 及相关 DTO / repository

## 总体结论

**机制层扎实，交互层不合格。**"根本没法用"的体感判断成立，但根子不在流程链路（昨天的走查已经把链路打通并 E2E 验证过），而在三类系统性缺失：

1. **表单化不彻底**：校验全靠手写函数 + 弹窗轰炸，必填项无红星；默认值（`quantity: 1`）制造幽灵必填与幽灵数据；remote 下拉共享选项池导致编辑回显裸数字 ID。
2. **展示粗糙**：DB decimal 原样渲染（`5.000000`）、英文枚举码直出（`RD_HANDOFF_IN`）、日期格式三套并存、内部数据库 ID 直接给用户看。
3. **追溯断链**：单号处处不可点、台账无日期/单号筛选、工作台统计混入作废单、同一实体两套名字。

后端核心机制（状态台账乐观锁、桶算术防超交接/超领料、FIFO 结算、事务边界、作废守卫）经评审确认是健康的，但存在 **1 个会随数据增长必然爆发的真 bug**（P0-3 模糊匹配守卫）和一批输入边界 / 幂等 / 报错可读性缺陷。

| 区域 | 机制正确性 | 日常可用性 | 一句话 |
| --- | --- | --- | --- |
| 研发项目页 | 中 | 差 | 新建被幽灵必填卡死，编辑必现裸 ID 回显 |
| 采购需求页 | 良 | 中 | 骨架最健康，但误关丢单、明细行无校验标记 |
| 交接/入库结果页 | 良 | 中 | 命名分裂，来源显示内部 ID |
| 工作台 / 台账 | 良 | 差 | 统计口径失真，枚举码直出，无法对账 |
| 后端服务层 | 良 | 中 | 机制扎实，报错不是人话，1 个数据增长必爆 bug |

---

## P0 —— 立即修（当前就阻碍日常使用或损害数据可信）

| # | 问题 | 位置 | 说明 |
| --- | --- | --- | --- |
| P0-1 ✓ | 新增项目"幽灵必填物料"：默认空行 `quantity:1` 被 `hasContent` 判为有内容行，报"BOM 物料不能为空"；后端 bomLines 本是可选 | `projects/index.vue:701,714,906` | 校验与提交过滤（`filter(line => line.materialId)`，:935）两套空行定义打架；改为与 payload 同口径（无 materialId 即空行跳过），一行修复 |
| P0-2 ✓ | 编辑项目时 BOM 物料下拉回显裸数字 ID：只回填 `materialId`，丢弃后端已返回的物料快照，且 `materialOptions` 初始为空 | `projects/index.vue:861-876,183-189` | 编辑任何已有项目 100% 复现；退料带出物料同款（:997-1013）。打开弹窗时把快照 seed 进选项即可 |
| P0-3 ✓ | 后端项目守卫用模糊匹配做精确判断：`hasActiveProcurementRequests` 走列表接口，repository 是 `projectCode: { contains }`；`YFXMBH-1` 是 `YFXMBH-10/100` 的子串 | `rd-project-master.service.ts:428-439` + `rd-procurement-request.repository.ts:70-72` | 只要 YFXMBH-10 有有效需求，YFXMBH-1 的作废/改编码就被误阻断；随 id 增长必然爆发。需精确匹配的 repository 方法 |
| P0-4 ✓ | 工作台"今日入库结果"计数与最近列表不过滤作废单，表格也无状态列 | `workbench/index.vue:157-175` | 首屏指标虚高、作废单与有效单外观相同；查询加 `lifecycleStatus: "EFFECTIVE"` |
| P0-5 ✓ | RD 台账页三列英文枚举直出：`RD_HANDOFF_IN` / `IN`/`OUT` / `RdHandoffOrder`；同页筛选下拉和主仓流水页都有现成中文映射 | `inventory-logs/index.vue:64-76` | 仓库操作员读不懂；照抄 `stock/log/index.vue` 的映射即可 |
| P0-6 | RD 台账无日期范围、无单据编号筛选；后端 DTO 已全部支持，纯前端缺失 | `inventory-logs/index.vue:11-51` | 不能按日期查账、不能按单号定位 = 对账场景不可用；零后端改动 |
| P0-7 ✓ | 采购需求创建弹窗（1100px 多行明细大表单）未禁 `close-on-click-modal`，误点遮罩整单丢失 | `procurement-requests/index.vue:112` | 项目/交接的创建弹窗同查；加 `:close-on-click-modal="false"` + 脏表单 `before-close` 确认 |
| P0-8 | 必填项无红星标记（全线）：项目名称/业务日期、动作类型、退回 Reference/原因等硬必填项都无 `required`/`rules`，只靠提交后弹窗试错 | `projects/index.vue:137,479-499`；`procurement-requests/index.vue:475-501` 等 | 用户本次报告的原始问题；系统性改用 el-form rules（红星 + 行内报错免费获得） |
| P0-9 | 同一实体两套名字："自动入库结果"（页标题/工作台入口）vs"主仓交接单"（新建/成功提示/作废） | `inbound-results/index.vue:6 vs 127,609,619` | 用户建不出"我建的交接单=列表里的入库结果"的心智模型；统一叫"主仓交接单"并注明入库语义 |

## P1 —— 尽快修（高频硌手或数据质量风险）

**表单与录入**

- 明细行幽灵默认 `quantity: 1`：漏填数量静默按 1 提交，"数量必须大于 0"校验永不触发（`procurement-requests:620-627`、`projects:701,718-728`）；动作单弹窗还叠加"空行不过滤"，多点一次新增明细必报错只能手动删行（`projects:1060`）。默认改空值。
- `el-input-number :min="0.000001"` 把 0 静默钳成 0.000001（`procurement-requests:258-261,466-471`）。用校验报错代替钳位。
- 退料数量无 `:max` 钳一次后可任意调大、多行可重复选同一来源领料行合计超退，全靠后端打回（`projects:559-568,516-534`）。
- 交接单多行引用同一采购来源行不做合计超量校验（`inbound-results:563-581`）。
- BOM / 动作明细不校验重复物料，台账按物料聚合后与录入行数对不上（`projects:894-921`）。
- 明细行校验一次只报第一条错，无行内标记（`procurement-requests:972-995`）。

**后端输入边界与幂等**

- 数量/单价正则不限整数位数，超出 `Decimal(18,6)` 直接 Prisma 溢出 → 500"服务器内部错误"（`create-rd-procurement-request-line.dto.ts:16-19` 等 4 处同款）。
- 三个创建入口（采购需求/交接/物料动作）无请求级幂等，双击/网络重试建两张单，交接单会真实扣两次主仓库存（`rd-procurement-request.service.ts:134-181` 等）。
- 更新接口 `?? existing` 语义：客户/供应商/负责人/备注填错后永远清不掉（`rd-project-master.service.ts:208-211,261`）。
- `IsDateString` 非 strict，`2026-02-30` 过校验后落库 500（各 DTO）。

**报错可读性**

- 核心防线报错不是人话且不含行号/物料：`RD 状态数量不足，无法推进到 HANDED_OFF: 还缺 2.000000`、`FIFO 可用来源库存不足...`、`退料来源库存释放不足: actionId=…`（`rd-material-status-operations.helper.ts:149-152` 等）。多行单据下用户无法定位。
- 退回动作提示中英夹杂（"请输入真实 reference"），状态历史列头 "Reference" 未汉化（`procurement-requests:1062-1069,417`）。

**展示与追溯**

- decimal 原样渲染满屏尾零 + 金额无千分位、格式三套并存（`5.000000` / `toFixed(6)` / 原串），全部 RD 页面。统一 formatQty/formatAmount 工具。
- 交接详情"来源采购行"显示内部数据库 ID（`需求 57 / 行 213`），拿去采购页搜不到（`inbound-results:287-294`）。
- 单号全线不可穿透：工作台列表、台账单据编号均纯文本（`workbench:61`、`inventory-logs:75`）。
- 采购需求列表查询只有 3 个字段，后端已支持的日期范围/关键字/状态筛选全没接；"筛出还有待采购的单"只能翻页肉眼扫（`procurement-requests:16-48`）。

**错误处理与状态**

- 全线 async 只有 try/finally 没有 catch，接口失败靠拦截器 toast 兜底但产生 unhandled rejection、流程中断点不可控（三个前端评审均报告）。
- `handleVoid` 类函数用一个 catch 同时吞"用户取消"和"API 失败"，且作废原因 prompt 预填默认值/无非空校验（`procurement-requests:1028-1047`、`projects:968-986`、`inbound-results:617-632` 三处同款）。
- 工作台 `Promise.all` 一败全败：任一请求失败整页归零（`workbench:151-179`）。改 `allSettled`。
- 详情抽屉/弹窗打开无 loading、失败后永久空白（`projects:880-885`、`inbound-results:547-551`、`procurement-requests:942-946`）。
- 作废最后一页最后一条后停在超界空页（`projects:968-986`）。

**后端一致性**

- 退料作废缺"释放额度已被再次领用"守卫（交接作废和手工退回都有对应守卫，此处漏配），可造成来源层超分配、FIFO"账面有货但结算不足"（`rd-project-material-action.service.ts:313-329`）。
- 超退校验 / BOM 覆盖校验在事务外读旧值，并发下有 TOCTOU 窗口（`rd-project-material-action-helper.service.ts:127-152` 等）。
- 交接单头 `totalAmount` 已改为 FIFO 成本口径，但行 `amount` 仍是录入价口径，明细合计 ≠ 单头合计（`rd-handoff.service.ts:349-353,137-139`）。前端展示需选定口径。

## P2 —— 排期修（一致性 / 代码质量）

- 验收按钮允许从"待采购"跳过"采购中"直接验收，与宣称状态链不符，若是快捷路径应在弹窗说明（`procurement-requests:379,813-815`）。
- 作废权限复用创建权限（`canCreate`），无独立权限点；有状态动作权限无创建权限的用户看不到详情按钮（`procurement-requests:90-95`）。
- actionType 从"退料"切走时不重置带出的物料/成本单价，可按领料成本价误提交报废（`projects:677-696`）。
- 退料无可退来源时下拉空无提示（`projects:517-534`）。
- 空态全是干巴巴"暂无数据"，无引导文案（三个下游页面）。
- 远程下拉打开时空白需先打字；列表无默认时间范围（`inbound-results`、`inventory-logs`）。
- 台账变动数量无 +/- 号与颜色（`inventory-logs:72`）。
- "最近自动入库结果"却带全量分页，定位打架（`workbench:57-107`）。
- `formatDate` 用 `toLocaleDateString` 输出 `2026/7/10`，与录入格式不一致，且多处重复实现（各页同款）。
- `formatCurrency` 对 null 显示 `0.0000`，缺失与真实 0 不可区分（`projects:753-758`）。
- 项目下拉一次性 `limit:100`，超过后静默不可选（`procurement-requests:928`）。
- 弹窗固定 `width="1100px"` 小屏溢出（`inbound-results:127,248`）。
- 动作单列表不分页不筛选一次拉全量，后端 DTO 支持但前端不传（`projects:395` + `api/rd-subwarehouse.js:144-149`）；后端 `listMaterialActions` 也未钳 limit 上限（`rd-project-material-action.service.ts:42-49`）。
- DTO 死字段 `documentNo`/`projectName` 传了被静默丢弃（`create-rd-procurement-request.dto.ts:17-20,30-33`）。
- projectCode 唯一冲突并发下 P2002 未捕获 → 500 而非 409（`rd-project-master.service.ts:168-172`）。
- 手工退回流水 `bizDate = new Date()` 与其它动作的单据业务日期口径不一致（`rd-procurement-return.helper.ts:112`）。
- 单据号生成当日从 001 线性试错，O(N²/日)，日上限 999；`buildDashedTimestampDocumentNo` 名不副实（`document-number.util.ts:64-70,128-147`）。
- 领料不限 BOM，但事后改 BOM 强制"计划 ≥ 净领用"，错误在远离原因处爆发（政策不对称）。
- 重复/死代码：`validateMasterData` 两份逐字相同、撤销按钮双分支、FIFO fallback 两处复制、`createOrder` 290 行、详情联动刷新恒 false 的死分支、`buildStatusTags` 每行调用两次等。

## 系统性模式（修复时按模式修，不要按个案修）

1. **手写校验 + ElMessage 弹窗代替 el-form rules** → 必填无红星、错误一次一条、体验割裂。全部 RD 表单。
2. **所有明细行共享一个远程下拉选项池**（`materialOptions` / `procurementSourceOptions`）→ 多行互相覆盖、回显裸 ID。procurement-requests / projects / inbound-results，兄弟页面 scrap-orders、stocktake-orders 同款。
3. **明细行默认 `quantity: 1`** → 幽灵必填 + 幽灵数据。三个录入弹窗同款。
4. **async 只 finally 不 catch；取消与失败共用一个 catch** → 静默中断、不可排查。全线。
5. **DB decimal / 枚举码 / 内部 ID 原样给用户看** → 展示层缺一层翻译。全部下游页面。
6. **`toLocaleDateString` 与 `YYYY-MM-DD` 混用、formatDate 多处复制** → 抽公共工具。
7. **单号不可点击穿透、跨页无 route query 联动** → 追溯全靠抄单号。
8. **前端校验弱于后端** → 后端守卫成了第一道而非最后一道防线，用户拿到的是开发者报错。

## 修复路线建议

- **第一批（P0，约 1 个工作日）**：P0-1/2/7/8 是研发项目与采购需求两个录入口的解堵，P0-4/5/6/9 是查看侧口径与可读性，P0-3 是后端一处精确匹配方法。改完后"能正常录单、能看懂账"。
- **第二批（P1，2~3 个工作日）**：按上文主题分组推进，前端优先"表单与录入"+"错误处理"，后端优先"输入边界与幂等"+ 退料作废守卫。
- **第三批（P2）**：与日常迭代合并顺手清，重点是把 8 个系统性模式各自沉淀成一个公共工具/约定，防止新页面继续复制旧毛病。

## 附注

- 5 条 P0 级结论（P0-1/2/3/4/5/7）已人工复核实锤；其余条目均带 文件:行号 证据，来自 4 路并行评审。
- 行号基于 2026-07-10 评审时的工作区状态，修复后已漂移。

---

## 修复执行记录（2026-07-10 当日）

### 范围与结果

全部 P0（9/9）、P1、P2 条目已修复，前后端并行执行：

- **后端**（5 个域切片 + 单据号接线）：精确匹配守卫（P0-3）、null=清空语义、P2002→409、数值位数上限、日期 strict 校验、报错人话化（"第 N 行 物料X:" 前缀 + 状态枚举中文化）、创建入口 `clientRequestId` 幂等（3 张表新增唯一列）、退料作废占用守卫、超退/BOM 校验移入事务、动作列表 limit 钳制、领料超 BOM 返回 `warnings`、手工退回可选 `bizDate`、交接行 cost 口径契约确认、单据号从当日最大序号起步、重复代码合并。
- **前端**（5 个页面）：幽灵必填修复（P0-1）、物料选择"选中缓存合并"机制根治回显裸 ID 与行间覆盖（P0-2 及同款）、el-form rules 必填红星、大弹窗防误关 + 脏表单确认、作废单过滤（P0-4）、台账枚举中文化 + 日期/单号筛选（P0-5/6）、命名统一"主仓交接单"（P0-9）、formatQty/formatAmount/formatDateValue 统一格式化（新增于 `web/src/utils/rd-documents.js`）、单号穿透链接（工作台/台账 → `/rd/inbound-results?documentNo=`，目标页读 query 自动查询）、退料超量/重复来源前端拦截、来源采购行显示需求单号（按 ID 查详情缓存换取）、catch 惯例统一、`clientRequestId` 接入三个创建表单、PICK warnings toast、动作列表显式 limit 100 + 截断提示。

### 有意保留 / 未改（含理由）

- `buildDashedTimestampDocumentNo` 函数名未改：纯命名问题，改名波及全仓调用点。
- 作废按钮未引入独立权限点：维持与后端现有守卫一致（避免权限种子变更连锁），详情按钮已对所有人放开。
- 验收可从"待采购"直达（跳过采购中）行为保留：弹窗已展示"待采购 X + 采购中 Y"数量构成；是否禁止跳级属业务决策，待拍板。
- 单价小数位维持 4 位（DB `Decimal(18,4)` 约束），仅加整数位上限。
- 台账页时间列由"发生时间"改为"业务日期"（与新增日期筛选、主仓流水页口径一致）；如需时分秒可恢复。
- 采购状态动作弹窗原本没有业务日期字段，本次新增（默认当天），配合后端手工退回账期归属。

### 验证

- `bun run typecheck` ✓；`bun run test` 135 套件 / **917 条全绿**（评审前基线 895，新增 22 条：幂等 ×3、精确守卫、null 清空、409 ×2、报错文案 ×4、退料守卫 ×2、limit 钳制、warnings ×2、单据号 ×4 等）。
- `web` 五个页面 vue/compiler-sfc 编译自查 ✓；`bun run build:prod` ✓。
- lint：触达文件零新增诊断（仓库既有 3 个 error 均在 approval/inbound 等无关文件，基线未恶化）。
- dev 库（`saifute-wms-dev`）已执行 `prisma db push`：仅新增 3 列 + 3 唯一索引（推送前经 `migrate diff` 确认无其它漂移）。

### 部署注意

- **prod 库需单独执行 DDL**（prod/dev 已拆库）：`rd_procurement_request` / `rd_handoff_order` / `rd_project_material_action` 各加 `client_request_id VARCHAR(64) NULL` + 唯一索引。
- web 前端需重新构建发布；菜单/权限种子无变化。
- 需求域文档已同步契约口径：`rd-subwarehouse.md`（幂等键、bizDate、成本口径、数值边界、报错口径）、`rd-project-management.md`（null 清空、409、精确守卫、warnings、退料作废守卫、动作分页）。
- 建议后续按 live 验证协议（scratch 库）做一轮浏览器全链路走查后再发版。
