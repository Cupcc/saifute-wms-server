export const inventoryMetricHelp = Object.freeze({
  activeMaterialCount:
    "当前筛选范围内库存数量大于 0 的有效物料去重数；同一物料存在多条库存余额时只计一个品种。",
  inventoryRecordCount:
    "当前筛选范围内的物料-仓别库存余额记录数，包含零余额；主要用于数据核对。",
  lowStockCount: "物料-仓别库存数量严格低于已配置下限的项数。",
  normalStockCount:
    "已配置至少一个库存阈值，且当前数量未低于下限、未超过上限的物料-仓别项数。",
  aboveMaxStockCount: "物料-仓别库存数量严格超过已配置上限的项数。",
  unconfiguredStockCount:
    "未配置库存下限和上限的物料-仓别项数；不再将其误标为正常。",
  totalInventoryValue:
    "按当前尚未耗用的入库来源数量乘对应单位成本汇总，属于可追溯来源库存成本，不是销售价或正式财务账面余额。",
  quantityOnHand:
    "该物料在当前仓别所有已生效库存流水累计得到的实时结存数量。",
  inventoryValue:
    "该物料当前未耗用入库来源的剩余数量乘对应单位成本汇总。",
  inventoryStatus:
    "状态在物料-仓别粒度互斥分类为低库存、正常、超上限或未配置；等于上下限时视为正常。",
  materialCount:
    "当前分类下存在库存余额记录的有效物料去重数，不等同于库存数量大于零的品种数。",
});

export const trendMetricHelp = Object.freeze({
  date:
    "按库存流水业务日期归并为自然日，不使用单据创建时间；日期边界采用系统业务时区。",
  trendType:
    "按业务事实区分入库域净流量、销售出库成本、车间净耗用、研发项目净耗用、RD 交接及盘盈盘亏。",
  recordCount:
    "当前查询返回的日期×业务类型数据点数，仅用于描述图表数据规模。",
  documentCount:
    "按业务单据类型和单据 ID 去重后的真实业务单据数；同一单据多条库存流水只计一张。",
  totalAmount:
    "该日期和业务类型的库存成本金额；具体正负方向由业务类型定义，不是销售收入。",
  inventoryCostNetChange:
    "当前筛选范围内所有已纳入趋势流水按入为正、出为负计算的库存成本净变动，由后端 Decimal 精确汇总。",
});

const monthlyCountHelp = Object.freeze({
  documentCount:
    "按单据类型和单据 ID 去重后的业务单据数量；同一单据包含多行时只计一张。",
  lineCount:
    "筛选范围内参与汇总的业务单据行数量；它是核对信息，不代表风险高低。",
});

const costFlowHelp = Object.freeze({
  inAmount:
    "所有入向月报事实的实际库存成本合计；查看全部仓别时排除内部仓间转移。",
  outAmount:
    "所有出向月报事实的实际库存成本合计；查看全部仓别时排除内部仓间转移。",
  netChangeAmount: "库存成本净变动 = 库存成本流入 - 库存成本流出。",
});

const workshopHelp = Object.freeze({
  netConsumptionQuantity:
    "该物料车间净耗用数量 = 领料数量 - 退料数量 + 报废数量。",
  pickCostAmount: "统计期内已纳入月报的车间领料实际成本。",
  returnCostAmount: "统计期内已纳入月报的车间退料成本冲回。",
  scrapCostAmount: "统计期内已纳入月报的车间报废实际成本。",
  netConsumptionCostAmount:
    "车间净耗用成本 = 领料成本 - 退料冲回成本 + 报废成本，正数表示本期耗用。",
});

const salesHelp = Object.freeze({
  outboundCostAmount: "销售出库消耗的库存来源实际成本。",
  returnCostAmount: "销售退货恢复或冲回的库存成本。",
  netQuantity: "同一物料的净销售数量 = 销售出库数量 - 销售退货数量。",
  netSalesAmount:
    "销售净额（WMS 销售价口径）= 销售出库销售价金额 - 销售退货销售价金额。",
  netCostAmount: "销售净成本 = 销售出库成本 - 销售退货成本。",
  grossProfitAmount:
    "WMS 商品毛利估算 = 销售净额 - 销售净成本；不含税费、折扣、期间费用和会计确认差异。",
});

const rdProjectHelp = Object.freeze({
  handoffInCostAmount: "统计期内交接进入研发项目的 FIFO 结算成本。",
  pickCostAmount: "统计期内研发项目领用物料的 FIFO 实际成本。",
  returnCostAmount: "统计期内研发项目退回物料的成本冲回。",
  scrapCostAmount: "统计期内研发项目报废物料的实际成本。",
  netConsumptionCostAmount:
    "项目净耗用成本 = 项目领用成本 - 项目退回成本 + 项目报废成本。",
  attributedInventoryCostNetChangeAmount:
    "项目归属库存成本净变动 = 交接入成本 + 退回成本 + 项目盘盈成本 - 领用成本 - 报废成本 - 项目盘亏成本。",
});

const balanceHelp = Object.freeze({
  openingQuantity:
    "该物料按本月首日前库存流水回算的月初数量；数量格式本轮保持现状。",
  netQuantity: "同一物料的库存净变动数量 = 月末数量 - 月初数量。",
  closingQuantity:
    "该物料按不晚于本月末的库存流水回算的月末数量；数量格式本轮保持现状。",
  openingCostAmount: "当前筛选且本月有发生物料的月初库存来源成本。",
  inventoryCostNetChangeAmount: "库存成本净变动 = 月末库存成本 - 月初库存成本。",
  closingCostAmount: "当前筛选且本月有发生物料的月末库存来源成本。",
});

const inboundHelp = Object.freeze({
  purchaseNetInboundAmount: "采购净入库金额 = 验收入库计价金额 - 退厂计价金额。",
  inQuantity: "该物料统计期内纳入范围的库存流入数量。",
  outQuantity: "该物料统计期内纳入范围的库存流出数量。",
});

const detailHelp = Object.freeze({
  documentCost:
    "来源单据对应的实际库存成本；销售、车间和研发优先采用结算后的成本字段。",
  unitPrice: "该物料行的成本单价，优先由实际成本金额除以数量回算。",
  amount: "该物料行的实际成本金额，不是销售价金额。",
});

export const monthlyMetricHelp = Object.freeze({
  count: monthlyCountHelp,
  costFlow: costFlowHelp,
  workshop: workshopHelp,
  sales: salesHelp,
  rdProject: rdProjectHelp,
  balance: balanceHelp,
  inbound: inboundHelp,
  detail: detailHelp,
});
