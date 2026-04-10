<template>
  <el-autocomplete
    :model-value="inputValue"
    :placeholder="placeholder"
    :clearable="clearable"
    :disabled="disabled"
    :style="computedStyle"
    :fetch-suggestions="querySuggestions"
    :trigger-on-focus="true"
    @focus="onFocus"
    @update:model-value="handleInput"
    @select="handleSelect"
  />
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { getFieldSuggestions } from "@/api/base/suggestions";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  /** 后端建议范围，如 "material" */
  scope: { type: String, default: "" },
  /** 后端建议字段，如 "unitCode" */
  field: { type: String, default: "" },
  /** 静态默认选项（字符串数组） */
  defaults: { type: Array, default: () => [] },
  placeholder: { type: String, default: "请选择或输入" },
  clearable: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  width: { type: String, default: "100%" },
});

const emit = defineEmits(["update:modelValue"]);

const remoteOptions = ref([]);
const loaded = ref(false);
const loading = ref(false);

const computedStyle = computed(() => ({ width: props.width }));
const inputValue = computed(() =>
  props.modelValue == null ? "" : String(props.modelValue),
);

const mergedOptions = computed(() => {
  const set = new Set([...props.defaults, ...remoteOptions.value]);
  // 保证当前值也在列表中
  if (inputValue.value) {
    set.add(inputValue.value);
  }
  return [...set].sort();
});

async function loadSuggestions(force = false) {
  if ((!force && loaded.value) || !props.scope || !props.field) return;
  loading.value = true;
  try {
    remoteOptions.value = await getFieldSuggestions(props.scope, props.field);
  } catch {
    // 接口不可用时降级到静态选项
  } finally {
    loaded.value = true;
    loading.value = false;
  }
}

async function querySuggestions(queryString, callback) {
  await loadSuggestions();
  const keyword = queryString.trim().toLowerCase();
  const matches = mergedOptions.value
    .filter((item) => !keyword || item.toLowerCase().includes(keyword))
    .map((item) => ({ value: item }));
  callback(matches);
}

function handleInput(value) {
  emit("update:modelValue", value);
}

function handleSelect(item) {
  emit("update:modelValue", item.value);
}

function onFocus() {
  loadSuggestions();
}

onMounted(() => {
  // 如果有scope+field，预加载
  if (props.scope && props.field) {
    loadSuggestions();
  }
});

watch(
  () => [props.scope, props.field],
  ([scope, field], [prevScope, prevField]) => {
    if (scope === prevScope && field === prevField) {
      return;
    }
    remoteOptions.value = [];
    loaded.value = false;
    if (scope && field) {
      loadSuggestions();
    }
  },
);
</script>
