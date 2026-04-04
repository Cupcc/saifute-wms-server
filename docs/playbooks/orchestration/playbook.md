# Orchestration Playbook

本页记录本仓库在任务编排、子代理协作 (subagent coordination) 和工作流设计 (workflow design) 上的可复用经验。

---

## 事实优先编排

> 编排规则不要写死执行顺序。恢复执行 (resume) 时先看当前事实，优先复用 active task doc，不要机械回到 `planner`。

**场景**: 在重构 orchestration 提示词 (prompts)、subagents 和 rules 时发现，固定流程会让恢复 (resume)操作总是先回到 `planner`。结果是反复创建或重写 task doc，还会把评审 (review) 和验收 (acceptance) 硬推成必经步骤。
**结论**: 编排规则要区分硬约束和条件性建议。真正应该写死的，只有生命周期事实 (lifecycle truth)、来源关系 (provenance)、可写范围边界 (writable scope) 和仓库约束 (repo constraints)；执行顺序应该由主代理 (main agent) 根据当前事实决定。
**做法**: 逐句检查编排文案是在表达 `hard`、`fact-conditioned soft` 还是 `guidance`。把 `after X`、`default to Y` 这类固定顺序，改成 `when X is true, prefer Y`；恢复执行 (resume) 时默认复用 active task doc，而不是先重新规划 (replan)。
**成熟度**: 初步观察

## Commit 不应作为默认编排阶段

> commit 不是日常执行循环里的默认步骤。只有到了明确交付或真实发布边界，再把它纳入编排。

**场景**: 在调整 orchestration 提示词 (prompts) 和 Playbooks 时发现，把 commit 当成常规编排步骤会持续消耗时间和 token，但对大多数实现循环或恢复执行 (resume) 没有直接帮助。
**结论**: commit 属于交付或发布边界，不是普通执行过程里的默认协作阶段。
**做法**: 只有在用户明确要求可发布结果 (publish-ready)，或流程已经到达真实发布边界 (release boundary) 时，才把 commit 写进默认编排。
**成熟度**: 初步观察

## 先核实测试结论再标环境缺口

> 在验收 (acceptance) 里看到“环境问题”时，不要急着下分类结论。先跑最小相关命令核实事实，再决定它是不是 blocker。

**场景**: 在 `master-data` `Phase 1` reopen + acceptance closeout 中，验收 (acceptance) 起初把 Redis 集成测和 supplier 权限 e2e 记成附条件项。后续复核才发现：Redis 用例本身已经通过，报错日志只是测试内部探测；supplier 的 403 失败也来自陈旧账号预期，而不是接口回归。
**结论**: 在把失败归类为 `environment-gap`、`implementation-gap` 或 `evidence-gap` 之前，必须先复跑最小相关命令，核对当前权限和测试真相。日志噪音、过时断言，很容易把验收 (acceptance) 误导成“条件通过”。
**做法**: 当验收 (acceptance) 发现“环境问题”时，先执行对应的聚焦命令 (focused command)。命令如果通过，就把日志说明写进 spec，不要继续当作 blocker；如果是权限用例失败，先回查当前 preset 和 role 绑定，再决定修代码还是修测试。
**成熟度**: 初步观察