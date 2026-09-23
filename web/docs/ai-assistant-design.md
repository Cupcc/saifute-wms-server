# WMS AI 智能助手 — 前端设计文档

> 本文档面向后端开发，说明前端 AI 助手的整体架构、请求/响应协议、以及后端需要做的适配工作。

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────┐
│                     前端 (Vue 3)                     │
│                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ AiChat   │───>│ SSE 请求     │───>│ 后端 API  │  │
│  │ Panel    │<───│ (流式响应)    │<───│ /ai/chat  │  │
│  └──────────┘    └──────────────┘    └───────────┘  │
│       │                                              │
│       │ action.type === 'openForm'                   │
│       ▼                                              │
│  ┌──────────┐    ┌──────────────┐                    │
│  │ aiAction │───>│ 业务页面     │                    │
│  │ Store    │    │ (验收单等)    │                    │
│  └──────────┘    └──────────────┘                    │
│                    │                                 │
│                    ▼                                 │
│              打开表单弹窗                             │
│              + 自动预填字段                           │
└─────────────────────────────────────────────────────┘
```

### 核心文件

| 文件 | 职责 |
|------|------|
| `src/components/AiAssistant/index.vue` | 浮动按钮 + 页面上下文映射 |
| `src/components/AiAssistant/AiChatPanel.vue` | 聊天面板 UI、SSE 消息处理、action 分发 |
| `src/api/ai/chat.js` | API 封装、SSE 解析、系统提示词 |
| `src/constants/formSchemas.js` | **表单字段 Schema 注册表**（核心） |
| `src/store/modules/aiAction.js` | 跨组件通信 Store（传递 formData） |
| `src/views/entry/order/index.vue` 等 | 业务页面，消费 action 并预填表单 |

---

## 二、请求协议

### 接口

```
POST /ai/chat
Content-Type: application/json
Authorization: Bearer {token}
响应: text/event-stream (SSE)
```

### 请求体

```json
{
  "systemPrompt": "你是一个专业的 WMS 智能助手...",
  "pageContext": "入库管理 - 验收单",
  "message": "创建验收单，从华东皮革进100个靴子",
  "history": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好，我是小仓..." }
  ],
  "formSchemas": {
    "/entry/order": {
      "formName": "验收单",
      "mainFields": {
        "supplierName": { "label": "供应商", "type": "string", "hint": "填写供应商名称，系统自动模糊匹配", "example": "华东皮革" },
        "workshopName": { "label": "关联部门", "type": "string", "hint": "填写部门或车间名称，系统自动匹配" },
        "attn": { "label": "经办人", "type": "string" },
        "chargeBy": { "label": "负责人", "type": "string" },
        "remark": { "label": "备注", "type": "string" }
      },
      "detailFields": {
        "materialName": { "label": "物料名称", "type": "string", "hint": "填写物料名称或编码，系统自动模糊搜索匹配", "required": true, "example": "靴子" },
        "quantity": { "label": "验收数量", "type": "number", "required": true, "example": "100" },
        "unitPrice": { "label": "单价", "type": "number", "hint": "可不填，系统会自动查询最近采购价" },
        "taxPrice": { "label": "含税价", "type": "number" },
        "remark": { "label": "明细备注", "type": "string" }
      },
      "hint": "主表字段放在 formData 顶层，明细行数据放在 formData.details 数组中，每个明细至少包含 materialName 和 quantity"
    },
    "/entry/intoOrder": { "formName": "入库单", "..." : "..." },
    "/take/pickOrder": { "formName": "领料单", "..." : "..." }
  }
}
```

### 各字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `systemPrompt` | string | 是 | AI 角色设定、功能地图、路由映射、回答要求 |
| `pageContext` | string | 是 | 用户当前所在页面的中文描述，如 `入库管理 - 验收单` |
| `message` | string | 是 | 用户本次输入的消息 |
| `history` | array | 是 | 最近 20 条对话历史 `[{role, content}]` |
| `formSchemas` | object | 是 | **前端表单字段定义**，key 为路由路径，value 为字段结构 |

---

## 三、formSchemas 详解

这是本次设计的核心。前端将所有支持 AI 预填的表单字段结构随请求发送，**后端需要将其注入 AI 的 prompt 中**，使 AI 能返回正确的 `formData`。

### Schema 结构

```json
{
  "/路由路径": {
    "formName": "表单中文名",
    "mainFields": {
      "字段名": {
        "label": "中文标签",
        "type": "string | number | date",
        "hint": "填写提示（可选）",
        "required": false,
        "example": "示例值（可选）"
      }
    },
    "detailFields": {
      "字段名": { "..." : "..." }
    },
    "hint": "整体填写说明"
  }
}
```

### 当前支持的 3 种表单

| 路由 | 表单名 | 主表字段 | 明细字段 |
|------|--------|---------|---------|
| `/entry/order` | 验收单 | supplierName, workshopName, attn, chargeBy, remark | materialName, quantity, unitPrice, taxPrice, remark |
| `/entry/intoOrder` | 入库单 | workshopName, attn, chargeBy, remark | materialName, quantity, unitPrice, remark |
| `/take/pickOrder` | 领料单 | workshopName, picker, chargeBy, remark | materialName, quantity, remark |

### 扩展新表单

前端只需在 `src/constants/formSchemas.js` 中新增一个路由 key，后端和 AI 侧**零改动**即可自动支持。

---

## 四、响应协议 (SSE)

后端通过 Server-Sent Events 返回 3 种事件类型，按以下顺序推送：

```
event: message    ← AI 文本流式输出（多条）
event: action     ← 操作指令（0~N 条，在文本之后）
event: done       ← 完成标记
```

### 4.1 message 事件（流式文本）

```
event: message
data: {"content": "好的，我来帮您创建"}

event: message
data: {"content": "验收单..."}
```

前端逐条拼接 `content`，实现打字机效果。

### 4.2 action 事件（操作指令）★ 重点

```
event: action
data: {"type":"openForm","path":"/entry/order","label":"去创建验收单（预填：靴子×100）","formData":{"supplierName":"华东皮革","details":[{"materialName":"靴子","quantity":100}]}}
```

#### action 结构定义

```json
{
  "type": "openForm | navigate",
  "path": "/entry/order",
  "label": "按钮显示文字",
  "formData": {
    "supplierName": "华东皮革",
    "attn": "张三",
    "details": [
      {
        "materialName": "靴子",
        "quantity": 100,
        "unitPrice": 25.5
      }
    ]
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | **是** | `openForm`（创建单据）或 `navigate`（仅跳转页面） |
| `path` | string | **是** | 目标路由路径，如 `/entry/order` |
| `label` | string | **是** | 操作按钮的显示文字 |
| `formData` | object | **openForm 时必填** | 表单预填数据，结构见下文 |

#### formData 结构规则

1. **主表字段**放在 `formData` 顶层，字段名与 `formSchemas.mainFields` 的 key 一致
2. **明细行**放在 `formData.details` 数组中，每个元素的字段名与 `formSchemas.detailFields` 的 key 一致
3. **每条明细至少包含** `materialName`（字符串）和 `quantity`（数字）
4. **用户没提到的字段不要编造**，留空即可，前端会自动处理（如自动查询最近价格）
5. `quantity` 必须是数字类型（`100`），不能是字符串（`"100"`）

#### 两种 action type 的行为差异

| type | 前端行为 | formData |
|------|---------|----------|
| `navigate` | **自动执行**跳转，不需要用户点击 | 不需要 |
| `openForm` | 显示为按钮卡片，**用户点击后**跳转并预填表单 | **必须提供** |

### 4.3 done 事件（完成标记）

```
event: done
data: {}
```

### 4.4 error 事件（错误）

```
event: error
data: {"message": "服务暂时不可用"}
```

---


## 五、前端处理流程

```
用户输入
  │
  ▼
handleSend()
  ├── 构建 history（最近 20 条）
  ├── 附带 formSchemas（全量）
  └── 调用 sendChatMessageStream()
        │
        ├── event: message → 拼接文本，打字机效果
        │
        ├── event: action
        │     ├── normalizeAction() 标准化字段名
        │     ├── type=navigate → 自动 router.push()
        │     └── type=openForm → 显示操作按钮卡片
        │                           │
        │                     用户点击按钮
        │                           │
        │                     handleOpenForm()
        │                       ├── aiActionStore.setPendingAction(action)
        │                       └── router.push(action.path)
        │                                │
        │                          目标页面激活
        │                                │
        │                          checkAiAction()
        │                            ├── 校验 path 匹配
        │                            ├── consumeAction()
        │                            └── handleAiPrefill(formData)
        │                                  ├── handleAdd() 打开弹窗
        │                                  ├── 填写主表字段
        │                                  ├── 远程搜索供应商/物料
        │                                  └── 填写明细行
        │
        └── event: done → 完成
```

### 关键机制：跨页面 action 通信

```
AiChatPanel                   aiActionStore                   业务页面
     │                              │                              │
     │  setPendingAction(action)    │                              │
     │─────────────────────────────>│                              │
     │                              │                              │
     │  router.push(path)          │                              │
     │─────────────────────────────────────────────────────────────>│
     │                              │                              │
     │                              │   watch(pendingAction)       │
     │                              │<─────────────────────────────│
     │                              │                              │
     │                              │   consumeAction()            │
     │                              │<─────────────────────────────│
     │                              │                              │
     │                              │   handleAiPrefill(formData)  │
     │                              │              ────────────────>│
     │                              │              打开弹窗+预填    │
```

业务页面通过三种方式触发 `checkAiAction()`：
- `onMounted` — 首次进入页面
- `onActivated` — keep-alive 缓存后再次激活
- `watch(aiActionStore.pendingAction)` — 已在当前页面时，AI 推送了新 action

---

## 六、完整交互示例

### 示例 1：用户说"创建验收单，100个靴子"

**请求：**
```json
{
  "message": "创建验收单，100个靴子",
  "pageContext": "首页 - 仪表盘",
  "formSchemas": { "/entry/order": { "..." } }
}
```

**期望 SSE 响应：**
```
event: message
data: {"content": "好的，我来帮您创建验收单，预填 100 个靴子。请点击下方按钮："}

event: action
data: {"type":"openForm","path":"/entry/order","label":"去创建验收单（预填：靴子×100）","formData":{"details":[{"materialName":"靴子","quantity":100}]}}

event: done
data: {}
```

### 示例 2：复杂输入

**用户说：** "从供应商华东皮革进200双靴子和50件大衣，经办人张三，备注紧急订单"

**期望 action：**
```json
{
  "type": "openForm",
  "path": "/entry/order",
  "label": "去创建验收单（预填：靴子×200, 大衣×50）",
  "formData": {
    "supplierName": "华东皮革",
    "attn": "张三",
    "remark": "紧急订单",
    "details": [
      { "materialName": "靴子", "quantity": 200 },
      { "materialName": "大衣", "quantity": 50 }
    ]
  }
}
```

### 示例 3：仅导航（不创建表单）

**用户说：** "我想看一下库存"

**期望 action：**
```json
{
  "type": "navigate",
  "path": "/stock/inventory",
  "label": "查看库存"
}
```

注意：`navigate` 类型**不需要** `formData`。

---

## 七、接口接入清单

| # | 事项 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 请求 DTO 新增 `formSchemas` 字段 | **高** | `Map<String, Object>` 类型 |
| 2 | 将 `formSchemas` 拼入 AI prompt | **高** | 参考 5.2 节的 `buildSchemaPrompt` |
| 3 | action 事件必须包含 `formData` | **高** | 缺少 formData 前端无法预填 |
| 4 | formData 字段名与 schema 的 key 一致 | **高** | 如 `supplierName` 不能写成 `supplier` |
| 5 | quantity 使用数字类型 | 中 | `100` 而非 `"100"` |
| 6 | 未提及的字段不要编造 | 中 | AI 倾向于补全，需在 prompt 中约束 |
| 7 | 工具定义动态生成（如用 Function Calling） | 低 | 参考 5.4 节 |

---

## 八、前端文件结构

```
src/
├── api/
│   └── ai/
│       └── chat.js              # API 封装 + 系统提示词
├── constants/
│   └── formSchemas.js           # ★ 表单字段 Schema 注册表
├── components/
│   └── AiAssistant/
│       ├── index.vue            # 浮动按钮 + 上下文映射
│       └── AiChatPanel.vue      # 聊天面板 + action 处理
├── store/
│   └── modules/
│       └── aiAction.js          # 跨页面 action 通信
└── views/
    ├── entry/
    │   ├── order/index.vue      # 验收单（含 AI 预填逻辑）
    │   └── intoOrder/index.vue  # 入库单（含 AI 预填逻辑）
    └── take/
        └── pickOrder/index.vue  # 领料单（含 AI 预填逻辑）
```
