<script setup name="SupplierStatement">
import { computed, getCurrentInstance, ref } from "vue";
import { listProductMaterial } from "@/api/article/product";
import { listSupplierByKeywordIncludingDisabled } from "@/api/base/supplier";
import { listNoPage } from "@/api/entry/detail";
import { formatDate } from "@/utils/index.js";

const { proxy } = getCurrentInstance();

// 搜索相关
const loading = ref(false);
const supplierOptions = ref([]);
const supplierLoading = ref(false);
const selectedSupplierId = ref(null);
const selectedSupplierName = ref("");

// 默认日期范围（最近90天）
const getDefaultDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  return [
    formatDate(startDate, "YYYY-MM-DD"),
    formatDate(endDate, "YYYY-MM-DD"),
  ];
};

const dateRange = ref(getDefaultDateRange());

// 数据
const entryDetailList = ref([]);
const projectMaterialList = ref([]);
const activeTab = ref("entry");

// 计算汇总金额
const entryTotal = computed(() => {
  return entryDetailList.value
    .reduce((sum, item) => {
      const amount = (item.quantity || 0) * (item.unitPrice || 0);
      return sum + amount;
    }, 0)
    .toFixed(2);
});

const projectTotal = computed(() => {
  return projectMaterialList.value
    .reduce((sum, item) => {
      const amount = (item.quantity || 0) * (item.unitPrice || 0);
      return sum + amount;
    }, 0)
    .toFixed(2);
});

const grandTotal = computed(() => {
  return (
    parseFloat(entryTotal.value) + parseFloat(projectTotal.value)
  ).toFixed(2);
});

// 搜索供应商
function searchSupplier(query) {
  supplierLoading.value = true;
  listSupplierByKeywordIncludingDisabled(query)
    .then((response) => {
      supplierOptions.value = response.rows || [];
      supplierLoading.value = false;
    })
    .catch(() => {
      supplierLoading.value = false;
    });
}

// 处理供应商选择
function handleSupplierChange(val) {
  const supplier = supplierOptions.value.find(
    (item) => item.supplierId === val,
  );
  if (supplier) {
    selectedSupplierName.value = supplier.supplierName;
  }
}

// 查询数据
async function fetchData() {
  if (!selectedSupplierId.value) {
    proxy.$modal.msgWarning("请先选择供应商");
    return;
  }

  loading.value = true;

  try {
    const params = {
      supplierId: selectedSupplierId.value,
    };

    if (dateRange.value && dateRange.value.length === 2) {
      params.params = {
        beginTime: dateRange.value[0],
        endTime: dateRange.value[1],
      };
    }

    // 并行请求两个数据源
    const [entryRes, projectRes] = await Promise.all([
      listNoPage(params),
      listProductMaterial(params),
    ]);

    // 处理验收单明细数据
    if (entryRes.data && Array.isArray(entryRes.data)) {
      entryDetailList.value = entryRes.data.map((item) => ({
        ...item,
        amount: ((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2),
      }));
    } else {
      entryDetailList.value = [];
    }

    // 处理项目物料数据
    if (projectRes.rows && Array.isArray(projectRes.rows)) {
      projectMaterialList.value = projectRes.rows.map((item) => ({
        ...item,
        amount: ((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2),
      }));
    } else if (projectRes.data && Array.isArray(projectRes.data)) {
      projectMaterialList.value = projectRes.data.map((item) => ({
        ...item,
        amount: ((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2),
      }));
    } else {
      projectMaterialList.value = [];
    }
  } catch (error) {
    console.error("获取对账数据失败:", error);
    proxy.$modal.msgError("获取数据失败，请稍后重试");
    entryDetailList.value = [];
    projectMaterialList.value = [];
  } finally {
    loading.value = false;
  }
}

// 重置查询
function resetQuery() {
  selectedSupplierId.value = null;
  selectedSupplierName.value = "";
  dateRange.value = getDefaultDateRange();
  entryDetailList.value = [];
  projectMaterialList.value = [];
}

// 验收单明细表格合计
function getEntrySummaries(param) {
  const { columns, data } = param;
  const sums = [];

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = "合计";
      return;
    }

    if (column.property === "quantity") {
      const total = data.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0,
      );
      sums[index] = total.toFixed(2);
    } else if (column.property === "amount") {
      sums[index] = entryTotal.value;
    } else {
      sums[index] = "";
    }
  });

  return sums;
}

// 项目物料表格合计
function getProjectSummaries(param) {
  const { columns, data } = param;
  const sums = [];

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = "合计";
      return;
    }

    if (column.property === "quantity") {
      const total = data.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0,
      );
      sums[index] = total.toFixed(2);
    } else if (column.property === "amount") {
      sums[index] = projectTotal.value;
    } else {
      sums[index] = "";
    }
  });

  return sums;
}

// 导出Excel
function handleExport() {
  if (!selectedSupplierId.value) {
    proxy.$modal.msgWarning("请先选择供应商并查询数据");
    return;
  }

  const params = {
    supplierId: selectedSupplierId.value,
  };

  if (dateRange.value && dateRange.value.length === 2) {
    params.beginTime = dateRange.value[0];
    params.endTime = dateRange.value[1];
  }

  proxy.download(
    "report/supplier/statement/export",
    params,
    `供应商对账单_${selectedSupplierName.value}_${new Date().getTime()}.xlsx`,
  );
}
</script>

<template>
  <div class="app-container">
    <h2>供应商对账报表</h2>
    
    <!-- 搜索区域 -->
    <el-form :inline="true" label-width="80px" class="search-form">
      <el-form-item label="供应商" required>
        <el-select
          v-model="selectedSupplierId"
          filterable
          remote
          reserve-keyword
          placeholder="请输入供应商编码或名称搜索"
          :remote-method="searchSupplier"
          :loading="supplierLoading"
          style="width: 280px"
          @change="handleSupplierChange"
        >
          <el-option
            v-for="item in supplierOptions"
            :key="item.supplierId"
            :label="item.supplierName"
            :value="item.supplierId"
          >
            <span style="float: left">{{ item.supplierCode }}</span>
            <span style="float: left; margin-left: 10px;">{{ item.supplierName }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      
      <el-form-item label="日期范围">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 280px"
        />
      </el-form-item>
      
      <el-form-item>
        <el-button type="primary" @click="fetchData" :loading="loading">查询</el-button>
        <el-button @click="resetQuery">重置</el-button>
        <el-button type="warning" @click="handleExport" :disabled="!selectedSupplierId">导出Excel</el-button>
      </el-form-item>
    </el-form>
    
    <!-- 汇总卡片 -->
    <el-row :gutter="20" class="summary-cards" v-if="selectedSupplierId && (entryDetailList.length > 0 || projectMaterialList.length > 0)">
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>
            <span>验收单总额（原材料）</span>
          </template>
          <div class="card-value">¥ {{ entryTotal }}</div>
          <div class="card-count">共 {{ entryDetailList.length }} 条记录</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>
            <span>项目直入总额</span>
          </template>
          <div class="card-value">¥ {{ projectTotal }}</div>
          <div class="card-count">共 {{ projectMaterialList.length }} 条记录</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="total-card">
          <template #header>
            <span>总应付金额</span>
          </template>
          <div class="card-value total">¥ {{ grandTotal }}</div>
          <div class="card-count">合计 {{ entryDetailList.length + projectMaterialList.length }} 条记录</div>
        </el-card>
      </el-col>
    </el-row>
    
    <!-- 明细展示 Tabs -->
    <el-tabs v-model="activeTab" class="detail-tabs" v-if="selectedSupplierId">
      <!-- Tab 1: 验收单明细 -->
      <el-tab-pane label="验收单明细（原材料）" name="entry">
        <adaptive-table
          :data="entryDetailList"
          v-loading="loading"
          border
          stripe
          show-summary
          :summary-method="getEntrySummaries"
        >
          <el-table-column type="index" label="序号" width="60" align="center" />
          <el-table-column prop="inboundNo" label="验收单号" align="center" show-overflow-tooltip />
          <el-table-column prop="inboundDate" label="验收日期" align="center" width="120" />
          <el-table-column prop="material.materialName" label="物料名称" align="center" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.material?.materialName || scope.row.materialName }}
            </template>
          </el-table-column>
          <el-table-column prop="material.specification" label="规格型号" align="center" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.material?.specification || scope.row.specification }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" align="center" width="100" />
          <el-table-column prop="unitPrice" label="单价" align="center" width="100" />
          <el-table-column prop="taxPrice" label="含税价" align="center" width="100" />
          <el-table-column prop="amount" label="金额" align="center" width="120" />
          <el-table-column prop="remark" label="备注" align="center" show-overflow-tooltip />
        </adaptive-table>
        <el-empty v-if="!loading && entryDetailList.length === 0" description="暂无验收单数据" />
      </el-tab-pane>
      
      <!-- Tab 2: 项目直入明细 -->
      <el-tab-pane label="项目直入明细" name="project">
        <adaptive-table
          :data="projectMaterialList"
          v-loading="loading"
          border
          stripe
          show-summary
          :summary-method="getProjectSummaries"
        >
          <el-table-column type="index" label="序号" width="60" align="center" />
          <el-table-column prop="productName" label="项目名称" align="center" show-overflow-tooltip />
          <el-table-column prop="classification" label="项目分类" align="center" width="100" />
          <el-table-column prop="acceptanceDate" label="验收日期" align="center" width="120" />
          <el-table-column prop="materialName" label="物料名称" align="center" show-overflow-tooltip />
          <el-table-column prop="specification" label="规格型号" align="center" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" align="center" width="80" />
          <el-table-column prop="quantity" label="数量" align="center" width="100" />
          <el-table-column prop="unitPrice" label="单价" align="center" width="100" />
          <el-table-column prop="amount" label="金额" align="center" width="120" />
          <el-table-column prop="instruction" label="计价说明" align="center" show-overflow-tooltip />
        </adaptive-table>
        <el-empty v-if="!loading && projectMaterialList.length === 0" description="暂无项目直入数据" />
      </el-tab-pane>
    </el-tabs>
    
    <!-- 初始提示 -->
    <el-empty v-if="!selectedSupplierId" description="请选择供应商并点击查询" />
  </div>
</template>

<style scoped lang="scss">
.app-container {
  padding: 20px;
}

h2 {
  margin-bottom: 20px;
  color: #303133;
}

.search-form {
  padding: 20px 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 20px;
}

.summary-cards {
  margin-bottom: 20px;
  
  .el-card {
    text-align: center;
    
    :deep(.el-card__header) {
      padding: 12px 20px;
      background-color: #f5f7fa;
      font-weight: 600;
    }
  }
  
  .card-value {
    font-size: 28px;
    font-weight: bold;
    color: #409EFF;
    margin: 10px 0;
    
    &.total {
      color: #E6A23C;
    }
  }
  
  .card-count {
    font-size: 14px;
    color: #909399;
  }
  
  .total-card {
    :deep(.el-card__header) {
      background-color: #fdf6ec;
    }
  }
}

.detail-tabs {
  background-color: #fff;
  padding: 15px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>
