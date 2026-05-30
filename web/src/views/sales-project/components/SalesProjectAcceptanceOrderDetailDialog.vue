<template>
  <el-dialog
    v-model="visible"
    title="验收单详情"
    width="920px"
    append-to-body
    draggable
  >
    <div v-loading="loading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="验收单号">
          {{ order?.inboundNo || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="验收日期">
          {{ formatDate(order?.inboundDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="销售项目">
          {{ projectLabel }}
        </el-descriptions-item>
        <el-descriptions-item label="供应商">
          {{ order?.supplierName || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="经办人">
          {{ order?.attn || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="车间">
          {{ order?.workshopName || "-" }}
        </el-descriptions-item>
        <el-descriptions-item label="总金额">
          {{ formatAmount(order?.totalAmount) }}
        </el-descriptions-item>
        <el-descriptions-item label="备注">
          {{ order?.remark || "-" }}
        </el-descriptions-item>
      </el-descriptions>

      <el-table
        :data="orderLines"
        border
        stripe
        class="acceptance-detail-table"
      >
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column label="物料编码" prop="materialCode" min-width="120" />
        <el-table-column label="物料名称" prop="materialName" min-width="150" />
        <el-table-column label="规格型号" prop="specModel" min-width="130" />
        <el-table-column label="单位" prop="unitCode" width="80" />
        <el-table-column label="验收数量" prop="quantity" width="110" align="right">
          <template #default="{ row }">
            {{ formatNumber(row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column label="单价" prop="unitPrice" width="100" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.unitPrice) }}
          </template>
        </el-table-column>
        <el-table-column label="金额" prop="amount" width="110" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="140" show-overflow-tooltip />
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup name="SalesProjectAcceptanceOrderDetailDialog">
import { computed } from "vue";
import { formatDate, formatNumber } from "../shared";

function formatAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(4) : "0.0000";
}

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Object,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const orderLines = computed(() =>
  Array.isArray(props.order?.details) ? props.order.details : [],
);

const projectLabel = computed(() => {
  if (!props.order?.salesProjectId) {
    return "-";
  }
  return `${props.order.salesProjectCode || "-"} / ${props.order.salesProjectName || "-"}`;
});
</script>

<style scoped lang="scss">
.acceptance-detail-table {
  margin-top: 14px;
}
</style>
