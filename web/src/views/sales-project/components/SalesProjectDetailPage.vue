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
              icon="Plus"
              v-hasPermi="['inbound:order:create']"
              @click="handleCreateAcceptanceOrder"
            >
              新增验收单
            </el-button>
            <el-button
              v-if="detailProject"
              icon="Connection"
              v-hasPermi="['sales:project:update']"
              @click="openSelectMaterialDialog"
            >
              选择库存物料
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

          <div class="summary-grid">
            <div v-for="card in summaryCards" :key="card.label" class="summary-card">
              <div class="summary-label">{{ card.label }}</div>
              <div class="summary-value">{{ card.value }}</div>
            </div>
          </div>

          <div class="detail-toolbar">
            <div class="detail-tip">
              项目库存物料明细
            </div>
          </div>

          <el-table
            :data="detailMaterials"
            border
            stripe
            max-height="560"
            @selection-change="handleDetailSelectionChange"
          >
            <el-table-column
              type="selection"
              width="48"
              align="center"
              :selectable="isDraftableMaterialRow"
            />
            <el-table-column
              type="index"
              label="序号"
              width="64"
              align="center"
            />
            <el-table-column label="物料编码" prop="materialCode" min-width="120" />
            <el-table-column label="物料名称" prop="materialName" min-width="160" />
            <el-table-column label="规格型号" prop="specification" min-width="140" />
            <el-table-column label="单位" prop="unitCode" width="90" />
            <el-table-column label="来源" width="120">
              <template #default="{ row }">
                {{ row.materialSourceType === "SELECTED_STOCK" ? "已有库存候选" : "项目库存" }}
              </template>
            </el-table-column>
            <el-table-column label="关联表单" min-width="170">
              <template #default="{ row }">
                <div v-if="hasLinkedDocuments(row)" class="linked-documents">
                  <el-button
                    link
                    type="primary"
                    @click="openLinkedAcceptanceOrder(row.linkedDocuments[0])"
                  >
                    {{ formatLinkedDocumentLabel(row.linkedDocuments[0]) }}
                  </el-button>
                  <el-dropdown
                    v-if="row.linkedDocuments.length > 1"
                    trigger="click"
                    @command="handleLinkedDocumentCommand"
                  >
                    <el-button link type="primary">
                      更多 {{ row.linkedDocuments.length - 1 }}
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="document in row.linkedDocuments.slice(1)"
                          :key="document.lineId"
                          :command="document"
                        >
                          {{ formatLinkedDocumentLabel(document) }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="成本价层" width="120" align="right">
              <template #default="{ row }">
                {{ row.selectedUnitCost || "-" }}
              </template>
            </el-table-column>
            <el-table-column label="项目库存" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.currentInventoryQty) }}
              </template>
            </el-table-column>
            <el-table-column label="价层可用" width="110" align="right">
              <template #default="{ row }">
                {{ formatNumber(row.priceLayerAvailableQty) }}
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
            <el-table-column label="草稿数量" width="140">
              <template #default="{ row }">
                <el-input
                  v-model="row.draftQty"
                  :disabled="!isDraftableMaterialRow(row)"
                  placeholder="数量"
                  @input="normalizeDecimalField(row, 'draftQty', 6)"
                />
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

    <sales-project-acceptance-order-dialog
      v-model="acceptanceDialogOpen"
      :project="detailProject"
      @submitted="handleAcceptanceSubmitted"
    />

    <sales-project-acceptance-order-detail-dialog
      v-model="acceptanceDetailOpen"
      :order="acceptanceDetail"
      :loading="acceptanceDetailLoading"
    />

    <el-dialog
      v-model="selectMaterialDialogOpen"
      title="选择已有库存物料"
      width="640px"
      append-to-body
      draggable
    >
      <el-form :model="selectMaterialForm" label-width="96px">
        <el-form-item label="物料">
          <el-select
            v-model="selectMaterialForm.materialId"
            filterable
            remote
            reserve-keyword
            clearable
            placeholder="请输入物料编码、名称或规格"
            style="width: 100%"
            :remote-method="searchMaterialOptions"
            :loading="materialLoading"
          >
            <el-option
              v-for="item in materialOptions"
              :key="item.materialId"
              :label="`${item.materialCode} / ${item.materialName}`"
              :value="item.materialId"
            >
              <span style="float: left; color: #ff7171">{{ item.materialCode }}</span>
              <span style="float: left; margin-left: 10px">{{ item.materialName }}</span>
              <span style="float: right; color: #909399">{{ item.specification }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="参考数量">
          <el-input
            v-model="selectMaterialForm.quantity"
            placeholder="用于项目候选清单，不占用库存"
            @input="normalizeDecimalField(selectMaterialForm, 'quantity', 6)"
          />
        </el-form-item>
        <el-form-item label="参考单价">
          <el-input
            v-model="selectMaterialForm.unitPrice"
            placeholder="0"
            @input="normalizeDecimalField(selectMaterialForm, 'unitPrice', 2)"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="selectMaterialForm.remark" type="textarea" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="selectMaterialDialogOpen = false">取 消</el-button>
          <el-button type="primary" :loading="selectMaterialSubmitting" @click="submitSelectedMaterial">
            确 定
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="SalesProjectDetailPage">
import { computed, getCurrentInstance, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { getOrder } from "@/api/entry/order";
import {
  createSalesProjectOutboundDraft,
  getSalesProject,
  getSalesProjectMaterials,
  updateSalesProject,
} from "@/api/sales-project";
import SalesOrderEditorDialog from "@/views/sales/components/SalesOrderEditorDialog.vue";
import {
  buildSalesProjectSummaryCards,
  formatDate,
  formatNumber,
  toInputString,
} from "../shared";
import SalesProjectAcceptanceOrderDetailDialog from "./SalesProjectAcceptanceOrderDetailDialog.vue";
import SalesProjectAcceptanceOrderDialog from "./SalesProjectAcceptanceOrderDialog.vue";
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
const acceptanceDialogOpen = ref(false);
const acceptanceDetailOpen = ref(false);
const acceptanceDetailLoading = ref(false);
const acceptanceDetail = ref(null);
const selectMaterialDialogOpen = ref(false);
const selectMaterialSubmitting = ref(false);
const selectMaterialForm = ref({
  materialId: undefined,
  quantity: "1",
  unitPrice: "0",
  remark: "",
});
const materialOptions = ref([]);
const materialLoading = ref(false);

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
  buildSalesProjectSummaryCards({
    ...(detailProject.value?.summary ?? {}),
    materialKindCount: countMaterialKinds(detailMaterials.value),
  }),
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

function countMaterialKinds(materials) {
  return new Set(
    materials
      .map((item) => item.materialId)
      .filter(
        (materialId) =>
          materialId !== null && typeof materialId !== "undefined",
      ),
  ).size;
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
      draftQty: isDraftableMaterialRow(item)
        ? toInputString(item.currentInventoryQty)
        : "",
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

function handleCreateAcceptanceOrder() {
  if (!currentProjectId.value) {
    return;
  }
  acceptanceDialogOpen.value = true;
}

function openSelectMaterialDialog() {
  selectMaterialForm.value = {
    materialId: undefined,
    quantity: "1",
    unitPrice: "0",
    remark: "",
  };
  selectMaterialDialogOpen.value = true;
}

async function searchMaterialOptions(keyword) {
  materialLoading.value = true;
  try {
    const response = await listMaterialByCodeOrName({
      materialCode: keyword,
      pageNum: 1,
      pageSize: 100,
    });
    materialOptions.value = response.rows || [];
  } finally {
    materialLoading.value = false;
  }
}

async function submitSelectedMaterial() {
  if (!detailProject.value || !selectMaterialForm.value.materialId) {
    proxy.$modal.msgWarning("请选择物料");
    return;
  }
  if (Number(selectMaterialForm.value.quantity || 0) <= 0) {
    proxy.$modal.msgWarning("参考数量必须大于 0");
    return;
  }
  const materialId = selectMaterialForm.value.materialId;
  const existingLines = detailProject.value.materialLines || [];
  if (existingLines.some((line) => Number(line.materialId) === Number(materialId))) {
    proxy.$modal.msgWarning("该物料已经在项目中");
    return;
  }

  selectMaterialSubmitting.value = true;
  try {
    await updateSalesProject(detailProject.value.projectId, {
      materialLines: [
        ...existingLines.map((line) => ({
          materialId: line.materialId,
          quantity: toInputString(line.quantity || 0),
          unitPrice: toInputString(line.unitPrice || 0),
          remark: line.remark || "",
        })),
        {
          materialId,
          quantity: selectMaterialForm.value.quantity,
          unitPrice: selectMaterialForm.value.unitPrice || "0",
          remark: selectMaterialForm.value.remark || "",
        },
      ],
    });
    proxy.$modal.msgSuccess("已加入项目候选物料");
    selectMaterialDialogOpen.value = false;
    await loadDetail();
  } finally {
    selectMaterialSubmitting.value = false;
  }
}

function handleDetailSelectionChange(selection) {
  selectedDetailRows.value = selection.filter((item) => isDraftableMaterialRow(item));
}

function hasSelectedUnitCost(row) {
  if (row?.selectedUnitCost === null || typeof row?.selectedUnitCost === "undefined") {
    return false;
  }
  return String(row.selectedUnitCost).trim() !== "";
}

function isDraftableMaterialRow(row) {
  return hasSelectedUnitCost(row) && Number(row?.currentInventoryQty || 0) > 0;
}

function hasLinkedDocuments(row) {
  return Array.isArray(row?.linkedDocuments) && row.linkedDocuments.length > 0;
}

function formatLinkedDocumentLabel(document) {
  return document?.documentNo || document?.documentLabel || "关联表单";
}

function handleLinkedDocumentCommand(document) {
  void openLinkedAcceptanceOrder(document);
}

async function openLinkedAcceptanceOrder(document) {
  if (!document?.documentId) {
    return;
  }

  acceptanceDetailOpen.value = true;
  acceptanceDetailLoading.value = true;
  try {
    const response = await getOrder(document.documentId);
    acceptanceDetail.value = response.data ?? null;
  } catch (_error) {
    acceptanceDetail.value = null;
    proxy.$modal.msgError("加载关联验收单失败");
  } finally {
    acceptanceDetailLoading.value = false;
  }
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
          selectedUnitCost: line.selectedUnitCost ?? sourceLine.selectedUnitCost,
          sourceProjectTargetId:
            line.sourceProjectTargetId ?? sourceLine.sourceProjectTargetId ?? null,
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
          projectTargetId:
            line.projectTargetId ?? draft.projectTargetId ?? project.projectTargetId,
          remark: line.remark ?? sourceLine.remark ?? "",
        };
      })
    : lines.map((line) => ({
        materialId: line.materialId,
        materialCode: line.materialCode,
        materialName: line.materialName,
        specification: line.specification,
        quantity: line.quantity,
        selectedUnitCost: line.selectedUnitCost,
        sourceProjectTargetId: line.sourceProjectTargetId ?? null,
        unitPrice: line.unitPrice,
        salesProjectId: project.projectId,
        salesProjectCode: project.salesProjectCode,
        salesProjectName: project.salesProjectName,
        projectTargetId: project.projectTargetId,
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
    projectTargetId: draft?.projectTargetId ?? project.projectTargetId,
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
      ? selectedDetailRows.value.filter((item) => isDraftableMaterialRow(item))
      : detailMaterials.value.filter(
          (item) =>
            isDraftableMaterialRow(item) && Number(item.draftQty || 0) > 0,
        );

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
      quantity: row.draftQty || row.currentInventoryQty,
      selectedUnitCost: row.selectedUnitCost,
      sourceProjectTargetId: row.sourceProjectTargetId ?? null,
      unitPrice: "0",
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
        selectedUnitCost: toInputString(line.selectedUnitCost),
        sourceProjectTargetId: line.sourceProjectTargetId ?? null,
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

function handleAcceptanceSubmitted() {
  acceptanceDialogOpen.value = false;
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
    display: grid;
    grid-template-columns: repeat(7, minmax(112px, 1fr));
    gap: 12px;
    margin: 16px 0;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .summary-card {
    min-width: 0;
    height: 100%;
    padding: 12px 14px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
  }

  .summary-label {
    color: #909399;
    font-size: 13px;
  }

  .summary-value {
    margin-top: 8px;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
    color: #303133;
    word-break: break-all;
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

  .linked-documents {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
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
