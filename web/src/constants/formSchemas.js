/**
 * 表单字段 Schema 注册表
 *
 * 集中定义各业务表单中 **用户需要填写的字段**，
 * 随请求发送给后端，后端将其注入 AI prompt，
 * 使 AI 能够在 action.formData 中返回正确的字段名和结构。
 *
 * ★ 新增 / 修改表单时，只需在此处维护对应的 schema 即可，
 *   后端与 AI 侧无需任何改动。
 *
 * 字段说明：
 *   label    — 中文标签
 *   type     — 数据类型（string / number / date）
 *   hint     — 填写提示，帮助 AI 理解如何填写
 *   required — 是否必填
 *   example  — 示例值
 */

export const FORM_SCHEMAS = {
  /* ========== 验收单 ========== */
  "/entry/order": {
    formName: "验收单",
    mainFields: {
      supplierName: {
        label: "供应商",
        type: "string",
        hint: "填写供应商名称，系统自动模糊匹配",
        example: "华东皮革",
      },
      workshopName: {
        label: "关联部门",
        type: "string",
        hint: "填写部门或车间名称，系统自动匹配",
      },
      attn: { label: "经办人", type: "string" },
      remark: { label: "备注", type: "string" },
    },
    detailFields: {
      materialName: {
        label: "物料名称",
        type: "string",
        hint: "填写物料名称或编码，系统自动模糊搜索匹配",
        required: true,
        example: "靴子",
      },
      quantity: {
        label: "验收数量",
        type: "number",
        required: true,
        example: "100",
      },
      unitPrice: {
        label: "单价",
        type: "number",
        hint: "可不填，系统会自动查询最近采购价",
      },
      taxPrice: { label: "含税价", type: "number" },
      remark: { label: "明细备注", type: "string" },
    },
    hint: "主表字段放在 formData 顶层，明细行数据放在 formData.details 数组中，每个明细至少包含 materialName 和 quantity",
  },

  /* ========== 入库单 ========== */
  "/entry/intoOrder": {
    formName: "入库单",
    mainFields: {
      workshopName: {
        label: "部门",
        type: "string",
        hint: "填写部门或车间名称，系统自动匹配",
      },
      attn: { label: "经办人", type: "string" },
      remark: { label: "备注", type: "string" },
    },
    detailFields: {
      materialName: {
        label: "物料名称",
        type: "string",
        hint: "填写物料名称或编码，系统自动模糊搜索匹配",
        required: true,
        example: "靴子",
      },
      quantity: {
        label: "入库数量",
        type: "number",
        required: true,
        example: "100",
      },
      unitPrice: {
        label: "单价",
        type: "number",
        hint: "可不填，系统会自动查询最近价格",
      },
      remark: { label: "明细备注", type: "string" },
    },
    hint: "主表字段放在 formData 顶层，明细行数据放在 formData.details 数组中，每个明细至少包含 materialName 和 quantity",
  },

  /* ========== 领料单 ========== */
  "/take/pickOrder": {
    formName: "领料单",
    mainFields: {
      workshopName: {
        label: "车间",
        type: "string",
        hint: "填写车间名称，系统自动匹配",
      },
      picker: { label: "领料人", type: "string", hint: "填写领料人姓名" },
      remark: { label: "备注", type: "string" },
    },
    detailFields: {
      materialName: {
        label: "物料名称",
        type: "string",
        hint: "填写物料名称或编码，系统自动模糊搜索匹配",
        required: true,
        example: "螺丝",
      },
      quantity: {
        label: "领料数量",
        type: "number",
        required: true,
        example: "50",
      },
      unitPrice: {
        label: "单价",
        type: "number",
        required: true,
        example: "10",
      },
      remark: { label: "明细备注", type: "string" },
    },
    hint: "主表字段放在 formData 顶层，明细行数据放在 formData.details 数组中，每个明细至少包含 materialName、quantity 和 unitPrice，金额由系统按单价乘数量计算",
  },
};
