<template>
  <el-table-column
    v-bind="$attrs"
    :prop="prop"
    :label="label"
    :min-width="resolvedMinWidth"
    label-class-name="reporting-column-header"
  >
    <template #header>
      <reporting-metric-label :label="label" :content="content" />
    </template>
    <template #default="scope">
      <slot v-if="$slots.default" v-bind="scope" />
    </template>
  </el-table-column>
</template>

<script setup name="ReportingMetricColumn">
import { computed } from "vue";
import { resolveReportingColumnWidth } from "../reportingColumnLayout";
import ReportingMetricLabel from "./ReportingMetricLabel.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  prop: {
    type: String,
    default: undefined,
  },
  label: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  width: {
    type: [Number, String],
    default: undefined,
  },
});

const resolvedMinWidth = computed(() =>
  resolveReportingColumnWidth(props.label, props.width),
);
</script>

<style lang="scss">
.reporting-column-header .cell {
  white-space: nowrap;
}
</style>
