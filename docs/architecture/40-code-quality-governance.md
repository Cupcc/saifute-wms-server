# 代码质量治理基线

## 1. 文档目标与适用范围

本文档定义 Saifute WMS NestJS 仓库的代码质量治理规则。所有 agent 会话、子代理执行和人工 code review 均以此为判定基准。

适用范围：`src/modules/**`、`src/shared/**` 下所有 TypeScript 生产代码和测试代码（`generated/` 除外）。

与其他文档的关系：

- `00-architecture-overview.md` 定义模块清单、技术栈和依赖总图——是"系统长什么样"
- 本文档定义"代码必须怎么写"——是质量执行标准
- `docs/playbooks/domain-refactor/playbook.md` 记录具体重构经验——是"怎么改已有问题"

优先级：若本文档与模块文档（`modules/*.md`）有冲突，以本文档为准；若与 `00-architecture-overview.md` 有冲突，需人工仲裁并更新两侧。

---

## 1.5 治理方法总览（How Governance Is Enforced）

本仓库的代码质量治理不依赖"靠谱的人自觉遵守"，而是通过**四层防线**层层拦截。每层解决不同阶段的问题，缺一不可。

### 1.5.1 四层防线全景

```text
┌──────────────────────────────────────────────────────────────┐
│  第 1 层：知识约束（人/Agent 写代码前读什么）                     │
│    - CLAUDE.md（项目根）                                       │
│    - docs/architecture/*.md（本文档 + 架构总览 + 模块文档）       │
│    - .agents/skills/nestjs-best-practices/SKILL.md             │
└────────────────────────┬─────────────────────────────────────┘
                         │ 指导
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  第 2 层：实时反馈（写代码过程中立即拦截）                         │
│    - Claude Code PostToolUse hook                              │
│    - scripts/check-quality-hooks.mjs                           │
│    - 编辑器 LSP / Biome 即时提示                                │
└────────────────────────┬─────────────────────────────────────┘
                         │ 拦截
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  第 3 层：提交门禁（commit / push 前统一校验）                    │
│    - pre-commit：lint-staged + biome                           │
│    - commit-msg：commitlint                                    │
│    - pre-push：prisma generate → typecheck → test              │
└────────────────────────┬─────────────────────────────────────┘
                         │ 阻断
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  第 4 层：审计与趋势（事后度量、Code Review）                      │
│    - bun run lint:src-lines（文件行数扫描）                      │
│    - 本文档 §8 审计基线快照                                      │
│    - 人工 / agent Code Review（§7.4）                           │
└──────────────────────────────────────────────────────────────┘
```

### 1.5.2 每层的职责与手段


| 层次    | 目标                        | 载体                                                                   | 触发时机                      | 失败后果                     |
| ----- | ------------------------- | -------------------------------------------------------------------- | ------------------------- | ------------------------ |
| 知识约束  | 让写代码的人/agent **事前知道规则**   | `.claude/CLAUDE.md`、`docs/architecture/`、`.agents/skills/`           | 开始任务前主动 Read              | 无直接阻断，依赖自觉与 review       |
| 实时反馈  | 写代码**当下**就发现违规，不等到 commit | `.claude/settings.json` PostToolUse hook + `check-quality-hooks.mjs` | 每次 Edit/Write `.ts` 文件    | stderr 输出修复指引，agent 立即感知 |
| 提交门禁  | 进入仓库历史前**自动化阻断**          | `lint-staged`、`commitlint`、`husky` pre-push 脚本                       | `git commit` / `git push` | 阻止 commit / push         |
| 审计与趋势 | 度量存量问题、跟踪改善方向             | `bun run lint:src-lines`、本文档 §8 基线、Code Review                       | 手动 / 定期 / PR 阶段           | 生成违规清单，不直接阻断             |


### 1.5.3 各手段的职责边界

**CLAUDE.md（知识约束）**

- 项目根 `.claude/CLAUDE.md` 列出 agent 写代码前**必读文档清单**，不重复规则本身，只做索引。
- 用户级 `~/.claude/CLAUDE.md` 记录机器环境、工具版本、工作偏好。
- 规则本身**集中写在本文档**（§2–§6），避免散落在多处产生漂移。

**PostToolUse hook（实时反馈）**

- 配置位置：`.claude/settings.json` 的 `hooks.PostToolUse`。
- 执行脚本：`scripts/check-quality-hooks.mjs`。
- 当前覆盖的检查（与本文档映射）：
  - 文件行数 ≤ 500（对应 §4.1）
  - 拆分残留检测：≤ 30 行且 ≥ 80% 为 re-export 的文件（对应 §4.4 反模式）
  - `application/` 层禁止注入 PrismaService / 直接执行查询（对应 §2.3，类型引用按 §2.3.1 豁免）
  - 跨模块 repository import 识别（对应 §3.1）
- 触发时机：agent 每次 `Edit` / `Write` 一个 `.ts` 文件后**立即运行**。
- 失败处理：脚本以非零退出码 + stderr 给出**可操作的修复指引**（文件名、违规行、引用的文档章节）。Claude Code 会把 stderr 回显给 agent，促使其当场修复。
- 与 pre-commit 的关系：hook 更早介入（写文件的瞬间），pre-commit 作为兜底；两者检查项有重叠但不完全一致，因为 hook 只看单文件，pre-commit 看整个暂存区。

**Husky 门禁（提交门禁）**

- 配置位置：`package.json` 的 `scripts`、`.husky/` 目录、`lint-staged.config.`*。
- 职责：保证进入仓库的代码**至少通过格式化、lint、类型检查、测试**。
- 当前状态与目标状态的 gap 见 §7.2——核心差距是文件行数规则目前是 warn 级、未接入 verify 链路。

**Code Review（审计与趋势）**

- Agent code review 时按 §7.4 的六个维度逐项核对。
- §8 的基线数字用于对比：当次变更是否让违规总数**增加**——任何会让违规数增加的 PR 默认拒绝合并。

### 1.5.4 为什么要分四层

- **只靠文档**：规则会被忽略，尤其是多 agent 并行协作时。
- **只靠 hook**：hook 只看单个文件写入瞬间，看不到跨文件的关系（如跨模块依赖全图）。
- **只靠 pre-commit**：反馈太晚——agent 已经写了几百行才发现分层错误，返工成本高。
- **只靠 Code Review**：避免AI只靠主观判断就下结论。

四层组合的设计目标：**规则 1 份（本文档）、执行 4 处、违规在最早一层被拦住**。

### 1.5.5 新增治理手段的落位原则

当需要补充新的检查项时，按以下顺序选择落位：

1. **能在单文件写入时判定的** → 加进 `check-quality-hooks.mjs`（第 2 层）。
2. **需要跨文件但在提交时能判定的** → 加进 pre-push 的 `verify` 链（第 3 层）。
3. **需要全仓库扫描或趋势度量的** → 加进 `scripts/` 下的独立扫描脚本 + §8 基线（第 4 层）。
4. **纯约定、难以机器判定的** → 写入本文档对应章节 + Code Review 清单（第 1 / 4 层）。

新增检查项**同时**要更新本文档 §7.2 的"检查项覆盖表"，保持目标状态与实现一致。

---

## 2. 分层纪律（Layer Discipline）

### 2.1 层间依赖方向

```text
controllers/  →  application/  →  infrastructure/
     ↓               ↓                  ↓
    dto/            domain/          Prisma / Redis / 外部 API
```

**严格规则**：依赖方向只能向右和向下，不允许反向。

### 2.2 各层允许的 import 范围


| 层                 | 允许 import                                                                | 禁止 import                                           |
| ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `controllers/`    | dto/, application/ service, shared/decorators, shared/guards             | infrastructure/, Prisma, 其他模块内部                     |
| `application/`    | domain/, dto/(仅类型), 本模块 repository interface, 其他模块的 **exported service**, Prisma 类型引用（见 §2.3.1） | `PrismaService`（运行时注入）, 直接执行 Prisma 查询/事务, 其他模块的 repository |
| `domain/`         | 仅标准库和本模块 domain/ 内类型                                                     | 任何外部框架（NestJS, Prisma, Express）                     |
| `infrastructure/` | Prisma, Redis, 外部 SDK, domain/                                           | controllers/, 其他模块 infrastructure                   |
| `dto/`            | class-validator, class-transformer, shared/domain/                       | application/, infrastructure/                       |


### 2.3 关键禁令

1. **application 层禁止注入 PrismaService / 直接执行查询** — 不允许在 constructor 中注入 `PrismaService`，不允许调用 `this.prisma.*` 或 `tx.*` 执行查询/事务。数据访问必须通过 repository 方法。
2. **application 层禁止直接执行事务** — 事务边界由 repository 或 Unit of Work 模式封装，service 只调用 repository 方法。
3. **controllers 禁止业务逻辑** — 不允许 if/else 业务分支、循环计算、数据聚合。只做：解析请求 → 调用 service → 返回响应。

#### 2.3.1 Prisma 类型引用豁免

application 层**允许**以下 Prisma 类型的只读引用，不视为分层违规：

- **输入类型**：`Prisma.XXXUncheckedUpdateInput` 等——用于构造传给 repository 的 payload，避免重复定义 1:1 映射的 interface
- **异常类型**：`Prisma.PrismaClientKnownRequestError`——用于 catch 中做语义转换（§6.5 模式 #1），如唯一约束冲突 → 业务异常
- **枚举/常量**：Prisma schema 生成的 enum（如 `AuditStatusSnapshot`、`DocumentFamily`）——这些是领域概念的类型表达

**判定标准**：`import { Prisma } from '...'` 或 `import { SomeEnum } from '...'` 本身不违规；**注入 `PrismaService` 或调用 `prisma.*` 方法**才违规。简单说：**type-only 引用 OK，runtime 依赖禁止**。

### 2.4 过渡期处理

当前 25 个 service 文件存在 Prisma import 和直接事务执行。这些属于历史存量，在重构前允许存在，但：

- **新增代码不得引入新的分层违规**
- 修改现有文件时，如果改动涉及 Prisma 调用，应在同一 PR 中将该调用下沉到 repository

---

## 3. 模块边界（Module Boundaries）

### 3.1 跨模块通信规则


| 允许                          | 禁止                               |
| --------------------------- | -------------------------------- |
| 注入其他模块 **exported service** | 注入其他模块 repository                |
| 使用 shared/ 下的公共类型           | import 其他模块 infrastructure/ 下的文件 |
| 通过 EventEmitter 发事件         | 直接调用其他模块的 private 方法             |


### 3.2 模块依赖方向

```text
                ┌──────────┐
                │  shared/ │
                └─────┬────┘
                      │ (所有模块可依赖)
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
┌────────────┐ ┌───────────┐ ┌─────────────┐
│ master-data│ │ approval  │ │ auth/rbac/  │
│            │ │           │ │ session     │
└─────┬──────┘ └─────┬─────┘ └─────────────┘
      │               │
      ▼               ▼
┌─────────────────────────────┐
│       inventory-core        │  (唯一库存写入口)
└──────────────┬──────────────┘
               │
    ┌──────────┼──────────┬────────────┐
    ▼          ▼          ▼            ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌──────────┐
│inbound│ │ sales │ │workshop- │ │rd-project│
│       │ │       │ │material  │ │          │
└───────┘ └───────┘ └──────────┘ └────┬─────┘
                                      │ (仅通过 service)
                                      ▼
                                ┌──────────────┐
                                │rd-subwarehouse│
                                └──────────────┘

┌───────────┐
│ reporting │ ──→ inventory-core (只读), master-data (只读)
└───────────┘

┌──────────────┐
│ ai-assistant │ ──→ reporting, master-data, inventory-core (只读)
└──────────────┘
```

**核心原则**：

- 箭头只能向下或同层，不能向上
- 上层模块只通过 service 接口访问下层
- `inventory-core` 是唯一库存写入口，任何模块不得绕过它直接写库存表
- `reporting` 和 `ai-assistant` 是只读消费者，不得触发写操作

### 3.3 Module 导出规则

- `*.module.ts` 的 `exports` 只允许 service，**不允许导出 repository**
- 如果其他模块需要某个查询能力，应在 service 上暴露查询方法

### 3.4 已知违规（审计基线）

- `rd-subwarehouse` 直接注入 `RdProjectRepository`（应改为通过 `RdProjectService`）— **待修复，存在 rd-project ↔ rd-subwarehouse 双向模块依赖，需先解耦后才能改为 service 注入**
- ~~`approval.module.ts` 导出 `ApprovalRepository`~~ — **已修复**（2026-04-22，移除 exports 中的 ApprovalRepository）

---

## 4. 单一职责与文件治理（Single Responsibility）

### 4.1 量化阈值


| 指标            | 阈值        | 处置                          |
| ------------- | --------- | --------------------------- |
| 文件行数          | **500 行** | 超过即为违规，必须拆分                 |
| 单个方法/函数       | **80 行**  | 超过应提取为独立方法或协作者              |
| 构造函数依赖注入数（普通 service） | **5 个**   | 超过表明职责过多，应拆分 service        |
| 构造函数依赖注入数（facade）     | **不限**    | facade 注入子 service 是其职责，不计违规 |
| 类的 public 方法数 | **15 个**  | 超过应按职责域拆分为多个 service        |
| 方法参数数         | **5 个**   | 超过应封装为 command/query object |

**facade 的判定标准**：文件 < 300 行，class 内所有 public 方法均为单行委托（`return this.xxxService.xxx(...)`），不含 `if`/`for`/`switch` 等业务逻辑分支。满足此条件的 service 免于构造函数依赖数检查。Facade 可因 DTO import 和大量委托方法而达到 200–300 行，这是正常的——判定依据是"是否含业务逻辑"，而非行数本身。


### 4.2 God Object 识别标准

满足以下**任一**条件即判定为 God Object（**facade 豁免**：满足 §4.1 facade 判定标准的文件不计入）：

1. 构造函数注入 ≥ 5 个依赖（facade 除外）
2. 文件超过 800 行
3. 同一个 class 处理 3 个以上互不相关的业务职责域

### 4.3 拆分原则

- **application 层**：按 use case（用例）拆分。一个 service 文件承担一个业务用例族。
  - 示例：`SalesService` → `SalesOutboundService` + `SalesReturnService`
- **infrastructure 层**：按聚合根或读模型来源拆分。
  - 示例：`ReportingRepository` → `MonthlyReportRepository` + `HomeMetricsRepository`
- **spec 文件**：跟随生产代码拆分。当 service 被拆为多个文件时，spec 也应对应拆分。

**拆分不得恶化其他指标**。拆分前后必须对比：

| 指标 | 拆分前 | 拆分后要求 |
| ---- | ------ | ---------- |
| 文件行数 | 超标 | 每个子文件 ≤ 500 |
| 构造函数依赖总数 | N | 子 service 各自 ≤ 5（共享依赖通过 shared service 收拢，不重复注入） |
| 分层违规 | M 个 PrismaService 注入 | ≤ M（不允许因拆分而增加 PrismaService 注入数） |

**共享依赖收拢模式**：当多个子 service 都需要相同的外部依赖（如 `PrismaService`、`MasterDataService`、`InventoryService`），应由 shared service 统一持有事务协调，子 service 只注入 shared service。参照 `InboundSharedService` 的设计意图——但当前实现未贯彻此原则（子 service 仍各自注入 PrismaService）。

### 4.4 Facade 模式与拆分善后

拆分后，**是否保留原文件**取决于外部消费者：

| 拆分类型 | 原文件是否有外部消费者 | 处理方式 |
| -------- | -------------------- | -------- |
| application service | 是（controller、module exports、跨模块注入） | 保留为 facade（薄代理，< 100 行），委托给子 service |
| infrastructure repository | 否（§3.3 禁止导出 repository，消费者只有本模块 service） | **删除原文件**，service 直接 import 具体 repository |
| domain helper / util | 视情况 | 如果原名被外部引用则保留 re-export，否则删除 |

**判定标准**：拆分完成后，对原文件执行 `rg "from.*<原文件名>" src/ -l`。如果结果为空（零消费者），直接删除。不允许留下只有 re-export 的空壳文件。

**禁止的反模式**：
- 纯 re-export barrel 文件（只有 `export { ... } from "./xxx"`，无业务逻辑）——这不是 facade，是死代码
- Facade 中包含业务逻辑——facade 只做委托，逻辑必须在子 service 中

### 4.5 新增代码的默认行为

- 新增功能不得追加到已超过 400 行的文件
- 新增 use case 应创建独立 service 文件
- 如果一个 PR 会让某文件超过 500 行，该 PR 必须同时包含拆分
- **禁止创建无语义命名的"万能抽屉"文件**：`utils.ts` / `helpers.ts` / `common.ts` / `misc.ts` 等一律不予通过。工具函数必须归属到明确的领域子目录（如 `<module>/domain/`、`shared/domain/`、`shared/infrastructure/`），并以职责命名（例：`decimal-precision.util.ts`、`business-document-ref.factory.ts`）。
- **Rule of Three（抽取阈值）**：同一段逻辑出现 **< 3 次** 时保持内联重复，不预先抽取。仅当出现 ≥ 3 次且语义一致、变更节奏同步时，才抽取为共享函数/VO。依据：Martin Fowler《Refactoring》——过早抽象的成本（错误的接口、虚假的耦合）高于重复的成本。

---

## 5. 领域建模（Domain Modeling）

### 5.1 数据团簇（Data Clump）识别与封装

当 3 个以上字段总是一起出现在多个方法签名或接口定义中时，应提取为 Value Object。

**已识别的数据团簇**：


| 团簇                                          | 出现频次 | 建议封装                       |
| ------------------------------------------- | ---- | -------------------------- |
| businessDocumentType + Id + Number + LineId | 20+  | `BusinessDocumentRef`      |
| materialCategoryId/Code/Name/PathSnapshot   | 10+  | `MaterialCategorySnapshot` |
| stockScope + workshopId + stockScopeId      | 15+  | `StockScopeContext`        |


**封装位置**：`src/shared/domain/` 或所属模块的 `domain/` 目录。

### 5.2 Value Object 引入时机

- 同一组字段在 **3 个以上方法** 间传递时
- 同一组字段需要 **校验逻辑**（如 Decimal 精度、非空约束）时
- 同一组字段在 **跨模块** 传递时（应放入 shared/domain/）

### 5.3 贫血模型改善方向

当前所有业务模块使用贫血模型（service 持有全部逻辑，entity 只是数据容器）。改善方向：

1. **短期**：通过 Value Object 封装数据团簇，减少参数传递
2. **中期**：对核心聚合（如 InventoryBalance、StockInOrder）引入 domain entity，将不变量校验移入 entity
3. **长期**：将复杂状态机（如 RdMaterialStatus）封装为 domain service + entity 协作

改善应渐进式，不做一次性大重写。每次触及相关代码时小步改进。

---

## 6. 复杂度控制（Complexity Control）

### 6.1 嵌套深度

- 条件/循环嵌套不超过 **3 层**
- 超过 3 层时必须提取为独立方法、使用 guard clause（early return）或管道化处理

### 6.2 Guard Clause 优先

```typescript
// 禁止
async createOrder(dto: CreateOrderDto) {
  if (dto.lines.length > 0) {
    if (dto.lines.every(l => l.quantity > 0)) {
      // ...200 行业务逻辑
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
  if (!dto.lines.every(l => l.quantity > 0)) throw new BadRequestException("...");
  // ...业务逻辑（无额外嵌套）
}
```

### 6.3 Switch/Map 替代长 if-else 链

当条件分支超过 3 个时，应使用 Map/Record 查表或策略模式替代。

### 6.4 Prisma 查询复杂度

- 嵌套 `include/select` 不超过 **3 层**
- 超过时应拆分为多次查询或使用 raw SQL
- `Promise.all` 并行查询不超过 **5 个**，超过时应评估是否存在 N+1 或数据模型问题

### 6.5 异常处理边界

**禁止"以防万一"的 try-catch**。`catch` 块只有在满足以下至少一个目的时才允许存在：

1. **语义转换**：将底层异常转为领域异常（如 `PrismaClientKnownRequestError` → `BusinessConflictException`）
2. **有意义的降级**：catch 后返回可接受的 fallback 值，并记录 warn 级日志
3. **资源清理**：配合 `finally` 释放连接、文件句柄等
4. **边界捕获**：在消息消费者、定时任务入口等"顶层"防止进程崩溃，必须记录 error 级日志

**明确禁止的反模式**：

```typescript
// 禁止：吞掉异常
try { await doSomething(); } catch (e) { /* ignore */ }

// 禁止：log + rethrow（NestJS 全局过滤器已统一处理）
try { await doSomething(); } catch (e) { this.logger.error(e); throw e; }

// 禁止：catch 后抛出相同异常（等同于没写）
try { await doSomething(); } catch (e) { throw e; }
```

**默认行为**：让异常冒泡到 NestJS 全局 `ExceptionFilter`，由框架统一转换为 HTTP 响应。Controller / Service 默认不写 try-catch。

---

## 7. 质量门禁（Quality Gates）

### 7.1 当前门禁链

```text
pre-commit (lint-staged)
  └── biome check --write（仅暂存文件，格式 + lint）

commit-msg
  └── commitlint（提交信息格式）

pre-push (verify)
  └── prisma generate → typecheck → test
```

### 7.2 门禁应覆盖的检查项


| 检查项                            | 当前状态               | 目标状态                    |
| ------------------------------ | ------------------ | ----------------------- |
| 代码格式 (biome format)            | pre-commit ✓       | 不变                      |
| Lint 规则 (biome lint)           | pre-commit ✓       | 不变                      |
| 文件行数 (noExcessiveLinesPerFile) | **warn 级别，不阻断**    | error 级别，阻断             |
| 拆分残留检测 (dead barrel)           | PostToolUse hook ✓ | 不变                      |
| TypeScript 类型检查                | pre-push ✓         | 不变                      |
| 单元测试                           | pre-push ✓         | 不变                      |
| 文件行数扫描 (lint:src-lines)        | **--no-error，不阻断** | 纳入 verify，移除 --no-error |
| 跨模块 import 检查                  | PostToolUse hook ✓ | 不变                      |
| 构造函数依赖数检查                      | PostToolUse hook ✓（⚠️ warn 级） | 待评估是否升级为 error      |


### 7.3 Agent 执行前自检清单

Agent 在提交代码前必须通过以下检查：

```bash
bun run lint          # zero errors
bun run typecheck     # zero errors
bun run test          # all pass
bun run lint:src-lines  # zero violations (500 line threshold)
```

### 7.4 Code Review 检查维度

无论人工还是 agent review，必须覆盖：

1. **分层合规** — 是否有新的 Prisma import 进入 application 层？
2. **边界合规** — 是否有跨模块 repository 注入？
3. **体积合规** — 文件是否超 500 行？方法是否超 80 行？
4. **复杂度合规** — 是否存在 4 层以上嵌套？
5. **测试覆盖** — 新增用例是否有对应测试？
6. **命名一致性** — 是否符合模块命名约定？

---

## 8. 审计基线（2026-04-23 快照，第三次更新）

记录当前已知违规的量化数据，用于跟踪改善趋势。

### 8.1 文件行数违规（> 500 行）

- **违规文件数**：7（较上次 13 减少 6，较初始 23 减少 16，↓70%）
- **完整违规列表**：
  - `inventory-core/application/inventory.service.spec.ts` — 1724 行（spec，因新增 FactoryNumberRepository mock 略增）
  - `inventory-core/application/inventory.service.ts` — 1635 行（唯一剩余 God Object）
  - `rd-project/application/rd-project.service.ts` — 1502 行（高耦合核心）
  - `rd-subwarehouse/application/rd-material-status.helper.ts` — 1007 行（高耦合核心）
  - `inbound/application/inbound.service.spec.ts` — 908 行（spec）
  - `rd-project/application/rd-project-material-action.service.ts` — 650 行（高耦合核心）
  - `rd-subwarehouse/application/rd-handoff.service.ts` — 541 行（高耦合核心）
- **本轮消除的违规（共 6 个）**：
  - ~~`rbac/infrastructure/in-memory-rbac.repository.ts` — 2391~~ → 拆为 rbac-persistence / rbac-resource / rbac-user / rbac-dict-config / rbac-routes / rbac-seed-repair + rbac-state（最大 489 行）
  - ~~`reporting/infrastructure/reporting.repository.ts` — 2165~~ → 拆为 monthly-report / monthly-material-category / monthly-report-adjustment / monthly-report-rd / home-metrics / inventory-reporting + reporting-repository.helpers（最大 500 行）
  - ~~`rd-project/application/rd-project.service.spec.ts` — 760~~ → 拆为 rd-project-actions.spec + rd-project-master.spec + rd-project-material-action.spec + spec-helpers（最大 443 行）
  - ~~`rd-subwarehouse/application/rd-stocktake-order.service.spec.ts` — 515~~ → 精简至 434 行
  - ~~`reporting/application/reporting.service.ts` — 620~~ → 提取 date/timezone 工具到 domain/reporting-date.util.ts（490 行）
  - ~~`inventory-core/infrastructure/inventory.repository.ts` — 536~~ → 提取 FactoryNumberRepository（431 行）
- **历史已消除（共 10 个，前两轮 facade 拆分）**：
  - ~~`sales/application/sales.service.ts` — 1738~~ → facade 58 + 6 子 service
  - ~~`sales/application/sales.service.spec.ts` — 1125~~ → 4 spec
  - ~~`workshop-material/application/workshop-material.service.ts` — 1495~~ → facade 112 + 5 子 service
  - ~~`workshop-material/application/workshop-material.service.spec.ts` — 1391~~ → 5 spec
  - ~~`reporting/application/monthly-reporting.service.ts` — 2106~~ → facade 121 + 7 子 service
  - ~~`reporting/application/monthly-reporting.service.spec.ts` — 695~~ → 4 spec
  - ~~`inbound/application/inbound.service.ts` — 1106~~ → facade 63 + 4 子 service + shared + domain helper
  - ~~`sales-project/application/sales-project.service.ts` — 745~~ → facade 70 + 4 子 service
  - ~~`rbac/application/system-management.service.ts` — 721~~ → facade 91 + 3 子 service

### 8.2 分层违规（application 层 PrismaService 注入）

- **违规文件数**：约 21（仅统计注入 `PrismaService` 或直接调用 `prisma.*` 的生产文件）
- **主要模式**：注入 `PrismaService`、调用 `this.prisma.*` 或 `tx.*` 执行查询/事务
- **不计为违规**：仅 import `Prisma` 类型（如 `Prisma.XXXUncheckedUpdateInput`）、Prisma 生成的 enum、`PrismaClientKnownRequestError` 异常类型（见 §2.3.1 豁免）
- **下一步**：按模块逐个下沉 Prisma 调用到 repository，每个模块一个独立 PR

### 8.3 模块边界违规

- **跨模块 Repository 注入**：2 处（rd-subwarehouse → RdProjectRepository）— **阻塞原因**：rd-project ↔ rd-subwarehouse 存在双向 Module 依赖（rd-project imports RdSubwarehouseModule，rd-subwarehouse 的 service 注入 RdProjectRepository），直接改为 service 注入会形成 NestJS 循环依赖。需先解耦模块依赖方向。
- **Repository 导出**：~~2 处~~ → **0 处**（~~approval~~ 已修复；rd-subwarehouse 本身未导出 repository，只是在 providers 中注册了外模块 repository——这是 providers 复制粘贴的变体）

### 8.4 God Object

| Service          | 行数   | 构造函数依赖 | 判定   |
| ---------------- | ---- | ------ | ---- |
| InventoryService | 1635 | 5      | 行数超标 + 依赖达阈值 |

- **已消除（共 6 个）**：SalesService、WorkshopMaterialService、MonthlyReportingService、InboundService、SalesProjectService、SystemManagementService
- **RdProjectService**（1502 行）不再计为 God Object——它已有 `RdProjectMaterialActionService` 分担部分职责，且构造函数依赖数 = 5（边界）。但行数仍超 500，属于文件行数违规。
- God Object 从 5 个降至 **1 个**（↓80%）

### 8.5 趋势跟踪

每次执行 `bun run lint:src-lines --json` 可获取最新数据。建议每月或每个大版本后更新本节基线数字。

### 8.6 后续治理路线图

以下任务按优先级排序，供后续 agent 或人工开展：

#### P1：rd-project ↔ rd-subwarehouse 双向依赖解耦

- **现状**：`rd-project.module.ts` imports `RdSubwarehouseModule`（因为 RdProjectService 注入 RdProcurementRequestService）；`rd-subwarehouse.module.ts` 在 providers 中注册了 `RdProjectRepository`（绕过模块边界直接注入）。
- **目标**：消除双向依赖，让 rd-subwarehouse 通过 RdProjectService 访问 rd-project 数据。
- **建议方案**：
  1. 将 `RdProcurementRequestService` 提取到独立的 `rd-procurement` 模块，同时被 rd-project 和 rd-subwarehouse 依赖（共享层下沉）
  2. 或使用 NestJS `forwardRef`（最小改动但引入循环依赖代码味道）
  3. 或用 EventEmitter 反转调用方向（rd-project 发事件，rd-subwarehouse 监听）
- **前置条件**：需要人工决策方案选型
- **影响文件**：`rd-project.module.ts`、`rd-subwarehouse.module.ts`、`rd-handoff.service.ts`、`rd-stocktake-order.service.ts` 及对应 spec

#### P2：InventoryService 拆分（唯一剩余 God Object）

- **现状**：1635 行，5 个构造函数依赖（含新增的 FactoryNumberRepository）。是 inventory-core 模块的核心写入口。
- **风险**：被 sales、workshop-material、inbound、rd-project、rd-subwarehouse 等几乎所有模块依赖。拆分需要非常谨慎。
- **建议方向**：按操作类型拆分（increaseStock / decreaseStock / reverseStock / getBalance 等），保留 facade。
- **前置条件**：需要 Read 完整的 inventory.service.ts 和所有调用方，理解每个方法的消费者。

#### ~~P3：Infrastructure 层大文件拆分~~ ✅ 已完成

- ~~`in-memory-rbac.repository.ts`（2391 行）~~ → 已拆为 6+ 文件（最大 489 行）
- ~~`reporting.repository.ts`（2165 行）~~ → 已拆为 6 文件（最大 500 行）
- ~~`inventory.repository.ts`（536 行）~~ → 已提取 FactoryNumberRepository（431 行）

#### P4：application 层 PrismaService 下沉

- **现状**：约 21 个 application 层生产文件注入 PrismaService 并直接执行数据库查询/事务（仅 type import 已按 §2.3.1 豁免，不计入）。
- **方法**：每个模块独立 PR，把 `this.prisma.runInTransaction` 和直接 Prisma 查询下沉到 repository 方法。
- **参照**：master-data 模块已完成此项（application 层零 Prisma import）。
- **建议顺序**：从最小模块开始（approval → sales-project → sales → inbound → workshop-material → rd-* → inventory-core）。

#### P5：Spec 文件拆分

- 3 个 spec 文件超 500 行（最大 1724）。
- 优先级最低——测试代码的行数违规不影响生产代码质量。
- 随对应生产代码重构时顺手拆分即可。

---

## 附录 A：正面案例

### master-data 模块拆分

`master-data` 模块已完成 service 拆分，是当前仓库的最佳实践参考：

```text
master-data/application/
├── master-data.service.ts        (facade, 269 行, 注入 8 个子 service)
├── customer.service.ts           (167 行, 注入 1 个 repository)
├── material.service.ts           (170 行, 注入 1 个 repository)
├── material-category.service.ts  (< 200 行)
├── supplier.service.ts           (168 行)
├── personnel.service.ts          (< 100 行)
├── workshop.service.ts           (< 100 行)
├── stock-scope.service.ts        (< 100 行)
└── field-suggestions.service.ts  (< 100 行)
```

**关键模式**：

- 原 MasterDataService 保留为 facade，只做委托
- 每个子 service 只注入 1 个 repository，职责单一
- Controller 和 DTO 保持不变，模块对外接口稳定
- Spec 文件对应拆分为 `customer.service.spec.ts` 等

### sales 模块拆分（2026-04-22）

```text
sales/application/
├── sales.service.ts                  (facade, 58 行)
├── sales-outbound.service.ts         (393 行)
├── sales-outbound-update.service.ts  (495 行)
├── sales-return.service.ts           (473 行)
├── sales-return-source.service.ts    (141 行)
├── sales-snapshots.service.ts        (227 行)
└── sales-traceability.service.ts     (175 行)
```

**关键决策**：updateOrder 单独 419 行，无法与 create/void 合入同文件，故拆为独立 service。SnapshotsService 和 TraceabilityService 被 3 个消费者共享（Rule of Three），合理抽取。

### workshop-material 模块拆分（2026-04-22）

```text
workshop-material/
├── application/
│   ├── workshop-material.service.ts              (facade, 112 行)
│   ├── workshop-material-pick.service.ts         (411 行)
│   ├── workshop-material-return.service.ts       (469 行)
│   ├── workshop-material-scrap.service.ts        (468 行)
│   ├── workshop-material-shared.service.ts       (408 行)
│   └── workshop-material-return-helpers.service.ts (283 行)
└── domain/
    └── workshop-material-order-type.helper.ts    (42 行)
```

**关键决策**：按 OrderType（PICK/RETURN/SCRAP）拆分，每种类型独立 service。`toOperationType`/`toCreateDocumentPrefix` 纯函数移到 domain/ 层。

### monthly-reporting 模块拆分（2026-04-22）

```text
reporting/application/
├── monthly-reporting.service.ts                  (facade, 121 行)
├── monthly-report-catalog.service.ts             (132 行)
├── monthly-report-domain-aggregator.service.ts   (344 行)
├── monthly-report-domain-summary.service.ts      (287 行)
├── monthly-report-export.service.ts              (408 行)
├── monthly-report-item-mapper.service.ts         (197 行)
├── monthly-report-material-category.service.ts   (312 行)
├── monthly-report-source.service.ts              (412 行)
└── monthly-reporting.formatters.ts               (241 行, 共享格式化工具)
```

**关键决策**：按 topic/视图维度拆分。格式化工具集中到 formatters.ts 而非分散到各 service。

### inbound 模块拆分（2026-04-22）

```text
inbound/
├── application/
│   ├── inbound.service.ts                             (facade, 63 行)
│   ├── inbound-acceptance-creation.service.ts         (150 行)
│   ├── inbound-acceptance-update.service.ts           (217 行)
│   ├── inbound-production-receipt-creation.service.ts (90 行)
│   ├── inbound-production-receipt-update.service.ts   (185 行)
│   └── inbound-shared.service.ts                      (341 行)
└── domain/
    └── inbound-order-type.helper.ts                   (24 行)
```

**关键决策**：原 service 按 `StockInOrderType` × use case 双维度拆分：ACCEPTANCE 和 PRODUCTION_RECEIPT 各自分 creation + update 两个 service，因为 updateOrder 逻辑极重（400+ 行）。共享校验/快照构建/采购需求关联逻辑集中到 InboundSharedService。

### sales-project 模块拆分（2026-04-22）

```text
sales-project/application/
├── sales-project.service.ts                  (facade, 70 行)
├── sales-project-lifecycle.service.ts        (362 行)
├── sales-project-material-view.service.ts    (233 行)
├── sales-project-outbound-draft.service.ts   (106 行)
└── sales-project-reference.service.ts        (93 行)
```

**关键决策**：`SalesProjectBindingReference` type 从 facade 通过 `export { type ... }` re-export，保持外部 consumer（sales 模块）零改动。MaterialViewService 提供 `requireProject` + `buildProjectView`，被 Lifecycle 和 OutboundDraft 共用。

### rbac/system-management 模块拆分（2026-04-22）

```text
rbac/application/
├── system-management.service.ts    (facade, 91 行)
├── system-user.service.ts          (91 行, 用户 CRUD + 密码/状态/授权)
├── system-resource.service.ts      (79 行, 角色/菜单/部门/岗位)
└── system-dict-config.service.ts   (71 行, 字典/参数/公告)
```

**关键决策**：原 service 是"宽而浅"的 God Object（60+ 个公开方法，但每个方法只有 1-5 行纯委托）。按 RBAC 领域域分 3 组：User（需要 SessionService 做 session 失效）、Resource（需要 SessionService 做角色 session 失效）、DictConfig（不需要 SessionService）。CSV 导出 helper 因 Rule of Three（3+ 子 service 各自需要）保持内联重复，未抽取到共享层。

---

## 附录 B：判定速查表


| 问题                                     | 判定标准                                             | 行动                        |
| -------------------------------------- | ------------------------------------------------ | ------------------------- |
| 新文件该放 application/ 还是 infrastructure/? | 是否 import Prisma/Redis/外部 SDK？是 → infrastructure | 按层归类                      |
| 是否需要新建 service？                        | 现有 service 已有 5+ 依赖或 400+ 行？是 → 新建               | 按 use case 拆分             |
| 跨模块需要数据怎么办？                            | 对方 module exports 里有合适的 service 方法吗？             | 有 → 注入 service；无 → 请求对方新增 |
| 一组字段总是一起出现？                            | 出现 3+ 次？                                         | 封装为 Value Object          |
| 方法太长？                                  | > 80 行                                           | 提取子方法或创建 helper           |

