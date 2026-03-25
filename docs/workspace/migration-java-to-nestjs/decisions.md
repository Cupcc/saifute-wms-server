# 决策日志

## 待决策 {#pending}

当前无待决策项。

## 已决策

### DEC-006: `project` 域遇到“确无对应物料”时自动补建 `material`

- 决策时间: 2026-03-25
- 结论: 对 `project` 明细中无法通过现有 batch1 主数据确定到唯一 `material.id`、且确认没有对应目标物料的行，按 `material_name + specification + unit` 的稳定键自动补建目标 `material`
- 理由:
  - 用户明确要求“确实没有对应物料，你自行编码 materialCode 插入新的物料”
  - 当前真实数据中 `134` 条 pending 行全部属于 `pending-no-candidate`，继续保持人工 backlog 会长期阻塞 `project` 域 cutover
  - 自动补建规则仍保持 deterministic：同一归一化键复用同一补建物料，不引入 fuzzy matching
- 执行:
  - `scripts/migration/project/legacy-reader.ts` 读取既有 `ProjectAutoCreatedMaterial`
  - `scripts/migration/project/transformer.ts` 为无候选物料行生成/复用稳定 `materialCode`
  - `scripts/migration/project/writer.ts` 先 upsert 自动补建物料，再落 `project_material_line`
  - `scripts/migration/project/validate.ts` 校验补建物料与其审计 payload
  - 真实数据重跑结果：`5` 个项目、`138` 条项目明细全部准入 live，自动补建 `126` 条 `AUTO_CREATED` 物料，`pending_relations = 0`

### DEC-005: pending 行放 pending_relations 还是 excluded_documents

- 决策时间: 2026-03-23
- 结论: `pending_relations`（可恢复的 staging），`excluded_documents` 仅用于结构性排除
- 理由: pending 行有恢复可能——一旦物料映射确认即可迁入 live 表，语义上不是"排除"而是"暂缓"
- 执行: 已实现于 `scripts/migration/project/writer.ts`，pending 行写入 `pending_relations` 并保留完整审计 payload

### DEC-004: material resolution 是否允许 fuzzy matching

- 决策时间: 2026-03-23
- 结论: 不允许。只使用 deterministic fallback（精确的 名称+规格+单位 匹配）
- 理由: 物料映射错误会导致 BOM 成本失真和库存追溯污染，project 域是带库存副作用的事务域，风险不可接受
- 执行: `scripts/migration/project/transformer.ts` 中 fallback 链仅包含 `direct-map` 和 `exact-normalized-name-spec-unit`

### DEC-003: project 域采用三态 admission 还是二态

- 决策时间: 2026-03-23
- 结论: 三态——`migrated` / `pending-material-resolution` / `structural-excluded`
- 理由: 二态（migrated / excluded）会把可恢复的物料 backlog 和真正的结构性问题混为一谈，丢失恢复路径
- 执行: `scripts/migration/project/types.ts` 中的 plan 结构体和 `transformer.ts` 中的分类逻辑

### DEC-002: project 迁移的 header admission 策略

- 决策时间: 2026-03-23
- 结论: all-or-nothing——一个 project header 下只要有任意一条明细 pending，整个 header 不写入 live 表
- 理由: 部分写入会导致项目金额不完整、物料清单残缺，下游库存副作用基于不完整数据产生
- 执行: `scripts/migration/project/writer.ts` 中 header 级别的 admission 检查

### DEC-001: scrap 域是否纳入本轮迁移范围

- 决策时间: 2026-03-21
- 结论: 纳入。即使当前历史数据为 0，也要补齐迁移能力
- 理由: 保证全量迁移的完整性，避免上线后发现遗漏；目标模型已预留 scrap 表结构
- 执行: 待实施

