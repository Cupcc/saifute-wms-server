import { computed, getCurrentInstance, nextTick, ref, watch } from "vue";
import { listMaterialByCodeOrName } from "@/api/base/material";
import { clearSuggestionsCache } from "@/api/base/suggestions";
import { listSupplierByKeyword } from "@/api/base/supplier";
import { getLatestDetailByMaterialId } from "@/api/entry/detail";
import { addOrder } from "@/api/entry/order";
import useUserStore from "@/store/modules/user";
import { confirmDocumentSave } from "@/utils/documentConfirm";
import { mergeMaterialOptions } from "@/utils/materialOptions";
import { formatDateToYYYYMMDD } from "@/utils/orderNumber";
import { toInputString } from "../shared";

export function useSalesProjectAcceptanceOrderDialog(props, emit) {
  const { proxy } = getCurrentInstance();
  const userStore = useUserStore();
  const orderFormRef = ref();
  const submitting = ref(false);
  const supplierLoading = ref(false);
  const supplierOptions = ref([]);
  const materialLoading = ref(false);
  const materialOptions = ref([]);
  const form = ref(createForm());
  const detailList = ref([createDetailLine()]);

  const visible = computed({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
  });

  const projectLabel = computed(() => {
    if (!props.project) {
      return "-";
    }
    return `${props.project.salesProjectCode || "-"} / ${props.project.salesProjectName || "-"}`;
  });

  const operatorNickname = computed(
    () => userStore.nickName || userStore.name || "",
  );

  const rules = {
    inboundDate: [
      { required: true, message: "验收日期不能为空", trigger: "change" },
    ],
    supplierId: [
      { required: true, message: "供应商不能为空", trigger: "change" },
    ],
  };

  function resetForm() {
    form.value = {
      ...createForm(),
      salesProjectId: props.project?.projectId ?? null,
      salesProjectCode: props.project?.salesProjectCode ?? null,
      salesProjectName: props.project?.salesProjectName ?? null,
      workshopId: props.project?.workshopId ?? null,
      attn: props.project?.managerName || operatorNickname.value || null,
    };
    detailList.value = [createDetailLine()];
    supplierOptions.value = [];
    materialOptions.value = [];
    calculateTotalAmount();
    nextTick(() => {
      orderFormRef.value?.clearValidate?.();
    });
  }

  function handleClosed() {
    if (!submitting.value) {
      resetForm();
    }
  }

  function isExistingMaterialRow(row) {
    return typeof row?.materialId === "number";
  }

  function searchSupplier(query) {
    supplierLoading.value = true;
    listSupplierByKeyword(query)
      .then((response) => {
        supplierOptions.value = response.rows || [];
      })
      .finally(() => {
        supplierLoading.value = false;
      });
  }

  function searchMaterial(query) {
    materialLoading.value = true;
    listMaterialByCodeOrName({
      materialCode: query,
    })
      .then((response) => {
        materialOptions.value = mergeMaterialOptions(
          response.rows || [],
          materialOptions.value,
        );
      })
      .finally(() => {
        materialLoading.value = false;
      });
  }

  function handleMaterialChange(value, index) {
    const row = detailList.value[index];
    if (!row) {
      return;
    }
    if (typeof value === "string") {
      row.materialName = value;
      row.specModel = row.specModel || "";
      row.unitCode = row.unitCode || "";
      calculateTotalAmount();
      return;
    }

    const selectedMaterial = materialOptions.value.find(
      (item) => Number(item.materialId) === Number(value),
    );
    if (!selectedMaterial) {
      calculateTotalAmount();
      return;
    }

    row.materialName = selectedMaterial.materialName || "";
    row.specModel = selectedMaterial.specification || "";
    row.unitCode = selectedMaterial.unit || "";
    getLatestDetailByMaterialId(value)
      .then((response) => {
        if (response.data?.unitPrice && !Number(row.unitPrice || 0)) {
          row.unitPrice = Number(response.data.unitPrice);
          calculateTotalAmount();
        }
      })
      .catch(() => {
        proxy.$modal.msgWarning("未能获取物料最近单价，请手动填写");
      });
    calculateTotalAmount();
  }

  function addDetailItem() {
    detailList.value.push(createDetailLine());
    calculateTotalAmount();
  }

  function removeDetailItem(index) {
    if (detailList.value.length === 1) {
      detailList.value = [createDetailLine()];
    } else {
      detailList.value.splice(index, 1);
    }
    calculateTotalAmount();
  }

  function calculateTotalAmount() {
    let total = 0;
    for (const line of detailList.value) {
      const quantity = Number(line.quantity || 0);
      const unitPrice = Number(line.unitPrice || 0);
      line.amount = Number((quantity * unitPrice).toFixed(2));
      total += line.amount;
    }
    form.value.totalAmount = total.toFixed(2);
  }

  function submitForm() {
    orderFormRef.value?.validate(async (valid) => {
      if (!valid || !validateDetailLines()) {
        return;
      }
      if (!props.project?.projectId) {
        proxy.$modal.msgError("销售项目参数无效");
        return;
      }

      if (!(await confirmDocumentSave({ documentName: "项目验收单" }))) {
        return;
      }
      submitting.value = true;
      addOrder(buildSubmitPayload(form.value, detailList.value, supplierOptions.value))
        .then((response) => {
          clearSuggestionsCache();
          proxy.$modal.msgSuccess("新增验收单成功");
          visible.value = false;
          emit("submitted", response);
        })
        .finally(() => {
          submitting.value = false;
        });
    });
  }

  function validateDetailLines() {
    if (detailList.value.length === 0) {
      proxy.$modal.msgError("至少需要添加一条明细");
      return false;
    }

    for (let index = 0; index < detailList.value.length; index++) {
      const line = detailList.value[index];
      const isNewMaterial = typeof line.materialId === "string";
      if (!line.materialId && !line.materialName) {
        proxy.$modal.msgError(`第${index + 1}行物料不能为空`);
        return false;
      }
      if (isNewMaterial && !line.unitCode) {
        proxy.$modal.msgError(`第${index + 1}行新物料单位不能为空`);
        return false;
      }
      if (Number(line.quantity || 0) <= 0) {
        proxy.$modal.msgError(`第${index + 1}行验收数量必须大于 0`);
        return false;
      }
    }

    return true;
  }

  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        resetForm();
      }
    },
  );

  return {
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
  };
}

function createForm() {
  return {
    inboundId: null,
    inboundNo: null,
    inboundDate: formatDateToYYYYMMDD(new Date()),
    supplierId: null,
    supplierName: null,
    salesProjectId: null,
    salesProjectCode: null,
    salesProjectName: null,
    workshopId: null,
    attn: null,
    totalAmount: "0.00",
    remark: "",
    details: [],
  };
}

function createDetailLine() {
  return {
    materialId: null,
    materialName: "",
    specModel: "",
    unitCode: "",
    quantity: null,
    unitPrice: 0,
    amount: 0,
    remark: "",
  };
}

function buildSubmitPayload(form, detailList, supplierOptions) {
  const payload = {
    ...form,
    details: detailList.map((line) => ({
      materialId: line.materialId,
      materialName: line.materialName,
      specModel: line.specModel,
      unitCode: line.unitCode,
      quantity: toInputString(line.quantity),
      unitPrice: toInputString(line.unitPrice || 0),
      amount: toInputString(line.amount || 0),
      remark: line.remark,
    })),
  };
  normalizeSupplierForSubmit(payload, supplierOptions);
  return payload;
}

function normalizeSupplierForSubmit(payload, supplierOptions) {
  const selectedSupplier = supplierOptions.find(
    (item) => String(item.supplierId) === String(payload.supplierId),
  );
  if (selectedSupplier) {
    payload.supplierId = selectedSupplier.supplierId;
    payload.supplierName = selectedSupplier.supplierName;
    return;
  }

  const supplierId = Number(payload.supplierId);
  if (Number.isInteger(supplierId) && supplierId > 0) {
    payload.supplierId = supplierId;
    payload.supplierName = null;
    return;
  }

  payload.supplierName = payload.supplierId;
  payload.supplierId = null;
}
