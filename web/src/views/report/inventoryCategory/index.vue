<script setup>
import { getCurrentInstance, onMounted, ref } from "vue";
import { getInventoryCategoryDetail } from "@/api/report.js";
import { formatQty } from "@/utils/format";
import { formatDate } from "@/utils/index.js";

const reportData = ref([]);
const loading = ref(false);
const dateRange = ref(["", ""]);

// 获取当前实例
const { proxy } = getCurrentInstance();

// 自定义合计方法
const getSummaries = (param) => {
  const { columns, data } = param;
  const sums = [];

  if (!data || data.length === 0) {
    return sums;
  }

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = "合计";
      return;
    }

    const values = data.map((item) => Number(item[column.property]));
    if (values.every((value) => isNaN(value))) {
      sums[index] = "";
    } else {
      const sum = values.reduce((prev, curr) => {
        const value = Number(curr);
        if (!isNaN(value)) {
          return prev + value;
        } else {
          return prev;
        }
      }, 0);

      sums[index] = column.property.endsWith("Quantity")
        ? formatQty(sum)
        : sum.toFixed(2);
    }
  });

  return sums;
};

// 默认日期范围
const getDefaultDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  return [
    formatDate(startDate, "YYYY-MM-DD"),
    formatDate(endDate, "YYYY-MM-DD"),
  ];
};

// 初始化日期范围
dateRange.value = getDefaultDateRange();

// 查询报表数据
const fetchReportData = async () => {
  if (!dateRange.value[0] || !dateRange.value[1]) {
    console.error("请选择完整的日期范围");
    return;
  }

  try {
    loading.value = true;
    const params = {
      beginDate: dateRange.value[0],
      endDate: dateRange.value[1],
    };

    const response = await getInventoryCategoryDetail(params);
    reportData.value = response.data || [];
  } catch (error) {
    console.error("获取报表数据失败:", error);
    reportData.value = [];
  } finally {
    loading.value = false;
  }
};

// 重置查询条件
const resetQuery = () => {
  dateRange.value = getDefaultDateRange();
  fetchReportData();
};

// 导出Excel
const handleExport = () => {
  proxy.download(
    "report/inventory/category/detail/export",
    {
      beginDate: dateRange.value[0],
      endDate: dateRange.value[1],
    },
    `仓库管理系统变动表_${new Date().getTime()}.xlsx`,
  );
};

// 初始化加载数据
onMounted(() => {
  fetchReportData();
});
</script>

<template>
  <div class="app-container">
    <h2>库存分类明细报表</h2>
    
    <!-- 搜索区域 -->
    <el-form :inline="true" label-width="100px" class="search-form">
      <el-form-item label="日期区间：">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 240px"
        />
      </el-form-item>
      
      <el-form-item>
        <el-button type="primary" @click="fetchReportData" :loading="loading">搜索</el-button>
        <el-button @click="resetQuery">重置</el-button>
        <el-button type="warning" @click="handleExport">导出Excel</el-button>
      </el-form-item>
    </el-form>
    
    <!-- 数据表格 -->
    <adaptive-table
      :data="reportData"
      v-loading="loading"
      border
      show-summary
      :summary-method="getSummaries"
      style="width: 100%; margin-top: 20px;"
    >
      <!-- 序号列 -->
      <el-table-column type="index" label="序号" width="60" align="center" />
      
      <el-table-column prop="categoryName" label="分类名称" align="center" />
      
      <!-- 物料名称和规格型号 -->
      <el-table-column prop="materialName" label="名称" align="center" />
      <el-table-column prop="specification" label="规格型号" align="center" />
      
      <!-- 期初结存（此前） -->
      <el-table-column label="此前" align="center">
        <el-table-column prop="totalQuantity" label="数量" align="center" />
        <el-table-column prop="totalValue" label="金额" align="center" />
      </el-table-column>
      
      <!-- 本期入库 -->
      <el-table-column label="本期入库" align="center">
        <el-table-column prop="intoPeriodQuantity" label="数量" align="center" />
        <el-table-column prop="intoPeriodValue" label="金额" align="center" />
      </el-table-column>
      
      <!-- 本期出库 -->
      <el-table-column label="本期出库" align="center">
        <el-table-column prop="pickPeriodQuantity" label="数量" align="center" />
        <el-table-column prop="pickPeriodValue" label="金额" align="center" />
      </el-table-column>
      
      <!-- 本期进货（入区） -->
      <el-table-column label="本期进货" align="center">
        <el-table-column prop="inboundPeriodQuantity" label="数量" align="center" />
        <el-table-column prop="inboundPeriodValue" label="金额" align="center" />
      </el-table-column>
      
      <!-- 本期销售（出区） -->
      <el-table-column label="本期销售" align="center">
        <el-table-column prop="outboundPeriodQuantity" label="数量" align="center" />
        <el-table-column prop="outboundPeriodValue" label="金额" align="center" />
      </el-table-column>
      
      <!-- 结存（期末） -->
      <el-table-column label="结存" align="center">
        <el-table-column prop="endingQuantity" label="数量" align="center" />
        <el-table-column prop="endingValue" label="金额" align="center" />
      </el-table-column>
    </adaptive-table>
    
    <!-- 空数据提示 -->
    <el-empty v-if="!loading && reportData.length === 0" description="暂无数据" />
  </div>
</template>

<style scoped lang="scss">
.app-container {
  padding: 20px;
}

.search-form {
  padding: 20px 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 20px;
}

.el-table {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>
