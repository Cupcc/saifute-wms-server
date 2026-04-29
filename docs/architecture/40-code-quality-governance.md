# 代码质量治理规则

## 1. 目标与适用范围

本文档定义 Saifute WMS NestJS 仓库的代码质量治理规则。所有开发、agent 会话、子代理执行和 code review 均以本文档作为判定基准。

适用范围：

- `src/modules/**` 下所有 TypeScript 生产代码和测试代码
- `src/shared/**` 下所有 TypeScript 生产代码和测试代码
- `generated/` 目录除外

本文档只保留长期有效的治理规则。阶段性执行资料应放入 `docs/tasks/**` 或 `docs/workspace/**`，不得沉淀在本文件中。

与其他文档的关系：

| 文档 | 职责 |
| --- | --- |
| `00-architecture-overview.md` | 模块清单、技术栈、依赖总图和冻结语义约束 |
| `modules/*.md` | 单个模块的边界、职责、数据访问规则和跨模块约束 |
| `docs/playbooks/domain-refactor/playbook.md` | 重构操作经验和执行方法 |
| 本文档 | 所有代码必须遵守的质量规则、门禁要求和审查口径 |

优先级：

1. 若本文档与模块文档冲突，以本文档为准，并同步修正模块文档。
2. 若本文档与 `00-architecture-overview.md` 冲突，需要人工仲裁，并同时更新两侧。
3. 若代码现状与本文档冲突，以本文档作为目标规则；变更不得扩大冲突面。

---

## 2. 治理执行模型

本仓库的代码质量治理通过四层执行，不依赖单一人工记忆。

```text
第 1 层：知识约束
  CLAUDE.md / AGENTS.md
  docs/architecture/*.md
  .agents/skills/nestjs-best-practices/SKILL.md

第 2 层：实时反馈
  Claude Code PostToolUse hook
  Codex PostToolUse hook
  scripts/check-quality-hooks.mjs
  编辑器 LSP / Biome 即时提示

第 3 层：提交门禁
  pre-commit：lint-staged + biome
  commit-msg：commitlint
  pre-push：prisma generate -> typecheck -> test

第 4 层：审计与 Review
  bun run lint:src-lines
  agent / human code review
  必要时执行专用扫描脚本
```

### 2.1 各层职责

| 层次 | 目标 | 载体 | 失败处理 |
| --- | --- | --- | --- |
| 知识约束 | 让开发者和 agent 在写代码前知道规则 | 根级指令、架构文档、技能文档 | review 时按本文档纠偏 |
| 实时反馈 | 在写代码当下发现单文件违规 | PostToolUse hook、`check-quality-hooks.mjs`、LSP、Biome | 立即修复本次编辑引入的问题 |
| 提交门禁 | 阻断不合格变更进入版本记录 | Husky、lint-staged、commitlint、verify 脚本 | 失败则不得提交或推送 |
| 审计与 Review | 发现跨文件、趋势性和机器难判定问题 | 扫描脚本、review 清单 | 阻断 PR 或要求同 PR 修复 |

### 2.2 规则载体边界

**NestJS Best Practices skill**

- 位置：`.agents/skills/nestjs-best-practices/SKILL.md`。
- 涉及新增、修改、重构或 review NestJS module / controller / service / provider / DTO / repository 时，agent 必须读取该 skill 的规则索引。
- 该 skill 提供通用 NestJS rule id，例如 `arch-*`、`di-*`、`security-*`、`test-*`；本文档提供项目级约束。
- 二者冲突时，以本文档为准。
- Review 发现问题时，优先使用“本文档章节 + skill rule id”的形式标注。

**PostToolUse hook**

- Claude 配置位置：`.claude/settings.json` 的 `hooks.PostToolUse`。
- Codex 配置位置：`.codex/hooks.json` 的 `hooks.PostToolUse`。
- Codex 仓库脚本位置：`.codex/hooks/post_tool_use_quality_check.mjs`。
- 统一执行脚本：`scripts/check-quality-hooks.mjs`。
- hook 用于尽早发现单文件或本次 patch 可判定的问题，不替代 pre-push、全仓扫描和 review。

hook 至少覆盖以下规则：

| 检查 | 对应规则 |
| --- | --- |
| 文件行数不得超过 500 行 | §5.1 |
| 拆分残留和纯 re-export 空壳检测 | §5.4 |
| `application/` 层禁止注入 `PrismaService` 和直接查询 | §3.3 |
| 跨模块 repository import / 注入识别 | §4 |
| 构造函数依赖宽度提示 | §5.1 |

**Husky 门禁**

- `pre-commit` 必须执行暂存文件格式化和 lint。
- `commit-msg` 必须执行 commitlint。
- `pre-push` 必须执行 Prisma Client 生成、TypeScript 类型检查和测试。
- 门禁失败时不得绕过提交或推送，除非用户明确授权，并在交付说明中记录原因。

**Code Review**

- review 必须按 §9 的维度逐项核对。
- 对于分层、DI、事务、DTO 校验、安全边界等 NestJS 问题，review 必须同时参考 `nestjs-best-practices` skill。
- 独立 review agent 不会自动运行；只有用户明确要求 review、PR 阶段需要独立审查，或主 agent 判断变更高风险并获得授权时，才调用独立 review。

### 2.3 新增检查项落位原则

| 检查类型 | 落位 |
| --- | --- |
| 单文件写入时即可判定 | 加入 `scripts/check-quality-hooks.mjs` |
| 需要跨文件、但提交或推送时可判定 | 加入 verify / pre-push 链路 |
| 需要全仓扫描或趋势度量 | 增加 `scripts/` 下的独立扫描脚本 |
| 难以机器判定的约定 | 写入本文档规则，并加入 code review 清单 |

新增检查项必须同步更新 §8 的门禁覆盖表，保持规则和执行链一致。

---

## 3. 分层纪律

### 3.1 层间依赖方向

```text
controllers/  ->  application/  ->  infrastructure/
     |                 |                    |
     v                 v                    v
    dto/             domain/            Prisma / Redis / 外部 API
```

依赖方向只能向右和向下，不允许反向依赖。

### 3.2 各层允许的 import 范围

| 层 | 允许 import | 禁止 import |
| --- | --- | --- |
| `controllers/` | dto、application service、shared decorators、shared guards | infrastructure、Prisma、其他模块内部实现 |
| `application/` | domain、dto 类型、本模块 repository interface、其他模块 exported service、Prisma 类型引用 | `PrismaService` 运行时注入、直接 Prisma 查询、直接事务、其他模块 repository |
| `domain/` | 标准库、本模块 domain 类型、shared domain 类型 | NestJS、Prisma、Express、Redis、外部 SDK |
| `infrastructure/` | Prisma、Redis、外部 SDK、domain 类型 | controllers、其他模块 infrastructure |
| `dto/` | class-validator、class-transformer、shared/domain | application、infrastructure |

### 3.3 关键禁令

1. `application/` 层禁止注入 `PrismaService`。
2. `application/` 层禁止直接调用 `this.prisma.*`、`prisma.*` 或 `tx.*` 执行查询。
3. `application/` 层禁止直接开启事务；事务边界必须由 repository 或 Unit of Work 封装。
4. `controllers/` 禁止业务逻辑，只能解析请求、调用 service、返回响应。
5. `domain/` 禁止依赖框架、ORM、HTTP、Redis 或外部 SDK。

### 3.4 Prisma 类型引用豁免

`application/` 层允许只读引用 Prisma 生成类型，不视为分层违规。

允许类型：

- 输入类型：如 `Prisma.XXXUncheckedUpdateInput`，用于构造传给 repository 的 payload。
- 异常类型：如 `Prisma.PrismaClientKnownRequestError`，用于底层异常到业务异常的语义转换。
- 枚举和常量：Prisma schema 生成的 enum，如 `AuditStatusSnapshot`、`DocumentFamily`。
- 事务客户端类型：仅可作为 repository 方法签名或回调类型，不得在 application 层直接执行查询。

判定标准：

- `import { Prisma } from '...'` 本身不违规。
- `import { SomeEnum } from '...'` 本身不违规。
- 注入 `PrismaService`、调用 `prisma.*`、调用 `tx.*` 才是违规。

### 3.5 存量冲突处理

代码现状若仍存在与本文档不一致的存量问题，按以下规则处理：

1. 新增代码不得引入同类违规。
2. 修改已有文件时，不得扩大违规范围。
3. 若改动触碰违规逻辑，应在同一 PR 中优先收敛到本文档规则。
4. 若一次性修复风险过高，必须在 PR 说明中写明保留原因、影响边界和后续处理入口。

---

## 4. 模块边界

### 4.1 跨模块通信规则

| 允许 | 禁止 |
| --- | --- |
| 注入其他模块 exported service | 注入其他模块 repository |
| 使用 `shared/` 下公共类型 | import 其他模块 `infrastructure/` 文件 |
| 通过事件发布跨模块变化 | 直接调用其他模块 private 方法 |
| 通过对方 module exports 暴露的 service 能力访问数据 | 在本模块 providers 中注册其他模块 repository |

### 4.2 模块依赖方向

```text
                shared/
                  |
      +-----------+-----------+
      v           v           v
 master-data   approval   auth/rbac/session
      |           |
      v           v
        inventory-core
              |
   +----------+-----------+------------+
   v          v           v            v
 inbound    sales   workshop-material  rd-project
                                      |
                                      v
                               rd-subwarehouse

 reporting -> inventory-core (只读), master-data (只读)
 ai-assistant -> reporting, master-data, inventory-core (只读)
```

核心规则：

1. 箭头只能向下或同层，不允许向上依赖。
2. 上层模块只通过 service 接口访问下层模块。
3. `inventory-core` 是唯一库存写入口，任何模块不得绕过它直接写库存表。
4. `reporting` 和 `ai-assistant` 是只读消费者，不得触发库存、单据或主数据写操作。

### 4.3 Module 导出规则

1. `*.module.ts` 的 `exports` 只允许导出 service。
2. `*.module.ts` 不允许导出 repository。
3. 如果其他模块需要查询能力，应在本模块 service 上暴露明确方法。
4. 如果多个模块需要共享读能力，应优先创建 shared module 或 lookup service，仍然只导出 service。

---

## 5. 单一职责与文件治理

### 5.1 量化阈值

| 指标 | 阈值 | 处置 |
| --- | --- | --- |
| 文件行数 | 500 行 | 超过即违规，必须拆分 |
| 单个方法或函数 | 80 行 | 提取为独立方法、helper 或协作者 |
| 普通 service 构造函数依赖数 | 5 个 | 超过表明职责过多，应拆分或收拢共享依赖 |
| facade 构造函数依赖数 | 不限 | facade 注入子 service 是其职责，不计违规 |
| 类的 public 方法数 | 15 个 | 超过应按职责域拆分 |
| 方法参数数 | 5 个 | 超过应封装为 command / query object |

facade 判定标准：

- 文件少于 300 行。
- public 方法均为委托方法。
- 不包含 `if`、`for`、`while`、`switch` 等业务逻辑分支。
- 不直接执行数据访问、事务、校验聚合或状态变更。

满足以上条件的 service 可豁免构造函数依赖数检查。Facade 的核心判定依据是“是否只做委托”，不是行数本身。

### 5.2 God Object 判定

满足以下任一条件即判定为 God Object。满足 §5.1 facade 标准的文件豁免。

1. 构造函数注入超过 5 个依赖。
2. 文件超过 800 行。
3. 同一个 class 处理 3 个以上互不相关的业务职责域。
4. 单个 service 同时承担命令、查询、导入导出、状态机和跨模块协调等多类职责。

### 5.3 拆分原则

| 层 | 拆分依据 |
| --- | --- |
| `application/` | 按 use case 或业务动作族拆分 |
| `infrastructure/` | 按聚合根、读模型来源或外部系统边界拆分 |
| `domain/` | 按不变量、值对象、领域计算或状态机拆分 |
| `dto/` | 按接口用途和请求/响应语义拆分 |
| spec 文件 | 跟随生产代码拆分 |

拆分前后必须保证：

1. 每个子文件不超过 500 行。
2. 子 service 各自依赖数不超过 5 个；共享依赖应通过 shared service 或 repository 收拢。
3. 不得因拆分新增 `PrismaService` 注入点。
4. 不得因拆分新增跨模块 repository 依赖。
5. 外部 API、controller 入参和 module exports 需要保持兼容，除非任务明确要求破坏性调整。

### 5.4 Facade 和拆分善后

拆分后是否保留原文件，取决于外部消费者。

| 拆分类型 | 原文件有外部消费者 | 处理方式 |
| --- | --- | --- |
| application service | 有 | 保留为 facade，只委托给子 service |
| application service | 无 | 删除原文件，调用方直接引用新 service |
| infrastructure repository | 一般不应有外部消费者 | 删除原文件，本模块 service 直接引用具体 repository |
| domain helper / util | 视外部引用情况 | 有消费者则保留兼容出口；无消费者则删除 |

拆分完成后必须检查消费者：

```bash
rg "from .*<原文件名>" src/ -l
```

禁止反模式：

1. 只有 re-export 的空壳文件。
2. 没有业务语义的 barrel 文件。
3. facade 中继续保留业务逻辑。
4. 子 service 各自重复注入同一组外部依赖。

### 5.5 新增代码默认规则

1. 新增功能不得追加到已经超过 400 行的文件。
2. 新增 use case 应创建独立 service 文件。
3. 如果一个 PR 会让某文件超过 500 行，该 PR 必须同时完成拆分。
4. 禁止创建无语义命名的万能文件，如 `utils.ts`、`helpers.ts`、`common.ts`、`misc.ts`。
5. 工具函数必须归属到明确领域目录，并以职责命名，例如 `decimal-precision.util.ts`、`business-document-ref.factory.ts`。
6. 同一段逻辑出现少于 3 次时保持内联重复；出现 3 次及以上且语义一致、变更节奏同步时，才抽取为共享函数、helper 或 Value Object。

---

## 6. 领域建模

### 6.1 数据团簇识别

当 3 个以上字段总是一起出现在多个方法签名、DTO、repository payload 或接口定义中时，应提取为 Value Object。

优先识别以下组合：

| 字段组合 | 建议封装 |
| --- | --- |
| `businessDocumentType` + `businessDocumentId` + `businessDocumentNumber` + `businessDocumentLineId` | `BusinessDocumentRef` |
| `materialCategoryId` + `materialCategoryCode` + `materialCategoryName` + `materialCategoryPathSnapshot` | `MaterialCategorySnapshot` |
| `stockScope` + `workshopId` + `stockScopeId` | `StockScopeContext` |

封装位置：

- 跨模块使用：`src/shared/domain/`
- 单模块内部使用：`src/modules/<module>/domain/`

### 6.2 Value Object 引入时机

满足以下任一条件时，应引入 Value Object：

1. 同一组字段在 3 个以上方法间传递。
2. 同一组字段需要共同校验。
3. 同一组字段跨模块传递。
4. 同一组字段参与日志、审计、追溯或幂等判定。

Value Object 应提供明确构造和校验入口，避免在多个 service 中重复拼装相同结构。

### 6.3 贫血模型改善方向

本仓库允许渐进式从贫血模型向领域模型演进，但不得一次性大重写。

1. 优先通过 Value Object 封装数据团簇。
2. 对核心聚合引入 domain entity，将不变量校验移入 entity。
3. 对复杂状态机引入 domain service 或状态转换对象。
4. 每次触及相关代码时小步改进，并保持测试覆盖。

---

## 7. 复杂度控制

### 7.1 嵌套深度

- 条件或循环嵌套不得超过 3 层。
- 超过 3 层时，必须使用 guard clause、提取方法、提取策略对象或拆分管道步骤。

### 7.2 Guard Clause 优先

```typescript
// 禁止
async createOrder(dto: CreateOrderDto) {
  if (dto.lines.length > 0) {
    if (dto.lines.every((line) => line.quantity > 0)) {
      // business logic
    } else {
      throw new BadRequestException("...");
    }
  } else {
    throw new BadRequestException("...");
  }
}

// 推荐
async createOrder(dto: CreateOrderDto) {
  if (dto.lines.length === 0) throw new BadRequestException("...");
  if (!dto.lines.every((line) => line.quantity > 0)) {
    throw new BadRequestException("...");
  }

  // business logic
}
```

### 7.3 分支控制

- 条件分支超过 3 个时，应优先使用 `Record`、`Map`、策略模式或明确的状态转换表。
- 不允许在 controller 中写业务分支。
- 不允许在同一个 service 方法内混合多种单据类型的大型分支；应按 use case 拆分。

### 7.4 Prisma 查询复杂度

1. 嵌套 `include` / `select` 不得超过 3 层。
2. 超过 3 层时，应拆分为多次查询、创建读模型方法或使用明确的 raw SQL。
3. `Promise.all` 并行查询不应超过 5 个；超过时必须评估是否存在 N+1 或数据模型问题。
4. 查询组合逻辑属于 repository / infrastructure，不得放入 application service。

### 7.5 异常处理边界

禁止“以防万一”的 `try-catch`。`catch` 块只有满足以下至少一个目的时才允许存在：

1. 语义转换：将底层异常转为领域异常。
2. 有意义的降级：返回可接受 fallback，并记录 warn 级日志。
3. 资源清理：配合 `finally` 释放连接、文件句柄或回滚上下文。
4. 边界捕获：消息消费者、定时任务入口等顶层边界防止进程崩溃，并记录 error 级日志。

禁止反模式：

```typescript
// 禁止：吞掉异常
try {
  await doSomething();
} catch (error) {
  // ignore
}

// 禁止：log + rethrow，NestJS 全局过滤器会统一处理
try {
  await doSomething();
} catch (error) {
  this.logger.error(error);
  throw error;
}

// 禁止：catch 后抛出相同异常
try {
  await doSomething();
} catch (error) {
  throw error;
}
```

默认行为：让异常冒泡到 NestJS 全局 `ExceptionFilter`，由框架统一转换为 HTTP 响应。Controller 和 Service 默认不写 `try-catch`。

---

## 8. 质量门禁

### 8.1 标准门禁链

```text
pre-commit
  lint-staged
  biome check --write

commit-msg
  commitlint

pre-push
  prisma generate
  typecheck
  test
```

### 8.2 门禁覆盖表

| 检查项 | 执行位置 | 阻断要求 |
| --- | --- | --- |
| 代码格式 | pre-commit / Biome | 必须阻断 |
| lint | pre-commit / Biome | 必须阻断 |
| TypeScript 类型检查 | pre-push / verify | 必须阻断 |
| 单元测试 | pre-push / verify | 必须阻断 |
| 文件行数 | PostToolUse hook / `lint:src-lines` | 不得新增违规；全仓扫描发现违规时必须处理或说明 |
| 拆分残留 | PostToolUse hook / review | 必须处理 |
| application 层 Prisma 注入 | PostToolUse hook / review | 必须阻断 |
| 跨模块 repository 依赖 | PostToolUse hook / review | 必须阻断 |
| 构造函数依赖宽度 | PostToolUse hook / review | 超阈值必须拆分、收拢或说明豁免 |
| 异常处理反模式 | review | 必须处理 |

### 8.3 Agent 提交前自检

提交代码前应执行：

```bash
bun run lint
bun run typecheck
bun run test
bun run lint:src-lines
```

若任务范围很小且跳过部分检查，交付说明必须写明跳过的命令和原因。

---

## 9. Code Review 检查维度

Review 必须覆盖以下维度：

1. 分层合规：是否新增 `PrismaService` 注入、直接 Prisma 查询或 application 层事务。
2. 模块边界：是否跨模块 import / 注入 repository 或 infrastructure。
3. 文件体积：文件是否超过 500 行，方法是否超过 80 行。
4. 职责边界：service 是否承担过多 use case，是否形成 God Object。
5. 复杂度：是否存在超过 3 层嵌套、长 if-else 链或过深 Prisma include。
6. 事务边界：事务是否由 repository / Unit of Work 管理。
7. DTO 和校验：请求 DTO 是否具备必要校验，响应结构是否稳定。
8. 异常处理：是否存在吞异常、无意义 log + rethrow 或纯 rethrow。
9. 测试覆盖：新增路径是否有单元测试，重构是否保持原有行为覆盖。
10. 命名一致性：文件、类、方法和 DTO 是否符合模块命名约定。

任何会增加违规数量的变更，默认不得合并。若必须暂时接受，必须在 PR 说明中记录原因、影响范围和后续处理入口。

---

## 10. 判定速查表

| 问题 | 判定标准 | 行动 |
| --- | --- | --- |
| 新文件放 `application/` 还是 `infrastructure/` | 是否 import Prisma / Redis / 外部 SDK | 是则放 `infrastructure/` |
| 是否需要新建 service | 现有 service 已有 5 个依赖或超过 400 行 | 新建 focused service |
| 跨模块需要数据 | 对方 module 是否 exports 合适 service 方法 | 有则注入 service；无则让对方模块补 service 方法 |
| 能否注入其他模块 repository | 任何场景都不允许 | 改为注入 exported service |
| 一组字段总是一起出现 | 出现 3 次及以上 | 封装 Value Object |
| 方法太长 | 超过 80 行 | 提取子方法、helper 或协作者 |
| 文件太长 | 超过 500 行 | 拆分文件 |
| 构造函数依赖太多 | 普通 service 超过 5 个 | 拆分职责或收拢共享依赖 |
| 能否保留原 service 文件 | 外部仍有消费者，且可变成薄 facade | 保留 facade；否则删除 |
| 是否可以创建 `utils.ts` | 无明确领域语义 | 不允许，按职责命名 |
