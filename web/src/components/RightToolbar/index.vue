<template>
  <div class="top-right-btn" :style="style">
    <el-row>
      <el-tooltip
        v-if="search"
        class="item"
        effect="dark"
        :content="showSearch ? '隐藏搜索' : '显示搜索'"
        placement="top"
      >
        <el-button circle icon="Search" @click="toggleSearch" />
      </el-tooltip>
      <el-tooltip
        v-if="showRefresh"
        class="item"
        effect="dark"
        content="刷新"
        placement="top"
      >
        <el-button circle icon="Refresh" @click="refresh" />
      </el-tooltip>
    </el-row>
  </div>
</template>

<script setup>
const props = defineProps({
  showSearch: {
    type: Boolean,
    default: true,
  },
  search: {
    type: Boolean,
    default: true,
  },
  showRefresh: {
    type: Boolean,
    default: true,
  },
  gutter: {
    type: Number,
    default: 10,
  },
});

const emits = defineEmits(["update:showSearch", "queryTable"]);
const style = computed(() =>
  props.gutter ? { marginRight: `${props.gutter / 2}px` } : {},
);

function toggleSearch() {
  emits("update:showSearch", !props.showSearch);
}

function refresh() {
  emits("queryTable");
}
</script>
