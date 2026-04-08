<template>
  <el-select
    :model-value="modelValue"
    :placeholder="placeholder"
    filterable
    allow-create
    :loading="loading"
    :clearable="clearable"
    :disabled="disabled"
    :style="computedStyle"
    :default-first-option="true"
    @update:model-value="$emit('update:modelValue', $event)"
    @visible-change="onDropdownOpen"
  >
    <el-option
      v-for="item in mergedOptions"
      :key="item"
      :label="item"
      :value="item"
    />
  </el-select>
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

defineEmits(["update:modelValue"]);

const remoteOptions = ref([]);
const loaded = ref(false);
const loading = ref(false);

const computedStyle = computed(() => ({ width: props.width }));

const mergedOptions = computed(() => {
  const set = new Set([...props.defaults, ...remoteOptions.value]);
  // 保证当前值也在列表中
  if (props.modelValue && typeof props.modelValue === "string") {
    set.add(props.modelValue);
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

function onDropdownOpen(visible) {
  if (visible) loadSuggestions();
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
