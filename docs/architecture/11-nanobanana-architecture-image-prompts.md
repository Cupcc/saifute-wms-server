# Nanobanana 架构图需求与提示词清单

## 1. 文档目的

本文件不是架构真源，而是给 `Nanobanana` 生成高质量架构图时使用的提示词工作单。真实边界仍以下列文档为准：

- `docs/requirements/PROJECT_REQUIREMENTS.md`
- `docs/architecture/00-architecture-overview.md`
- `docs/architecture/10-architecture-views.md`

使用方式：

- 先按本文件生成第一版图。
- 再人工检查术语、箭头方向、仓别语义和模块命名。
- 若 `Nanobanana` 的文本细节不够稳，保留图形构图，用 `Figma` 或 `Keynote` 人工补字。

## 2. 先画哪些图

当前最值得生成的图，控制在 `7` 张：

| 优先级 | 图名 | 主要用途 | 面向谁 | Nanobanana 适配度 |
| --- | --- | --- | --- | --- |
| `P0` | 系统全景与模块分层图 | 建立全局共识 | 架构评审 / 新人理解 | `高` |
| `P0` | 库存真实范围与归属维度分离图 | 冻结最关键边界 | 架构评审 | `高` |
| `P0` | RD 小仓协同与 RD handoff 图 | 解释最特殊业务链路 | 架构评审 / 业务评审 | `高` |
| `P1` | 库存事务写路径图 | 解释 `inventory-core` 唯一写入口 | 架构评审 | `中` |
| `P1` | 报表与 AI 只读聚合图 | 解释读写边界 | 架构评审 / 管理沟通 | `高` |
| `P1` | 运行时容器与基础设施图 | 解释部署与集成边界 | 架构评审 / 对外汇报 | `高` |
| `P2` | 对外汇报版业务闭环总览图 | 用于老板/管理层快速理解 | 对外汇报 / 管理沟通 | `高` |

## 3. 统一全局风格提示

以下内容建议作为每张图的公共前缀提示词：

```text
请生成一张企业级仓储管理系统架构信息图。16:9 横版，浅色背景，蓝灰色系，少量强调色。整体简洁、专业、分层清楚，适合架构评审和汇报。

图中术语必须贴合本系统：MAIN 主仓、RD_SUB 研发小仓、inventory-core、approval、project、reporting、ai-assistant、RD handoff。不要擅自发明新的仓库、模块或基础设施。

如果文字渲染不稳定，优先保证构图关系、层级和箭头方向正确。
```

统一负向约束：

```text
避免科幻风、3D 炫技、无关云原生元素、开放式多仓网络，以及会误导系统边界的装饰。
```

## 4. 架构评审用图

### 4.1 系统全景与模块分层图

- 用途：第一次讲清楚这是一个 `NestJS` 单体 + 模块化架构，不是微服务拼盘。
- 必须包含：
  - `Web 管理端`
  - `NestJS 单体服务`
  - 平台与共享核心：`auth / session / rbac / system-management / audit-log / master-data / inventory-core / approval`
  - 业务域：`inbound / customer / workshop-material / project / rd-subwarehouse`
  - 分析与辅助：`reporting / ai-assistant`
- 建议构图：
  - 上到下三层或左到右三层。
  - 中间突出 `inventory-core` 与 `approval` 是横切共享核心。
  - `reporting / ai-assistant` 作为右侧只读/辅助区域。
- 风格要求：
  - 结构感强，不要画成杂乱的应用市场拼贴。
  - 模块块面规整，颜色按层次分组，不按“每个模块一个颜色”。
- 避免误导：
  - 不要画成多服务独立部署。
  - 不要暗示 `ai-assistant` 可以直接写业务数据。
- Nanobanana 提示词：

```text
生成“Saifute WMS NestJS 单体系统全景与模块分层图”。顶部是 Web 管理端，向下连接 NestJS 单体服务。单体内部清晰分为三组：平台与共享核心（auth, session, rbac, system-management, audit-log, master-data, inventory-core, approval），业务域（inbound, customer, workshop-material, project, rd-subwarehouse），分析与辅助（reporting, ai-assistant）。请突出 inventory-core 是所有库存写入的唯一入口，approval 是轻量审核共享域；reporting 和 ai-assistant 放在右侧或下侧，表达为只读辅助层，不直接写业务事实。不要画成微服务架构。
```

### 4.2 库存真实范围与归属维度分离图

- 用途：这是最重要的一张边界图，专门防止把 `workshop`、`project`、`department` 错画成库存池。
- 必须包含：
  - 两个真实库存范围：`MAIN`、`RD_SUB`
  - `inventory-core` 作为唯一库存写入口
  - 业务单据家族：`inbound / customer / workshop-material / project / rd-subwarehouse`
  - 归属维度：`department`、`workshop`、`project / allocation_target`
- 建议构图：
  - 左边“业务单据”，中间“inventory-core”，右边“真实库存范围”。
  - 底部或侧边单独放“归属/组织/核算维度”，用虚线或淡色表达“附加维度，不进入库存唯一键”。
- 风格要求：
  - 这是规则图，不是业务流程图。
  - 必须让 `MAIN / RD_SUB` 在视觉上比 `workshop / project` 更像真实库存落点。
- 避免误导：
  - 不要出现第三个物理仓。
  - 不要让 `project` 看起来像独立仓库。
  - 不要画出车间库存余额。
- Nanobanana 提示词：

```text
生成一张“真实库存范围 vs 归属维度分离”架构规则图。左侧是一组业务单据模块：inbound、customer、workshop-material、project、rd-subwarehouse，所有箭头汇聚到中央的 inventory-core，inventory-core 再只连接到右侧两个真实库存范围 MAIN 主仓 和 RD_SUB 研发小仓。请在画面下方或侧边单独放一个淡色区域，标注 department、workshop、project / allocation_target，这些只是组织、归属、核算维度，不是库存池，不进入库存唯一键。请明确表达 MAIN 和 RD_SUB 才是真实库存落点，workshop 和 project 只是附加语义。不要出现第三个物理仓或车间库存池。
```

### 4.3 RD 小仓协同与 RD handoff 图

- 用途：解释本项目最特别、最容易被误解的链路。
- 必须包含：
  - `RD 小仓管理员`、`采购人员`、`仓库管理员`
  - `RD 采购需求`
  - `主仓验收入 MAIN`
  - `RD handoff`
  - `MAIN -> RD_SUB`
  - `来源桥接 / 成本不断链`
  - `项目领用发生在 RD_SUB`
- 建议构图：
  - 横向业务链最清楚：`需求 -> 采购 -> 主仓验收 -> RD handoff -> RD_SUB 使用`
  - 关键节点上方可放角色，下方可放系统模块：`rd-subwarehouse / inbound / inventory-core / project`
- 风格要求：
  - 这张图应兼顾业务和系统，不要只画 IT 方框。
  - 可以少量使用强调色突出 `RD handoff` 与“来源桥接”。
- 避免误导：
  - 不要画成 RD 直接外部采购入小仓。
  - 不要画成项目直接从 `MAIN` 使用物料。
- Nanobanana 提示词：

```text
生成一张“RD 小仓协同与 RD handoff”业务架构图。画面横向展开：研发小仓管理员提出 RD 采购需求，采购人员推进采购，仓库管理员基于需求完成主仓验收入 MAIN，随后创建 RD handoff，由 inventory-core 完成 MAIN 减少、RD_SUB 增加，并保持来源桥接和成本不断链，最后项目领用发生在 RD_SUB。请在关键节点旁标注 rd-subwarehouse、inbound、inventory-core、project。必须明确：外部到货先入 MAIN，不允许直接进入 RD_SUB；项目实际使用仓别固定在 RD_SUB。
```

### 4.4 库存事务写路径图

- 用途：说明为什么单据模块不能直接改库存。
- Nanobanana 适配度：`中`
- 原因：
  - 它适合画成“评审版泳道信息图”，但不适合要求像 `UML sequence diagram` 那样逐步精确。
- 必须包含：
  - `业务用户`
  - `单据模块`
  - `master-data`
  - `inventory-core`
  - `approval`
  - `MySQL`
  - `audit-log`
  - 同事务提交与异步审计的区别
- 建议构图：
  - 用 5 到 7 条纵向泳道，按“提交 -> 校验 -> 库存副作用 -> 审核投影 -> 提交 -> 审计”组织。
- 风格要求：
  - 更像高质量流程信息图，不强求严格 UML 符号。
- 避免误导：
  - 不要让 `approval` 先于库存成为生效前提。
  - 不要让 `audit-log` 看起来和库存落账同事务。
- Nanobanana 提示词：

```text
生成一张“库存事务写路径”泳道式架构流程图，适合技术评审而不是严格 UML。参与泳道包括：业务用户、单据模块、master-data、inventory-core、approval、MySQL、audit-log。流程应表现为：用户提交单据，单据模块先校验主数据和快照，再在事务内写主表和明细，调用 inventory-core 写 inventory_balance / inventory_log / inventory_source_usage，然后创建或重置 approval 审核投影，最后同事务提交，audit-log 作为异步审计记录。请明确 inventory-core 是库存唯一写入口，approval 不是库存生效前置闸门，audit-log 不是同事务主事实。
```

### 4.5 报表与 AI 只读聚合图

- 用途：防止后续把 `reporting` 或 `ai-assistant` 误做成写模型。
- 必须包含：
  - 事务真源：`inbound / customer / workshop-material / project / rd-subwarehouse / inventory-core / approval / master-data`
  - 只读层：`reporting`
  - 受控辅助层：`ai-assistant`
  - 输出：`首页 / 月报 / Excel 导出 / AI 问答`
- 建议构图：
  - 左边真源，右边输出，中间 `reporting` 与 `ai-assistant`。
  - `ai-assistant` 可画成受控工具层，而不是大模型主脑。
- 风格要求：
  - 信息图而不是“AI 魔法图”。
- 避免误导：
  - 不要画出 AI 直接向单据模块写回数据。
  - 不要把报表画成数据库真源。
- Nanobanana 提示词：

```text
生成一张“报表与 AI 只读聚合”企业架构图。左侧是一组事务真源模块：inbound、customer、workshop-material、project、rd-subwarehouse、inventory-core、approval、master-data；中间是 reporting 和 ai-assistant，其中 reporting 是只读聚合层，ai-assistant 是受控查询、解释、导航和预填辅助层；右侧是输出结果：首页看板、库存报表、月报、Excel 导出、AI 问答。请明确画出 reporting 从事务真源读取，ai-assistant 只能通过 reporting、master-data、inventory-core 做受控查询，不能直接写业务数据。不要把 AI 画成系统控制中心。
```

### 4.6 运行时容器与基础设施图

- 用途：解释系统实际运行边界，而不是业务语义。
- 必须包含：
  - `Web 前端 SPA`
  - `NestJS 单体应用`
  - `MySQL`
  - `Redis`
  - `Local File Storage /profile/**`
  - `OpenAI-compatible API`
- 建议构图：
  - 中央一个应用容器，外围几个外部依赖。
  - `REST / SSE`、`会话`、`本地文件`、`AI 接口` 这些关系可做简短标注。
- 风格要求：
  - 更偏 container diagram，而不是业务流程图。
- 避免误导：
  - 不要引入 `Kafka`、`Kubernetes`、`微服务`、`对象存储` 等当前没有的设施。
- Nanobanana 提示词：

```text
生成一张“Saifute WMS 运行时容器与基础设施图”。中心是 NestJS monolith application，顶部是 Web 前端 SPA，通过 REST / SSE 访问；外围连接 MySQL、Redis、Local File Storage（保留 /profile/** 语义）、OpenAI-compatible API。请体现 Redis 主要用于会话和认证相关状态，而不是通用消息队列；体现本地文件存储而不是对象存储平台；体现 ai-assistant 调用外部兼容 OpenAI 的接口。不要引入 Kubernetes、服务网格或消息总线。
```

## 5. 对外汇报 / 管理沟通用图

### 5.1 对外汇报版业务闭环总览图

- 用途：给老板、管理层或跨部门沟通时快速看懂“为什么系统这样设计”。
- 必须包含：
  - 主仓 `MAIN`
  - 研发小仓 `RD_SUB`
  - 入库、客户收发、车间物料、项目 / RD、报表
  - “所有库存统一经过 `inventory-core`”
  - “项目不是库存池”
- 建议构图：
  - 中心放 `inventory-core`
  - 周围是几类业务主题
  - `MAIN / RD_SUB` 作为两个真实库存实体
  - 适当加入简化的人物或业务角色图标，但保持克制
- 风格要求：
  - 更易懂、更有展示感，但仍保持企业专业度。
- 避免误导：
  - 不要为了“好看”把技术边界画错。
  - 不要把 `approval` 画成复杂审批流引擎。
- Nanobanana 提示词：

```text
请生成一张适合老板和管理层查看的“Saifute WMS 业务闭环总览架构图”。画面中央是 inventory-core，强调所有库存变化统一从这里落账。周围环绕几个主题：inbound 入库、customer 客户收发、workshop-material 车间物料、project / rd-subwarehouse 项目与研发小仓、reporting 报表与分析。请把 MAIN 主仓 和 RD_SUB 研发小仓作为两个真实库存实体清楚放在画面中，并明确 project 不是库存池，只是归集与成本语义。整体要易懂、简洁，适合管理汇报；不要错误暗示复杂 BPM 或多仓网络。
```

## 6. 不建议直接用 Nanobanana 生成的图

以下两类图不建议直接交给 `Nanobanana` 做最终成品：

### 6.1 精确数据库 ER 图

- 原因：
  - 这类图要求字段名、主外键、关系基数、表名完全准确。
  - 图像模型很容易把精确文本、线条关系和表结构画错。
- 建议：
  - 用 `Mermaid`、`dbdiagram`、`Figma`、`OmniGraffle` 之类工具产出精确版。
  - `Nanobanana` 只适合先出“风格参考图”，不适合作为最终 schema 交付物。

### 6.2 严格 UML 时序图

- 原因：
  - `inventory_balance`、`inventory_source_usage`、`approval_document` 这些精确节点和箭头时序，图像模型容易产生次序误差。
- 建议：
  - 评审时可以先用本文件第 `4.4` 节的“泳道式信息图”。
  - 真正要进设计评审包时，仍建议用 `Mermaid sequenceDiagram` 或手工矢量图重画。

## 7. 推荐生成顺序

如果只先生成 `3` 张，优先顺序如下：

1. `系统全景与模块分层图`
2. `库存真实范围与归属维度分离图`
3. `RD 小仓协同与 RD handoff 图`

如果可以生成到 `5` 张，再补：

4. `报表与 AI 只读聚合图`
5. `运行时容器与基础设施图`

如果要补齐完整评审包，再补：

6. `库存事务写路径图`
7. `对外汇报版业务闭环总览图`

推荐策略：

- 先用 `P0` 三张图锁定最关键业务边界。
- 再用 `P1` 两张图锁定读写边界和运行时边界。
- 最后再做展示型总览图，避免先做“好看图”却把关键边界画错。
