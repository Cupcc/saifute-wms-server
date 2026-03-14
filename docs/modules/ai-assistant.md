# `ai-assistant` 模块设计

## 模块目标与职责

负责 AI 对话、SSE 流式输出、工具调用编排、页面跳转和表单预填。该模块是对业务查询与动作建议的编排层，不直接承载核心领域规则。

## 原 Java 来源与映射范围

- `business/src/main/java/com/saifute/ai`
- 依赖 `stock`、`base`、`entry`、`out`、`take` 的查询服务

## 领域对象与核心用例

核心对象：

- `ChatSession`
- `ToolCallPlan`
- `PageNavigationCommand`
- `FormPrefillCommand`

核心用例：

- SSE 流式问答
- Function calling 工具编排
- 查询库存、预警、最近单据
- 返回页面跳转指令
- 返回新建单据预填参数

## Controller 接口草案

- `POST /ai/chat`
- `GET /ai/tools`

说明：

- `/ai/chat` 采用 SSE 或流式响应协议，事件格式必须兼容前端现有消费逻辑

## Application 层编排

- `StreamChatUseCase`
- `PlanToolCallsUseCase`
- `ExecuteToolCallsUseCase`
- `BuildNavigationCommandUseCase`
- `BuildPrefillCommandUseCase`

编排要点：

- 先构造系统提示和页面上下文
- 执行模型流式输出
- 收集 tool calls 并调用受控工具
- 将工具结果再次送回模型完成总结
- 对导航与预填类动作使用显式命令对象，而不是自由文本约定

## Domain 规则与约束

- AI 不直接写业务数据，只提供查询、建议和预填
- 工具调用必须有白名单
- 前端依赖的 SSE 事件名和载荷结构必须稳定
- 页面跳转与表单预填契约需版本化

## Infrastructure 设计

- AI Provider 采用 OpenAI 兼容接口抽象
- 使用流式 HTTP 客户端与 SSE 输出
- 工具执行层只调用模块公开查询服务，不越权直查底表
- 配置来源于环境变量或系统配置表

## 与其他模块的依赖关系

- 依赖 `reporting`
- 依赖 `inventory-core`
- 依赖 `master-data`
- 可按需读取 `inbound`、`outbound`、`workshop-material` 的查询接口

## 事务边界与一致性要求

- AI 查询流程无业务写事务
- 工具查询允许最终一致，但必须声明数据来源时间点

## 权限点、数据权限、审计要求

- AI 对话接口需要登录
- 工具执行结果受原业务模块权限与数据权限约束
- 对话与工具调用建议记录审计摘要，但不强制保存全文

## 待补测试清单

- SSE 协议兼容测试
- 工具白名单执行测试
- 页面跳转命令生成测试
- 表单预填命令生成测试

## 暂不实现范围

- 会话历史持久化
- 自主代理写业务数据
- 多模型路由优化
