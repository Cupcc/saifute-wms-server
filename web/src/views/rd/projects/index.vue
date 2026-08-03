<template>
  <div class="app-container project-page">
    <el-card shadow="never" class="hero-card">
      <div class="hero">
        <div>
          <div class="hero-eyebrow">RD_SUB 研发项目</div>
          <h1 class="hero-title">研发项目主档、BOM 与台账</h1>
          <p class="hero-copy">
            统一管理 RD 内部研发项目主档，维护 BOM，并记录研发项目领料、退料、报废事实。
          </p>
        </div>
        <div class="hero-badges">
          <el-tag effect="dark" type="success">{{ rdProjectScopeLabel }}</el-tag>
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
          <div class="toolbar-subtitle">点击项目进入详情页，可直接查看、编辑并追溯变更记录。</div>
        </div>
        <el-button
          type="primary"
          v-hasPermi="['rd:project:create']"
          @click="openCreate"
        >
          新增研发项目
        </el-button>
      </div>

      <adaptive-table
        column-preferences
        :fit-viewport="false"
        :data="rows"
        stripe
        v-loading="loading"
      >
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
            {{ formatDateValue(row.bizDate) }}
          </template>
        </el-table-column>
        <el-table-column label="BOM 行数" min-width="100">
          <template #default="{ row }">
            {{ row.bomLineCount || row.bomLines?.length || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="计划数量" min-width="120">
          <template #default="{ row }">
            {{ formatQty(row.totalQty) }}
          </template>
        </el-table-column>
        <el-table-column label="计划金额" min-width="120">
          <template #default="{ row }">
            {{ formatAmount(row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
            <el-button
              link
              type="danger"
              v-hasPermi="['rd:project:void']"
              @click="handleVoidProject(row.id)"
            >
              作废
            </el-button>
          </template>
        </el-table-column>
      </adaptive-table>

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
  </div>
</template>

<script setup name="RdProjectPage">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { listRdProjects, voidRdProject } from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";
import { formatAmount, formatQty } from "@/utils/format";
import { formatDateValue } from "@/utils/rd-documents";

const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const projectVoiding = ref(false);

const rows = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);

const filters = ref({
  projectCode: "",
  projectName: "",
});

const stockScopeLabel = computed(
  () => userStore.stockScope?.stockScopeName || "研发小仓",
);
const rdProjectScopeLabel = computed(() => "研发项目专属");

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
    if (rows.value.length === 0 && pageNum.value > 1) {
      pageNum.value -= 1;
      await loadRows();
    }
  } catch {
    // 拦截器已提示错误
  } finally {
    loading.value = false;
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

function openCreate() {
  router.push("/rd/projects/create");
}

function openDetail(projectId) {
  router.push(`/rd/projects/detail/${projectId}`);
}

async function handleVoidProject(projectId) {
  if (projectVoiding.value) {
    return;
  }
  let voidReason = "";
  try {
    const result = await ElMessageBox.prompt("请输入作废原因", "作废研发项目", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputValidator: (value) =>
        value && value.trim() ? true : "作废原因不能为空",
    });
    voidReason = result.value.trim();
  } catch {
    return;
  }

  projectVoiding.value = true;
  try {
    await voidRdProject(projectId, { voidReason });
    ElMessage.success("研发项目已作废");
    await loadRows();
  } catch {
    // 拦截器已提示错误
  } finally {
    projectVoiding.value = false;
  }
}

onMounted(() => {
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

.toolbar-title {
  font-size: 16px;
  font-weight: 700;
}

.toolbar-subtitle {
  margin-top: 4px;
  color: #7a877f;
  font-size: 13px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 960px) {
  .hero,
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
