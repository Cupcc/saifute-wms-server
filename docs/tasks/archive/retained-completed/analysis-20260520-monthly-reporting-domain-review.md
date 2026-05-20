# 月度对账报表完善 Review

- 日期：2026-05-20
- 范围：`/reporting/monthly-reporting`
- 对照页面：`/reporting/monthly-reporting-material-category`
- 关联接口：
  - `GET /api/reporting/monthly-reporting`
  - `GET /api/reporting/monthly-reporting/details`
  - `POST /api/reporting/monthly-reporting/export`
- 当前状态：`implemented`
- 调查依据：当前代码、既有需求文档、`.env.dev` 目标库只读抽样

## 一句话结论

普通月度对账报表已经从早期领域月报合同补齐到当前可读合同：数量统一 2 位，单据类型筛选使用稳定 `topicKey`，销售域在原 `领域汇总`区域扩展固定列，不新增独立销售区域，同时汇总层删除含义不清的 `总成本`。

当前页面、API 和 Excel 导出已保持一致：销售域固定展示 `销售出库 / 销售退货 / 净销售`，明细层仍保留 `成本`用于追溯，销售项目汇总则拆成销售价金额和成本价金额。

## 本次实施结果

本次已按优先级先落地普通月报的可读性和筛选稳定性修复，范围覆盖 API、页面、Excel 导出和 focused 自动化测试。

### 当前报表合同

1. `领域汇总`仍是普通月报的主总览区域，不新增独立“销售汇总”区。
2. `领域汇总`的销售行固定展示以下销售列：
   - `销售出库数量`
   - `销售出库销售价金额`
   - `销售出库成本价金额`
   - `销售退货数量`
   - `销售退货销售价金额`
   - `销售退货成本价金额`
   - `净销售数量`
   - `净销售价金额`
   - `净成本价金额`
3. 非销售领域这些销售列为空，避免把入库、车间、研发项目误读成销售口径。
4. `单据类型汇总`继续保留 `销售出库单 / 销售退货单`，即使本月没有销售退货也返回 0 行，用于筛选和钻取。
5. `销售项目汇总`展示同一套销售价金额 / 成本价金额拆分字段，便于按销售项目查看。
6. 汇总层不再展示 `总成本`；单据头明细仍保留 `成本`。

### 已完成

1. 普通月报数量统一改为 2 位展示：
   - `MonthlyReportDomainSummaryService.buildTotals()` 改用 `formatQuantity()`。
   - `MonthlyReportDomainAggregatorService` 的车间、销售项目、研发项目数量字段改用 `formatQuantity()`。
   - `MonthlyReportItemMapperService.toDocumentItem()` 的单据头明细数量改用 `formatQuantity()`。
   - 普通月报前端空状态从 `0.000000` 改为 `0.00`。
   - Excel 导出沿用同一批后端格式化结果，不再输出普通月报数量的 6 位小数。

2. 普通月报单据类型筛选改为稳定 `topicKey` 合同：
   - `MonthlyReportDocumentTypeCatalogItem` 增加 `topicKey`。
   - `MonthlyReportDocumentTypeSummaryItem` 增加 `topicKey`。
   - 后端 `filterRows()` / `filterSalesProjectEntries()` 优先按 `topicKey` 过滤。
   - `documentTypeLabel` 保留为兼容路径，但前端普通月报不再依赖中文标签作为筛选 key。
   - 前端 `documentTypeKey` 优先保存 `topicKey`，下发查询时优先传 `topicKey`。

3. 销售域完整性已按最小改动方案落地：
   - 不新增独立“销售汇总”区域，直接在原来的 `领域汇总`中新增销售固定列。
   - 销售域行固定展示 `销售出库数量 / 销售出库销售价金额 / 销售出库成本价金额 / 销售退货数量 / 销售退货销售价金额 / 销售退货成本价金额 / 净销售数量 / 净销售价金额 / 净成本价金额`。
   - 当销售域有 `SALES_OUTBOUND` 或 `SALES_RETURN` 任一事实时，单据类型目录稳定包含 `销售出库单`和 `销售退货单`。
   - 若当前月没有销售退货，`销售退货单`仍返回 0 行，用户可以明确看到“退货为 0”。
   - 当用户选中 `SALES_RETURN` 且本月无退货时，汇总和导出仍保留 `销售退货单 = 0`，不会因为过滤后无 rows 而消失。

4. 业务汇总排序已修正：
   - `buildWorkshopItems()`、`buildSalesProjectItems()`、`buildRdProjectItems()` 不再用金额字符串 `localeCompare()` 排序。
   - 排序改为 `Prisma.Decimal` 数值比较，避免 `900.00` 排在 `1000.00` 前面。

5. 自动化验证已补齐：
   - 新增 `monthly-report-document-type-contract.spec.ts`，锁住 `topicKey` 筛选和销售退货 0 行合同。
   - 新增 `monthly-report-domain-aggregator.service.spec.ts`，锁住业务汇总数值排序和 2 位数量格式。
   - 更新 `monthly-report-export.service.spec.ts`，锁住普通月报导出 2 位数量和销售退货 0 行。

6. 汇总层 `总成本`已删除：
   - 普通月报总览、领域汇总、单据类型汇总、车间汇总、销售项目汇总、研发项目汇总不再返回或展示 `总成本`。
   - Excel 导出同步删除汇总层 `总成本`。
   - 单据头明细仍保留 `成本`，用于追溯单据差异。

7. 销售项目金额已拆分：
   - 销售项目汇总从原来的 `销售出库金额 / 销售退货金额 / 净发生金额 / 总成本`，改为：
     - `销售出库销售价金额`
     - `销售出库成本价金额`
     - `销售退货销售价金额`
     - `销售退货成本价金额`
     - `净销售价金额`
     - `净成本价金额`
   - 页面、API 和 Excel 导出同步使用这组明确字段。

### 本次未处理

- 未新增 `test/batch-d-slice.e2e-spec.ts` 切片；本次先用 focused unit/export test、前端构建和类型检查闭环。

### 验证记录

已执行并通过：

```bash
bun run test -- src/modules/reporting/application/monthly-report-domain-summary.service.spec.ts src/modules/reporting/application/monthly-report-document-type-contract.spec.ts src/modules/reporting/application/monthly-report-domain-aggregator.service.spec.ts src/modules/reporting/application/monthly-report-export.service.spec.ts
pnpm -C web build:stage
bun run typecheck
bunx biome check --write src/modules/reporting/application/monthly-report-catalog.service.ts src/modules/reporting/application/monthly-report-domain-summary.service.ts src/modules/reporting/application/monthly-report-source.service.ts src/modules/reporting/application/monthly-report-domain-summary.service.spec.ts src/modules/reporting/application/monthly-report-document-type-contract.spec.ts src/modules/reporting/application/monthly-report-domain-aggregator.service.ts src/modules/reporting/application/monthly-report-domain-aggregator.service.spec.ts src/modules/reporting/application/monthly-report-item-mapper.service.ts src/modules/reporting/application/monthly-report-export.service.ts src/modules/reporting/application/monthly-report-export.service.spec.ts web/src/views/reporting/monthly-reporting/index.vue
git diff --check
```

## 修复前调查事实（历史问题）

### 1. 普通月报数量仍是 6 位小数

代码位置：

- `src/modules/reporting/application/monthly-reporting.shared.ts`
  - `formatDecimal()` 返回 `toFixed(6)`
  - `formatQuantity()` 返回 `toFixed(2)`
- 普通月报仍使用 `formatDecimal()`：
  - `src/modules/reporting/application/monthly-report-domain-summary.service.ts`
  - `src/modules/reporting/application/monthly-report-domain-aggregator.service.ts`
  - `src/modules/reporting/application/monthly-report-item-mapper.service.ts`
- 前端空状态也写死了 `0.000000`：
  - `web/src/views/reporting/monthly-reporting/index.vue`

已对比：物料分类月报的明细、分类汇总、物料汇总都已经使用 `formatQuantity()`，因此显示为 `3.00` 而不是 `3.000000`。

影响：

- 页面顶部总入/总出/净发生数量显示过长。
- 领域汇总、单据类型汇总、业务汇总、单据头明细都不统一。
- Excel 导出会按 6 位小数样式写出数量列。

### 2. 金额目前基本已经是 2 位，但仍需要统一验收

普通月报金额字段多数已经通过 `formatMoney()` 返回 2 位：

- 总入金额、总出金额、净发生金额
- 业务汇总金额
- 明细金额、成本

所以“金额保留 2 位”的主要工作不是大改计算，而是把 API、页面、导出和测试一起锁住，避免后续某个新增金额列绕过 `formatMoney()`。

### 3. 单据类型汇总曾经是“有数据才显示”，不是固定业务清单

普通月报的单据类型汇总来自当前月筛选后的单据头数据：

- `MonthlyReportDomainSummaryService.buildDocumentTypeItems(filteredRows)`
- `MonthlyReportCatalogService.buildDocumentTypeCatalog(rowsBeforeDocumentTypeFilter)`

这意味着：某个月没有销售退货单，页面就只显示 `销售出库单`，不会显示 `销售退货单 = 0`。

`.env.dev` 当前目标库抽样结果：

| 月份 | 销售出库单 | 销售退货单 | 页面销售单据类型表现 |
| --- | ---: | ---: | --- |
| 2026-03 | 149 张，27312 数量，3930655.60 金额 | 7 张，1224 数量，54853.60 金额 | 两类都出现 |
| 2026-04 | 146 张，37612 数量，3556159.15 金额 | 13 张，847 数量，110617.50 金额 | 两类都出现 |
| 2026-05 | 37 张，8319 数量，654725.82 金额 | 0 张 | 只出现销售出库单 |

结论：如果用户当前看的默认月份是 2026-05，只看到销售出库单有数据事实原因；但作为报表，这种表现不完整，因为使用者无法确认“销售退货是 0”还是“报表漏了”。

### 4. 普通月报和物料分类月报销售口径不一致

物料分类月报已经固定展示销售出库和销售退货：

- `salesOutboundQuantity`
- `salesOutboundSalesAmount`
- `salesOutboundCostAmount`
- `salesReturnQuantity`
- `salesReturnSalesAmount`
- `salesReturnCostAmount`

修复前，普通月报有两套分散销售信息：

- `单据类型汇总`：按单据头展示真实出现的单据类型。
- `销售项目汇总`：按销售项目展示销售出库、销售退货和净发生。

当时的问题是，普通月报没有一个稳定的“销售总览行/销售固定列”，导致销售域在当前月没有退货时看起来像只支持销售出库。

这里的“销售完整性放在哪里”有三个层次：

- 放在 `单据类型汇总`补 0 行：不新增页面区域，仍在原来的“单据类型汇总”表里显示 `销售出库单`和 `销售退货单`。如果本月没有销售退货，就显示 `销售退货单 = 0`。本次保留这条路径用于筛选和钻取。
- 新增独立 `销售汇总`区域：另外新增一个专门的销售汇总区域，固定展示 `销售出库数量/金额`、`销售退货数量/金额`、`净销售数量/金额`等列。这个更像物料分类月报，但页面会多一个区块，本次未采用。
- 在原来的区域新增列：不新建销售汇总区，直接在已有 `领域汇总`里给销售行补固定列。这样用户仍在原来的总览区域看销售完整性，不需要多看一个新区块，本次采用这个方案。

本次结论：按“原来的区域新增列，不新增区域”执行。`领域汇总`新增销售固定列；`单据类型汇总`仍保留销售退货 0 行，方便单据类型筛选和钻取。

### 5. 单据类型筛选只用中文标签，长期不稳

当前前端筛选值是 `documentTypeLabel`：

- 前端 `filters.documentTypeLabel`
- 后端 `query.documentTypeLabel`
- 后端过滤条件是 `row.documentTypeLabel === documentTypeLabel`

短期看销售出库/销售退货没冲突；长期看这不是稳定主键。更稳的合同应该使用 `topicKey`，比如：

- `SALES_OUTBOUND`
- `SALES_RETURN`
- `WORKSHOP_PICK`
- `RD_PROJECT_RETURN`

这样页面显示中文标签，但请求用稳定枚举，不会被中文名、重复标签或后续改名影响。

### 6. 普通月报曾经展示多个“总成本”，业务含义不清

物料分类月报之前已经移除了没有明确业务意义的聚合 `总成本`，但普通月报仍在以下区域展示 `总成本`：

- 领域汇总
- 单据类型汇总
- 车间汇总
- 销售项目汇总
- 研发项目汇总
- Excel 导出

明细行的 `成本`是追溯证据，有价值；但把不同方向、不同业务性质的成本直接求和成 `总成本`，很容易被误解为一个可对账指标。它至少需要重新定义，否则建议从汇总层删除，只在明细层保留。

### 7. 业务汇总排序使用字符串比较金额

以下汇总排序使用了 `right.netAmount.localeCompare(left.netAmount, "en")`：

- `buildWorkshopItems`
- `buildSalesProjectItems`
- `buildRdProjectItems`

金额是字符串时，`900.00` 和 `1000.00` 的排序可能按字典序而不是数值大小处理。数据一多，业务汇总顺序会不稳定。

### 8. 当前测试没有锁住这次要的展示合同

现有测试覆盖了聚合、导出、物料分类 2 位数量，但普通月报没有明确断言：

- 普通月报数量必须是 2 位。
- 销售域在没有退货数据时仍能展示 `销售退货 = 0`。
- Excel 导出普通月报数量列必须是 2 位。
- 前端单据类型筛选使用稳定 `topicKey`。

如果只改实现不补测试，后面很容易退回 6 位或数据驱动缺列。

## 问题清单

| 优先级 | 问题 | 影响 | 处理结论 |
| --- | --- | --- | --- |
| P1 | 普通月报数量统一输出 6 位 | 页面和导出不适合业务阅读，也和物料分类月报不一致 | 改为 2 位，API/页面/导出同步 |
| P1 | 销售域缺少固定完整展示 | 当前月无退货时只看到销售出库，用户无法判断是 0 还是漏算 | 已在原 `领域汇总`新增销售固定列，并保留单据类型 0 行 |
| P1 | 单据类型筛选用中文标签当 key | 后续改名或重复标签会导致筛选漂移 | 改用 `topicKey` 作为筛选值 |
| P2 | 汇总层 `总成本`口径不清 | 容易被当作可对账指标，实际是混合方向成本求和 | 已删除汇总层，只保留明细成本 |
| P2 | 业务汇总金额排序用字符串比较 | 金额超过位数变化后排序可能错误 | 改为 Decimal/Number 数值比较 |
| P2 | 普通月报与物料分类月报销售列命名不一致 | 同一用户在两个报表间切换时理解成本高 | 销售项目汇总已拆成销售价金额 / 成本价金额 |
| P2 | 导出和页面合同依赖同一批旧字段 | 页面修了但 Excel 可能继续 6 位或缺列 | 导出 helper 与页面一起改 |
| P3 | 自动化测试没有覆盖新展示合同 | 回归风险高 | 增加 focused unit/e2e/export 断言 |

## 实施方案与当前状态

### 方案 A：数量与金额格式统一

执行状态：已完成。

改动范围：

- `src/modules/reporting/application/monthly-report-domain-summary.service.ts`
- `src/modules/reporting/application/monthly-report-domain-aggregator.service.ts`
- `src/modules/reporting/application/monthly-report-item-mapper.service.ts`
- `web/src/views/reporting/monthly-reporting/index.vue`
- `src/modules/reporting/application/monthly-report-export.service.ts`
- 相关 specs / e2e

具体做法：

1. 普通月报所有用户可见数量字段改用 `formatQuantity()`。
2. 普通月报空状态从 `0.000000` 改成 `0.00`。
3. 金额字段继续统一走 `formatMoney()`。
4. Excel 导出依赖返回值小数位自动生成 2 位样式，确保不再出现 `3.000000`。

验收标准：

- 页面所有 `数量`列显示 2 位。
- API summary/detail 中普通月报数量返回 2 位字符串。
- Excel 中普通月报数量列显示 2 位。
- 物料分类月报不回归。

### 方案 B：补齐销售域完整汇总

执行状态：已完成。

当前做法：

1. 后端新增稳定 topic 汇总合同，至少销售域固定包含：
   - `SALES_OUTBOUND / 销售出库`
   - `SALES_RETURN / 销售退货`
   - `净销售数量 / 净销售价金额 / 净成本价金额`
2. 当销售域有任意销售数据时，即使退货为 0，也返回销售退货 0 行。
3. 当前筛选 `domainKey=SALES` 时，即使当月退货为 0，也能看到完整销售清单。
4. 页面不新增独立销售区域，直接在原来的 `领域汇总`中新增固定销售列。
5. `单据类型汇总`保留销售退货 0 行，用于筛选和钻取。

结论：在原来的 `领域汇总`中新增固定销售列，不新增区域；同时保留 `单据类型汇总`补 0 行用于筛选和钻取。

验收标准：

- 2026-05 普通月报销售域显示 `销售出库单`和 `销售退货单`，其中销售退货为 0。
- 2026-03 / 2026-04 仍显示真实销售出库和销售退货数据。
- Excel 导出同步显示完整销售域。

### 方案 C：把单据类型筛选从标签切到 `topicKey`

执行状态：已完成。

改动范围：

- `MonthlyReportDocumentTypeCatalogItem`
- `MonthlyReportDocumentTypeSummaryItem`
- `buildDocumentTypeCatalog`
- `buildDocumentTypeItems`
- 前端 `documentType` 选择器
- `buildBaseQuery`

具体做法：

1. 后端返回 `topicKey`。
2. 前端 option 的 value 使用 `topicKey`，label 仍展示中文。
3. 后端筛选优先使用 `query.topicKey`。
4. `documentTypeLabel` 可以短期保留兼容，但页面不再依赖它。

验收标准：

- 点击 `销售退货单`只筛 `SALES_RETURN`。
- 改中文显示名不影响筛选。
- 导出使用同样筛选合同。

### 方案 D：处理汇总层 `总成本`

执行状态：已执行。

处理结果：

1. 普通月报汇总层 `总成本`已从页面和导出中移除，保留明细行 `成本`。
2. 如果业务确实要看成本汇总，再单独定义：
   - `销售出库成本金额`
   - `销售退货成本金额`
   - `车间领料成本金额`
   - 或者其他有方向、有业务含义的字段

验收标准：

- 领域汇总、单据类型汇总、业务汇总不再出现含义不清的 `总成本`。
- 单据头明细仍保留 `成本`，用于差异追溯。
- 若新增成本汇总字段，必须有明确名称和公式。

### 方案 E：修正业务汇总排序

执行状态：已完成。

改动范围：

- `src/modules/reporting/application/monthly-report-domain-aggregator.service.ts`

具体做法：

1. 聚合阶段保留 Decimal 数值用于排序。
2. 输出前再格式化成字符串。
3. 或者在排序时临时 `new Prisma.Decimal(item.netAmount)` 比较。

验收标准：

- `1000.00` 排在 `900.00` 前面。
- 负数、0、正数排序符合预期。

### 方案 F：补齐验证

执行状态：focused 单元测试、导出测试、类型检查、前端构建已完成；`test/batch-d-slice.e2e-spec.ts` 切片未新增。

已新增或更新：

- `monthly-report-domain-summary.service.spec.ts`
  - 断言普通月报数量为 `2.00`。
  - 断言 `领域汇总`销售行固定列。
  - 断言销售退货 0 行可以展示。
- `monthly-report-export.service.spec.ts`
  - 断言普通月报导出不包含 `3.000000`。
  - 断言导出包含销售退货 0 行。
  - 断言 `领域汇总`和 `销售项目汇总`都输出销售价金额 / 成本价金额拆分列。
- `test/batch-d-slice.e2e-spec.ts`
  - 本次未新增；后续如要覆盖完整 HTTP summary/detail/export 流程，可补普通月报数量 2 位和销售完整性切片。
- 前端构建：
  - `bun --cwd web build:stage` 或 `pnpm --dir web build:prod`。

## 实际实施顺序

1. 先改格式化：普通月报用户可见数量统一 2 位。
2. 再改筛选合同：普通月报单据类型筛选从中文标签切到 `topicKey`。
3. 补销售完整性：`领域汇总`原区域新增销售固定列，`单据类型汇总`保留销售退货 0 行。
4. 删除汇总层 `总成本`：保留明细层 `成本`作为追溯证据。
5. 拆分销售项目金额：销售价金额和成本价金额分开展示。
6. 最后补 focused tests、导出验收、类型检查和前端构建。

## 本次 Review 未直接修改的范围

- 不改变月报归月口径：仍按 `bizDate + 自然月`。
- 不改库存或业务单据写模型。
- 不扩展到正式月报冻结、人工重算、日期范围报表。
- 不改变物料分类月报已确认的行级快照合同。

## 最终结论

1. 普通月报汇总层 `总成本`：
   - 结论：已删除汇总层，只保留明细成本。
2. 销售完整性：
   - 解释：`单据类型汇总`补 0 行，就是在现有表格里显示 `销售退货单 = 0`；新增独立 `销售汇总`区域，则是另外做一个专门销售区块。
   - 结论：按“原来的区域新增列，不新增区域”执行：`领域汇总`新增销售固定列，`单据类型汇总`保留 0 行用于筛选和钻取。
3. 销售价金额和成本价金额：
   - 结论：已在销售项目汇总中拆分销售价金额和成本价金额。
