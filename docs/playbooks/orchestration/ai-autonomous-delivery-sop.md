# AI 自主交付 SOP

适用场景：

- 用户要求 AI 端到端完成一个需求、主题或完整项目切片
- 用户要求“你直接做完并判断是否完成”
- 最终交付需要一份可审计的完整测试报告

这份 SOP 约束的是“如何让 AI 不只写代码，还能证明需求已经完成”。

## 1. 进入条件

在进入 `coder` 之前，以下条件必须成立：

1. 已有 `confirmed` 的 requirement。
2. requirement 已明确：
   - `In scope`
   - `Out of scope / non-goals`
   - `[AC-*]` 编号化验收标准
   - 每个 `[AC-*]` 的证据类型期待
   - `完成定义`
3. 已创建 task doc，并将 `Delivery mode` 设为 `autonomous`。
4. 对非 trivial scope，`Acceptance mode` 默认设为 `full`。

如果上述任一条件缺失，不应让 AI 直接进入“写代码并宣称完成”。

## 2. Requirement 怎么写

requirement 不是散文 PRD，而是判定合同。最小结构：

- `用户需求`
- `交付范围`
- `验收标准`
- `验收证据要求`
- `完成定义`
- `当前进展`
- `待确认`

写法约束：

- `[AC-*]` 必须是业务可读、可判定的结果，不写实现步骤
- `Out of scope / non-goals` 必须明确，避免 AI 自行扩 scope
- `验收证据要求` 只写证据类型，不写具体执行步骤
- `完成定义` 必须区分“完成”“有条件通过”“阻塞”

## 3. 标准交付流

默认执行顺序：

1. `requirement` 确认
2. `planner` 产出 task doc
3. `coder` 实现
4. `code-reviewer` 复核并补齐测试缺口
5. `acceptance-qa` 生成或更新 acceptance spec
6. `acceptance-qa` 生成 acceptance run
7. 若有失败项，回到 `planner` / `coder` / `code-reviewer`
8. acceptance run 达到可签收状态后，才允许宣称“完成”

其中：

- `acceptance spec` 回答“这类需求以后应该怎么测”
- `acceptance run` 回答“这次具体测了什么、结果如何、能否签收”

## 4. 完整测试报告要求

在自主交付模式下，`docs/acceptance-tests/runs/run-*.md` 就是完整测试报告。至少要包含：

- 报告范围：关联 requirement、task、spec、环境、版本
- 覆盖矩阵：每个 `[AC-*]` 对应哪些 case
- 环境准备：账号、数据、入口、外部依赖、是否 ready
- 执行结果：逐 case 的预期、实际、证据、结果
- 回归结果：自动化测试、静态检查、浏览器/手工验证、数据验证
- 缺陷与阻塞：失败项、环境缺口、后续 owner
- 最终建议：`accept` | `reject` | `conditional` | `block`
- 残余风险：不阻断签收但需要明确写出的风险

## 5. 完成判定

只有当以下条件同时满足时，AI 才能把任务判定为“已完成”：

1. 所有 in-scope `[AC-*]` 都有明确最终 verdict。
2. 没有被隐藏的 `blocked` 或未说明的环境缺口。
3. `acceptance run` 已产出，并可作为完整测试报告交付。
4. requirement 的 `验收状态` 已同步为聚合结论。
5. task doc、acceptance run、requirement 三者结论一致。

以下情况不算完成：

- 只有代码修改，没有验收结论
- 只有 `pnpm test` 通过，没有业务 `[AC-*]` 对应的 case 结果
- 环境不具备，但未在报告中明确标记为 `blocked`
- 只说“理论上应该可以”，没有证据

## 6. 推荐判定语义

- `accept`：所有 `[AC-*]` 满足，证据完整，可签收
- `conditional`：主标准已满足，但存在已知轻微缺口或后续 follow-up，不阻断当前签收
- `reject`：存在明确未满足的 `[AC-*]`
- `block`：当前无法完成真实验收，原因是环境、数据、权限或依赖未就绪

## 7. 最小落地规则

如果不想一开始就把所有任务都推到最重流程，至少执行这三条：

1. 没有 `[AC-*]` 的 requirement，不进入 coder。
2. 用户要求“完整测试报告”时，`Acceptance mode` 必须为 `full`。
3. 没有 acceptance run，不宣称需求闭环。
