<template>
  <el-dialog
    v-model="visible"
    title="新增项目验收单"
    width="1200px"
    append-to-body
    draggable
    @closed="handleClosed"
  >
    <el-form
      ref="orderFormRef"
      :model="form"
      :rules="rules"
      label-width="88px"
      v-loading="submitting"
    >
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="验收单号">
            <el-input v-model="form.inboundNo" placeholder="保存后自动生成" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="验收日期" prop="inboundDate">
            <el-date-picker
              v-model="form.inboundDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="请选择验收日期"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="销售项目">
            <el-input :model-value="projectLabel" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="车间">
            <el-input :model-value="project?.workshopName || '-'" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="经办人" prop="attn">
            <combo-input
              v-model="form.attn"
              scope="personnel"
              field="personnelName"
              placeholder="请选择或输入经办人"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="供应商" prop="supplierId">
            <el-select
              v-model="form.supplierId"
              filterable
              remote
              reserve-keyword
              allow-create
              default-first-option
              placeholder="请输入供应商编码或名称搜索"
              :remote-method="searchSupplier"
              :loading="supplierLoading"
              style="width: 100%"
            >
              <el-option
                v-for="item in supplierOptions"
                :key="item.supplierId"
                :label="item.supplierName"
                :value="item.supplierId"
              >
                <span style="float: left">{{ item.supplierCode }}</span>
                <span style="float: left; margin-left: 10px">{{ item.supplierName }}</span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="总金额">
            <el-input v-model="form.totalAmount" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="备注">
            <el-input
              v-model="form.remark"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              maxlength="500"
              placeholder="请输入备注"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <div class="detail-table-wrap">
      <el-table :data="detailList" border stripe>
        <el-table-column type="index" width="50" align="center" />
        <el-table-column label="物料" prop="materialId" min-width="220">
          <template #default="{ row, $index }">
            <el-select
              v-model="row.materialId"
              filterable
              remote
              reserve-keyword
              allow-create
              default-first-option
              placeholder="请输入物料名称或规格型号搜索"
              :remote-method="searchMaterial"
              :loading="materialLoading"
              style="width: 100%"
              @change="(value) => handleMaterialChange(value, $index)"
            >
              <el-option
                v-for="item in materialOptions"
                :key="item.materialId"
                :label="`${item.materialName} ${item.specification || ''}`"
                :value="item.materialId"
              >
                <span style="float: left; color: #ff7171">{{ item.materialCode }}</span>
                <span style="float: left; color: #6985ff; margin-left: 10px">
                  {{ item.materialName }}
                </span>
                <span style="float: right; color: #37a62c; font-size: 13px; margin-left: 20px">
                  {{ item.specification }}
                </span>
              </el-option>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="物料名称" prop="materialName" min-width="150">
          <template #default="{ row }">
            <el-input
              v-model="row.materialName"
              placeholder="新物料名称"
              :disabled="isExistingMaterialRow(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="规格型号" prop="specModel" min-width="130">
          <template #default="{ row }">
            <el-input
              v-model="row.specModel"
              placeholder="规格型号"
              :disabled="isExistingMaterialRow(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="单位" prop="unitCode" width="110">
          <template #default="{ row }">
            <el-input
              v-model="row.unitCode"
              placeholder="单位"
              :disabled="isExistingMaterialRow(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="验收数量" prop="quantity" width="140">
          <template #default="{ row }">
            <el-input-number
              v-model="row.quantity"
              :min="0"
              :precision="6"
              controls-position="right"
              style="width: 100%"
              @change="calculateTotalAmount"
            />
          </template>
        </el-table-column>
        <el-table-column label="单价" prop="unitPrice" width="130">
          <template #default="{ row }">
            <el-input-number
              v-model="row.unitPrice"
              :min="0"
              :precision="2"
              controls-position="right"
              style="width: 100%"
              @change="calculateTotalAmount"
            />
          </template>
        </el-table-column>
        <el-table-column label="金额" prop="amount" width="120" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.amount) }}
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="150">
          <template #default="{ row }">
            <el-input
              v-model="row.remark"
              type="textarea"
              :autosize="{ minRows: 1 }"
              placeholder="请输入备注"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }">
            <el-button link type="primary" icon="Delete" @click="removeDetailItem($index)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="detail-table-footer">
        <el-button type="primary" plain icon="Plus" @click="addDetailItem">
          添加明细
        </el-button>
        <span>合计金额: {{ form.totalAmount }}</span>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          确 定
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup name="SalesProjectAcceptanceOrderDialog">
import { formatAmount } from "../shared";
import { useSalesProjectAcceptanceOrderDialog } from "./useSalesProjectAcceptanceOrderDialog";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  project: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update:modelValue", "submitted"]);

const {
  orderFormRef,
  submitting,
  supplierLoading,
  supplierOptions,
  materialLoading,
  materialOptions,
  form,
  detailList,
  visible,
  projectLabel,
  rules,
  handleClosed,
  isExistingMaterialRow,
  searchSupplier,
  searchMaterial,
  handleMaterialChange,
  addDetailItem,
  removeDetailItem,
  calculateTotalAmount,
  submitForm,
} = useSalesProjectAcceptanceOrderDialog(props, emit);
</script>

<style scoped lang="scss">
.detail-table-wrap {
  margin-top: 12px;
}

.detail-table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding-right: 12px;
}
</style>
