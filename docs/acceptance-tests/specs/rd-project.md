# 历史 RD 项目实现验收规格（legacy rd-project）

## 元数据

| 字段 | 值 |
|------|------|
| 模块 | legacy-rd-project |
| 需求源 | docs/requirements/domain/rd-project-management.md（本 spec 冻结的是 `2026-04-09` 历史交付证据） |
| 最近更新 | 2026-04-14 |

## 历史说明

- 本 spec 冻结的是 `2026-04-09` 当时的 `src/modules/rd-project/**` 验收结果；该实现本质上是 `RD_SUB` 下的历史研发项目能力。
- 当前运行时菜单与页面文案已经从“项目管理”收口为“研发项目”，以避免与销售项目语义冲突。
- 当前研发项目需求真源见 `docs/requirements/domain/rd-project-management.md`；销售项目真源见 `docs/requirements/domain/sales-project-management.md`。
- `2026-04-14` 新确认 follow-on 规则要求：进入 `RD_SUB` 的物料必须归属研发项目，研发项目承担 `RD_SUB` 二级归属真源。该 follow-on 不在本历史 spec 的 `F1-F4` 验收范围内，后续将由 `task-20260414-1418-rd-sub-project-attribution-and-reporting-alignment.md` 配合新的 `rd-subwarehouse` 验收规格承接。

## 能力覆盖

| 能力 | 说明 | 状态 |
|------|------|------|
| F1 | 历史 RD 项目主档轻量 CRUD 与固定 RD_SUB 口径 | `已验收` |
| F2 | 历史 RD 项目 BOM、缺料预警与补货辅助 | `已验收` |
| F3 | 历史 RD 项目领料 / 退料 / 报废通过 inventory-core 落账 | `已验收` |
| F4 | 历史 RD 项目净耗用与成本台账 | `已验收` |

## F1-F4 总体验收摘要

- 关联任务：`docs/tasks/archive/retained-completed/task-20260409-0056-rd-project-phase1-phase2-delivery.md`
- 验收模式：`full`
- 结论：`accepted`
- 理由摘要：
  - `rd-project` 后端已从“创建项目即直接出库”切换为“历史 RD 项目主档 + BOM + 独立项目物料动作”语义，`create/update` 不再直接记库存，动作统一经 `inventory-core` 落账。
  - 浏览器证据冻结时，`http://127.0.0.1:90/rd/projects` 已作为 RD 项目入口；当前运行时文案统一为“研发项目”，与销售项目分域。
  - 本地 live 环境首次访问出现 `/api/rd-projects` `500`，根因是 `.env.dev` 数据库尚未同步新增 `RdProjectBomLine / RdProjectMaterialAction*` Prisma schema；在显式执行 `pnpm prisma db push --schema prisma/schema.prisma --accept-data-loss` 后恢复为可验收状态，需作为 rollout 前置条件记录。

### 验证摘要

| 时间 | 关联 task | 环境 | 结果 |
|------|-----------|------|------|
| 2026-04-09 | `archive/retained-completed/task-20260409-0056-rd-project-phase1-phase2-delivery.md` | `.env.dev`; backend `http://127.0.0.1:8112`; web `http://127.0.0.1:90`; Prisma schema synced to local DB; automated validation + browser walkthrough | `passed` |

### 证据索引

| 执行面 | 证据文件/命令 | 结果 |
|--------|-------------|------|
| prisma | `set -a && source .env.dev && set +a && pnpm prisma:validate` | pass |
| prisma | `set -a && source .env.dev && set +a && pnpm prisma db push --schema prisma/schema.prisma --accept-data-loss` | pass |
| typecheck | `pnpm typecheck` | pass |
| unit | `pnpm test -- src/modules/rd-project/application/rd-project.service.spec.ts src/modules/rd-project/application/rd-project-material-action.service.spec.ts src/modules/rd-subwarehouse/application/rd-procurement-request.service.spec.ts src/modules/workshop-material/application/workshop-material.service.spec.ts` | pass |
| build | `pnpm --dir web build:prod` | pass |
| browser | `docs/acceptance-tests/runs/run-20260409-0126-rd-project-phase1-phase2.md` | pass |
| cases | `docs/acceptance-tests/cases/rd-project.json` | pass |

## F1 历史 RD 项目主档轻量 CRUD 与固定 RD_SUB 口径

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-1 | 历史 RD 项目主档提供轻量 CRUD，作业仓别固定为 RD_SUB，且主档不再等同库存消耗单 | `met` | unit + browser | `rd-project.service.spec.ts` 明确断言 create 不调用 `inventoryService.settleConsumerOut`；browser run 中 `/rd/projects` 首屏文案、创建弹窗、列表与详情页都体现主档语义 | 浏览器创建使用业务车间下拉，修复了对固定 workshopScope 的错误假设 |

### 残余风险

- rollout 到其他环境前必须先同步 Prisma schema；否则 `/api/rd-projects` 会因缺表而失败。

## F2 历史 RD 项目 BOM、缺料预警与补货辅助

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-2 | 历史 RD 项目 BOM 保存不直接过账库存，并能展示缺口/补货状态 | `met` | unit + browser | `rd-project.service.spec.ts` 覆盖 BOM、短缺、补货状态、legacy ledger 聚合；browser run 中详情抽屉展示 `计划量/当前可用/缺口量/补货状态/补货在途` | 当前 browser fixture 未覆盖进行中的采购单，但读模型字段已在 UI 呈现 |

### 残余风险

- browser 只验证了“待补货”路径；“补货中”状态仍主要依赖自动化与后端读模型逻辑。

## F3 历史 RD 项目库存动作通过 inventory-core 落账

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-3 | 历史 RD 项目领料 / 退料 / 报废统一经 inventory-core 落账，并维持与 workshop-material 一致的动作家族语义 | `met` | unit + browser | `rd-project-material-action.service.spec.ts` 覆盖 `PICK/RETURN/SCRAP` create/void、来源释放与回补；详情页浏览器 walkthrough 显示“项目物料动作”页签与 `新增物料动作` 入口 | 当前 live browser run 未额外制造 RD_SUB 库存 fixture，因此动作创建真路径以 focused tests 为主证据 |

### 残余风险

- 若后续要做更强 browser 证据，需先准备一条可供 RD_SUB 消耗的 handoff 库存 fixture。

## F4 历史 RD 项目净耗用与成本台账

### 验收矩阵

| AC | 描述 | 结论 | 执行面 | 关键证据 | 备注 |
|----|------|------|--------|----------|------|
| AC-4 | 可查看项目层的计划、已领、已退、已报废、净耗用、缺口量与成本汇总 | `met` | unit + browser | `rd-project.service.spec.ts` 断言 ledger summary / netUsed / shortage 聚合；browser run 中详情抽屉显示 `计划成本/已领成本/退料回补/报废损耗/净耗用成本/缺口物料数` 与行级台账 | 当前 browser 数据集金额为 0，是因未执行领料动作，不影响字段闭环验收 |

### 残余风险

- live browser 未展示非零成本样本，成本数值正确性主要由 service tests 覆盖。
- `2026-07-09` 复核补记：非零成本样本已在 `docs/acceptance-tests/runs/run-20260414-1620-rd-sub-project-attribution-and-reporting-alignment.md` 中经浏览器验证覆盖；当前仅剩 `F2` 的“补货中”浏览器路径与 `F3` 的浏览器端动作创建两项未获浏览器主证据。
