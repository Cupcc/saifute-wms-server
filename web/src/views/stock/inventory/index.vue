<template>
  <div class="app-container">
    <el-form
      ref="queryRef"
      :model="queryParams"
      :inline="true"
      v-show="showSearch"
      label-width="68px"
    >
      <el-form-item label="物料分类" prop="category">
        <el-select
          v-model="queryParams.category"
          placeholder="请选择类型"
          clearable
          multiple
          collapse-tags
          collapse-tags-tooltip
          style="width: 200px"
        >
          <el-option
            v-for="dict in saifute_material_category"
            :key="dict.value"
            :label="dict.label"
            :value="dict.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="仓库范围" prop="stockScope">
        <el-select
          v-model="queryParams.stockScope"
          placeholder="请选择范围"
          clearable
          style="width: 180px"
          @change="handleQuery"
        >
          <el-option
            v-for="option in stockScopeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="物料" prop="keyword">
        <el-autocomplete
          :model-value="queryParams.keyword ?? ''"
          :fetch-suggestions="queryMaterialSuggestions"
          placeholder="请输入物料编码、名称或规格型号"
          clearable
          style="width: 260px"
          :trigger-on-focus="false"
          :debounce="250"
          @update:model-value="handleMaterialKeywordInput"
          @select="handleMaterialSuggestionSelect"
          @clear="handleMaterialKeywordClear"
          @keyup.enter="handleQuery"
        >
          <template #default="{ item }">
            <div class="material-search-suggestion">
              <template v-if="item.suggestionType === 'material'">
                <span class="material-search-suggestion__code">
                  {{ item.materialCode }}
                </span>
                <span class="material-search-suggestion__name">
                  {{ item.materialName }}
                </span>
                <span class="material-search-suggestion__spec">
                  {{ item.specification || "无规格" }}
                </span>
              </template>
              <template v-else>
                <span class="material-search-suggestion__spec-tag">规格</span>
                <span class="material-search-suggestion__spec-only">
                  {{ item.specification }}
                </span>
              </template>
            </div>
          </template>
        </el-autocomplete>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">
          搜索
        </el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <right-toolbar
        v-model:showSearch="showSearch"
        @queryTable="getList"
        :columns="columns"
      />
    </el-row>

    <adaptive-table border stripe v-loading="loading" :data="inventoryList">
      <el-table-column type="index" width="50" align="center" />
      <el-table-column
        sortable
        show-overflow-tooltip
        label="物料编码"
        align="center"
        v-if="columns[0].visible"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            @click="handleViewDetail(scope.row)"
          >
            {{ scope.row.materialCode }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="物料名称"
        align="center"
        v-if="columns[1].visible"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            @click="handleViewDetail(scope.row)"
          >
            {{ scope.row.materialName }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="规格型号"
        align="center"
        prop="specification"
        v-if="columns[2].visible"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            @click="handleViewDetail(scope.row)"
          >
            {{ scope.row.specification }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="物料分类"
        align="center"
        prop="category"
        v-if="columns[3].visible"
      >
        <template #default="scope">
          <dict-tag :options="saifute_material_category" :value="scope.row.category" />
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="仓库范围"
        align="center"
        prop="stockScopeName"
        v-if="columns[4].visible"
      >
        <template #default="scope">
          <el-tag
            size="small"
            :type="scope.row.stockScope === 'RD_SUB' ? 'warning' : 'success'"
          >
            {{ scope.row.stockScopeName }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        sortable
        show-overflow-tooltip
        label="当前库存"
        align="center"
        prop="currentQty"
        v-if="columns[5].visible"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            @click="handleViewDetail(scope.row)"
            :style="{ color: scope.row.currentQty < 0 ? 'red' : '' }"
          >
            {{ formatQtyDisplay(scope.row.currentQty) }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        label="价格库存"
        align="center"
        width="120"
        v-if="columns[6].visible"
      >
        <template #default="scope">
          <el-button link type="primary" @click="handleViewDetail(scope.row)">
            查看明细
          </el-button>
        </template>
      </el-table-column>
    </adaptive-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <el-dialog
      title="库存详情"
      v-model="materialViewOpen"
      width="720px"
      append-to-body
    >
      <el-row :gutter="10">
        <el-col :span="24">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>物料信息</span>
              </div>
            </template>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="物料编码">
                {{ materialViewForm.materialCode }}
              </el-descriptions-item>
              <el-descriptions-item label="物料名称">
                {{ materialViewForm.materialName }}
              </el-descriptions-item>
              <el-descriptions-item label="规格型号">
                {{ materialViewForm.specification }}
              </el-descriptions-item>
              <el-descriptions-item label="分类">
                {{ getCategoryLabel(materialViewForm.category) }}
              </el-descriptions-item>
              <el-descriptions-item label="单位">
                {{ materialViewForm.unit }}
              </el-descriptions-item>
              <el-descriptions-item label="仓库范围">
                {{ materialViewForm.stockScopeName || "-" }}
              </el-descriptions-item>
              <el-descriptions-item label="库存数量">
                {{ formatQtyDisplay(materialViewForm.currentQty) }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
        <el-col :span="24" class="price-layer-section">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>价格库存明细</span>
              </div>
            </template>
            <el-table
              border
              stripe
              v-loading="priceLayerLoading"
              :data="priceLayerRows"
              empty-text="暂无可用价格库存"
            >
              <el-table-column label="单价" prop="unitCost" align="right">
                <template #default="{ row }">
                  {{ formatMoneyDisplay(row.unitCost) }}
                </template>
              </el-table-column>
              <el-table-column
                label="库存数量"
                prop="availableQty"
                align="right"
              >
                <template #default="{ row }">
                  {{ formatQtyDisplay(row.availableQty) }}
                </template>
              </el-table-column>
              <el-table-column
                label="来源流水数"
                prop="sourceLogCount"
                align="right"
                width="110"
              />
            </el-table>
          </el-card>
        </el-col>
      </el-row>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="materialViewOpen = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="Inventory">
import { getFieldSuggestions } from "@/api/base/suggestions";
import { getMaterial, listMaterialByCodeOrName } from "@/api/base/material";
import {
  listInventory,
  listInventoryPriceLayers,
} from "@/api/stock/inventory";
import { useDict } from "@/utils/dict";

const { proxy } = getCurrentInstance();
const { saifute_material_category } = useDict("saifute_material_category");

const inventoryList = ref([]);
const loading = ref(true);
const showSearch = ref(true);
const total = ref(0);
const materialViewOpen = ref(false);
const materialViewForm = ref({});
const priceLayerRows = ref([]);
const priceLayerLoading = ref(false);
const specSuggestionValues = ref([]);
const specSuggestionsLoaded = ref(false);
const materialSuggestionRequestId = ref(0);
const selectedMaterialKeyword = ref("");

const queryParams = ref({
  pageNum: 1,
  pageSize: 30,
  materialId: null,
  category: null,
  stockScope: null,
  keyword: null,
});

const stockScopeOptions = [
  { label: "主仓", value: "MAIN" },
  { label: "研发小仓", value: "RD_SUB" },
];

const columns = ref([
  { key: 0, label: "物料编码", visible: true },
  { key: 1, label: "物料名称", visible: true },
  { key: 2, label: "规格型号", visible: true },
  { key: 3, label: "物料分类", visible: true },
  { key: 4, label: "仓库范围", visible: true },
  { key: 5, label: "当前库存", visible: true },
  { key: 6, label: "价格库存", visible: true },
]);

function getList() {
  loading.value = true;
  listInventory(queryParams.value)
    .then((response) => {
      inventoryList.value = response.rows || [];
      total.value = response.total || 0;
    })
    .finally(() => {
      loading.value = false;
    });
}

function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}

function resetQuery() {
  proxy.resetForm("queryRef");
  queryParams.value.materialId = null;
  selectedMaterialKeyword.value = "";
  handleQuery();
}

function normalizeKeyword(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function buildMaterialSuggestion(item) {
  return {
    value: item.materialCode || item.materialName || item.specification || "",
    materialId: item.materialId,
    materialCode: item.materialCode || "",
    materialName: item.materialName || "",
    specification: item.specification || "",
    suggestionType: "material",
  };
}

function buildSpecSuggestion(specification) {
  return {
    value: specification,
    materialId: null,
    materialCode: "",
    materialName: "",
    specification,
    suggestionType: "spec",
  };
}

function dedupeSuggestions(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = item.materialId
      ? `material:${item.materialId}`
      : `spec:${item.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function ensureSpecSuggestionsLoaded() {
  if (specSuggestionsLoaded.value) {
    return specSuggestionValues.value;
  }

  try {
    specSuggestionValues.value = await getFieldSuggestions("material", "specModel");
  } catch {
    specSuggestionValues.value = [];
  } finally {
    specSuggestionsLoaded.value = true;
  }

  return specSuggestionValues.value;
}

async function queryMaterialSuggestions(queryString, callback) {
  const requestId = ++materialSuggestionRequestId.value;
  const keyword = normalizeKeyword(queryString);
  if (!keyword) {
    callback([]);
    return;
  }

  try {
    const [materialResponse, specValues] = await Promise.all([
      listMaterialByCodeOrName({
        materialCode: keyword,
        materialName: keyword,
        pageNum: 1,
        pageSize: 8,
      }).catch(() => ({ rows: [] })),
      ensureSpecSuggestionsLoaded(),
    ]);

    if (requestId !== materialSuggestionRequestId.value) {
      return;
    }

    const normalizedKeyword = keyword.toLowerCase();
    const materialSuggestions = (materialResponse.rows || [])
      .filter((item) =>
        [item.materialCode, item.materialName, item.specification].some((field) =>
          String(field || "")
            .toLowerCase()
            .includes(normalizedKeyword),
        ),
      )
      .map(buildMaterialSuggestion);
    const specSuggestions = specValues
      .filter((item) =>
        String(item || "")
          .toLowerCase()
          .includes(normalizedKeyword),
      )
      .slice(0, 5)
      .map(buildSpecSuggestion);

    callback(dedupeSuggestions([...materialSuggestions, ...specSuggestions]).slice(0, 10));
  } catch {
    if (requestId === materialSuggestionRequestId.value) {
      callback([]);
    }
  }
}

function handleMaterialKeywordInput(value) {
  materialSuggestionRequestId.value += 1;
  queryParams.value.keyword = value || null;
  if (!value || value !== selectedMaterialKeyword.value) {
    queryParams.value.materialId = null;
    selectedMaterialKeyword.value = "";
  }
}

function handleMaterialKeywordClear() {
  materialSuggestionRequestId.value += 1;
  queryParams.value.keyword = null;
  queryParams.value.materialId = null;
  selectedMaterialKeyword.value = "";
}

function handleMaterialSuggestionSelect(item) {
  queryParams.value.keyword = item.value || null;
  queryParams.value.materialId = item.materialId ?? null;
  selectedMaterialKeyword.value = item.materialId ? item.value : "";
  handleQuery();
}

function buildMaterialViewForm(row, material = {}) {
  return {
    ...material,
    materialId: row.materialId ?? material.materialId,
    materialCode: material.materialCode ?? row.materialCode,
    materialName: material.materialName ?? row.materialName,
    specification: material.specification ?? row.specification,
    category: material.category ?? row.category,
    currentQty: row.currentQty,
    stockScope: row.stockScope,
    stockScopeName: row.stockScopeName,
  };
}

async function handleViewDetail(row) {
  if (!row?.materialId) {
    return;
  }

  materialViewForm.value = buildMaterialViewForm(row);
  priceLayerRows.value = [];
  priceLayerLoading.value = true;
  materialViewOpen.value = true;

  try {
    const [materialResponse, priceLayerResponse] = await Promise.all([
      getMaterial(row.materialId).catch(() => ({ data: {} })),
      listInventoryPriceLayers({
        materialId: row.materialId,
        stockScope: row.stockScope || queryParams.value.stockScope,
      }).catch(() => ({ rows: [] })),
    ]);

    materialViewForm.value = buildMaterialViewForm(row, materialResponse.data);
    priceLayerRows.value = priceLayerResponse.rows || [];
  } finally {
    priceLayerLoading.value = false;
  }
}

function getCategoryLabel(value) {
  if (!value) {
    return "";
  }

  const category = saifute_material_category.value.find(
    (item) => item.value === value.toString(),
  );
  return category ? category.label : value;
}

function formatDecimalDisplay(value, maxFractionDigits) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "-";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return parsed.toLocaleString("zh-CN", {
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatQtyDisplay(value) {
  return formatDecimalDisplay(value, 6);
}

function formatMoneyDisplay(value) {
  return formatDecimalDisplay(value, 6);
}

getList();
</script>

<style scoped>
.material-search-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.material-search-suggestion__code {
  color: #ff7171;
  white-space: nowrap;
}

.material-search-suggestion__name {
  color: #6985ff;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-search-suggestion__spec,
.material-search-suggestion__spec-only {
  color: #37a62c;
  margin-left: auto;
  font-size: 12px;
  white-space: nowrap;
}

.material-search-suggestion__spec-tag {
  color: #909399;
  font-size: 12px;
  white-space: nowrap;
}

.price-layer-section {
  margin-top: 12px;
}
</style>
