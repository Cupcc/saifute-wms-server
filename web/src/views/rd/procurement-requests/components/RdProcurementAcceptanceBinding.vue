<template>
  <div class="acceptance-binding">
    <template v-if="requiresBinding">
      <el-alert
        title="请选择已经存在的实际物料。该动作不会新建物料，首次绑定后不可修改。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-select
        v-model="materialId"
        filterable
        remote
        reserve-keyword
        clearable
        placeholder="搜索物料编码、名称或规格"
        :remote-method="searchMaterials"
        :loading="loading"
        style="width: 100%; margin-top: 10px"
        @focus="preloadMaterials"
        @change="cacheSelection"
      >
        <el-option
          v-for="item in selectOptions"
          :key="item.id"
          :value="item.id"
          :label="`${item.materialCode} ${item.materialName}`"
        >
          <div class="material-option">
            <span>{{ item.materialCode }}</span>
            <strong>{{ item.materialName }}</strong>
            <span>{{ item.specModel || "无规格" }}</span>
            <el-tag v-if="item.creationMode === 'AUTO_CREATED'" size="small" type="info">
              验收形成
            </el-tag>
          </div>
        </el-option>
      </el-select>
    </template>
    <template v-else>
      <el-alert
        :title="`已锁定物料：${boundMaterialLabel}`"
        :description="`绑定来源：${bindingSourceLabel}`"
        type="success"
        :closable="false"
        show-icon
      />
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { listRdAcceptanceMaterialOptions } from "@/api/rd-subwarehouse";

const materialId = defineModel({ type: Number, default: null });
const props = defineProps({
  requiresBinding: {
    type: Boolean,
    default: false,
  },
  boundMaterial: {
    type: Object,
    default: null,
  },
  materialCodeSnapshot: {
    type: String,
    default: "",
  },
  materialNameSnapshot: {
    type: String,
    default: "",
  },
  bindingSource: {
    type: String,
    default: "",
  },
});

const loading = ref(false);
const materialOptions = ref([]);
const selectedCache = ref([]);
let requestSequence = 0;
let preloaded = false;

const selectOptions = computed(() => {
  const merged = [...selectedCache.value];
  for (const item of materialOptions.value) {
    if (!merged.some((existing) => existing.id === item.id)) {
      merged.push(item);
    }
  }
  return merged;
});

const boundMaterialLabel = computed(() => {
  const material = props.boundMaterial;
  if (material) {
    return `${material.materialCode} ${material.materialName}`;
  }
  return `${props.materialCodeSnapshot || ""} ${props.materialNameSnapshot || ""}`.trim();
});

const bindingSourceLabel = computed(() => {
  const labels = {
    BOM_CATALOG: "创建时选择 BOM",
    ACCEPTANCE_CONFIRMED: "登记验收时首次绑定",
    LEGACY: "历史数据",
  };
  return labels[props.bindingSource] || "已绑定";
});

async function searchMaterials(keyword = "") {
  const currentSequence = ++requestSequence;
  loading.value = true;
  try {
    const response = await listRdAcceptanceMaterialOptions({
      keyword: keyword.trim() || undefined,
      limit: 30,
      offset: 0,
    });
    if (currentSequence === requestSequence) {
      materialOptions.value = response.data?.items || [];
    }
  } finally {
    if (currentSequence === requestSequence) {
      loading.value = false;
    }
  }
}

function preloadMaterials() {
  if (preloaded) {
    return;
  }
  preloaded = true;
  searchMaterials();
}

function cacheSelection(value) {
  const selected = materialOptions.value.find((item) => item.id === value);
  if (selected && !selectedCache.value.some((item) => item.id === selected.id)) {
    selectedCache.value.push(selected);
  }
}
</script>

<style scoped lang="scss">
.material-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
