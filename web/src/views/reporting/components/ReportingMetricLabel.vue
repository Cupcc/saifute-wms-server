<template>
  <el-tooltip :content="content" placement="top">
    <span
      class="reporting-metric-label"
      tabindex="0"
      :aria-label="`${label}：${content}`"
    >
      <span>{{ label }}</span>
      <el-icon class="reporting-metric-help-icon" aria-hidden="true">
        <QuestionFilled />
      </el-icon>
    </span>
  </el-tooltip>
</template>

<script setup name="ReportingMetricLabel">
defineProps({
  label: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
});
</script>

<style scoped lang="scss">
.reporting-metric-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  cursor: help;

  &:focus-visible {
    border-radius: 2px;
    outline: 2px solid var(--el-color-primary-light-5);
    outline-offset: 2px;
  }
}

.reporting-metric-help-icon {
  flex: 0 0 auto;
  color: #909399;
  font-size: 14px;
}
</style>
