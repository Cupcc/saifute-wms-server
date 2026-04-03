# Orchestration Playbook

本目录记录本仓库在任务编排、subagent 协作、workflow 设计上的可复用经验。

---

## 2026-04-04 · 事实优先编排

**Source task**: 重构 orchestration skills、subagents 与 rules，去掉强制 planner-first 执行
**Scenario**: 固定流程表述让 resume 流程总是回到 `planner`，重复创建或重写 task doc，并把 review、acceptance 推成必经下游步骤，即使仓库当前状态已经足够说明下一步该做什么
**Lesson**: 编排规则必须区分 hard invariants 与 fact-conditioned guidance。只有 lifecycle truth、provenance、writable scope 边界、repo 约束应保留为 hard；执行顺序应由 main agent 根据当前事实决定
**Reusable action**: 逐句检查编排文案属于 `hard`、`fact-conditioned soft` 还是 `guidance`；把 `after X`、`default to Y`、固定顺序改写成 `when X is true, prefer Y`；resume 时默认复用 active task doc，而不是先 replan
**Maturity**: initial observation

## 2026-04-04 · Commit 不应作为默认编排阶段

**Source task**: 调整 orchestration prompts 与 playbooks，降低 token 和协作成本
**Scenario**: 把 commit 当成常规编排步骤会消耗时间和 token，但对大多数实现循环或 resume 流程没有直接帮助
**Lesson**: commit 是交付或发布边界，不是普通任务执行中的默认协作阶段
**Reusable action**: 除非用户明确要求 publish-ready 结果，或当前流程已经到达真实 release boundary，否则不要把 commit 写成 orchestration 默认步骤
**Maturity**: initial observation

## 2026-04-04 · 先核实测试结论再标环境缺口

**Source task**: `master-data` `Phase 1` reopen + acceptance closeout
**Scenario**: acceptance 初看把 Redis 集成测和 supplier 权限 e2e 记成附条件项，但后续复核发现：Redis 用例本身已通过，错误日志只是测试内探测；supplier 403 失败来自陈旧账号预期，而不是接口回归
**Lesson**: 在把失败归类为 `environment-gap`、`implementation-gap` 或 `evidence-gap` 前，必须先复跑最小相关命令并核对当前权限 / 测试真相；日志噪音和过时断言很容易把 acceptance 误导成条件通过
**Reusable action**: 当 acceptance 发现“环境问题”时，先执行对应的 focused command；若命令通过，则把日志说明写入 spec，不要继续保留为 blocker；若是权限用例失败，先回查当前 preset / role 绑定，再决定修代码还是修测试
**Maturity**: initial observation
