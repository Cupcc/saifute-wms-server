<template>
  <el-table-column
    v-bind="$attrs"
    :prop="prop"
    :label="label"
    :width="resolvedWidth"
    label-class-name="reporting-column-header"
  >
    <template #default="scope">
      <slot v-if="$slots.default" v-bind="scope" />
    </template>
  </el-table-column>
</template>

<script setup name="ReportingColumn">
import { computed } from "vue";
import { resolveReportingColumnWidth } from "../reportingColumnLayout";

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
  width: {
    type: [Number, String],
    default: undefined,
  },
});

const resolvedWidth = computed(() =>
  resolveReportingColumnWidth(props.label, props.width),
);
</script>

<style lang="scss">
.reporting-column-header .cell {
  white-space: nowrap;
}
</style>
