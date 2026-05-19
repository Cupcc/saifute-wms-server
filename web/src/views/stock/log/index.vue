<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">库存日志</div>
            <div class="page-subtitle">只展示真实库存流水，不再兼容旧库存日志字段</div>
          </div>
        </div>
      </template>

      <el-form :inline="true" class="query-form">
        <el-form-item label="物料">
          <el-select
            v-model="filters.materialId"
            filterable
            remote
            reserve-keyword
            clearable
            placeholder="请输入物料编码或名称"
            :remote-method="searchMaterials"
            :loading="materialLoading"
            style="width: 280px"
          >
            <el-option
              v-for="item in materialOptions"
              :key="item.materialId"
              :label="formatMaterialOption(item)"
              :value="item.materialId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="库存范围">
          <el-select
            v-model="filters.stockScope"
            clearable
            filterable
            placeholder="请选择库存范围"
            style="width: 180px"
          >
            <el-option
              v-for="item in stockScopeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="车间">
          <el-select
            v-model="filters.workshopId"
            filterable
            remote
            reserve-keyword
            clearable
            placeholder="请输入车间名称"
            :remote-method="searchWorkshops"
            :loading="workshopLoading"
            style="width: 220px"
          >
            <el-option
              v-for="item in workshopOptions"
              :key="item.workshopId"
              :label="item.workshopName"
              :value="item.workshopId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="单据类型">
          <el-select
            v-model="filters.businessDocumentType"
            clearable
            filterable
            placeholder="请选择单据类型"
            style="width: 220px"
          >
            <el-option
              v-for="item in documentTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="单据编号">
          <el-input
            v-model="filters.businessDocumentNumber"
            clearable
            placeholder="支持模糊查询"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="业务日期">
          <el-date-picker
            v-model="bizDateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="-"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <adaptive-table
        class="stock-log-table"
        :data="rows"
        border
        stripe
        v-loading="loading"
        table-layout="auto"
      >

        <el-table-column prop="bizDate" label="业务日期" width="105" align="center">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column label="物料" min-width="180" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.material?.materialCode }} {{ row.material?.materialName }}</div>
            <div class="subtext">{{ row.material?.specModel || "-" }}</div>
          </template>
        </el-table-column>

        <el-table-column label="车间" min-width="100" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.workshop?.workshopName || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="direction" label="方向" width="70" align="center">
          <template #default="{ row }">
            <el-tag :type="row.direction === 'IN' ? 'success' : 'danger'">
              {{ row.direction === "IN" ? "入库" : "出库" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalQty" label="总库存" align="center">
          <template #default="{ row }">
            {{ formatQuantity(row.totalQty ?? row.beforeQty) }}
          </template>
        </el-table-column>
        <el-table-column prop="priceLayerBeforeQty" label="变动前" align="center">
          <template #default="{ row }">
            {{ formatOptionalQuantity(row.priceLayerBeforeQty) }}
          </template>
        </el-table-column>
        <el-table-column prop="priceLayerChangeQty" label="变动数量" align="center">
          <template #default="{ row }">
            <span :class="row.direction === 'IN' ? 'qty-in' : 'qty-out'">
              {{ formatPriceLayerChangeQty(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="priceLayerAfterQty" label="变动后" align="center">
          <template #default="{ row }">
            {{ formatOptionalQuantity(row.priceLayerAfterQty) }}
          </template>
        </el-table-column>
        <el-table-column label="成本单价" prop="unitCost" align="right" header-align="center">
          <template #default="{ row }">
            {{ formatMoney(row.unitCost) }}
          </template>
        </el-table-column>
        <el-table-column label="成本金额" prop="costAmount" width="100" align="right" header-align="center">
          <template #default="{ row }">
            {{ formatMoney(row.costAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="operatorId" label="操作人" width="80" align="center" />
        <el-table-column label="单据编号" min-width="140" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button
              v-if="canOpenDocumentDetail(row)"
              link
              type="primary"
              class="document-number-button"
              @click.stop="handleOpenDocumentDetail(row)"
            >
              {{ row.businessDocumentNumber || "-" }}
            </el-button>
            <span v-else>{{ row.businessDocumentNumber || "-" }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="140" align="center" show-overflow-tooltip />

        <el-table-column label="操作类型" min-width="130" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ getOperationTypeLabel(row.operationType) }}</div>
            <div class="subtext">{{ row.operationType || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column
          label="单据类型"
          min-width="160"
          align="center"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <div>{{ getDocumentTypeLabel(row) }}</div>
            <div class="subtext">{{ row.businessDocumentType || "-" }}</div>
          </template>
        </el-table-column>

        <el-table-column label="业务模块" width="100" align="center">
          <template #default="{ row }">
            {{ getBusinessModuleLabel(row.businessModule) }}
          </template>
        </el-table-column>
        <el-table-column label="库存范围" width="80" align="center">
          <template #default="{ row }">
            {{ getStockScopeLabel(row.stockScope) }}
          </template>
        </el-table-column>
        <el-table-column prop="occurredAt" label="发生时间" width="170" align="center">
          <template #default="{ row }">
            {{ formatDateTime(row.occurredAt) }}
          </template>
        </el-table-column>
      </adaptive-table>

      <div class="pagination-wrap pagination-container">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :current-page="pageNum"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="documentDetailOpen"
      :title="documentDetailTitle"
      width="1120px"
      append-to-body
      draggable
    >
      <div v-loading="documentDetailLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item
            v-for="field in documentSummaryFields"
            :key="field.label"
            :label="field.label"
            :span="field.span || 1"
          >
            {{ field.value || "-" }}
          </el-descriptions-item>
        </el-descriptions>

        <el-table
          class="document-detail-table"
          :data="documentDetailLines"
          border
          stripe
          row-key="rowKey"
          :row-class-name="getDocumentLineRowClassName"
          style="margin-top: 16px"
          empty-text="未找到单据明细"
        >
          <el-table-column type="index" width="50" align="center" />
          <el-table-column label="物料编码" prop="materialCode" min-width="120" />
          <el-table-column label="物料名称" prop="materialName" min-width="160" show-overflow-tooltip />
          <el-table-column label="规格型号" prop="specification" min-width="140" show-overflow-tooltip />
          <el-table-column label="数量" prop="quantity" width="100" align="right">
            <template #default="{ row }">
              {{ formatQuantity(row.quantity) }}
            </template>
          </el-table-column>
          <el-table-column label="单价" prop="unitPrice" width="110" align="right">
            <template #default="{ row }">
              {{ formatMoney(row.unitPrice) }}
            </template>
          </el-table-column>
          <el-table-column
            v-if="showDocumentCostUnitPriceColumn"
            label="成本单价"
            prop="costUnitPrice"
            width="110"
            align="right"
          >
            <template #default="{ row }">
              {{ formatMoney(row.costUnitPrice) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" prop="amount" width="110" align="right">
            <template #default="{ row }">
              {{ formatMoney(row.amount) }}
            </template>
          </el-table-column>
          <el-table-column label="备注" prop="remark" min-width="160" show-overflow-tooltip />
        </el-table>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="documentDetailOpen = false">关 闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="StockLogPage">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { listWorkshop } from "@/api/base/workshop";
import {
  getOrder as getAcceptanceOrder,
  getReturnToSupplierOrder,
} from "@/api/entry/order";
import { getIntoOrder } from "@/api/entry/intoOrder";
import {
  getRdProjectMaterialAction,
  getRdStocktakeOrder,
} from "@/api/rd-subwarehouse";
import { getSalesReturnOrder } from "@/api/sales/salesReturnOrder";
import { getOrder as getSalesOrder } from "@/api/sales/order";
import { listLog } from "@/api/stock/log";
import { getScrapOrder } from "@/api/stock/scrapOrder";
import { getPickOrder } from "@/api/take/pickOrder";
import { getReturnOrder } from "@/api/take/returnOrder";
import request from "@/utils/request";

const stockScopeOptions = [
  { value: "MAIN", label: "主仓" },
  { value: "RD_SUB", label: "研发小仓" },
];
const documentTypeOptions = [
  { value: "StockInOrder", label: "入库单据（验收 / 生产）" },
  { value: "SalesStockOrder", label: "销售单据（出库 / 退货）" },
  { value: "WorkshopMaterialOrder", label: "车间物料单据（领料 / 退料 / 报废）" },
  { value: "RdProjectMaterialAction", label: "项目物料单据（领用 / 退回 / 报废）" },
  { value: "RdHandoffOrder", label: "RD 交接单" },
  { value: "RdStocktakeOrder", label: "RD 盘点调整单" },
  { value: "StockInPriceCorrectionOrder", label: "入库调价单" },
];
const businessModuleLabels = {
  inbound: "入库",
  sales: "销售",
  "workshop-material": "车间物料",
  "rd-project": "研发项目",
  "rd-subwarehouse": "研发小仓",
};
const operationTypeOptions = [
  { value: "ACCEPTANCE_IN", label: "验收入库" },
  { value: "PRODUCTION_RECEIPT_IN", label: "生产入库" },
  { value: "PRICE_CORRECTION_IN", label: "调价入库" },
  { value: "OUTBOUND_OUT", label: "销售出库" },
  { value: "PRICE_CORRECTION_OUT", label: "调价出库" },
  { value: "SUPPLIER_RETURN_OUT", label: "供应商退货出库" },
  { value: "SALES_RETURN_IN", label: "销售退货入库" },
  { value: "PICK_OUT", label: "领料出库" },
  { value: "RETURN_IN", label: "退料入库" },
  { value: "SCRAP_OUT", label: "报废出库" },
  { value: "RD_PROJECT_OUT", label: "项目领用出库" },
  { value: "RD_HANDOFF_OUT", label: "RD 交接出库" },
  { value: "RD_HANDOFF_IN", label: "RD 交接入库" },
  { value: "RD_STOCKTAKE_IN", label: "RD 盘点入库" },
  { value: "RD_STOCKTAKE_OUT", label: "RD 盘点出库" },
  { value: "REVERSAL_IN", label: "逆操作入库" },
  { value: "REVERSAL_OUT", label: "逆操作出库" },
];

const loading = ref(false);
const materialLoading = ref(false);
const workshopLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(20);
const materialOptions = ref([]);
const workshopOptions = ref([]);
const bizDateRange = ref([]);
const filters = ref({
  materialId: null,
  stockScope: "",
  workshopId: null,
  businessDocumentType: "",
  businessDocumentNumber: "",
});
const documentDetailOpen = ref(false);
const documentDetailLoading = ref(false);
const selectedLog = ref(null);
const documentDetail = ref(null);

const documentDetailTitle = computed(() => {
  if (!selectedLog.value) {
    return "单据详情";
  }
  return `${getDocumentTypeLabel(selectedLog.value)}详情`;
});
const documentSummaryFields = computed(() =>
  buildDocumentSummaryFields(documentDetail.value, selectedLog.value),
);
const documentDetailLines = computed(() =>
  normalizeDocumentLines(documentDetail.value),
);
const showDocumentCostUnitPriceColumn = computed(
  () =>
    !["StockInOrder", "WorkshopMaterialOrder"].includes(
      selectedLog.value?.businessDocumentType,
    ),
);

function formatMaterialOption(item) {
  return [
    item.materialCode,
    item.materialName,
    item.specification || item.specModel || "",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return String(value).slice(0, 10);
}

function getStockScopeLabel(value) {
  return (
    stockScopeOptions.find((item) => item.value === value)?.label || value || "-"
  );
}

function getOperationTypeLabel(value) {
  return (
    operationTypeOptions.find((item) => item.value === value)?.label ||
    value ||
    "-"
  );
}

function getBusinessModuleLabel(value) {
  return businessModuleLabels[value] || value || "-";
}

function getDocumentTypeLabel(row) {
  switch (row.businessDocumentType) {
    case "StockInOrder":
      if (row.operationType === "PRODUCTION_RECEIPT_IN") {
        return "生产入库单";
      }
      if (row.operationType === "SUPPLIER_RETURN_OUT") {
        return "供应商退货单";
      }
      return "验收单";
    case "SalesStockOrder":
      return row.operationType === "SALES_RETURN_IN"
        ? "销售退货单"
        : "销售出库单";
    case "WorkshopMaterialOrder":
      if (row.operationType === "RETURN_IN") {
        return "退料单";
      }
      if (row.operationType === "SCRAP_OUT") {
        return "报废单";
      }
      return "领料单";
    case "RdProjectMaterialAction":
      if (row.operationType === "RETURN_IN") {
        return "项目退回单";
      }
      if (row.operationType === "SCRAP_OUT") {
        return "项目报废单";
      }
      return "项目领用单";
    case "RdHandoffOrder":
      return "RD 交接单";
    case "RdStocktakeOrder":
      return "RD 盘点调整单";
    case "StockInPriceCorrectionOrder":
      return "入库调价单";
    default:
      return row.businessDocumentType || "-";
  }
}

function getDocumentDetailResolver(row) {
  const id = row?.businessDocumentId;
  if (!id) {
    return null;
  }

  switch (row.businessDocumentType) {
    case "StockInOrder":
      if (row.operationType === "PRODUCTION_RECEIPT_IN") {
        return () =>
          fetchFirstAvailable([
            () => getIntoOrder(id),
            () => getAcceptanceOrder(id),
            () => getReturnToSupplierOrder(id),
          ]);
      }
      if (row.operationType === "SUPPLIER_RETURN_OUT") {
        return () =>
          fetchFirstAvailable([
            () => getReturnToSupplierOrder(id),
            () => getAcceptanceOrder(id),
            () => getIntoOrder(id),
          ]);
      }
      return () =>
        fetchFirstAvailable([
          () => getAcceptanceOrder(id),
          () => getIntoOrder(id),
          () => getReturnToSupplierOrder(id),
        ]);
    case "SalesStockOrder":
      if (row.operationType === "SALES_RETURN_IN") {
        return () =>
          fetchFirstAvailable([
            () => getSalesReturnOrder(id),
            () => getSalesOrder(id),
          ]);
      }
      return () =>
        fetchFirstAvailable([
          () => getSalesOrder(id),
          () => getSalesReturnOrder(id),
        ]);
    case "WorkshopMaterialOrder":
      if (row.operationType === "RETURN_IN") {
        return () =>
          fetchFirstAvailable([
            () => getReturnOrder(id),
            () => getPickOrder(id),
            () => getScrapOrder(id),
          ]);
      }
      if (row.operationType === "SCRAP_OUT") {
        return () =>
          fetchFirstAvailable([
            () => getScrapOrder(id),
            () => getPickOrder(id),
            () => getReturnOrder(id),
          ]);
      }
      return () =>
        fetchFirstAvailable([
          () => getPickOrder(id),
          () => getReturnOrder(id),
          () => getScrapOrder(id),
        ]);
    case "RdProjectMaterialAction":
      return () => getRdProjectMaterialAction(id);
    case "RdHandoffOrder":
      return () => fetchRawDocument(`/api/rd-subwarehouse/handoff-orders/${id}`);
    case "RdStocktakeOrder":
      return () => getRdStocktakeOrder(id);
    case "StockInPriceCorrectionOrder":
      return () => fetchRawDocument(`/api/inbound/price-correction-orders/${id}`);
    default:
      return null;
  }
}

function canOpenDocumentDetail(row) {
  return Boolean(getDocumentDetailResolver(row));
}

async function fetchRawDocument(url) {
  const response = await request({
    url,
    method: "get",
  });
  return { data: response.data };
}

async function fetchFirstAvailable(fetchers) {
  let lastError;
  for (const fetcher of fetchers) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function handleOpenDocumentDetail(row) {
  const resolver = getDocumentDetailResolver(row);
  if (!resolver) {
    ElMessage.warning("当前流水没有可查看的业务单据");
    return;
  }

  selectedLog.value = row;
  documentDetail.value = null;
  documentDetailOpen.value = true;
  documentDetailLoading.value = true;
  try {
    const response = await resolver();
    documentDetail.value = response?.data ?? response;
  } catch (error) {
    documentDetailOpen.value = false;
    ElMessage.error(error?.message || "加载单据详情失败");
  } finally {
    documentDetailLoading.value = false;
  }
}

function buildDocumentSummaryFields(detail, log) {
  if (!log) {
    return [];
  }

  const fields = [
    {
      label: "单据编号",
      value: resolveCurrentDocumentNumber(detail, log),
    },
    { label: "单据类型", value: getDocumentTypeLabel(log) },
    ...buildDocumentRelationSummaryFields(detail, log),
    {
      label: "业务日期",
      value: formatDate(
        firstValue(detail, [
          "bizDate",
          "inboundDate",
          "intoDate",
          "pickDate",
          "returnDate",
          "scrapDate",
        ]) || log.bizDate,
      ),
    },
    {
      label: "审核状态",
      value: formatAuditStatus(
        firstValue(detail, ["auditStatus", "auditStatusSnapshot"]),
      ),
    },
    {
      label: "库存状态",
      value: formatInventoryEffectStatus(
        firstValue(detail, ["inventoryEffectStatus"]),
      ),
    },
    { label: "车间", value: getDocumentWorkshop(detail) },
    { label: "经办人", value: getDocumentHandler(detail) },
    { label: "往来单位", value: getDocumentCounterparty(detail) },
    {
      label: "总数量",
      value: formatOptionalQuantity(
        firstValue(detail, [
          "totalQty",
          "totalBookQty",
          "totalCountQty",
          "totalAdjustmentQty",
          "totalLineCount",
        ]),
      ),
    },
    {
      label: "总金额",
      value: formatMoney(
        firstValue(detail, ["totalAmount", "totalHistoricalDiffAmount"]),
      ),
    },
    { label: "创建人", value: firstValue(detail, ["createBy", "createdBy"]) },
    {
      label: "创建时间",
      value: formatDateTime(firstValue(detail, ["createdAt"])),
    },
    {
      label: "备注",
      value: firstValue(detail, ["remark", "voidReason", "voidDescription"]),
      span: 2,
    },
  ];

  return fields.filter((field) => hasDisplayValue(field.value));
}

function buildDocumentRelationSummaryFields(detail, log) {
  if (
    log?.businessDocumentType === "WorkshopMaterialOrder" &&
    log?.operationType === "RETURN_IN"
  ) {
    return [
      {
        label: "关联领料单号",
        value: resolveLinkedPickOrderNumber(detail, log),
      },
    ];
  }

  return [];
}

function resolveLinkedPickOrderNumber(detail, log) {
  const directPickNo = firstValue(detail, [
    "pickNo",
    "sourceDocumentNo",
    "sourceDocumentNumber",
  ]);
  if (directPickNo) {
    return directPickNo;
  }

  const lines = getDocumentRawLines(detail);
  const selectedLine = lines.find((line) =>
    isSameNumber(
      firstValue(line, ["detailId", "id"]),
      log?.businessDocumentLineId,
    ),
  );
  const sourceDocumentId =
    firstValue(selectedLine, ["sourceDocumentId"]) ??
    firstValue(lines.find((line) => firstValue(line, ["sourceDocumentId"])), [
      "sourceDocumentId",
    ]) ??
    firstValue(detail, ["sourceId", "pickId"]);

  return sourceDocumentId ? String(sourceDocumentId) : undefined;
}

function resolveCurrentDocumentNumber(detail, log) {
  if (log?.businessDocumentNumber) {
    return log.businessDocumentNumber;
  }

  switch (log?.businessDocumentType) {
    case "StockInOrder":
      return log.operationType === "PRODUCTION_RECEIPT_IN"
        ? firstValue(detail, ["intoNo", "documentNo", "inboundNo"])
        : firstValue(detail, ["inboundNo", "documentNo"]);
    case "WorkshopMaterialOrder":
      if (log.operationType === "RETURN_IN") {
        return firstValue(detail, ["returnNo", "documentNo"]);
      }
      if (log.operationType === "SCRAP_OUT") {
        return firstValue(detail, ["scrapNo", "documentNo"]);
      }
      return firstValue(detail, ["pickNo", "documentNo"]);
    default:
      return firstValue(detail, [
        "documentNo",
        "inboundNo",
        "intoNo",
        "returnNo",
        "scrapNo",
        "pickNo",
      ]);
  }
}

function normalizeDocumentLines(detail) {
  const lines = getDocumentRawLines(detail);

  return lines.map((line, index) => {
    const lineId = firstValue(line, ["detailId", "id"]);
    return {
      rowKey: lineId ?? index,
      lineId,
      materialId: firstValue(line, [
        "materialId",
        "material.materialId",
        "material.id",
      ]),
      materialCode: firstValue(line, [
        "materialCode",
        "material.materialCode",
        "materialCodeSnapshot",
      ]),
      materialName: firstValue(line, [
        "materialName",
        "material.materialName",
        "materialNameSnapshot",
      ]),
      specification: firstValue(line, [
        "specification",
        "material.specification",
        "material.specModel",
        "materialSpecSnapshot",
      ]),
      quantity: firstValue(line, [
        "quantity",
        "returnQty",
        "scrapQty",
        "adjustmentQty",
        "sourceInQty",
        "countedQty",
      ]),
      unitPrice: firstValue(line, [
        "unitPrice",
        "rawUnitPrice",
        "wrongUnitCost",
      ]),
      costUnitPrice: firstValue(line, [
        "costUnitPrice",
        "selectedUnitCost",
        "correctUnitCost",
      ]),
      amount: firstValue(line, [
        "amount",
        "costAmount",
        "historicalDiffAmount",
      ]),
      remark: firstValue(line, ["remark", "reason"]),
    };
  });
}

function getDocumentRawLines(detail) {
  return Array.isArray(detail?.details)
    ? detail.details
    : Array.isArray(detail?.lines)
      ? detail.lines
      : [];
}

function getDocumentLineRowClassName({ row }) {
  return getDocumentLineMatchType(row) ? "is-related-document-line" : "";
}

function getDocumentLineMatchType(row) {
  const log = selectedLog.value;
  if (!log) {
    return "";
  }

  if (isSameNumber(row.lineId, log.businessDocumentLineId)) {
    return "exact";
  }

  if (hasExactDocumentLineMatch(log)) {
    return "";
  }

  const fallbackMatches = documentDetailLines.value.filter((line) =>
    isBusinessEquivalentDocumentLine(line, log),
  );
  if (fallbackMatches.length !== 1) {
    return "";
  }

  return fallbackMatches[0].rowKey === row.rowKey ? "fallback" : "";
}

function hasExactDocumentLineMatch(log) {
  return documentDetailLines.value.some((line) =>
    isSameNumber(line.lineId, log.businessDocumentLineId),
  );
}

function isBusinessEquivalentDocumentLine(line, log) {
  return (
    isSameMaterial(line, log) &&
    isSameDecimal(line.quantity, log.changeQty) &&
    isSameOptionalMoney(
      firstValue(line, ["costUnitPrice", "unitPrice"]),
      log.unitCost,
    )
  );
}

function isSameMaterial(line, log) {
  if (hasDisplayValue(line.materialId) && hasDisplayValue(log.materialId)) {
    return isSameNumber(line.materialId, log.materialId);
  }
  const lineMaterialCode = String(line.materialCode ?? "").trim();
  const logMaterialCode = String(log.material?.materialCode ?? "").trim();
  return Boolean(lineMaterialCode && logMaterialCode) &&
    lineMaterialCode === logMaterialCode;
}

function isSameNumber(left, right) {
  if (!hasDisplayValue(left) || !hasDisplayValue(right)) {
    return false;
  }
  return Number(left) === Number(right);
}

function isSameDecimal(left, right) {
  if (!hasDisplayValue(left) || !hasDisplayValue(right)) {
    return false;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return String(left) === String(right);
  }
  return Math.abs(leftNumber - rightNumber) < 0.000001;
}

function isSameOptionalMoney(left, right) {
  if (!hasDisplayValue(right)) {
    return true;
  }
  return isSameDecimal(left, right);
}

function getDocumentWorkshop(detail) {
  const sourceWorkshop = firstValue(detail, [
    "sourceWorkshopNameSnapshot",
    "sourceWorkshopName",
  ]);
  const targetWorkshop = firstValue(detail, [
    "targetWorkshopNameSnapshot",
    "targetWorkshopName",
  ]);
  if (sourceWorkshop && targetWorkshop && sourceWorkshop !== targetWorkshop) {
    return `${sourceWorkshop} -> ${targetWorkshop}`;
  }

  return firstValue(detail, [
    "workshopName",
    "workshop.workshopName",
    "workshopNameSnapshot",
    "targetWorkshopNameSnapshot",
    "sourceWorkshopNameSnapshot",
  ]);
}

function getDocumentHandler(detail) {
  return firstValue(detail, [
    "handlerName",
    "handlerNameSnapshot",
    "attn",
    "picker",
    "returnBy",
    "countedBy",
    "approvedBy",
  ]);
}

function getDocumentCounterparty(detail) {
  return firstValue(detail, [
    "supplierName",
    "supplierNameSnapshot",
    "customerName",
    "customerNameSnapshot",
    "salesProjectSummary",
    "rdProject.projectName",
  ]);
}

function firstValue(source, paths) {
  for (const path of paths) {
    const value = getPathValue(source, path);
    if (hasDisplayValue(value)) {
      return value;
    }
  }
  return undefined;
}

function getPathValue(source, path) {
  return String(path)
    .split(".")
    .reduce((current, key) => current?.[key], source);
}

function hasDisplayValue(value) {
  return value !== null && typeof value !== "undefined" && value !== "";
}

function formatAuditStatus(value) {
  if (value === "1" || value === 1 || value === "APPROVED") {
    return "审核通过";
  }
  if (value === "2" || value === 2 || value === "REJECTED") {
    return "审核不通过";
  }
  if (value === "NOT_REQUIRED") {
    return "无需审核";
  }
  if (value === "PENDING" || value === "0" || value === 0) {
    return "未审核";
  }
  return value || "-";
}

function formatInventoryEffectStatus(value) {
  if (value === "POSTED") {
    return "已过账";
  }
  if (value === "REVERSED") {
    return "已冲回";
  }
  return value || "-";
}

function formatPriceLayerChangeQty(row) {
  return formatSignedQuantity(row.priceLayerChangeQty, row.direction);
}

function formatSignedQuantity(value, direction) {
  if (!hasDisplayValue(value)) {
    return "-";
  }
  const quantity = formatQuantity(value);
  return direction === "OUT" && !quantity.startsWith("-")
    ? `-${quantity}`
    : quantity;
}

function formatOptionalQuantity(value) {
  return hasDisplayValue(value) ? formatQuantity(value) : "-";
}

function formatQuantity(value) {
  if (!hasDisplayValue(value)) {
    return "-";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return numericValue.toLocaleString("zh-CN", {
    maximumFractionDigits: 6,
  });
}

function formatMoney(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "-";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return numericValue.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mergeWorkshopOptions(items) {
  const next = new Map(
    workshopOptions.value.map((item) => [item.workshopId, item]),
  );
  for (const item of items) {
    if (!item?.workshopId || !item?.workshopName) {
      continue;
    }
    next.set(item.workshopId, item);
  }
  workshopOptions.value = Array.from(next.values()).sort((left, right) =>
    String(left.workshopName).localeCompare(String(right.workshopName), "zh-CN"),
  );
}

async function searchMaterials(keyword) {
  materialLoading.value = true;
  try {
    const response = await listMaterialByCodeOrName({
      materialCode: keyword || undefined,
      workshopId: filters.value.workshopId || undefined,
      pageSize: 20,
      pageNum: 1,
    });
    materialOptions.value = response.rows || [];
  } finally {
    materialLoading.value = false;
  }
}

async function searchWorkshops(keyword) {
  workshopLoading.value = true;
  try {
    const response = await listWorkshop({
      workshopName: keyword || undefined,
      pageNum: 1,
      pageSize: 100,
    });
    mergeWorkshopOptions(response.rows || []);
  } catch {
    // Ignore workshop option preload failures; the log query itself remains usable.
  } finally {
    workshopLoading.value = false;
  }
}

async function loadRows() {
  loading.value = true;
  try {
    const response = await listLog({
      materialId: filters.value.materialId || undefined,
      stockScope: filters.value.stockScope || undefined,
      workshopId: filters.value.workshopId || undefined,
      businessDocumentType: filters.value.businessDocumentType || undefined,
      businessDocumentNumber:
        filters.value.businessDocumentNumber.trim() || undefined,
      bizDateFrom: bizDateRange.value[0] || undefined,
      bizDateTo: bizDateRange.value[1] || undefined,
      limit: pageSize.value,
      offset: (pageNum.value - 1) * pageSize.value,
    });
    rows.value = response.data?.items || [];
    total.value = Number(response.data?.total || 0);
    mergeWorkshopOptions(
      rows.value.map((row) => ({
        workshopId: row.workshop?.id,
        workshopName: row.workshop?.workshopName,
      })),
    );
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pageNum.value = 1;
  loadRows();
}

function handleReset() {
  filters.value = {
    materialId: null,
    stockScope: "",
    workshopId: null,
    businessDocumentType: "",
    businessDocumentNumber: "",
  };
  bizDateRange.value = [];
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

onMounted(() => {
  searchWorkshops("");
  loadRows();
});
</script>

<style scoped lang="scss">
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
}

.page-subtitle {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.query-form {
  margin-bottom: 16px;
}

.subtext {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

:deep(.stock-log-table .cell),
:deep(.stock-log-table .cell > div) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-number-button {
  max-width: 100%;
  padding: 0;
  vertical-align: baseline;
}

:deep(.document-detail-table .is-related-document-line > td.el-table__cell),
:deep(
  .document-detail-table.el-table--striped
    .el-table__body
    tr.is-related-document-line.el-table__row--striped
    > td.el-table__cell
) {
  background-color: var(--el-color-primary-light-9);
}

.qty-in {
  color: var(--el-color-success);
}

.qty-out {
  color: var(--el-color-danger);
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
