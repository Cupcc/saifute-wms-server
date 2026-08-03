<template>
  <el-tooltip v-if="content" :content="content" placement="top">
    <span
      class="reporting-metric-label has-help"
      tabindex="0"
      :aria-label="`${label}：${content}`"
    >
      <span>{{ label }}</span>
      <el-icon class="reporting-metric-help-icon" aria-hidden="true">
        <QuestionFilled />
      </el-icon>
    </span>
  </el-tooltip>
  <span v-else class="reporting-metric-label">
    <span>{{ label }}</span>
  </span>
</template>

<script setup name="ReportingMetricLabel">
defineProps({
  label: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: undefined,
  },
});
</script>

<style scoped lang="scss">
.reporting-metric-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  cursor: default;
  white-space: nowrap;

  > span {
    flex: 0 0 auto;
  }

  &:focus-visible {
    border-radius: 2px;
    outline: 2px solid var(--el-color-primary-light-5);
    outline-offset: 2px;
  }
}

.reporting-metric-label.has-help {
  cursor: help;
}

.reporting-metric-help-icon {
  flex: 0 0 auto;
  color: #909399;
  font-size: 14px;
}
</style>
