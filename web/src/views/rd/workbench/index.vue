<template>
  <div class="app-container">
    <el-card shadow="never" class="hero-card">
      <template #header>
        <div class="page-header">
          <div>
            <div class="page-title">研发小仓工作台</div>
            <div class="page-subtitle">当前仓别：{{ workshopLabel }}</div>
          </div>
          <el-tag type="success">{{ consoleLabel }}</el-tag>
        </div>
      </template>

      <el-row :gutter="16" class="metric-row">
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-box">
            <div class="metric-label">在库物料数</div>
            <div class="metric-value">{{ dashboard.inventory.activeMaterialCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-box">
            <div class="metric-label">库存货值</div>
            <div class="metric-value">{{ dashboard.inventory.totalInventoryValue }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-box">
            <div class="metric-label">低库存项</div>
            <div class="metric-value">{{ dashboard.inventory.lowStockCount }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-box">
            <div class="metric-label">今日入库结果</div>
            <div class="metric-value">{{ dashboard.todayDocuments.inboundCount }}</div>
          </div>
        </el-col>
      </el-row>

      <div class="quick-actions">
        <el-button type="primary" @click="goTo('/rd/procurement-requests')">
          采购需求
        </el-button>
        <el-button type="primary" @click="goTo('/rd/projects')">
          研发项目
        </el-button>
        <el-button @click="goTo('/rd/scrap-orders')">本仓报废</el-button>
        <el-button @click="goTo('/rd/inventory-summary')">查看库存</el-button>
        <el-button @click="goTo('/rd/inventory-logs')">查看流水</el-button>
        <el-button @click="goTo('/rd/inbound-results')">自动入库结果</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="section-title">最近自动入库结果</div>
      </template>

      <el-table :data="recentInboundRows" stripe v-loading="loading">
        <el-table-column prop="documentNo" label="单据编号" min-width="160" />
        <el-table-column label="业务日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="sourceWorkshopNameSnapshot"
          label="来源车间"
          min-width="140"
        />
        <el-table-column prop="totalQty" label="总数量" min-width="120" />
        <el-table-column prop="totalAmount" label="总金额" min-width="120" />
        <el-table-column label="明细数" min-width="100">
          <template #default="{ row }">
            {{ row.lines?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" />
      </el-table>

      <pagination
        v-show="recentInboundTotal > 0"
        :total="recentInboundTotal"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="loadPage"
      />
    </el-card>
  </div>
</template>

<script setup name="RdWorkbenchPage">
import { computed, onMounted, ref } from "vue";
import { listRdInboundResults } from "@/api/rd-subwarehouse";
import { getReportingHome } from "@/api/reporting";
import router from "@/router";
import useUserStore from "@/store/modules/user";

const userStore = useUserStore();
const loading = ref(false);
const recentInboundRows = ref([]);
const recentInboundTotal = ref(0);
const queryParams = ref({
  pageNum: 1,
  pageSize: 30,
});
const dashboard = ref({
  inventory: {
    activeMaterialCount: 0,
    totalInventoryValue: "0.00",
    lowStockCount: 0,
  },
  todayDocuments: {
    inboundCount: 0,
  },
});

const workshopLabel = computed(
  () => userStore.stockScope?.stockScopeName || "未绑定研发小仓",
);

const consoleLabel = computed(() =>
  userStore.consoleMode === "rd-subwarehouse" ? "研发小仓模式" : "默认模式",
);

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("zh-CN");
}

function getTodayBusinessDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((item) => item.type === "year")?.value || "1970";
  const month = parts.find((item) => item.type === "month")?.value || "01";
  const day = parts.find((item) => item.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function goTo(path) {
  router.push(path);
}

async function loadPage() {
  loading.value = true;
  try {
    const today = getTodayBusinessDate();
    const limit = queryParams.value.pageSize;
    const offset = (queryParams.value.pageNum - 1) * limit;
    const [dashboardResponse, inboundResponse, todayInboundResponse] =
      await Promise.all([
        getReportingHome({ stockScope: "RD_SUB" }),
        listRdInboundResults({ limit, offset }),
        listRdInboundResults({
          bizDateFrom: today,
          bizDateTo: today,
          limit: 1,
          offset: 0,
        }),
      ]);
    dashboard.value = {
      ...(dashboardResponse.data || dashboard.value),
      todayDocuments: {
        inboundCount: Number(todayInboundResponse.data?.total || 0),
      },
    };
    recentInboundRows.value = inboundResponse.data?.items || [];
    recentInboundTotal.value = Number(inboundResponse.data?.total || 0);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadPage();
});
</script>

<style scoped lang="scss">
.hero-card {
  margin-bottom: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.page-subtitle {
  margin-top: 6px;
  color: #909399;
  font-size: 13px;
}

.metric-row {
  margin-bottom: 16px;
}

.metric-box {
  padding: 16px;
  border-radius: 8px;
  background: #f5f7fa;
}

.metric-label {
  color: #909399;
  font-size: 13px;
  margin-bottom: 8px;
}

.metric-value {
  color: #303133;
  font-size: 26px;
  font-weight: 700;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
}
</style>
