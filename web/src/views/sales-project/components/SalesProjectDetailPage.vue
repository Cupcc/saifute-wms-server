<template>
  <div class="app-container sales-project-detail-page">
    <el-alert
      title="销售项目详情已升级为独立全屏页面，可直接刷新、回跳和生成销售出库草稿。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">销售项目详情</div>
            <div class="page-subtitle">
              {{ headerSubtitle }}
            </div>
          </div>
          <div class="page-actions">
            <el-tag v-if="detailProject" :type="lifecycleTagType">
              {{ lifecycleLabel }}
            </el-tag>
            <el-button icon="Back" @click="handleBack">返回列表</el-button>
            <el-button
              icon="Refresh"
              :loading="detailLoading"
              @click="loadDetail"
            >
              刷新
            </el-button>
            <el-button
              v-if="detailProject"
              icon="Edit"
              v-hasPermi="['sales:project:update']"
              @click="editDialogOpen = true"
            >
              修改项目
            </el-button>
            <el-button
              v-if="detailProject"
              type="primary"
              v-hasPermi="['sales:project:draft']"
              @click="handleGenerateDraft"
            >
              生成出库草稿
            </el-button>
          </div>
        </div>
      </template>

      <div v-loading="detailLoading">
        <template v-if="detailProject">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="项目编码">
              {{ detailProject.salesProjectCode || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="项目名称">
              {{ detailProject.salesProjectName || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="业务日期">
              {{ formatDate(detailProject.bizDate) }}
            </el-descriptions-item>
            <el-descriptions-item label="客户">
              {{ detailProject.customerName || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="负责人">
              {{ detailProject.managerName || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="车间">
              {{ detailProject.workshopName || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="库存范围">
              {{ detailProject.stockScopeName || "-" }}
            </el-descriptions-item>
            <el-descriptions-item label="备注">
              {{ detailProject.remark || "-" }}
            </el-descriptions-item>
          </el-descriptions>

          <el-row :gutter="12" class="summary-grid">
            <el-col v-for="card in summaryCards" :key="card.label" :xs="12" :sm="8" :lg="4">
              <div class="summary-card">
                <div class="summary-label">{{ card.label }}</div>
                <div class="summary-value">{{ card.value }}</div>
              </div>
            </el-col>
          </el-row>

          <div class="detail-toolbar">
            <div class="detail-tip">
              读模型字段复用主仓库存与销售出库/退货事实；生成草稿后仍需在销售出库编辑器中正式提交。
            </div>
          </div>

          <el-table
            :data="detailMaterials"
            border
            stripe
            max-height="560"
            @selection-change="handleDetailSelectionChange"
          >
            <el-table-column type="selection" width="48" align="center" />
            <el-table-column label="物料编码" prop="materialCode" min-width="120" />
            <el-table-column label="物料名称" prop="materialName" min-width="160" />
            <el-table-column label="规格型号" prop="specification" min-width="140" />
            <el-table-column label="单位" prop="unitCode" width="90" />
            <el-table-column label="目标数量" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.targetQty) }}
              </template>
            </el-table-column>
            <el-table-column label="当前库存" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.currentInventoryQty) }}
              </template>
            </el-table-column>
            <el-table-column label="累计出库" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.outboundQty) }}
              </template>
            </el-table-column>
            <el-table-column label="累计退货" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.returnQty) }}
              </template>
            </el-table-column>
            <el-table-column label="净发货" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.netShipmentQty) }}
              </template>
            </el-table-column>
            <el-table-column label="待供货" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.pendingSupplyQty) }}
              </template>
            </el-table-column>
            <el-table-column label="草稿数量" width="140">
              <template #default="{ row }">
                <el-input
                  v-model="row.draftQty"
                  placeholder="数量"
                  @input="normalizeDecimalField(row, 'draftQty', 6)"
                />
              </template>
            </el-table-column>
            <el-table-column label="参考单价" width="120" align="right">
              <template #default="{ row }">
                {{ formatAmount(row.targetUnitPrice) }}
              </template>
            </el-table-column>
            <el-table-column label="备注" prop="remark" min-width="160" show-overflow-tooltip />
          </el-table>
        </template>

        <el-empty v-else description="未找到销售项目详情">
          <el-button type="primary" @click="handleBack">返回销售项目列表</el-button>
        </el-empty>
      </div>
    </el-card>

    <sales-project-form-dialog
      v-model="editDialogOpen"
      :project-id="currentProjectId"
      @submitted="handleProjectUpdated"
    />

    <sales-order-editor-dialog
      v-model="draftEditorOpen"
      mode="order"
      :draft-payload="draftPayload"
      @submitted="handleDraftSubmitted"
    />
  </div>
</template>

<script setup name="SalesProjectDetailPage">
import { computed, getCurrentInstance, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createSalesProjectOutboundDraft,
  getSalesProject,
  getSalesProjectMaterials,
} from "@/api/sales-project";
import SalesOrderEditorDialog from "@/views/sales/components/SalesOrderEditorDialog.vue";
import {
  buildSalesProjectSummaryCards,
  formatAmount,
  formatDate,
  formatNumber,
  toInputString,
} from "../shared";
import SalesProjectFormDialog from "./SalesProjectFormDialog.vue";

const route = useRoute();
const router = useRouter();
const { proxy } = getCurrentInstance();

const detailLoading = ref(false);
const detailProject = ref(null);
const detailMaterials = ref([]);
const selectedDetailRows = ref([]);

const editDialogOpen = ref(false);
const draftEditorOpen = ref(false);
const draftPayload = ref(null);

const currentProjectId = computed(() => {
  const parsed = Number(route.params.projectId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
});

const headerSubtitle = computed(() => {
  if (detailProject.value) {
    return `${detailProject.value.salesProjectCode || "-"} / ${detailProject.value.salesProjectName || "-"}`;
  }
  return currentProjectId.value
    ? `项目 ID ${currentProjectId.value}`
    : "项目参数无效";
});

const summaryCards = computed(() =>
  buildSalesProjectSummaryCards(detailProject.value?.summary ?? {}),
);

const lifecycleLabel = computed(() => {
  if (detailProject.value?.lifecycleStatus === "VOIDED") {
    return "已作废";
  }
  return "生效中";
});

const lifecycleTagType = computed(() =>
  detailProject.value?.lifecycleStatus === "VOIDED" ? "danger" : "success",
);

function normalizeDecimalField(row, key, scale) {
  const rawValue = row[key];
  if (typeof rawValue !== "string") {
    return;
  }

  row[key] = rawValue
    .replace(/[^\d.]/g, "")
    .replace(/^\./, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^(\d+\.\d{0,})(\..*)$/, "$1")
    .replace(
      new RegExp(`^(\\d+)(\\.\\d{0,${scale}}).*?$`),
      (_match, integerPart, decimalPart) => `${integerPart}${decimalPart}`,
    );
}

async function loadDetail() {
  if (!currentProjectId.value) {
    detailProject.value = null;
    detailMaterials.value = [];
    selectedDetailRows.value = [];
    return;
  }

  detailLoading.value = true;
  try {
    const [projectResponse, materialsResponse] = await Promise.all([
      getSalesProject(currentProjectId.value),
      getSalesProjectMaterials(currentProjectId.value),
    ]);
    const project = projectResponse.data || {};
    const materials = Array.isArray(materialsResponse.data?.materials)
      ? materialsResponse.data.materials
      : [];
    detailProject.value = {
      ...project,
      summary: materialsResponse.data?.summary ?? null,
    };
    detailMaterials.value = materials.map((item) => ({
      ...item,
      draftQty: item.pendingSupplyQty > 0 ? toInputString(item.pendingSupplyQty) : "",
    }));
    selectedDetailRows.value = [];
  } catch (_error) {
    detailProject.value = null;
    detailMaterials.value = [];
    selectedDetailRows.value = [];
    proxy.$modal.msgError("加载销售项目详情失败");
  } finally {
    detailLoading.value = false;
  }
}

function handleBack() {
  router.replace("/sales/project");
}

function handleDetailSelectionChange(selection) {
  selectedDetailRows.value = selection;
}

function normalizeDraftPayload(draft, project, lines) {
  const normalizedLines = Array.isArray(draft?.lines)
    ? draft.lines.map((line, index) => {
        const sourceLine = lines[index] ?? {};
        return {
          materialId: line.materialId ?? sourceLine.materialId,
          materialCode: line.materialCode ?? sourceLine.materialCode ?? "",
          materialName: line.materialName ?? sourceLine.materialName ?? "",
          specification: line.specification ?? sourceLine.specification ?? "",
          quantity: line.quantity ?? sourceLine.quantity,
          selectedUnitCost: line.selectedUnitCost,
          unitPrice: line.unitPrice ?? sourceLine.unitPrice,
          salesProjectId:
            line.salesProjectId ?? draft.salesProjectId ?? project.projectId,
          salesProjectCode:
            line.salesProjectCode ??
            draft.salesProjectCode ??
            project.salesProjectCode,
          salesProjectName:
            line.salesProjectName ??
            draft.salesProjectName ??
            project.salesProjectName,
          remark: line.remark ?? sourceLine.remark ?? "",
        };
      })
    : lines.map((line) => ({
        materialId: line.materialId,
        materialCode: line.materialCode,
        materialName: line.materialName,
        specification: line.specification,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        salesProjectId: project.projectId,
        salesProjectCode: project.salesProjectCode,
        salesProjectName: project.salesProjectName,
        remark: line.remark || "",
      }));

  return {
    ...draft,
    customerId: draft?.customerId ?? project.customerId,
    customerCode: draft?.customerCode ?? project.customerCode,
    customerName: draft?.customerName ?? project.customerName,
    handlerPersonnelId: draft?.handlerPersonnelId ?? project.managerPersonnelId,
    handlerName: draft?.handlerName ?? project.managerName,
    workshopId: draft?.workshopId ?? project.workshopId,
    workshopName: draft?.workshopName ?? project.workshopName,
    salesProjectId: draft?.salesProjectId ?? project.projectId,
    salesProjectCode:
      draft?.salesProjectCode ?? project.salesProjectCode ?? "",
    salesProjectName:
      draft?.salesProjectName ?? project.salesProjectName ?? "",
    remark: draft?.remark ?? project.remark ?? "",
    lines: normalizedLines,
  };
}

async function handleGenerateDraft() {
  if (!detailProject.value) {
    return;
  }

  const selectedRows =
    selectedDetailRows.value.length > 0
      ? selectedDetailRows.value
      : detailMaterials.value.filter((item) => Number(item.draftQty || 0) > 0);

  if (selectedRows.length === 0) {
    proxy.$modal.msgWarning("请先选择至少一条待生成草稿的物料");
    return;
  }

  const lines = selectedRows
    .map((row) => ({
      materialId: row.materialId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      specification: row.specification,
      quantity: row.draftQty || row.pendingSupplyQty,
      unitPrice: row.targetUnitPrice,
      remark: row.remark,
    }))
    .filter((item) => Number(item.quantity || 0) > 0);

  if (lines.length === 0) {
    proxy.$modal.msgWarning("草稿数量必须大于 0");
    return;
  }

  const response = await createSalesProjectOutboundDraft(
    detailProject.value.projectId,
    {
      lines: lines.map((line) => ({
        materialId: line.materialId,
        quantity: toInputString(line.quantity),
        unitPrice: toInputString(line.unitPrice),
        remark: line.remark,
      })),
    },
  );

  draftPayload.value = normalizeDraftPayload(
    response.data ?? {},
    detailProject.value,
    lines,
  );
  draftEditorOpen.value = true;
}

function handleDraftSubmitted() {
  draftEditorOpen.value = false;
  draftPayload.value = null;
  void loadDetail();
}

function handleProjectUpdated() {
  editDialogOpen.value = false;
  void loadDetail();
}

watch(
  () => route.params.projectId,
  () => {
    void loadDetail();
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.sales-project-detail-page {
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: #303133;
  }

  .page-subtitle {
    margin-top: 8px;
    color: #606266;
    font-size: 14px;
  }

  .page-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }

  .summary-grid {
    margin: 16px 0;
  }

  .summary-card {
    height: 100%;
    padding: 14px 16px;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
  }

  .summary-label {
    color: #909399;
    font-size: 13px;
  }

  .summary-value {
    margin-top: 8px;
    font-size: 22px;
    font-weight: 600;
    color: #303133;
  }

  .detail-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 0;
  }

  .detail-tip {
    color: #909399;
    font-size: 13px;
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
    }

    .page-actions {
      justify-content: flex-start;
    }
  }
}
</style>
