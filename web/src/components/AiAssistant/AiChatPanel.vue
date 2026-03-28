<template>
  <transition name="slide-up">
    <div v-show="visible" class="ai-chat-panel" :class="{ 'is-dark': isDark }">
      <!-- 头部 -->
      <div class="chat-header">
        <div class="header-left">
          <div class="ai-avatar-small">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v-2h-2v2zm1-12C9.79 4 8 5.79 8 8h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
            </svg>
          </div>
          <span class="header-title">AI 助手</span>
          <span class="header-badge">Beta</span>
        </div>
        <div class="header-actions">
          <button class="header-btn" title="清空对话" @click="handleClear">
            <el-icon><Delete /></el-icon>
          </button>
          <button class="header-btn" title="关闭" @click="$emit('close')">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>

      <!-- 消息区域 -->
      <div ref="messageListRef" class="chat-messages" @scroll="handleScroll">
        <!-- 欢迎消息 -->
        <div v-if="messages.length === 0" class="welcome-section">
          <div class="welcome-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v-2h-2v2zm1-12C9.79 4 8 5.79 8 8h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
            </svg>
          </div>
          <h3 class="welcome-title">您好，我是 AI 助手</h3>
          <p class="welcome-desc">我可以帮助您了解和使用仓库管理系统</p>
          <div class="quick-questions">
            <button
              v-for="(q, i) in quickQuestions"
              :key="i"
              class="quick-question-btn"
              @click="handleQuickQuestion(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>

        <!-- 消息列表 -->
        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="message-item"
          :class="[`message-${msg.role}`]"
        >
          <!-- 头像 -->
          <div class="message-avatar" v-if="msg.role === 'assistant'">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v-2h-2v2zm1-12C9.79 4 8 5.79 8 8h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
            </svg>
          </div>

          <!-- 消息内容 -->
          <div class="message-content">
            <div class="message-bubble" v-html="renderMarkdown(msg.content)"></div>
            <!-- 操作卡片 -->
            <div v-if="msg.actions && msg.actions.length > 0" class="action-cards">
              <button
                v-for="(action, aIdx) in msg.actions"
                :key="aIdx"
                class="action-card-btn"
                :class="{ 'is-executed': action.executed }"
                @click="executeAction(action)"
                :disabled="action.executed"
              >
                <el-icon class="action-icon">
                  <Position v-if="action.type === 'navigate'" />
                  <EditPen v-else-if="action.type === 'openForm'" />
                  <Right v-else />
                </el-icon>
                <span class="action-label">{{ action.label || '执行操作' }}</span>
                <el-icon class="action-arrow" v-if="!action.executed"><Right /></el-icon>
                <el-icon class="action-check" v-else><Check /></el-icon>
              </button>
            </div>
            <div class="message-time" v-if="msg.time">{{ formatTime(msg.time) }}</div>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="isLoading" class="message-item message-assistant">
          <div class="message-avatar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v-2h-2v2zm1-12C9.79 4 8 5.79 8 8h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
            </svg>
          </div>
          <div class="message-content">
            <div class="message-bubble typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- 上下文提示 -->
      <div v-if="currentContext" class="context-bar">
        <el-icon><Location /></el-icon>
        <span>{{ currentContext }}</span>
      </div>

      <!-- 输入区域 -->
      <div class="chat-input-area">
        <div class="input-wrapper">
          <el-input
            ref="inputRef"
            v-model="inputText"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            placeholder="输入您的问题..."
            resize="none"
            @keydown.enter.exact.prevent="handleSend"
            @keydown.enter.shift.exact="handleNewLine"
          />
          <button
            class="send-btn"
            :class="{ 'is-active': inputText.trim() }"
            :disabled="!inputText.trim() || isLoading"
            @click="handleSend"
          >
            <el-icon v-if="!isLoading"><Promotion /></el-icon>
            <el-icon v-else class="is-loading"><Loading /></el-icon>
          </button>
        </div>
        <div class="input-hint">Enter 发送，Shift+Enter 换行</div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import {
  Check,
  Close,
  Delete,
  EditPen,
  Loading,
  Location,
  Position,
  Promotion,
  Right,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { sendChatMessageStream, WMS_SYSTEM_PROMPT } from "@/api/ai/chat";
import { FORM_SCHEMAS } from "@/constants/formSchemas";
import useAiActionStore from "@/store/modules/aiAction";
import useSettingsStore from "@/store/modules/settings";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  /** 当前页面上下文 */
  pageContext: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["close"]);

const settingsStore = useSettingsStore();
const aiActionStore = useAiActionStore();
const router = useRouter();
const isDark = computed(() => settingsStore.isDark);

// 消息列表
const messages = ref([]);
// 输入文本
const inputText = ref("");
// 加载状态
const isLoading = ref(false);
// 当前上下文
const currentContext = computed(() => props.pageContext);
// refs
const messageListRef = ref(null);
const inputRef = ref(null);
// 当前流式请求控制器
let currentController = null;

// 快捷问题
const quickQuestions = [
  "系统有哪些功能？",
  "如何新建入库单？",
  "如何查看库存预警？",
  "出库流程是什么？",
];

// 监听 visible 变化，聚焦输入框
watch(
  () => props.visible,
  (val) => {
    if (val) {
      nextTick(() => {
        inputRef.value?.focus();
      });
    }
  },
);

// 发送消息
function handleSend() {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  // 添加用户消息
  messages.value.push({
    role: "user",
    content: text,
    time: new Date(),
  });

  inputText.value = "";
  isLoading.value = true;
  scrollToBottom();

  // 构建对话历史（不含本次消息，最近 20 条）
  const historyMessages = messages.value.slice(0, -1).slice(-20);
  const history = historyMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // assistant 消息引用，收到第一个片段时才创建
  let assistantMsg = null;

  // 确保 assistant 消息存在
  function ensureAssistantMsg() {
    if (!assistantMsg) {
      messages.value.push({
        role: "assistant",
        content: "",
        actions: [],
        time: new Date(),
      });
      assistantMsg = messages.value[messages.value.length - 1];
    }
    return assistantMsg;
  }

  // 发送请求到后端 AI 接口
  currentController = sendChatMessageStream(
    {
      systemPrompt: WMS_SYSTEM_PROMPT,
      pageContext: currentContext.value,
      message: text,
      history,
      formSchemas: FORM_SCHEMAS,
    },
    // onMessage — 收到文本片段
    (data) => {
      const msg = ensureAssistantMsg();
      msg.content += data.content || "";
      isLoading.value = false;
      scrollToBottom();
    },
    // onAction — 收到操作指令
    (actionData) => {
      const msg = ensureAssistantMsg();
      isLoading.value = false;

      const normalized = normalizeAction(actionData);
      if (!normalized) return;

      if (normalized.type === "navigate") {
        // 导航类型：自动执行跳转
        handleNavigate(normalized);
        // 在 actions 中记录（已执行状态）
        msg.actions.push({ ...normalized, executed: true });
      } else if (normalized.type === "openForm") {
        // 表单预填类型：显示为可点击的操作卡片
        msg.actions.push({ ...normalized, executed: false });
      } else {
        // 未知类型也显示为卡片
        msg.actions.push({ ...normalized, executed: false });
      }
      scrollToBottom();
    },
    // onDone — 回复完成
    () => {
      isLoading.value = false;
      currentController = null;
      scrollToBottom();
    },
    // onError — 发生错误
    (error) => {
      isLoading.value = false;
      currentController = null;
      const msg = ensureAssistantMsg();
      msg.content = error.message || "抱歉，回复出现了问题，请稍后重试。";
      console.error("AI chat error:", error);
      scrollToBottom();
    },
  );
}

/**
 * 执行操作指令
 */
function executeAction(action) {
  if (action.executed) return;

  if (action.type === "navigate") {
    handleNavigate(action);
  } else if (action.type === "openForm") {
    handleOpenForm(action);
  }

  // 标记为已执行
  action.executed = true;
}

/**
 * 处理导航跳转（自动执行）
 */
function handleNavigate(action) {
  if (!action.path) return;
  router.push(action.path);
  ElMessage.success(`已跳转到${action.label || action.path}`);
}

/**
 * 处理表单预填（用户点击后执行）
 */
function handleOpenForm(action) {
  if (!action.path) return;

  // 预警：formData 缺失时提示用户
  if (action._missingFormData) {
    ElMessage.warning("AI 未能生成预填数据，将仅跳转到表单页面，请手动填写");
  }

  // 将表单数据存入 aiAction Store
  aiActionStore.setPendingAction({
    type: action.type,
    path: action.path,
    label: action.label,
    formData: action.formData || {},
  });

  // 导航到目标页面
  router.push(action.path);
  ElMessage.success(`正在跳转并准备表单...`);
}

/**
 * 统一标准化后端 action 数据
 * 兼容: formData/payload/params/data 以及 JSON 字符串
 */
function normalizeAction(raw) {
  if (!raw || typeof raw !== "object") return null;

  const action = { ...raw };
  action.type = action.type || action.actionType || action.kind;
  action.path = action.path || action.route || action.url;
  action.label = action.label || action.title || action.text;

  let formData =
    action.formData ?? action.payload ?? action.params ?? action.data;
  if (typeof formData === "string") {
    try {
      formData = JSON.parse(formData);
    } catch {
      /* ignore */
    }
  }
  if (formData && typeof formData === "object") {
    action.formData = formData;
  }

  // 预警：如果 AI 未返回 formData，提示用户表单数据缺失
  if (!action.formData && action.type === "openForm") {
    console.warn("[AI Action] open_form 缺少 formData，仅跳转不预填");
    action._missingFormData = true;
  }

  // 便于排查：在控制台输出原始与标准化结构
  console.info("[AI Action] raw:", raw);
  console.info("[AI Action] normalized:", action);

  return action;
}

/**
 * 从 action label 文本中解析 formData（回退方案）
 * 当后端未在 action 中返回 formData 时，尝试从 label 中提取物料和数量
 *
 * 支持的 label 格式示例：
 *   "创建验收单（预填：靴子×100）"
 *   "创建验收单（预填：靴子×200, 大衣×50）"
 *   "去创建入库单（预填：螺丝×500）"
 */
function parseFormDataFromLabel(label) {
  if (!label) return null;

  // 匹配括号内的预填内容：（预填：...）或 (预填：...)
  const preMatch = label.match(/[（(]预填[：:]\s*(.+?)\s*[）)]/);
  if (!preMatch) return null;

  const content = preMatch[1];
  // 匹配 "物料名×数量" 或 "物料名 × 数量" 格式，支持多个逗号分隔
  const itemPattern = /([^,，×xX\d]+?)\s*[×xX]\s*(\d+(?:\.\d+)?)/g;
  const details = [];
  let match = itemPattern.exec(content);
  while (match !== null) {
    const materialName = match[1].trim();
    const quantity = Number(match[2]);
    if (materialName && !isNaN(quantity)) {
      details.push({ materialName, quantity });
    }
    match = itemPattern.exec(content);
  }

  if (details.length > 0) {
    return { details };
  }
  return null;
}

// 快捷问题
function handleQuickQuestion(question) {
  inputText.value = question;
  handleSend();
}

// 清空对话
function handleClear() {
  if (currentController) {
    currentController.abort?.();
    currentController = null;
  }
  messages.value = [];
  isLoading.value = false;
}

// 换行
function handleNewLine() {
  // Shift+Enter 默认行为即可
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
}

// 滚动事件（预留）
function handleScroll() {}

// 时间格式化
function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// 简单的 Markdown 渲染
function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    // 转义 HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // 标题
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // 斜体
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // 行内代码
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // 引用块
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    // 无序列表
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // 换行
    .replace(/\n/g, "<br>")
    // 修复连续 li
    .replace(/(<li>.*?<\/li>)(<br>)(<li>)/g, "$1$3");

  // 包裹连续的 li 为 ul
  html = html.replace(/((?:<li>.*?<\/li>)+)/g, "<ul>$1</ul>");

  return html;
}

// 组件卸载时取消请求
onUnmounted(() => {
  if (currentController) {
    currentController.abort?.();
  }
});
</script>

<style lang="scss" scoped>
.ai-chat-panel {
  position: fixed;
  bottom: 90px;
  right: 24px;
  width: 400px;
  height: 560px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 2000;
  border: 1px solid rgba(0, 0, 0, 0.06);

  &.is-dark {
    background: #1d1e1f;
    border-color: #303030;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);

    .chat-header {
      background: #141414;
      border-color: #303030;
      .header-title { color: #fff; }
      .header-btn {
        color: #999;
        &:hover { background: #2d2d2d; color: #fff; }
      }
    }

    .chat-messages { background: #1d1e1f; }
    .welcome-title { color: #e0e0e0; }
    .welcome-desc { color: #999; }

    .quick-question-btn {
      background: #2d2d2d;
      color: #d0d0d0;
      border-color: #3d3d3d;
      &:hover { background: #3d3d3d; border-color: #4d4d4d; }
    }

    .message-user .message-bubble { background: #2563eb; }
    .message-assistant .message-bubble { background: #2d2d2d; color: #e0e0e0; }

    .action-card-btn {
      background: #2d2d2d;
      border-color: #3d3d3d;
      color: #d0d0d0;
      &:hover:not(:disabled) { background: #3d3d3d; border-color: #5b9cf6; }
      &.is-executed { background: #1a2e1a; border-color: #2d5a2d; color: #6abf6a; }
    }

    .context-bar { background: #2d2d2d; border-color: #3d3d3d; color: #999; }

    .chat-input-area {
      background: #141414;
      border-color: #303030;
      .input-wrapper { background: #2d2d2d; border-color: #3d3d3d; }
      :deep(.el-textarea__inner) {
        background: transparent;
        color: #e0e0e0;
        &::placeholder { color: #666; }
      }
      .input-hint { color: #555; }
    }

    .message-time { color: #555; }
    .typing-indicator span { background: #666; }
  }
}

/* 头部 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ai-avatar-small {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }

  .header-title {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  .header-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    font-weight: 500;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .header-btn {
    width: 30px;
    height: 30px;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.85);
    transition: all 0.2s;
    font-size: 14px;

    &:hover {
      background: rgba(255, 255, 255, 0.25);
      color: #fff;
    }
  }
}

/* 消息区域 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 4px;
  }
}

/* 欢迎区 */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  text-align: center;

  .welcome-icon {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2563eb;
    margin-bottom: 16px;
  }

  .welcome-title {
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
    margin: 0 0 6px;
  }

  .welcome-desc {
    font-size: 13px;
    color: #94a3b8;
    margin: 0 0 20px;
  }
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.quick-question-btn {
  padding: 6px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: #eff6ff;
    border-color: #93c5fd;
    color: #2563eb;
  }
}

/* 消息项 */
.message-item {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease;

  &.message-user {
    flex-direction: row-reverse;
    .message-content { align-items: flex-end; }
    .message-bubble {
      background: #2563eb;
      color: #fff;
      border-radius: 16px 4px 16px 16px;
      :deep(a) { color: #93c5fd; }
      :deep(code) { background: rgba(255, 255, 255, 0.2); color: #fff; }
    }
  }

  &.message-assistant {
    .message-bubble {
      background: #f1f5f9;
      color: #334155;
      border-radius: 4px 16px 16px 16px;
      :deep(h2), :deep(h3), :deep(h4) { margin: 8px 0 4px; font-size: 14px; color: #1e293b; }
      :deep(ul) { margin: 4px 0; padding-left: 20px; }
      :deep(li) { margin: 2px 0; }
      :deep(blockquote) {
        margin: 8px 0;
        padding: 6px 12px;
        border-left: 3px solid #2563eb;
        background: rgba(37, 99, 235, 0.05);
        border-radius: 0 8px 8px 0;
      }
      :deep(code) { background: rgba(0, 0, 0, 0.06); padding: 1px 4px; border-radius: 4px; font-size: 12px; }
      :deep(strong) { color: #1e293b; }
    }
  }
}

.message-avatar {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.message-content {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}

.message-bubble {
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.message-time {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
  padding: 0 4px;
}

/* 操作卡片 */
.action-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.action-card-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;

  &:hover:not(:disabled) {
    background: #dbeafe;
    border-color: #93c5fd;
    transform: translateX(2px);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &.is-executed {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #15803d;
    cursor: default;
  }

  &:disabled {
    opacity: 0.8;
  }

  .action-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .action-label {
    flex: 1;
    font-weight: 500;
  }

  .action-arrow {
    font-size: 12px;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .action-check {
    font-size: 14px;
    flex-shrink: 0;
    color: #16a34a;
  }
}

/* 打字动画 */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px !important;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #94a3b8;
    animation: typing 1.4s infinite ease-in-out;
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* 上下文提示 */
.context-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 11px;
  color: #94a3b8;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;
}

/* 输入区 */
.chat-input-area {
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #f1f5f9;
  flex-shrink: 0;

  .input-wrapper {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 6px 8px 6px 12px;
    transition: border-color 0.2s;
    &:focus-within { border-color: #93c5fd; }
  }

  :deep(.el-textarea__inner) {
    background: transparent;
    border: none;
    box-shadow: none !important;
    padding: 4px 0;
    font-size: 13px;
    line-height: 1.5;
    resize: none;
  }

  .input-hint {
    font-size: 11px;
    color: #cbd5e1;
    text-align: right;
    margin-top: 4px;
  }
}

.send-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border: none;
  border-radius: 8px;
  background: #e2e8f0;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 16px;

  &.is-active {
    background: #2563eb;
    color: #fff;
    &:hover { background: #1d4ed8; }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 移动端适配 */
@media screen and (max-width: 480px) {
  .ai-chat-panel {
    width: calc(100vw - 16px);
    height: calc(100vh - 120px);
    bottom: 80px;
    right: 8px;
    border-radius: 12px;
  }
}
</style>
