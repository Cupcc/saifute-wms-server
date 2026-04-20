<template>
  <el-table
    ref="tableRef"
    v-bind="$attrs"
    :height="resolvedHeight"
  >
    <slot></slot>
  </el-table>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  useAttrs,
} from "vue";

const attrs = useAttrs();
const tableRef = ref(null);
const tableHeight = ref(400);
const minHeight = 150;
const hasCustomHeight = computed(
  () =>
    attrs.height !== undefined ||
    attrs["max-height"] !== undefined ||
    attrs.maxHeight !== undefined,
);
const resolvedHeight = computed(() =>
  hasCustomHeight.value ? undefined : tableHeight.value,
);

function getElementHeightWithMargin(element) {
  if (!element) {
    return 0;
  }

  const style = window.getComputedStyle(element);
  const marginTop = Number.parseFloat(style.marginTop) || 0;
  const marginBottom = Number.parseFloat(style.marginBottom) || 0;

  return element.offsetHeight + marginTop + marginBottom;
}

function findPaginationElement(tableElement) {
  let current = tableElement?.nextElementSibling ?? null;

  while (current) {
    if (current.classList?.contains("pagination-container")) {
      return current;
    }
    current = current.nextElementSibling;
  }

  return null;
}

/** 计算表格高度 */
function calculateTableHeight() {
  if (hasCustomHeight.value) {
    return;
  }

  const tableElement = tableRef.value?.$el;
  if (!tableElement) {
    return;
  }

  const container = tableElement.closest(".app-container");
  const footer = document.querySelector(".copyright");
  const pagination = findPaginationElement(tableElement);
  const tableTop = tableElement.getBoundingClientRect().top;
  const footerHeight = footer?.offsetHeight ?? 0;
  const paginationHeight = getElementHeightWithMargin(pagination);
  const containerPaddingBottom = container
    ? Number.parseFloat(window.getComputedStyle(container).paddingBottom) || 0
    : 0;
  const calculatedHeight =
    window.innerHeight -
    tableTop -
    paginationHeight -
    footerHeight -
    containerPaddingBottom;

  tableHeight.value = Math.max(Math.floor(calculatedHeight), minHeight);
}

function scheduleTableHeightCalculation() {
  if (hasCustomHeight.value) {
    return;
  }

  nextTick(() => {
    window.requestAnimationFrame(() => {
      calculateTableHeight();
    });
  });
}

onMounted(() => {
  scheduleTableHeightCalculation();
  window.addEventListener("resize", scheduleTableHeightCalculation);
});

onUpdated(() => {
  scheduleTableHeightCalculation();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleTableHeightCalculation);
});

defineExpose({
  tableRef,
  refreshHeight: scheduleTableHeightCalculation,
});
</script>
