<template>
  <div class="app-container project-page">
    <el-card shadow="never" class="hero-card">
      <div class="hero">
        <div>
          <div class="hero-eyebrow">RD_SUB 研发项目</div>
          <h1 class="hero-title">研发项目主档、BOM、缺料与台账</h1>
          <p class="hero-copy">
            统一管理 RD 内部研发项目主档，维护 BOM，查看缺料补货状态，并记录研发项目领料、退料、报废事实。
          </p>
        </div>
        <div class="hero-badges">
          <el-tag effect="dark" type="success">{{ workshopLabel }}</el-tag>
          <el-tag effect="plain" type="info">固定仓别 {{ stockScopeLabel }}</el-tag>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <el-form :inline="true" class="query-form">
        <el-form-item label="项目编码">
          <el-input
            v-model="filters.projectCode"
            clearable
            placeholder="请输入项目编码"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="项目名称">
          <el-input
            v-model="filters.projectName"
            clearable
            placeholder="请输入项目名称"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="toolbar">
        <div class="toolbar-copy">
          <div class="toolbar-title">研发项目主档</div>
          <div class="toolbar-subtitle">BOM 保存不会直接过账库存，库存动作在研发项目台账中单独记录。</div>
        </div>
        <el-button type="primary" @click="openProjectDialog()">新增研发项目</el-button>
      </div>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="projectCode" label="项目编码" min-width="160">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">
              {{ row.projectCode }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="projectName" label="项目名称" min-width="180" />
        <el-table-column label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column label="BOM 行数" min-width="100">
          <template #default="{ row }">
            {{ row.bomLineCount || row.bomLines?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="计划数量" min-width="120">
          <template #default="{ row }">
            {{ formatDecimal(row.totalQty) }}
          </template>
        </el-table-column>
        <el-table-column label="计划金额" min-width="120">
          <template #default="{ row }">
            {{ formatCurrency(row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" />
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
            <el-button link type="primary" @click="openProjectDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="handleVoidProject(row.id)">作废</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :current-page="pageNum"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="projectDialogOpen"
      :title="projectForm.id ? '编辑研发项目' : '新增研发项目'"
      width="1080px"
      destroy-on-close
    >
      <el-form label-width="100px" class="project-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="项目编码">
              <el-input
                v-model="projectForm.projectCode"
                disabled
                placeholder="保存后自动生成: XMBH-顺序ID"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务日期">
              <el-date-picker
                v-model="projectForm.bizDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="项目名称">
              <el-input v-model="projectForm.projectName" placeholder="请输入项目名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务车间">
              <el-select
                v-if="!userStore.workshopScope?.workshopId"
                v-model="projectForm.workshopId"
                filterable
                clearable
                placeholder="请选择业务车间"
                :loading="workshopLoading"
                style="width: 100%"
              >
                <el-option
                  v-for="item in workshopOptions"
                  :key="item.workshopId"
                  :label="item.workshopName"
                  :value="item.workshopId"
                />
              </el-select>
              <el-input
                v-else
                :model-value="projectForm.workshopName || workshopLabel"
                disabled
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="作业仓别">
              <el-input :model-value="stockScopeLabel" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12" />
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="projectForm.remark" type="textarea" :rows="3" />
        </el-form-item>

        <div class="section-toolbar">
          <div>
            <div class="section-title">研发项目 BOM</div>
            <div class="section-subtitle">计划量与参考成本只用于计划、缺料和成本基线，不直接影响库存。</div>
          </div>
          <el-button type="primary" plain @click="addBomLine">新增 BOM 行</el-button>
        </div>

        <el-table :data="projectForm.bomLines" border stripe>
          <el-table-column label="物料" min-width="240">
            <template #default="{ row }">
              <el-select
                v-model="row.materialId"
                filterable
                remote
                reserve-keyword
                clearable
                placeholder="请输入物料编码或名称"
                :remote-method="searchMaterials"
                :loading="materialLoading"
                style="width: 100%"
              >
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="`${item.materialCode} ${item.materialName}`"
                  :value="item.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="计划数量" min-width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                :min="0.000001"
                :precision="6"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="参考单价" min-width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.unitPrice"
                :min="0"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="计划金额" min-width="130">
            <template #default="{ row }">
              {{ formatCurrency(calculateLineAmount(row)) }}
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.remark" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeBomLine($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>

      <template #footer>
        <el-button @click="projectDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="projectSubmitting" @click="submitProject">
          保存研发项目
        </el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="detailOpen"
      size="80%"
      title="研发项目详情"
      destroy-on-close
      @closed="resetDetailState"
    >
      <template v-if="detailRow">
        <div class="detail-shell">
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-label">计划成本</div>
              <div class="summary-value">{{ formatCurrency(detailRow.ledgerSummary?.plannedAmount) }}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">已领成本</div>
              <div class="summary-value">{{ formatCurrency(detailRow.ledgerSummary?.pickedCost) }}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">退料回补</div>
              <div class="summary-value">{{ formatCurrency(detailRow.ledgerSummary?.returnedCost) }}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">报废损耗</div>
              <div class="summary-value">{{ formatCurrency(detailRow.ledgerSummary?.scrappedCost) }}</div>
            </div>
            <div class="summary-card accent">
              <div class="summary-label">净耗用成本</div>
              <div class="summary-value">{{ formatCurrency(detailRow.ledgerSummary?.netCost) }}</div>
            </div>
            <div class="summary-card warning">
              <div class="summary-label">缺口物料数</div>
              <div class="summary-value">{{ detailRow.ledgerSummary?.shortageLineCount || 0 }}</div>
            </div>
          </div>

          <el-descriptions :column="3" border class="detail-descriptions">
            <el-descriptions-item label="项目编码">
              {{ detailRow.projectCode }}
            </el-descriptions-item>
            <el-descriptions-item label="项目名称">
              {{ detailRow.projectName }}
            </el-descriptions-item>
            <el-descriptions-item label="业务日期">
              {{ formatDate(detailRow.bizDate) }}
            </el-descriptions-item>
            <el-descriptions-item label="作业仓别">
              {{ detailRow.fixedStockScope || stockScopeLabel }}
            </el-descriptions-item>
            <el-descriptions-item label="车间">
              {{ detailRow.workshopNameSnapshot }}
            </el-descriptions-item>
            <el-descriptions-item label="备注">
              {{ detailRow.remark || "-" }}
            </el-descriptions-item>
          </el-descriptions>

          <el-tabs v-model="detailTab" class="detail-tabs">
            <el-tab-pane label="BOM / 缺料 / 台账" name="ledger">
              <el-table :data="detailRow.materialLedger || []" stripe border>
                <el-table-column prop="materialCode" label="物料编码" min-width="140" />
                <el-table-column prop="materialName" label="物料名称" min-width="180" />
                <el-table-column prop="plannedQty" label="计划量" min-width="110">
                  <template #default="{ row }">
                    {{ formatDecimal(row.plannedQty) }}
                  </template>
                </el-table-column>
                <el-table-column prop="currentAvailableQty" label="当前可用" min-width="110">
                  <template #default="{ row }">
                    {{ formatDecimal(row.currentAvailableQty) }}
                  </template>
                </el-table-column>
                <el-table-column prop="pickedQty" label="已领" min-width="100">
                  <template #default="{ row }">
                    {{ formatDecimal(row.pickedQty) }}
                  </template>
                </el-table-column>
                <el-table-column prop="returnedQty" label="已退" min-width="100">
                  <template #default="{ row }">
                    {{ formatDecimal(row.returnedQty) }}
                  </template>
                </el-table-column>
                <el-table-column prop="scrappedQty" label="已报废" min-width="100">
                  <template #default="{ row }">
                    {{ formatDecimal(row.scrappedQty) }}
                  </template>
                </el-table-column>
                <el-table-column prop="netConsumedQty" label="净耗用" min-width="110">
                  <template #default="{ row }">
                    {{ formatDecimal(row.netConsumedQty) }}
                  </template>
                </el-table-column>
                <el-table-column prop="shortageQty" label="缺口量" min-width="110">
                  <template #default="{ row }">
                    <span :class="{ 'warn-text': Number(row.shortageQty || 0) > 0 }">
                      {{ formatDecimal(row.shortageQty) }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="replenishmentStatus" label="补货状态" min-width="130">
                  <template #default="{ row }">
                    <el-tag :type="Number(row.shortageQty || 0) > 0 ? 'warning' : 'success'">
                      {{ row.replenishmentStatus }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="procurementOpenQty" label="补货在途" min-width="110">
                  <template #default="{ row }">
                    {{ formatDecimal(row.procurementOpenQty) }}
                  </template>
                </el-table-column>
                <el-table-column prop="netCost" label="净耗用成本" min-width="130">
                  <template #default="{ row }">
                    {{ formatCurrency(row.netCost) }}
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="研发项目物料动作" name="actions">
              <div class="section-toolbar compact">
                <div>
                  <div class="section-title">领料 / 退料 / 报废</div>
                  <div class="section-subtitle">库存事实统一通过 inventory-core 落账，并持续挂到当前研发项目。</div>
                </div>
                <el-button type="primary" @click="openActionDialog">新增项目动作</el-button>
              </div>

              <el-table :data="actionRows" stripe border v-loading="actionLoading">
                <el-table-column type="expand">
                  <template #default="{ row }">
                    <el-table :data="row.lines || []" stripe size="small">
                      <el-table-column prop="lineNo" label="行号" width="70" />
                      <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="130" />
                      <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="160" />
                      <el-table-column label="数量" min-width="100">
                        <template #default="{ row: line }">
                          {{ formatDecimal(line.quantity) }}
                        </template>
                      </el-table-column>
                      <el-table-column label="参考金额" min-width="110">
                        <template #default="{ row: line }">
                          {{ formatCurrency(line.amount) }}
                        </template>
                      </el-table-column>
                      <el-table-column label="成本金额" min-width="110">
                        <template #default="{ row: line }">
                          {{ formatCurrency(line.costAmount) }}
                        </template>
                      </el-table-column>
                      <el-table-column label="可退数量" min-width="110">
                        <template #default="{ row: line }">
                          {{ line.availableReturnQty == null ? "-" : formatDecimal(line.availableReturnQty) }}
                        </template>
                      </el-table-column>
                      <el-table-column prop="remark" label="备注" min-width="160" />
                    </el-table>
                  </template>
                </el-table-column>
                <el-table-column prop="documentNo" label="单号" min-width="140" />
                <el-table-column label="动作类型" min-width="110">
                  <template #default="{ row }">
                    <el-tag :type="actionTagType(row.actionType)">{{ actionLabel(row.actionType) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="业务日期" min-width="120">
                  <template #default="{ row }">
                    {{ formatDate(row.bizDate) }}
                  </template>
                </el-table-column>
                <el-table-column label="总数量" min-width="110">
                  <template #default="{ row }">
                    {{ formatDecimal(row.totalQty) }}
                  </template>
                </el-table-column>
                <el-table-column label="总金额" min-width="120">
                  <template #default="{ row }">
                    {{ formatCurrency(row.totalAmount) }}
                  </template>
                </el-table-column>
                <el-table-column label="状态" min-width="100">
                  <template #default="{ row }">
                    <el-tag :type="row.lifecycleStatus === 'VOIDED' ? 'info' : 'success'">
                      {{ row.lifecycleStatus === "VOIDED" ? "已作废" : "有效" }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      link
                      type="danger"
                      :disabled="row.lifecycleStatus === 'VOIDED'"
                      @click="handleVoidAction(row.id)"
                    >
                      作废
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </div>
      </template>
    </el-drawer>

    <el-dialog
      v-model="actionDialogOpen"
      title="新增研发项目物料动作"
      width="980px"
      destroy-on-close
    >
      <el-form label-width="100px" class="action-form">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="动作类型">
              <el-select v-model="actionForm.actionType" style="width: 100%">
                <el-option label="研发项目领料" value="PICK" />
                <el-option label="研发项目退料" value="RETURN" />
                <el-option label="研发项目报废" value="SCRAP" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="业务日期">
              <el-date-picker
                v-model="actionForm.bizDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="actionForm.remark" type="textarea" :rows="2" />
        </el-form-item>

        <div class="section-toolbar">
          <div>
            <div class="section-title">动作明细</div>
            <div class="section-subtitle">
              退料必须关联上游领料行，系统将自动释放对应来源占用并回补成本。
            </div>
          </div>
          <el-button type="primary" plain @click="addActionLine">新增明细</el-button>
        </div>

        <el-table :data="actionForm.lines" border stripe>
          <el-table-column v-if="actionForm.actionType === 'RETURN'" label="来源领料行" min-width="280">
            <template #default="{ row }">
              <el-select
                v-model="row.sourceKey"
                filterable
                clearable
                placeholder="请选择可退的领料行"
                style="width: 100%"
                @change="handleReturnSourceChange(row)"
              >
                <el-option
                  v-for="item in returnSourceOptions"
                  :key="item.key"
                  :label="item.label"
                  :value="item.key"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="物料" min-width="220">
            <template #default="{ row }">
              <el-select
                v-model="row.materialId"
                filterable
                remote
                reserve-keyword
                clearable
                :disabled="actionForm.actionType === 'RETURN'"
                placeholder="请输入物料编码或名称"
                :remote-method="searchMaterials"
                :loading="materialLoading"
                style="width: 100%"
              >
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="`${item.materialCode} ${item.materialName}`"
                  :value="item.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="数量" min-width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                :min="0.000001"
                :precision="6"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="参考单价" min-width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.unitPrice"
                :min="0"
                :precision="2"
                controls-position="right"
                :disabled="actionForm.actionType === 'RETURN'"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.remark" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeActionLine($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>

      <template #footer>
        <el-button @click="actionDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="actionSubmitting" @click="submitAction">
          保存动作
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="RdProjectPage">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { listWorkshop } from "@/api/base/workshop";
import {
  createRdProject,
  createRdProjectMaterialAction,
  getRdProject,
  listRdMaterials,
  listRdProjectMaterialActions,
  listRdProjects,
  updateRdProject,
  voidRdProject,
  voidRdProjectMaterialAction,
} from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";
import { confirmDocumentSave } from "@/utils/documentConfirm";
import { formatDateOnly } from "@/utils/rd-documents";

const userStore = useUserStore();

const loading = ref(false);
const materialLoading = ref(false);
const workshopLoading = ref(false);
const projectSubmitting = ref(false);
const actionSubmitting = ref(false);
const actionLoading = ref(false);

const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);

const projectDialogOpen = ref(false);
const detailOpen = ref(false);
const actionDialogOpen = ref(false);
const detailTab = ref("ledger");

const detailRow = ref(null);
const actionRows = ref([]);
const selectedProjectId = ref(null);

const materialOptions = ref([]);
const workshopOptions = ref([]);
const filters = ref({
  projectCode: "",
  projectName: "",
});

const projectForm = ref(createEmptyProjectForm());
const actionForm = ref(createEmptyActionForm());

const stockScopeLabel = computed(
  () => userStore.stockScope?.stockScopeName || "研发小仓",
);
const workshopLabel = computed(
  () => userStore.workshopScope?.workshopName || "未绑定车间",
);

const returnSourceOptions = computed(() =>
  actionRows.value
    .filter((action) => action.actionType === "PICK" && action.lifecycleStatus === "EFFECTIVE")
    .flatMap((action) =>
      (action.lines || [])
        .filter((line) => Number(line.availableReturnQty || 0) > 0)
        .map((line) => ({
          key: `${action.id}:${line.id}`,
          actionId: action.id,
          lineId: line.id,
          materialId: line.materialId,
          availableReturnQty: Number(line.availableReturnQty || 0),
          unitPrice: Number(line.costUnitPrice || line.unitPrice || 0),
          label: `${action.documentNo} / ${line.materialCodeSnapshot} ${line.materialNameSnapshot} / 可退 ${formatDecimal(line.availableReturnQty)}`,
        })),
    ),
);

watch(
  () => actionForm.value.actionType,
  (value) => {
    if (value !== "RETURN") {
      actionForm.value.lines = actionForm.value.lines.map((line) => ({
        ...line,
        sourceKey: "",
        sourceDocumentId: null,
        sourceDocumentLineId: null,
      }));
      return;
    }

    actionForm.value.lines = actionForm.value.lines.map((line) => ({
      ...line,
      materialId: null,
      unitPrice: 0,
    }));
  },
);

function createEmptyBomLine() {
  return {
    materialId: null,
    quantity: 1,
    unitPrice: 0,
    remark: "",
  };
}

function createEmptyProjectForm() {
  return {
    id: null,
    projectCode: "",
    projectName: "",
    bizDate: formatDateOnly(),
    workshopId: userStore.workshopScope?.workshopId || null,
    workshopName: userStore.workshopScope?.workshopName || "",
    remark: "",
    bomLines: [createEmptyBomLine()],
  };
}

function createEmptyActionLine() {
  return {
    materialId: null,
    quantity: 1,
    unitPrice: 0,
    sourceKey: "",
    sourceDocumentId: null,
    sourceDocumentLineId: null,
    remark: "",
  };
}

function createEmptyActionForm() {
  return {
    actionType: "PICK",
    bizDate: formatDateOnly(),
    remark: "",
    lines: [createEmptyActionLine()],
  };
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("zh-CN");
}

function formatDecimal(value) {
  if (value == null || value === "") {
    return "0";
  }
  return Number(value).toFixed(6).replace(/\.?0+$/, "");
}

function formatCurrency(value) {
  if (value == null || value === "") {
    return "0.00";
  }
  return Number(value).toFixed(2);
}

function calculateLineAmount(row) {
  return Number(row.quantity || 0) * Number(row.unitPrice || 0);
}

async function searchMaterials(keyword) {
  materialLoading.value = true;
  try {
    const response = await listRdMaterials({
      keyword: keyword || undefined,
      limit: 20,
      offset: 0,
    });
    materialOptions.value = response.data?.items || [];
  } finally {
    materialLoading.value = false;
  }
}

async function loadWorkshopOptions() {
  if (userStore.workshopScope?.workshopId) {
    return;
  }
  workshopLoading.value = true;
  try {
    const response = await listWorkshop({
      pageNum: 1,
      pageSize: 100,
    });
    workshopOptions.value = response.rows || [];
  } finally {
    workshopLoading.value = false;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listRdProjects({
      projectCode: filters.value.projectCode || undefined,
      projectName: filters.value.projectName || undefined,
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    rows.value = response.data?.items || [];
    total.value = response.data?.total || 0;
  } finally {
    loading.value = false;
  }
}

async function loadProjectDetail(projectId) {
  const response = await getRdProject(projectId);
  detailRow.value = response.data || null;
}

async function loadProjectActions(projectId) {
  actionLoading.value = true;
  try {
    const response = await listRdProjectMaterialActions(projectId);
    actionRows.value = response.data?.items || [];
  } finally {
    actionLoading.value = false;
  }
}

function handleSearch() {
  pageNum.value = 1;
  loadRows();
}

function handleReset() {
  filters.value.projectCode = "";
  filters.value.projectName = "";
  pageNum.value = 1;
  loadRows();
}

function handlePageChange(value) {
  pageNum.value = value;
  loadRows();
}

function handleSizeChange(value) {
  pageSize.value = value;
  pageNum.value = 1;
  loadRows();
}

function addBomLine() {
  projectForm.value.bomLines.push(createEmptyBomLine());
}

function removeBomLine(index) {
  projectForm.value.bomLines.splice(index, 1);
  if (projectForm.value.bomLines.length === 0) {
    projectForm.value.bomLines.push(createEmptyBomLine());
  }
}

function addActionLine() {
  actionForm.value.lines.push(createEmptyActionLine());
}

function removeActionLine(index) {
  actionForm.value.lines.splice(index, 1);
  if (actionForm.value.lines.length === 0) {
    actionForm.value.lines.push(createEmptyActionLine());
  }
}

function openProjectDialog(row) {
  if (!row) {
    projectForm.value = createEmptyProjectForm();
    projectDialogOpen.value = true;
    return;
  }

  projectForm.value = {
    id: row.id,
    projectCode: row.projectCode,
    projectName: row.projectName,
    bizDate: row.bizDate?.slice?.(0, 10) || formatDateOnly(),
    workshopId: row.workshopId || userStore.workshopScope?.workshopId || null,
    workshopName: row.workshopNameSnapshot || userStore.workshopScope?.workshopName || "",
    remark: row.remark || "",
    bomLines:
      row.bomLines?.length > 0
        ? row.bomLines.map((line) => ({
            materialId: line.materialId,
            quantity: Number(line.quantity || 0),
            unitPrice: Number(line.unitPrice || 0),
            remark: line.remark || "",
          }))
        : [createEmptyBomLine()],
  };
  projectDialogOpen.value = true;
}

async function openDetail(projectId) {
  selectedProjectId.value = projectId;
  detailOpen.value = true;
  detailTab.value = "ledger";
  await Promise.all([loadProjectDetail(projectId), loadProjectActions(projectId)]);
}

function resetDetailState() {
  detailRow.value = null;
  actionRows.value = [];
  selectedProjectId.value = null;
  actionDialogOpen.value = false;
}

function validateProjectForm() {
  if (
    (projectForm.value.id && !projectForm.value.projectCode) ||
    !projectForm.value.projectName ||
    !projectForm.value.bizDate
  ) {
    ElMessage.error("请填写完整的研发项目头信息");
    return false;
  }
  if (!projectForm.value.workshopId) {
    ElMessage.error("请选择业务车间");
    return false;
  }

  const bomLines = projectForm.value.bomLines || [];
  for (let index = 0; index < bomLines.length; index += 1) {
    const line = bomLines[index];
    const hasContent = line.materialId || Number(line.quantity || 0) > 0 || Number(line.unitPrice || 0) > 0;
    if (!hasContent) {
      continue;
    }
    if (!line.materialId) {
      ElMessage.error(`第 ${index + 1} 行 BOM 物料不能为空`);
      return false;
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      ElMessage.error(`第 ${index + 1} 行 BOM 数量必须大于 0`);
      return false;
    }
  }

  return true;
}

async function submitProject() {
  if (!validateProjectForm()) {
    return;
  }

  projectSubmitting.value = true;
  try {
    const payload = {
      projectName: projectForm.value.projectName,
      bizDate: projectForm.value.bizDate,
      workshopId: projectForm.value.workshopId,
      remark: projectForm.value.remark || undefined,
      bomLines: (projectForm.value.bomLines || [])
        .filter((line) => line.materialId)
        .map((line) => ({
          materialId: line.materialId,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice || 0),
          remark: line.remark || undefined,
        })),
    };
    if (projectForm.value.id) {
      payload.projectCode = projectForm.value.projectCode;
    }

    if (projectForm.value.id) {
      await updateRdProject(projectForm.value.id, payload);
      ElMessage.success("研发项目已更新");
    } else {
      await createRdProject(payload);
      ElMessage.success("研发项目已创建");
    }

    projectDialogOpen.value = false;
    loadRows();
    if (selectedProjectId.value && Number(selectedProjectId.value) === Number(projectForm.value.id)) {
      await Promise.all([
        loadProjectDetail(selectedProjectId.value),
        loadProjectActions(selectedProjectId.value),
      ]);
    }
  } finally {
    projectSubmitting.value = false;
  }
}

async function handleVoidProject(projectId) {
  try {
    const result = await ElMessageBox.prompt("请输入作废原因", "作废研发项目", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputValue: "研发项目主档归档作废",
    });
    await voidRdProject(projectId, {
      voidReason: result.value,
    });
    ElMessage.success("研发项目已作废");
    if (selectedProjectId.value === projectId) {
      detailOpen.value = false;
    }
    loadRows();
  } catch {
    // User cancelled.
  }
}

function openActionDialog() {
  if (!selectedProjectId.value) {
    ElMessage.error("请先打开研发项目详情");
    return;
  }
  actionForm.value = createEmptyActionForm();
  actionDialogOpen.value = true;
}

function handleReturnSourceChange(row) {
  const option = returnSourceOptions.value.find((item) => item.key === row.sourceKey);
  if (!option) {
    row.sourceDocumentId = null;
    row.sourceDocumentLineId = null;
    row.materialId = null;
    row.unitPrice = 0;
    return;
  }
  row.sourceDocumentId = option.actionId;
  row.sourceDocumentLineId = option.lineId;
  row.materialId = option.materialId;
  row.unitPrice = option.unitPrice;
  if (Number(row.quantity || 0) <= 0 || Number(row.quantity || 0) > option.availableReturnQty) {
    row.quantity = option.availableReturnQty;
  }
}

function validateActionForm() {
  if (!actionForm.value.bizDate || !actionForm.value.actionType) {
    ElMessage.error("请填写完整的动作头信息");
    return false;
  }
  if (!Array.isArray(actionForm.value.lines) || actionForm.value.lines.length === 0) {
    ElMessage.error("至少需要一条物料动作明细");
    return false;
  }

  for (let index = 0; index < actionForm.value.lines.length; index += 1) {
    const line = actionForm.value.lines[index];
    if (actionForm.value.actionType === "RETURN") {
      if (!line.sourceDocumentId || !line.sourceDocumentLineId) {
        ElMessage.error(`第 ${index + 1} 行退料必须关联来源领料行`);
        return false;
      }
    }
    if (!line.materialId) {
      ElMessage.error(`第 ${index + 1} 行物料不能为空`);
      return false;
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      ElMessage.error(`第 ${index + 1} 行数量必须大于 0`);
      return false;
    }
  }

  return true;
}

async function submitAction() {
  if (!selectedProjectId.value || !validateActionForm()) {
    return;
  }

  if (!(await confirmDocumentSave({ documentName: "研发项目物料动作单" }))) {
    return;
  }
  actionSubmitting.value = true;
  try {
    await createRdProjectMaterialAction(selectedProjectId.value, {
      actionType: actionForm.value.actionType,
      bizDate: actionForm.value.bizDate,
      remark: actionForm.value.remark || undefined,
      lines: actionForm.value.lines.map((line) => ({
        materialId: line.materialId,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice || 0),
        sourceDocumentType:
          actionForm.value.actionType === "RETURN" ? "RdProjectMaterialAction" : undefined,
        sourceDocumentId:
          actionForm.value.actionType === "RETURN" ? line.sourceDocumentId : undefined,
        sourceDocumentLineId:
          actionForm.value.actionType === "RETURN" ? line.sourceDocumentLineId : undefined,
        remark: line.remark || undefined,
      })),
    });
    ElMessage.success("研发项目物料动作已创建");
    actionDialogOpen.value = false;
    await Promise.all([
      loadProjectDetail(selectedProjectId.value),
      loadProjectActions(selectedProjectId.value),
    ]);
  } finally {
    actionSubmitting.value = false;
  }
}

async function handleVoidAction(actionId) {
  try {
    const result = await ElMessageBox.prompt("请输入作废原因", "作废研发项目物料动作", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputValue: "研发项目动作作废",
    });
    await voidRdProjectMaterialAction(actionId, {
      voidReason: result.value,
    });
    ElMessage.success("研发项目物料动作已作废");
    if (selectedProjectId.value) {
      await Promise.all([
        loadProjectDetail(selectedProjectId.value),
        loadProjectActions(selectedProjectId.value),
      ]);
    }
  } catch {
    // User cancelled.
  }
}

function actionLabel(value) {
  if (value === "PICK") {
    return "领料";
  }
  if (value === "RETURN") {
    return "退料";
  }
  if (value === "SCRAP") {
    return "报废";
  }
  return value || "-";
}

function actionTagType(value) {
  if (value === "PICK") {
    return "primary";
  }
  if (value === "RETURN") {
    return "success";
  }
  if (value === "SCRAP") {
    return "danger";
  }
  return "info";
}

onMounted(() => {
  loadWorkshopOptions();
  loadRows();
});
</script>

<style scoped lang="scss">
.project-page {
  display: grid;
  gap: 16px;
}

.hero-card {
  overflow: hidden;
  border: 0;
  background:
    radial-gradient(circle at top left, rgba(33, 150, 83, 0.2), transparent 42%),
    linear-gradient(135deg, #f5fbf6 0%, #eef6ff 100%);
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.hero-eyebrow {
  margin-bottom: 8px;
  color: #2f6f46;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.hero-title {
  margin: 0;
  color: #1f2a1f;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.2;
}

.hero-copy {
  max-width: 680px;
  margin: 12px 0 0;
  color: #51625a;
  line-height: 1.7;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-card {
  border-radius: 18px;
}

.query-form {
  margin-bottom: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.toolbar-title,
.section-title {
  font-size: 16px;
  font-weight: 700;
}

.toolbar-subtitle,
.section-subtitle {
  margin-top: 4px;
  color: #7a877f;
  font-size: 13px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 12px;
}

.section-toolbar.compact {
  margin-top: 0;
}

.detail-shell {
  display: grid;
  gap: 20px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  padding: 16px 18px;
  border: 1px solid #e5ece8;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
}

.summary-card.accent {
  border-color: #a8d5b3;
  background: linear-gradient(180deg, #f4fcf6 0%, #edf7ef 100%);
}

.summary-card.warning {
  border-color: #f1cf90;
  background: linear-gradient(180deg, #fff9ef 0%, #fff3df 100%);
}

.summary-label {
  color: #708175;
  font-size: 13px;
}

.summary-value {
  margin-top: 8px;
  color: #1f2a1f;
  font-size: 26px;
  font-weight: 700;
}

.detail-descriptions,
.detail-tabs {
  margin-top: 0;
}

.warn-text {
  color: #cf7a12;
  font-weight: 700;
}

@media (max-width: 960px) {
  .hero,
  .toolbar,
  .section-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
