<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="1180px"
    append-to-body
    draggable
    @update:model-value="handleVisibleChange"
  >
    <div v-loading="loading">
      <el-descriptions :column="2" border>
        <el-descriptions-item :label="documentLabel">
          {{ detailData.documentNo || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="业务日期">
          {{ formatDate(detailData.bizDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="客户">
          {{ detailData.customerName || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="车间">
          {{ detailData.workshopName || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="经手人">
          {{ detailData.handlerName || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="审核状态">
          <el-tag :type="getAuditTagType(detailData.auditStatus)">
            {{ getAuditText(detailData.auditStatus) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="showSourceOutbound" label="来源出库 ID">
          {{ detailData.sourceOutboundOrderId || "-" }}
        </el-descriptions-item>
        <el-descriptions-item v-if="showSourceOutbound" label="总数量">
          {{ formatNumber(detailData.totalQty) }}
        </el-descriptions-item>
        <el-descriptions-item v-else label="总数量">
          {{ formatNumber(detailData.totalQty) }}
        </el-descriptions-item>
        <el-descriptions-item label="总金额">
          {{ formatAmount(detailData.totalAmount) }}
        </el-descriptions-item>
        <el-descriptions-item label="关联项目" :span="2">
          {{ detailData.salesProjectSummary || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="创建人">
          {{ detailData.createBy || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDateTime(detailData.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新人">
          {{ detailData.updateBy || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDateTime(detailData.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">
          {{ detailData.remark || "-" }}
        </el-descriptions-item>
        <el-descriptions-item v-if="detailData.voidReason" label="作废说明" :span="2">
          {{ detailData.voidReason }}
        </el-descriptions-item>
      </el-descriptions>

      <el-table
        style="margin-top: 16px"
        border
        stripe
        :data="Array.isArray(detailData.details) ? detailData.details : []"
      >
        <el-table-column type="index" width="50" align="center" />
        <el-table-column label="物料编码" prop="materialCode" min-width="120" />
        <el-table-column label="物料名称" prop="materialName" min-width="160" />
        <el-table-column label="规格型号" prop="specification" min-width="140" />
        <el-table-column label="销售项目" prop="salesProjectName" min-width="180">
          <template #default="scope">
            {{
              scope.row.salesProjectName ||
              scope.row.salesProjectCode ||
              "-"
            }}
          </template>
        </el-table-column>
        <el-table-column label="数量" prop="quantity" width="100" align="right">
          <template #default="scope">
            {{ formatNumber(scope.row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column label="成本价层" prop="selectedUnitCost" width="110" align="right">
          <template #default="scope">
            {{ formatAmount(scope.row.selectedUnitCost) }}
          </template>
        </el-table-column>
        <el-table-column label="销售单价" prop="unitPrice" width="110" align="right">
          <template #default="scope">
            {{ formatAmount(scope.row.unitPrice) }}
          </template>
        </el-table-column>
        <el-table-column label="金额" prop="amount" width="110" align="right">
          <template #default="scope">
            {{ formatAmount(scope.row.amount) }}
          </template>
        </el-table-column>
        <el-table-column label="成本金额" prop="costAmount" width="110" align="right">
          <template #default="scope">
            {{ formatAmount(scope.row.costAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="编号" min-width="180" show-overflow-tooltip>
          <template #default="scope">
            {{ formatFactoryNumber(scope.row) }}
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="160" show-overflow-tooltip />
      </el-table>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleVisibleChange(false)">关 闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  detailData: {
    type: Object,
    default: () => ({}),
  },
  title: {
    type: String,
    default: "查看详情",
  },
  documentLabel: {
    type: String,
    default: "单号",
  },
  showSourceOutbound: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

function handleVisibleChange(value) {
  emit("update:modelValue", value);
}

function getAuditText(status) {
  if (status === "1" || status === 1) {
    return "审核通过";
  }
  if (status === "2" || status === 2) {
    return "审核不通过";
  }
  return "未审核";
}

function getAuditTagType(status) {
  if (status === "1" || status === 1) {
    return "success";
  }
  if (status === "2" || status === 2) {
    return "danger";
  }
  return "warning";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return String(value).slice(0, 10);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function formatFactoryNumber(row) {
  const startNumber = row.startNumber || "";
  const endNumber = row.endNumber || "";
  if (startNumber && endNumber) {
    return startNumber === endNumber ? startNumber : `${startNumber}-${endNumber}`;
  }
  return startNumber || endNumber || "-";
}

void [
  handleVisibleChange,
  getAuditText,
  getAuditTagType,
  formatDate,
  formatDateTime,
  formatNumber,
  formatAmount,
  formatFactoryNumber,
];
</script>
