<template>
  <div class="item-lines-editor">
    <div class="line-toolbar">
      <div>
        <div class="section-title">采购品项明细</div>
        <div class="section-tip">
          可从有效研发项目 BOM 选择复用品项，也可直接填写一次性品项；自由填写不会创建物料。
        </div>
      </div>
      <el-button type="primary" plain @click="addLine">添加明细</el-button>
    </div>

    <el-table :data="lines" :row-key="(row) => row.clientLineId" border stripe max-height="420">
      <el-table-column label="品项名称" min-width="300">
        <template #header>
          <span class="required-column-header">品项名称</span>
        </template>
        <template #default="{ row }">
          <el-autocomplete
            v-model="row.materialName"
            :fetch-suggestions="fetchSuggestions"
            :disabled="!projectCode"
            clearable
            highlight-first-item
            placeholder="输入名称，选择 BOM 建议或直接填写"
            style="width: 100%"
            @input="handleNameInput(row)"
            @select="(item) => handleSuggestionSelect(row, item)"
          >
            <template #default="{ item }">
              <div class="suggestion-option">
                <div class="suggestion-main">
                  <span>{{ item.materialCode }}</span>
                  <strong>{{ item.materialName }}</strong>
                  <span>{{ item.specModel || "无规格" }}</span>
                </div>
                <div class="suggestion-meta">
                  <el-tag
                    size="small"
                    :type="item.sourceScope === 'CURRENT_PROJECT' ? 'success' : 'primary'"
                  >
                    {{ item.sourceScope === "CURRENT_PROJECT" ? "当前项目 BOM" : "其他项目 BOM" }}
                  </el-tag>
                  <span>{{ item.sourceProjectCode }} {{ item.sourceProjectName }}</span>
                </div>
              </div>
            </template>
          </el-autocomplete>
          <div class="item-source">
            <el-tag v-if="row.materialId" size="small" :type="row.sourceScope === 'CURRENT_PROJECT' ? 'success' : 'primary'">
              {{ row.sourceScope === "CURRENT_PROJECT" ? "当前项目 BOM" : "其他项目 BOM" }}
            </el-tag>
            <el-tag v-else size="small" type="info">自由品项</el-tag>
            <span v-if="row.materialId">{{ row.materialCode }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="规格/图号" min-width="180">
        <template #default="{ row }">
          <el-input
            v-model="row.specModel"
            :disabled="Boolean(row.materialId)"
            maxlength="128"
            placeholder="可选"
          />
        </template>
      </el-table-column>

      <el-table-column label="单位" min-width="120">
        <template #header>
          <span class="required-column-header">单位</span>
        </template>
        <template #default="{ row }">
          <el-input
            v-model="row.unitCode"
            :disabled="Boolean(row.materialId)"
            maxlength="32"
            placeholder="如 PCS"
          />
        </template>
      </el-table-column>

      <el-table-column label="需求数量" min-width="170" class-name="numeric-column">
        <template #header>
          <span class="required-column-header">需求数量</span>
        </template>
        <template #default="{ row }">
          <el-input-number
            v-model="row.quantity"
            :min="0"
            :precision="6"
            controls-position="right"
            style="width: 100%"
          />
        </template>
      </el-table-column>

      <el-table-column label="参考单价" min-width="155" class-name="numeric-column">
        <template #default="{ row }">
          <el-input-number
            v-model="row.unitPrice"
            :min="0"
            :precision="4"
            controls-position="right"
            style="width: 100%"
          />
        </template>
      </el-table-column>

      <el-table-column label="金额" min-width="135" class-name="numeric-column">
        <template #default="{ row }">{{ calculateLineAmount(row) }}</template>
      </el-table-column>

      <el-table-column label="备注" min-width="180">
        <template #default="{ row }">
          <el-input v-model="row.remark" maxlength="500" />
        </template>
      </el-table-column>

      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ $index }">
          <el-button link type="danger" @click="removeLine($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { listRdProcurementMaterialSuggestions } from "@/api/rd-subwarehouse";

const lines = defineModel({ type: Array, required: true });
const props = defineProps({
  projectCode: {
    type: String,
    default: "",
  },
});

let suggestionRequestSequence = 0;

function createClientLineId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `rd-line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyLine() {
  return {
    clientLineId: createClientLineId(),
    materialId: null,
    materialCode: "",
    materialName: "",
    specModel: "",
    unitCode: "",
    sourceScope: null,
    sourceProjectCode: "",
    sourceProjectName: "",
    quantity: null,
    unitPrice: 0,
    remark: "",
  };
}

function addLine() {
  lines.value.push(createEmptyLine());
}

function removeLine(index) {
  lines.value.splice(index, 1);
  if (lines.value.length === 0) {
    addLine();
  }
}

function clearBomBinding(row) {
  row.materialId = null;
  row.materialCode = "";
  row.sourceScope = null;
  row.sourceProjectCode = "";
  row.sourceProjectName = "";
}

function handleNameInput(row) {
  if (row.materialId) {
    clearBomBinding(row);
    row.specModel = "";
    row.unitCode = "";
  }
}

function handleSuggestionSelect(row, item) {
  row.materialId = item.materialId;
  row.materialCode = item.materialCode;
  row.materialName = item.materialName;
  row.specModel = item.specModel || "";
  row.unitCode = item.unitCode;
  row.sourceScope = item.sourceScope;
  row.sourceProjectCode = item.sourceProjectCode;
  row.sourceProjectName = item.sourceProjectName;
  if (Number(row.unitPrice || 0) === 0 && item.referenceUnitPrice != null) {
    row.unitPrice = Number(item.referenceUnitPrice);
  }
}

async function fetchSuggestions(keyword, callback) {
  if (!props.projectCode) {
    callback([]);
    return;
  }
  const requestSequence = ++suggestionRequestSequence;
  try {
    const response = await listRdProcurementMaterialSuggestions({
      projectCode: props.projectCode,
      keyword: keyword?.trim() || undefined,
      limit: 30,
      offset: 0,
    });
    if (requestSequence !== suggestionRequestSequence) {
      callback([]);
      return;
    }
    callback(
      (response.data?.items || []).map((item) => ({
        ...item,
        value: item.materialName,
      })),
    );
  } catch {
    callback([]);
  }
}

function calculateLineAmount(row) {
  return (Number(row.quantity || 0) * Number(row.unitPrice || 0)).toFixed(4);
}
</script>

<style scoped lang="scss">
.line-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 8px 0 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.section-tip {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.required-column-header::before {
  margin-right: 4px;
  color: var(--el-color-danger);
  content: "*";
}

.item-source,
.suggestion-meta,
.suggestion-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-source {
  min-height: 24px;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.suggestion-option {
  padding: 4px 0;
}

.suggestion-main strong {
  color: var(--el-text-color-primary);
}

.suggestion-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
