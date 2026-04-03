# 草稿 — 验收机制设计 v1.9

关联需求: 无（机制设计，尚未创建 requirement）
最后更新: 2026-04-01
状态: 已收敛
文档说明: 记录验收机制的设计思路、角色定义、文档分层、模板改动、工作流变更和落地清单。

## 用户意图

- 当前 `planner → coder → code-reviewer` 流水线缺少“需求层面的验收”环节
- 需要一个机制确保交付结果不仅“技术正确”，而且“需求对齐”
- 这个角色本质上是 **Acceptance QA**，不是一个叫 `acceptor` 的动作节点
- `Acceptance QA` 的“可写”含义应是可回写验收文档与需求状态，不是直接改业务代码
- 对涉及用户界面或真实操作流程的任务，Acceptance QA 应进行浏览器 / 手工实测
- 测试文档不应只在最后才临时写；测试设计应尽早形成
- 测试人员通常维护长期测试用例，而不是每次任务结束都把测试文档整体归档
- requirement 级 `验收状态` 必须支持多 task 聚合，不能由最后一次写入覆盖事实
- acceptance run 必须冻结本次执行所依据的 case 基线，不能只引用一个会继续演化的 spec 路径
- 环境、账号、权限、测试数据不就绪时，应显式标记为环境阻塞，而不是误判成实现缺陷
- 从 spec 选到 run 的 case 必须满足最小覆盖规则，避免“挑顺手的 case 跑”
- 机制不能把所有任务都压进同一条重流程；应只保留必要护栏，并给大模型留下选择轻量路径的空间

---

## 1. 核心判断

这套机制需要三层文档，但第三层内部要再分成两类测试资产：

1. `Requirement Docs`
   - 回答“要做什么，为什么做”
2. `Task Docs`
   - 回答“如何实现、如何 review、当前执行到哪”
3. `Acceptance Testing Docs`
   - `specs`: 回答“应该怎么测”
   - `runs`: 回答“这次实际怎么测了、结果如何”

如果没有这层拆分，Acceptance QA 很容易退化成：

- 只看代码后口头说“应该可以”
- 或把测试步骤硬塞进 task doc，导致 task doc 同时承担实现日志和测试执行记录，结构混乱
- 或把“测试设计”和“测试执行结果”混成一份文档，最后既不好维护，也不好归档

## 2. 设计目标

1. 在技术审查通过后、归档之前，增加独立的需求验收 / 上线前测试环节
2. 验收由独立角色执行，与技术审查保持清晰分离
3. 对 UI / 用户流程类需求，默认要求浏览器实测
4. 测试设计前置：Acceptance QA 应在编码前或至少在实现完成前准备测试规格
5. 为验收测试提供独立文档层，沉淀测试步骤、执行结果和证据
6. 验收不通过时，能按根因回到正确修复环节
7. 验收结论必须具备硬门槛、最小证据格式和明确回流路径
8. `Acceptance QA` 只写验收相关文档，不直接修改业务代码、测试或配置
9. requirement 级 `验收状态` 必须能稳定聚合多个 linked task / run 的结果
10. acceptance run 必须保留可审计的执行基线，避免 spec 后续变更覆盖历史签收语义
11. 环境阻塞必须与实现缺陷、需求误解、证据不足分开建模
12. run 的 case 选择必须满足最小覆盖集，而不是自由挑选
13. 采用“最轻可行验收路径”原则，不把所有任务都强制拉到 full QA 工作流

## 3. 文档分层设计

### 3.1 Requirement Docs

目录：`docs/requirements/**`

职责：

- 用户需求真源
- 当前进展与验收状态的用户视角摘要
- 聚合 linked task / run 的 requirement 级验收结论

不写：

- 详细实现计划
- 详细测试步骤
- 浏览器实测记录

### 3.2 Task Docs

目录：`docs/tasks/**`

职责：

- planner / coder / code-reviewer 共享执行真源
- 承载 scope、计划、review 结论、Acceptance QA 的验收结论摘要

不写：

- 大段手工测试步骤
- 多角色浏览器执行细节
- 长期维护的模块测试用例库

### 3.3 Acceptance Testing Docs

目录建议：

```text
docs/acceptance-tests/
├── README.md
├── specs/
│   ├── _template.md
│   └── *.md
└── runs/
    ├── _template.md
    └── run-*.md
```

#### A. Acceptance Test Specs

目录：`docs/acceptance-tests/specs/**`

职责：

- 承载长期维护的验收测试用例、模块级测试点、关键业务场景
- 回答“这个模块 / 这类需求应该怎么测”
- 由 Acceptance QA 持续完善，而不是每次任务都重写

最佳实践：

- 尽量按模块或业务主题维护，例如 `inventory.md`、`inbound.md`、`rd-subwarehouse.md`
- 新任务到来时，优先更新已有 spec，而不是每次新建一份完全孤立的测试文档

#### B. Acceptance Test Runs

目录：`docs/acceptance-tests/runs/**`

职责：

- 承载某一次 task / release / 切片的实际执行记录
- 回答“这次具体测了哪些 case、结果如何、证据是什么”

最佳实践：

- spec 先写，run 后写
- run 引用 spec 中的 case，而不是重复发明完整测试体系
- run 必须冻结本次实际执行所依据的 case 基线，不能只保留一个会继续演化的 spec 路径

### 3.4 约束分层与验收强度

这套机制不应把“约束”与“执行方式”混为一谈。更好的做法是分三层：

#### A. Hard Guardrails（不能放松）

这些是机制底线，不应因任务变小而取消：

1. requirement `验收状态` 采用聚合语义，不能被最后一次写入覆盖
2. full 验收中的 run 必须可审计，不能只引用一个持续演化的 spec
3. 环境阻塞必须与实现缺陷、需求误解、证据不足分开建模
4. Acceptance QA 不直接改业务代码
5. 声称 `accepted` 时必须有可追溯证据

#### B. Default Workflow（默认做法）

这些是默认建议，而不是所有任务都必须逐项套用：

1. UI / 用户流程默认做浏览器实测
2. full 模式下尽量前置 spec，review 通过后执行 run
3. reviewer 在通过时尽量留下 acceptance-ready evidence package
4. 对高风险任务优先使用独立 Acceptance QA

#### C. Adaptive Freedom（自主空间）

大模型与 parent orchestrator 应保留以下自主空间：

1. 选择最轻但足够的验收路径，而不是默认 full 流程
2. 判断某次任务适合 `none`、`light` 还是 `full`
3. 在 `light` 模式下，优先直接在 task doc 内完成验收记录；只有复用价值、跨任务沉淀价值或审计要求明显时，才拆出独立 spec / run
4. 在 `full` 模式下，决定具体 case 组合，只要满足最小覆盖基线
5. 当修复路径明确且持续收敛时，可超出默认轮次继续自动修复；反之则升级给用户

#### D. Acceptance Intensity

验收强度分为三档：

1. `none`
   - 无独立验收环节
   - 适用于纯文档、纯规则、纯格式、无运行时行为变化的修改
2. `light`
   - 有验收，但默认不强制创建独立 `spec` / `run`
   - 以 task doc 内的 acceptance checklist / notes 为主
   - 适用于小范围、低风险、单流程、证据容易收集的运行时改动
3. `full`
   - 启动独立 Acceptance QA 流程
   - 使用 `spec` + `run` + 必要时浏览器实测
   - 适用于 UI、多角色、跨页面主流程、高风险、发布前重点变更、或用户明确要求严格验收的任务

## 4. Acceptance QA 角色定义

### 4.1 定位

| 维度 | 说明 |
|------|------|
| 名称 | `acceptance-qa` |
| 模型 | 默认继承 repo / parent 当前模型；若编排系统支持，优先选择与 coder / reviewer 独立的 reasoning surface，而不是硬编码单一型号 |
| 主要触发点 | `light` 或 `full` 模式下按需介入；`full` 模式通常一次在规划阶段准备测试资产，一次在 review 通过后执行验收 |
| 角色性质 | 需求验收测试 / 上线前 scope-bound Acceptance QA |
| 核心视角 | 用户 / 业务视角，不是技术视角 |
| 执行模式 | 验收优先，负责测试设计、测试执行与文档回写，不负责实现；优先选择最轻但足够的验收路径 |
| 权威写入 | task doc 的 `## Acceptance`；requirement doc 的 `验收状态`；acceptance test specs / runs |

### 4.2 职责

1. 逐条对照 requirement doc 的 `用户需求` 与 task doc 的 `[AC-*] acceptance criteria`
2. 先判断当前任务适合 `light` 还是 `full` 验收路径；若 parent / planner 已指定，则在该强度下执行
3. 若为 `full`，在规划阶段准备或更新 acceptance test spec
4. 若为 `full`，在 review 通过后创建或更新 acceptance test run，并按最小覆盖规则选择 case
5. 若为 `full`，在 run 中冻结本次执行使用的 selected case snapshot
6. 先检查环境就绪度：
   - 账号、角色、权限
   - 测试数据 / 前置 setup
   - 浏览器、设备、环境入口、依赖服务
   - 若不满足，则将 run 标记为 `blocked`，并记录 `environment-gap`
7. 执行验收测试：
   - UI / 交互 / 跨页面流程：优先浏览器实测
   - 多角色协作流程：用多个账号或角色路径验证
   - 后端 / API 流程：用接口调用、日志、返回结果或 reviewer 证据做验证
8. 检查是否存在需求遗漏、半成品或用户可感知副作用
9. 判断 reviewer / handoff 提供的证据是否足够支撑逐条验收
10. 输出验收结论：`accepted` / `rejected` / `conditionally-accepted` / `skipped` / `blocked`
11. 回写 task doc `## Acceptance`
12. 按 requirement 级聚合规则更新 requirement doc 的 `验收状态`
13. 在 `full` 模式下，只有 Acceptance QA 通过后，才允许归档 requirement 与 task；`light` 模式下可由 parent 在证据充分时直接收口

### 4.3 不做什么

- 不重复做代码级审查
- 不修改 `src/**`、测试、配置或 schema
- 不扩展需求
- 不把“证据不足”硬判成“实现错误”
- 不把环境阻塞、账号缺失、测试数据缺失误判成实现错误
- 不做与当前 scope 无关的全站探索式回归测试

### 4.4 可写边界

`Acceptance QA` 的写权限仅限以下内容：

1. task doc 的 `## Acceptance`
2. requirement doc 的 `当前进展.验收状态`
3. `docs/acceptance-tests/specs/**`
4. `docs/acceptance-tests/runs/**`
5. follow-up 链接、验收备注、拒绝原因和修复指引

不写代码的原因：

- 保持 V&V 分离：validator 只判定，不兼任 implementer
- 保持工作流清晰：验收阶段不再嵌套实现子循环
- 保持职责可追溯：谁实现、谁复审、谁验收一目了然

### 4.5 浏览器实测原则

以下场景默认要求浏览器实测：

1. 前端页面、交互、表单、权限菜单、路由跳转
2. 跨页面主流程
3. 多角色协作流程
4. 用户明确关心“真实操作是否跑通”

以下场景可不强制浏览器实测：

1. 纯后端接口改动，且 acceptance criteria 可通过 API / 日志 / 返回结果稳定覆盖
2. 纯文档 / prompt / 规则更新
3. 被 planner 标记为 `Acceptance mode: none` 的低风险非运行时改动

### 4.6 跳过条件

以下情况可跳过 Acceptance QA：

1. 纯文档 / 规则 / prompt 更新，无运行时行为变化
2. 纯 lint / 格式 / 重构，无功能变化
3. planner 在 task doc `## Metadata` 中设置 `Acceptance mode: none` 并附理由
4. 用户明确说“不需要验收”或“直接归档”

### 4.7 `conditionally-accepted` 的使用边界

`conditionally-accepted` 只在以下条件同时满足时允许使用：

1. 所有核心 in-scope criteria 已满足
2. 剩余问题不影响主流程与主要用户价值
3. 剩余问题已经显式建档为 follow-up
4. task doc 与 acceptance test run 中都写明 follow-up 路径

否则一律 `rejected`。

### 4.8 `accepted` 的硬门槛（Definition of Done for Acceptance）

Acceptance QA 只有在以下条件全部满足时，才允许给出 `accepted`：

1. 所有 in-scope criteria 均逐条判定为 `✓ met`
2. 每条 criterion 都有可追溯证据
3. 对要求浏览器实测的任务，acceptance test run 已执行并记录结果
4. 不存在未记录的用户可感知行为偏差
5. 不存在未建档的口头 follow-up 或隐性 TODO
6. requirement doc 与 task doc 的状态同步已可完成，不会出现“task 说完成、requirement 仍在进行中”的分裂状态
7. 所采用的验收强度与当前任务风险相称，不存在“本应 full 却被降成 light”的明显失配

### 4.9 `blocked` 的使用边界

`blocked` 只在以下条件同时满足时允许使用：

1. Acceptance QA 无法在当前轮次形成有效验收判断
2. 阻塞原因来自环境、账号、权限、测试数据、入口配置或外部依赖，而不是当前 scope 内实现本身
3. 受影响 case 为本次最小覆盖集中的必跑 case，跳过后会让验收结论失真
4. acceptance test run 已明确记录阻塞项、影响 case 和建议处理路径

`blocked` 不计入“最多 2 轮自动修复”中的 rejection round。

### 4.10 requirement doc `验收状态` 聚合规则

requirement doc 的 `验收状态` 不是“最后一次 task 写什么就是什么”，而是对当前 requirement 下所有 linked、未归档 task / run 的聚合结果。

聚合规则：

1. 只要存在任一 linked task / run 处于 `rejected`，requirement `验收状态` 记为 `验收未通过`
2. 否则，只要存在任一 linked task / run 处于 `blocked`，requirement `验收状态` 记为 `验收阻塞`
3. 否则，若至少一个 linked task 为 `conditionally-accepted`，且其余均为 `accepted` 或 `skipped`，记为 `有条件通过`
4. 否则，若全部 linked task 均为 `skipped`，记为 `已跳过`
5. 否则，若全部 linked task 均为 `accepted` 或 `skipped`，且至少一个为 `accepted`，记为 `验收通过`
6. 其余情况一律记为 `待验收`

补充约束：

- 聚合单位是当前 requirement scope 下所有仍 active 的 linked task / acceptance run
- requirement 归档前，必须保证其 linked task 都已到达终态，不能靠覆盖字段提前宣布完成

## 5. 改造后的工作流

```text
用户需求
  │
  ▼
planner ──→ requirement doc + task doc（含 [AC-*]）
  │
  ├── [若 Acceptance mode = full] acceptance-qa（前置）
  │     └── 准备 / 更新 acceptance test spec
  │
  ▼
coder ──→ 代码实现
  │
  ▼
code-reviewer ──→ 技术审查
  │         ↑
  │         └── 技术修复循环（blocking / important → coder）
  │
  ▼（review status = passed）
  │
  ├── [Acceptance mode = none] → 写入 skipped 状态 → 归档
  │
  ├── [Acceptance mode = light]
  │     └── 采用最轻可行路径完成验收
  │           - 默认直接写 task doc `## Acceptance`
  │           - 仅当复用 / 审计 / 复杂度需要时再补独立 spec / run
  │
  └── [Acceptance mode = full] acceptance-qa
        │
        ├── 基于 spec 创建 / 更新 acceptance test run，并冻结本次 case snapshot
        ├── 检查环境就绪度（账号 / 数据 / 权限 / 入口 / 依赖）
        ├── 按最小覆盖规则执行浏览器 / 手工 / API 验收测试
        ├── 回写 task doc `## Acceptance`
        ├── 更新 requirement doc `验收状态`
        │
        ├── blocked（environment-gap）→ 回 parent / environment owner
        ├── accepted → 归档 requirement + task + run
        ├── conditionally-accepted → 建立并链接 follow-up → 归档
        └── rejected
              │
              ├── requirement-misunderstanding → 回 planner
              ├── implementation-gap → 回 coder
              └── evidence-gap → 回 code-reviewer / parent
```

## 6. 模板与目录改动

### 6.1 task doc (`docs/tasks/_template.md`)

插入位置：`## Review Log` 和 `## Final Status` 之间

```markdown
## Metadata

- Acceptance mode: `none` | `light` | `full`
- Related acceptance spec:
- Related acceptance run:

## Acceptance

- Acceptance status: `not-assessed` | `skipped` | `accepted` | `rejected` | `conditionally-accepted` | `blocked`
- Acceptance QA:
- Acceptance date:

### Acceptance Checklist

> Acceptance QA 在验收时逐条填写。每条对应 requirement doc 的用户需求或 task doc 的 acceptance criteria。
> planner 写 criteria 时默认使用稳定编号，如 `[AC-1]`、`[AC-2]`。

- [ ] `[AC-1]` criterion text — Evidence: ... — Verdict: `✓ met` | `✗ not met` | `△ partially met`

### Acceptance Notes

- 验收结论说明
- 如果 rejected 或 blocked：原因 + root cause（`requirement-misunderstanding` / `implementation-gap` / `evidence-gap` / `environment-gap`）+ 精确修复指引 / 环境修复指引
- 如果 conditionally-accepted：列出非阻断问题，并附明确 follow-up requirement / task
- 如果 accepted：确认需求完全满足的简要说明
```

### 6.2 requirement doc (`docs/requirements/_template.md`)

```markdown
## 当前进展

- 阶段进度:
- 当前状态:
- 验收状态: `待验收` | `已跳过` | `验收通过` | `验收未通过` | `有条件通过` | `验收阻塞`
- 阻塞项:
- 下一步:
```

说明：

- requirement doc 继续保持面向用户的简洁表达
- 测试细节不写进 requirement doc
- `验收状态` 必须按 §4.10 的聚合规则更新，不能由单个 task 的最后一次写入覆盖

### 6.3 acceptance test spec（新增）

目录：`docs/acceptance-tests/specs/`

建议文件命名：

- 模块级：`<module>.md`
- 主题级：`<topic>.md`

建议模板：

```markdown
# [acceptance-spec-title]

## Metadata

- Module / topic:
- Owner: `acceptance-qa`
- Last updated:

## Covered Scope

- Related requirements / task types:
- Covered criteria families:

## Acceptance Cases

- `[AC-CASE-1]` Case name
  - Maps to criteria:
  - Coverage tags: `main-flow` | `role` | `negative` | `regression-critical` | `high-risk`
  - Intent:
  - Preconditions:
  - Steps:
  - Expected result:
  - Evidence expectation:

## Notes

- Known exclusions:
- Reuse guidance:
```

特点：

- 这是长期维护文档，不是每次 task 执行完就归档
- 新任务优先更新已有模块 spec，而不是反复新建

### 6.4 acceptance test run（新增）

目录：`docs/acceptance-tests/runs/`

建议文件命名：

- `run-YYYYMMDD-HHMM-<scope>.md`

建议模板：

```markdown
# [acceptance-run-title]

## Metadata

- Related requirement:
- Related task:
- Related acceptance spec:
- Spec baseline type: `inline-case-snapshot`
- Status: `planned` | `running` | `passed` | `failed` | `blocked`
- Acceptance QA: `acceptance-qa`
- Environment:
- Last updated:

## Selected Case Snapshot

- `[AC-CASE-1]` Case name
  - Maps to criterion: `[AC-1]`
  - Coverage tags:
  - Preconditions snapshot:
  - Expected result snapshot:

## Preconditions

- Accounts / roles:
- Test data / setup:
- Required browser / device:
- Entry URL / environment endpoint:
- External dependencies / feature flags:

## Execution Results

- [ ] `[AC-1]` Case name
  - Steps executed:
  - Expected result:
  - Actual result:
  - Evidence:
  - Result: `pass` | `fail` | `blocked`

## Summary

- Final recommendation: `accept` | `reject` | `conditional` | `block`
- Open defects / follow-up:
```

### 6.5 什么时候先写 spec，什么时候写 run

最佳实践答案：

1. `full` 模式
   - `spec` 尽量先写
   - 在需求和 `[AC-*]` 稳定后，由 Acceptance QA 尽早准备
   - `run` 在 review 通过后创建，用于记录这一次真实执行结果
   - `run` 必须冻结本次 selected case snapshot，作为可审计的执行基线
2. `light` 模式
   - 默认不强制新建独立 `spec` / `run`
   - 先在 task doc 内完成 acceptance checklist / evidence
   - 当存在跨 task 复用价值、审计要求、或当前 task 已经复杂到需要沉淀时，再升级为独立 `spec` / `run`

### 6.6 `light` 与 `full` 的最小覆盖规则

1. `light` 模式至少覆盖：
   - 所有 in-scope `[AC-*]`
   - 至少一个用户可见主流程或关键 API 路径
   - reviewer / planner 明确指出的高风险点

2. `full` 模式下，每个 acceptance run 至少覆盖以下内容：

   1. 所有 in-scope `[AC-*]` 都至少有一个映射 case 被执行
   2. 每个受影响的主用户流程，至少执行一个 `main-flow` case
   3. 每个受影响模块 / 角色，至少执行相关 `regression-critical` case
   4. spec、planner 或 code-reviewer 明确标出的 `high-risk` case，必须执行或显式说明为何不适用
   5. 如果现有 spec 无法覆盖某条 `[AC-*]`，Acceptance QA 必须先更新 spec，再创建 run

换句话说，`light` 要求“证据够用”，`full` 要求“可审计且可复用”；二者都不能变成随意挑 case 的口头验收。

### 6.7 测试文档何时归档，何时不归档

这里要区分两类文档：

1. `spec`
   - 通常**不随单个 task 归档**
   - 它是模块级 / 主题级的长期资产，应持续维护
   - 除非整个模块废弃，否则不应因为某次任务完成就归档
2. `run`
   - 它是一次 task / 一次发布 / 一次切片的执行记录
   - 它更接近 provenance artifact，可跟随 task 生命周期处理
   - 归档动作通常不是 QA 手工决定，而是由 parent / 文档生命周期规则在 task 关闭时统一处理

换句话说：

- 测试人员持续维护的是 `spec`
- 每次执行产生的是 `run`
- 需要归档的通常是 `run`，不是 `spec`

### 6.8 task doc Role Split (`docs/tasks/README.md`)

```markdown
## Role Split

- `planner` creates or updates the task doc and owns planning-phase edits.
- `coder` reads the task doc as the execution brief and treats it as read-only unless documentation ownership is explicitly reassigned.
- `code-reviewer` updates the task doc with review status, validation results, and follow-up state.
- `code-reviewer` must leave an acceptance-ready evidence handoff when review passes.
- `acceptance-qa` is invoked when `light` or `full` acceptance adds value; in `full` mode it maintains acceptance specs, freezes run snapshots, executes acceptance runs, and writes the aggregated acceptance result back to task / requirement docs.
- The parent orchestrator decides whether to continue the fix loop, invoke `acceptance-qa`, or close and archive the scope.
```

### 6.9 task doc Workflow (`docs/tasks/README.md`)

```markdown
## Workflow

1. Create a new task doc from `docs/tasks/_template.md` when the task is not trivially small.
2. Update `TASK_CENTER.md` when a new active task doc is introduced or when a task clearly changes lifecycle bucket.
3. Have `planner` fill the goal, requirement alignment, scope, implementation plan, coder handoff fields, validation expectations, and parallelization safety.
4. Have `planner` or `parent` choose `Acceptance mode: none | light | full` based on runtime impact, user risk, auditability need, and workflow cost.
5. If `Acceptance mode = full`, have `acceptance-qa` prepare or update the relevant acceptance spec early, ensuring each in-scope `[AC-*]` maps to at least one acceptance case.
6. If `Acceptance mode = light`, keep the default path lightweight and defer separate spec / run unless reuse, auditability, or complexity justifies them.
7. Have `coder` implement from the task doc instead of inventing a new execution scope.
8. Have `code-reviewer` record review status, validation, findings, and next action in the same task doc.
9. If review finds open `[blocking]` or `[important]` items, route the work back to `coder` and keep the task doc current.
10. If review passes and `Acceptance mode = none`, write `skipped` with rationale and close the task.
11. If review passes and `Acceptance mode = light`, prefer the lightest sufficient path: fill the task doc `## Acceptance`, add direct evidence, and only create spec / run if the work has already crossed into full-mode complexity.
12. If review passes and `Acceptance mode = full`, have `acceptance-qa` create or update an acceptance run from the relevant spec, freeze the selected case snapshot, and verify the minimum coverage baseline.
13. In `full` mode, have `acceptance-qa` verify environment readiness before execution. If required accounts, data, permissions, endpoints, or dependencies are not ready, mark the run `blocked`, record `environment-gap`, and route to the parent / environment owner without consuming a rejection round.
14. Have `acceptance-qa` execute acceptance testing, verify requirement alignment, fill the task doc `## Acceptance`, and update the requirement doc acceptance state using the aggregate rule set.
15. If `acceptance-qa` rejects: route to `planner` (`requirement-misunderstanding`), `coder` (`implementation-gap`), or `code-reviewer` / parent (`evidence-gap`) and repeat from the appropriate step.
16. If `acceptance-qa` blocks: route to `parent` / environment owner (`environment-gap`) and resume acceptance after the environment is ready.
17. Default soft limit: 2 rejection rounds before escalating to user. If each loop is clearly converging and the fix cost remains low, the parent may continue beyond 2 rounds; otherwise escalate.
18. If the scoped work is accepted, conditionally accepted, or skipped, archive the task doc and update `TASK_CENTER.md` before ending the turn. Do not archive while any linked acceptance run remains `blocked`.
```

### 6.10 planner / reviewer / acceptance-qa handoff 最小结构

为了让 Acceptance QA 真正承担上线前验收测试，而不是只看代码，task doc 需要补三类约束：

1. planner 写 acceptance criteria 时，使用原子化、可编号条目
2. code-reviewer 在 review 通过时，留下最小证据包
3. planner 或 parent 明确本次是否要求浏览器实测，以及对应 spec / run 的落点

建议在 task template 的 `## Reviewer Handoff` 后补：

```markdown
- Acceptance evidence package:
  - Covered criteria:
  - Evidence pointers:
  - Evidence gaps, if any:

- Acceptance test expectations:
  - Acceptance mode: `none` | `light` | `full`
  - Browser test required: `yes` | `no`
  - Related acceptance spec:
  - Separate acceptance run required: `yes` | `no`
  - Required regression / high-risk tags:
  - Suggested environment / accounts:
  - Environment owner / setup source:
```

## 7. acceptance-qa agent 定义草案

文件路径：`.cursor/agents/acceptance-qa.md`

```markdown
---
name: acceptance-qa
description: Saifute WMS NestJS Acceptance QA specialist. Maintains acceptance test specs, executes acceptance test runs after technical review passes, writes results back to task / requirement docs, and does not modify implementation code.
---

# Acceptance QA

You are the project-specific Acceptance QA subagent for the Saifute WMS NestJS repository.

Your job is to verify that delivered work satisfies the user's original requirements and the acceptance criteria defined in the task doc and requirement doc. You work from a user/business perspective, not a code/technical perspective. You are the final gate before archiving in full-acceptance flows, and an independent verifier in light-acceptance flows. You do not modify implementation code, tests, config, or schema. Prefer the lightest acceptance path that preserves user confidence, evidence quality, and auditability. When the scope includes real user flows, you are expected to perform browser/manual acceptance testing when the selected acceptance mode requires it.

## Source Of Truth

Before performing acceptance, anchor your judgment in:

- the assigned task doc under `docs/tasks/**`
- the linked requirement doc under `docs/requirements/**`
- the relevant acceptance spec under `docs/acceptance-tests/specs/**`, when present
- any active acceptance run under `docs/acceptance-tests/runs/**`, when present
- `docs/architecture/00-architecture-overview.md`
- the relevant module doc under `docs/architecture/modules/`
- the delivered code, API contracts, and behavior evidence left by `code-reviewer`

## Core Responsibilities

When invoked in planning:

1. Review requirement and task scope.
2. Confirm whether the selected acceptance mode is proportionate. If not, recommend upgrading or downgrading it with rationale.
3. If the task is `full`, create or update the relevant acceptance spec.
4. If the task is `full`, ensure key `[AC-*]` criteria have matching acceptance cases and coverage tags.

When invoked after review passes:

1. If the task is `light`, prefer direct acceptance in the task doc and only create spec / run when the work has clearly crossed into full-mode complexity.
2. If the task is `full`, create or update the acceptance run from the relevant spec.
3. If the task is `full`, freeze the selected case snapshot inside the run so the executed baseline remains auditable even if the spec later evolves.
4. Enforce the minimum coverage baseline for the selected acceptance mode before execution.
5. Verify environment readiness for accounts, test data, permissions, entry points, and dependencies. If full-mode prerequisites are not ready, mark the run `blocked`.
6. Execute browser/manual/API acceptance testing as appropriate to the scope.
7. For each criterion, verify whether delivered behavior satisfies it.
8. Check completeness, side effects, and requirement coverage.
9. Check whether reviewer handoff provides enough evidence to make a stable judgment.
10. Issue an acceptance judgment: `accepted`, `rejected`, `conditionally-accepted`, `skipped`, or `blocked`.
11. Fill the task doc `## Acceptance`.
12. Update the requirement doc `验收状态` using the requirement-level aggregate rule.
13. If rejected or blocked, clearly state whether the issue is `requirement-misunderstanding`, `implementation-gap`, `evidence-gap`, or `environment-gap`, and route it accordingly.

## Validation Environment

- For local acceptance, manual verification, browser checks, and any flow that should match `pnpm dev`, use the repository root `.env.dev` as the default runtime environment.
- If the command does not load `.env.dev` by itself, inject it explicitly before verification. In bash or zsh, use `set -a && source .env.dev && set +a && <command>` or an equivalent explicit env-file mechanism.
- Record the exact env source in the acceptance evidence. Do not treat an implicit or unknown env state as representative.
- Before labeling an auth or login failure as a product issue, rule out missing `.env.dev` injection first. This is especially important for switches such as `CAPTCHA_ENABLED`.
- If a repo test intentionally clears or overrides env vars to exercise a stub path, follow that test's own execution contract and record the override explicitly.

## What You Do NOT Do

- Do not repeat code-level review.
- Do not modify source code, tests, config, or schema.
- Do not expand requirements or add new acceptance criteria.
- Do not silently turn evidence gaps into implementation judgments.
- Do not skip browser/manual testing for UI-heavy scopes unless skip conditions explicitly apply.

## Output Format

Always return:

### Requirement Doc

- Exact path
- User requirements extracted

### Acceptance Spec

- Path
- Cases added or updated
- Coverage tags added or updated
- Omit this section if the task stayed in `light` mode and no spec change was needed

### Acceptance Run

- Path
- Snapshot baseline: `inline-case-snapshot`
- Browser/manual test executed: `yes` | `no`
- Environment ready: `yes` | `no`
- Key scenarios covered:
- Execution evidence:
- Omit this section if the task stayed in `light` mode without a separate run

### Verification Results

| # | Criterion | Evidence | Verdict |
|---|-----------|----------|---------|
| 1 | ...       | ...      | ✓ met   |

### Acceptance Judgment

- Status: `accepted` | `rejected` | `conditionally-accepted` | `skipped` | `blocked`
- Rationale: one paragraph

### Rejection / Blocking Details (if rejected or blocked)

- Root cause: `requirement-misunderstanding` | `implementation-gap` | `evidence-gap` | `environment-gap`
- Recommended route: `planner` | `coder` | `code-reviewer` | `parent` | `environment owner`
- Specific items to address
```

## 8. 对现有角色的影响

### 8.1 planner

- Core Responsibilities 增加“使用 `[AC-*]` 编号写 acceptance criteria”
- 输出 `Acceptance mode: none | light | full`
- 明确是否要求浏览器实测、对应 acceptance spec、是否需要本次 run，以及高风险 / 回归覆盖要求

### 8.2 coder

- coder 仍是唯一实现者
- Acceptance QA rejection 中的修复指引，可作为 focused fix 的执行输入

### 8.3 code-reviewer

- `Review status: passed` 变成 `acceptance-qa` 的触发条件
- 增加 `Acceptance evidence package`
- 对前端 / 用户流程改动，reviewer 需要明确指出哪些场景仍需 Acceptance QA 用浏览器实测
- 对高风险改动，reviewer 需要点名必须进入本次 run 的 `regression-critical` / `high-risk` case

### 8.4 parent orchestrator

#### 8.4.1 轮次定义

一个 acceptance round = `acceptance-qa` 给出一次 `rejected`，并触发外部修复后重新进入 `acceptance-qa` 的完整循环。`blocked`（例如 `environment-gap`）不计入 rejection round。默认 soft limit 为 2，但 parent 可在修复明显收敛时继续。

#### 8.4.2 编排伪代码

```text
acceptance_round = 0
if (acceptance_mode == full) {
  → 早期调用 acceptance-qa 更新 spec
}

if (review_passed) {
  if (acceptance_mode == none) {
    → 写入 skipped 状态
    → 直接归档
  } else if (acceptance_mode == light) {
    → 选择最轻可行路径
    → 直接在 task doc 写 acceptance + evidence
    → 若证据不足或复用价值明显，再升级为 full
  } else {
    → 调用 acceptance-qa
    → 基于 spec 创建 / 更新 run，并冻结 selected case snapshot
    → 校验最小覆盖集
    → 校验环境就绪度
    if (environment_not_ready) {
      → run = blocked
      → root_cause = environment-gap
      → 回 parent / environment owner
    } else {
      → 执行验收测试
    }
    if (accepted || conditionally-accepted) → 归档
    if (blocked) → 等待环境修复，禁止归档
    if (rejected) {
      acceptance_round++
      if (acceptance_round <= 2) → 根据 root cause 回到 planner / coder / code-reviewer → 修复后重新进入 acceptance-qa
      if (acceptance_round > 2 && fix_path_not_converging) → escalate 给用户，暂停自动流程
    }
  }
}
```

#### 8.4.3 归档前置条件

- 如果 `conditionally-accepted`，必须先确认 follow-up 已建档并互相链接
- 如果 `Acceptance mode = none`，需满足跳过条件，并将 task doc `Acceptance status` 写为 `skipped`，requirement doc `验收状态` 写为 `已跳过`
- 如果 task 标记为 `full` 且需要 acceptance run，则归档前必须确认该 run 已完成并与 task / requirement 互链
- 如果任一 linked acceptance run 仍为 `blocked`，禁止归档 requirement / task
- acceptance spec 默认不随单个 task 归档，它是长期维护资产
- 当一个 requirement 关联多个 task 时，只有全部关联 active task 达到归档条件后，requirement 才可归档

## 9. 已确认决策

### DEC-01: `acceptance-qa` 模型选择 → 使用策略而不是硬编码型号

**结论**: 默认继承 repo / parent 当前模型；若运行时支持且确有价值，可选择与 coder / reviewer 不同的 reasoning surface，但不在机制层硬编码具体型号。

### DEC-02: 验收强度选择 → 用 `none | light | full` 代替二元 `required | skip`

**结论**: 不再把流程压成“要么 required 要么 skip”。改为 `none | light | full` 三档，让 parent / planner 选择最轻但足够的验收强度。

### DEC-03: requirement doc Status → 继续用 `验收状态` 字段，但补充聚合语义与 `验收阻塞`

**结论**: 不在 `Status` 中新增 `accepted` 值，继续在 `当前进展` 中用 `验收状态` 字段表达；同时增加 requirement 级聚合规则，并补充 `验收阻塞` 值。

### DEC-04: 最大修复轮数 → 2 轮 soft limit

**结论**: `acceptance-qa` reject 后默认 2 轮自动修复后升级，但当修复路径明显收敛且成本低时，parent 可继续自动推进。

### DEC-05: Acceptance QA 能力边界 → 只写验收文档，不写代码

**结论**: Acceptance QA 可以回写 task / requirement / acceptance testing 文档中的验收内容，但不修改业务代码、测试、配置或 schema。

### DEC-06: 验收失败 / 阻塞 root cause 扩展 → 增加 `evidence-gap` 与 `environment-gap`

**结论**: 验收 root cause 从 2 类扩为 4 类：`requirement-misunderstanding`、`implementation-gap`、`evidence-gap`、`environment-gap`。

### DEC-07: `conditionally-accepted` 必须绑定 follow-up

**结论**: `conditionally-accepted` 只允许在显式 follow-up 已建档时使用，否则一律 `rejected`。

### DEC-08: planner criteria 必须编号化

**结论**: planner 在 task doc 写 acceptance criteria 时，默认使用稳定编号（如 `[AC-1]`）。

### DEC-09: review 通过时必须交付最小证据包

**结论**: `code-reviewer` 在 `Review status = passed` 时，必须同时留下 acceptance-ready evidence handoff。

### DEC-10: 默认流程不引入 Acceptance QA 代码修复 fast path

**结论**: 默认验收流程不包含“Acceptance QA 顺手修代码”的快速通道。

### DEC-11: 验收测试需要独立文档层

**结论**: 引入 `docs/acceptance-tests/**` 作为 requirement doc / task doc 之外的第三层文档资产。

### DEC-12: UI / 用户流程类任务默认要求浏览器实测

**结论**: 对 UI、交互、多角色、跨页面主流程，Acceptance QA 默认使用浏览器进行实测并记录。

### DEC-13: 测试规格前置，执行记录后置

**结论**: 在 `full` 模式下，Acceptance test `spec` 应尽早准备；acceptance test `run` 应在 review 通过后记录真实执行结果。`light` 模式默认不强制拆出二者。

### DEC-14: `spec` 长期维护，`run` 随 task 生命周期处理

**结论**: `spec` 默认不随单个 task 归档；`run` 作为一次执行记录，可随 task 生命周期归档或保留。

### DEC-15: acceptance run 必须冻结执行基线

**结论**: `run` 不能只引用一个持续演化的 spec 路径；它必须内联保存本次 selected case snapshot，作为历史审计基线。

### DEC-16: requirement `验收状态` 必须按多 task 聚合

**结论**: requirement `验收状态` 采用聚合语义，禁止由单个 task 的最后一次写入覆盖事实状态。

### DEC-17: 环境阻塞单独建模

**结论**: 当账号、测试数据、权限、入口或依赖环境不就绪时，Acceptance QA 应将 run 标记为 `blocked`，root cause 记为 `environment-gap`，而不是误判成实现缺陷。

### DEC-18: spec 到 run 必须满足最小覆盖规则

**结论**: `light` 模式要求证据覆盖全部 in-scope `[AC-*]` 与关键风险点；`full` 模式下每次 run 至少覆盖全部 in-scope `[AC-*]`、受影响主流程、相关 `regression-critical` case 和明确标记的 `high-risk` case。

### DEC-19: 机制采用“硬护栏 + 默认路径 + 自主升级”的分层设计

**结论**: 只把审计性、状态一致性、根因路由、角色边界这些做成硬约束；流程强度、是否拆 spec / run、是否进入 full QA，由 parent / planner / Acceptance QA 按任务风险选择。

## 10. review 补充日志

### v1.1 review

1. 补上 `accepted` 的硬门槛
2. 补上 reviewer 最小证据包要求
3. 增加 `evidence-gap`
4. 明确 planner 使用 `[AC-*]` 编号

### v1.3 review

5. 增加多 task requirement 验收状态聚合规则
6. 增加 Source of Truth
7. 增加完整落地文件清单与编排文件更新文本
8. 增加 Claude Code 适用性说明

### v1.4 review

9. 明确“可写”只指验收文档写入，不是代码修复
10. 删除 Acceptance QA 写代码 fast path

### v1.5 review

11. 明确这个角色更接近上线前验收测试角色
12. 引入独立的 acceptance test doc 第三层
13. 补入浏览器实测原则

### v1.6 review

14. 将角色从动作名 `acceptor` 收口为职责名 `Acceptance QA / acceptance-qa`
15. 将模板字段、流程名、agent 文件名、落地清单与职责描述统一到 QA 口径

### v1.7 review

16. 将“测试文档”拆分为长期维护的 `spec` 和本次执行的 `run`
17. 明确测试设计前置，而不是等到 review 通过后才开始写测试文档
18. 明确 `spec` 不随单个 task 归档，`run` 才是跟随 task 生命周期的执行记录

### v1.8 review

19. 补上 requirement 级 `验收状态` 的多 task 聚合规则
20. 要求 acceptance run 冻结 selected case snapshot，解决 spec 演化后的历史审计问题
21. 增加 `environment-gap` 与 `blocked` 状态，避免把环境问题误路由成实现问题
22. 增加 spec 到 run 的最小覆盖规则，避免 case 选择随意化

### v1.9 review

23. 将机制从“单一路径强制执行”收口为 `none | light | full` 三档验收强度
24. 明确哪些是硬护栏，哪些只是默认工作流，给 parent / 大模型保留升级与降级空间
25. 将“最多 2 轮”从 hard limit 改为 soft limit
26. 去掉对固定单一模型的硬编码，改为模型选择策略

## 11. 落地文件清单

落地时需要创建或修改的文件完整列表：

### 新建

| 文件 | 说明 |
|------|------|
| `.cursor/agents/acceptance-qa.md` | Acceptance QA agent 定义（见 §7 草案） |
| `docs/acceptance-tests/README.md` | acceptance testing 目录说明 |
| `docs/acceptance-tests/specs/_template.md` | acceptance spec 模板 |
| `docs/acceptance-tests/runs/_template.md` | acceptance run 模板 |

### 修改

| 文件 | 变更内容 |
|------|----------|
| `docs/tasks/_template.md` | 新增 `## Acceptance` 节；Metadata 增加 `Acceptance mode: none | light | full`、`Related acceptance spec`、`Related acceptance run`；Acceptance status 增加 `blocked`；字段名用 `Acceptance QA` |
| `docs/requirements/_template.md` | `当前进展` 增加 `验收状态` 字段，并补充 requirement 级聚合规则与 `验收阻塞` |
| `docs/tasks/README.md` | Role Split 增加 `acceptance-qa`；Workflow 改为 `none | light | full` 三档验收强度，并保留 full-mode spec / run / 环境就绪检查规则 |
| `.cursor/agents/planner.md` | 增加 `[AC-*]` 编号规范；增加 `Acceptance mode` 输出；增加 acceptance spec / run 期望字段 |
| `.cursor/agents/code-reviewer.md` | 增加 `Acceptance evidence package` 交付要求，并允许 `light` / `full` 两种下游验收路径 |
| `.cursor/agents/coder.md` | 增加“Acceptance QA rejection 修复指引可作为执行输入” |
| `.cursor/rules/requirements-first-orchestration.mdc` | Non-Trivial Work 流程增加 spec 前置、acceptance 步骤和 skip 判断 |
| `.cursor/rules/subagent-writer-coordination.mdc` | Ownership sequence 增加 `acceptance-qa` 文档写回阶段 |
| `docs/acceptance-tests/README.md` | 写入 acceptance 状态机、spec/run 规则、环境阻塞路由与归档口径 |

## 12. Claude Code 适用性

- Cursor：通过 `.cursor/agents/acceptance-qa.md` 由 parent orchestrator 自动调用；更适合把 `none | light | full` 强度选择做成编排逻辑
- Claude Code：当前无自动触发机制；可在规划阶段手动请求“先判定验收强度”，若为 `full` 再补 acceptance spec，并在 code-review 通过后执行 acceptance run
- 浏览器实测能力在两端都适用；区别只在于是否有自动编排

---

## 对话留痕

| 时间 | 来源 | 关键信息 |
|------|------|----------|
| 2026-04-01 | 用户 | 提出“AI 团队缺少验收机制”的问题 |
| 2026-04-01 | AI | 诊断为 V&V 分离缺口，提出新增验收角色 |
| 2026-04-01 | 用户 | 要求写 draft 到 workspace |
| 2026-04-01 | 用户 | 澄清“可写”是写验收文档，不是改代码 |
| 2026-04-01 | 用户 | 指出这个角色更像上线前验收测试人员，并追问是否应有独立测试文档 |
| 2026-04-01 | AI | 按最佳实践引入 `acceptance test doc` 第三层，draft 升级为 v1.5 |
| 2026-04-01 | 用户 | 明确角色应按职责设计为 `Acceptance QA` |
| 2026-04-01 | AI | 将文档统一改为 `Acceptance QA / acceptance-qa` 口径，draft 升级为 v1.6 |
| 2026-04-01 | 用户 | 追问测试文档是否应先写，以及测试文档是否真的要随 task 归档 |
| 2026-04-01 | AI | 将验收测试资产拆分为 `spec` 与 `run`，并明确 `spec` 长期维护、`run` 跟随 task 生命周期，draft 升级为 v1.7 |
| 2026-04-01 | 用户 | 接受专业复审提出的 4 个机制缺口，要求直接补进草案 |
| 2026-04-01 | AI | 补入 requirement 多 task 聚合、run 基线冻结、`environment-gap` / `blocked` 路由、最小覆盖规则，draft 升级为 v1.8 |
| 2026-04-01 | 用户 | 追问当前约束是否过强，要求参考 oh-my-codex 给大模型保留自主空间 |
| 2026-04-01 | AI | 将机制重构为“硬护栏 + 默认路径 + `none | light | full` 三档验收强度”，draft 升级为 v1.9 |
