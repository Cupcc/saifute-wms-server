# RD 小仓 F4/F5 交付

## Metadata

- ID: `req-20260330-0127-rd-subwarehouse-phase4-phase5`
- Status: `confirmed`
- Lifecycle disposition: `retained-completed`
- Owner: `user`
- Topic requirement: `docs/requirements/topics/rd-subwarehouse.md`
- Related tasks: `docs/tasks/archive/retained-completed/task-20260330-0129-rd-subwarehouse-phase4-phase5.md`

## 用户需求

- 完成 `RD 小仓` 主题下 `F4`「RD 物料独立状态链」与 `F5`「RD 小仓盘点与库存调整」两项能力。
- 在当前 `主仓 + 研发小仓受限协同` 架构内落地，不把系统扩展成通用多仓框架；库存写入继续统一经过 `inventory-core`。
- 按仓库默认交付流程直接推进到实现、验证、review 与提交完成，不在中间里程碑停下。

## 当前进展

- 阶段进度: `F4 + F5` closing review 已完成，进入最终收口 / 提交阶段。
- 当前状态: 上一轮 `F5` 重复物料错账与 `MANUAL_RETURNED` 越权问题均已修复并复审通过；当前代码、focused tests、全量测试、web build 与 browser smoke 均满足本次风险面。
- 阻塞项: None
- 下一步: `None / 归档`

## 待确认

- None
