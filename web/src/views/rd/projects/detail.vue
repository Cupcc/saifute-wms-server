<template>
  <div class="app-container rd-project-detail-page">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="page-header">
          <div class="page-header-copy">
            <div class="page-title">{{ isCreate ? "新增研发项目" : "研发项目详情" }}</div>
            <div class="page-subtitle">{{ headerSubtitle }}</div>
          </div>
          <div class="page-actions">
            <el-tag v-if="detailRow" :type="lifecycleTagType">{{ lifecycleLabel }}</el-tag>
            <el-button icon="Back" @click="handleBack">返回列表</el-button>
            <el-button
              v-if="!isCreate"
              icon="Refresh"
              :loading="detailLoading"
              @click="reloadAll"
            >
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <div v-loading="detailLoading" class="detail-body">
        <el-form
          v-if="editing"
          ref="projectFormRef"
          :model="projectForm"
          :rules="projectFormRules"
          label-width="100px"
          class="project-form"
        >
          <el-row :gutter="16">
            <el-col :xs="24" :md="12">
              <el-form-item label="项目编码">
                <el-input
                  v-model="projectForm.projectCode"
                  disabled
                  placeholder="保存后自动生成: YFXMBH-顺序ID"
                />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item label="业务日期" prop="bizDate">
                <el-date-picker
                  v-model="projectForm.bizDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :xs="24" :md="12">
              <el-form-item label="项目名称" prop="projectName">
                <el-input v-model="projectForm.projectName" placeholder="请输入项目名称" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item label="业务车间">
                <el-input :model-value="projectForm.workshopNameSnapshot || '研发技术'" disabled />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :xs="24" :md="12">
              <el-form-item label="作业仓别">
                <el-input :model-value="stockScopeLabel" disabled />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item label="备注">
            <el-input v-model="projectForm.remark" type="textarea" :rows="3" />
          </el-form-item>

          <div class="section-toolbar">
            <div>
              <div class="section-title">研发项目 BOM</div>
              <div class="section-subtitle">
                计划量与参考成本只用于计划与成本基线，不直接影响库存。
                <span v-if="hasEffectiveActions" class="warn-text">
                  当前项目已有领退记录，BOM 计划量不能低于净领用量。
                </span>
              </div>
            </div>
            <el-button type="primary" plain @click="addBomLine">新增 BOM 行</el-button>
          </div>

          <el-table :data="projectForm.bomLines" border stripe>
            <el-table-column label="物料" min-width="240">
              <template #default="{ row }">
                <el-select
                  v-model="row.materialId"
                  filterable
                  remote
                  reserve-keyword
                  clearable
                  placeholder="请输入物料编码或名称"
                  :remote-method="searchMaterials"
                  :loading="materialLoading"
                  style="width: 100%"
                  @change="(val) => handleMaterialSelected(val, row)"
                >
                  <el-option
                    v-for="item in materialSelectOptions"
                    :key="item.id"
                    :label="`${item.materialCode} ${item.materialName}`"
                    :value="item.id"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="型号" min-width="120">
              <template #default="{ row }">
                <span class="muted-cell">{{ row.specModel || "-" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="单位" min-width="80">
              <template #default="{ row }">
                <span class="muted-cell">{{ row.unitCode || "-" }}</span>
              </template>
            </el-table-column>
            <el-table-column label="计划数量" min-width="170" class-name="numeric-column">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.quantity"
                  :min="0.000001"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="参考单价" min-width="155" class-name="numeric-column">
              <template #default="{ row }">
                <el-input-number
                  v-model="row.unitPrice"
                  :min="0"
                  :precision="4"
                  controls-position="right"
                  style="width: 100%"
                />
              </template>
            </el-table-column>
            <el-table-column label="计划金额" min-width="135" class-name="numeric-column">
              <template #default="{ row }">
                {{ formatAmount(calculateLineAmount(row)) }}
              </template>
            </el-table-column>
            <el-table-column label="厂家" min-width="150">
              <template #default="{ row }">
                <el-input v-model="row.manufacturer" maxlength="128" placeholder="厂家" />
              </template>
            </el-table-column>
            <el-table-column label="链接" min-width="200">
              <template #default="{ row }">
                <el-input v-model="row.productLink" maxlength="500" placeholder="购买/参考链接" />
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="180">
              <template #default="{ row }">
                <el-input v-model="row.remark" maxlength="500" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ $index }">
                <el-button link type="danger" @click="removeBomLine($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-form>

        <template v-else>
          <el-skeleton v-if="!detailRow" :rows="8" animated />
          <div v-else class="detail-shell">
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-label">计划成本</div>
                <div class="summary-value">{{ formatAmount(detailRow.ledgerSummary?.plannedAmount) }}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">已领成本</div>
                <div class="summary-value">{{ formatAmount(detailRow.ledgerSummary?.pickedCost) }}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">退料回补</div>
                <div class="summary-value">{{ formatAmount(detailRow.ledgerSummary?.returnedCost) }}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">报废损耗</div>
                <div class="summary-value">{{ formatAmount(detailRow.ledgerSummary?.scrappedCost) }}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">交接入成本</div>
                <div class="summary-value">
                  {{ formatAmount(detailRow.ledgerSummary?.totalHandoffInCostAmount ?? detailRow.totalHandoffInCostAmount) }}
                </div>
              </div>
              <div class="summary-card accent">
                <div class="summary-label">净耗用成本</div>
                <div class="summary-value">{{ formatAmount(detailRow.ledgerSummary?.netCost) }}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">在库成本</div>
                <div class="summary-value">
                  {{ formatAmount(detailRow.ledgerSummary?.totalOnHandCostAmount ?? detailRow.totalOnHandCostAmount) }}
                </div>
              </div>
            </div>

            <div v-if="canEnterEdit" class="edit-hint">
              带 <el-icon class="edit-hint-icon"><edit-pen /></el-icon> 标记的字段和 BOM
              行可双击修改；Enter 确认（弹二次确认框），Esc 或点击空白处放弃
            </div>

            <el-descriptions :column="descColumn" border class="detail-descriptions">
              <el-descriptions-item label="项目编码">
                {{ detailRow.projectCode }}
              </el-descriptions-item>
              <el-descriptions-item label="项目名称">
                <el-input
                  v-if="headerEditField === 'projectName'"
                  v-model="headerEditValue"
                  v-focus
                  size="small"
                  maxlength="128"
                  :disabled="headerSaving"
                  @keyup.enter="requestHeaderSave"
                  @keyup.esc="cancelHeaderEdit"
                  @blur="handleHeaderBlur"
                />
                <span
                  v-else
                  :class="canEnterEdit ? 'editable-value' : ''"
                  title="双击修改"
                  @dblclick="startHeaderEdit('projectName')"
                >
                  {{ detailRow.projectName
                  }}<el-icon v-if="canEnterEdit" class="edit-icon"><edit-pen /></el-icon>
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="业务日期">
                <el-date-picker
                  v-if="headerEditField === 'bizDate'"
                  v-model="headerEditValue"
                  v-focus
                  type="date"
                  value-format="YYYY-MM-DD"
                  size="small"
                  style="width: 100%"
                  :clearable="false"
                  :disabled="headerSaving"
                  @change="requestHeaderSave"
                  @visible-change="handleBizDateVisibleChange"
                />
                <span
                  v-else
                  :class="canEnterEdit ? 'editable-value' : ''"
                  title="双击修改"
                  @dblclick="startHeaderEdit('bizDate')"
                >
                  {{ formatDateValue(detailRow.bizDate)
                  }}<el-icon v-if="canEnterEdit" class="edit-icon"><edit-pen /></el-icon>
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="作业仓别">
                {{ detailRow.fixedStockScope || stockScopeLabel }}
              </el-descriptions-item>
              <el-descriptions-item label="车间">
                {{ detailRow.workshopNameSnapshot }}
              </el-descriptions-item>
              <el-descriptions-item label="备注">
                <el-input
                  v-if="headerEditField === 'remark'"
                  v-model="headerEditValue"
                  v-focus
                  size="small"
                  maxlength="500"
                  :disabled="headerSaving"
                  @keyup.enter="requestHeaderSave"
                  @keyup.esc="cancelHeaderEdit"
                  @blur="handleHeaderBlur"
                />
                <span
                  v-else
                  :class="canEnterEdit ? 'editable-value' : ''"
                  title="双击修改"
                  @dblclick="startHeaderEdit('remark')"
                >
                  {{ detailRow.remark || "-"
                  }}<el-icon v-if="canEnterEdit" class="edit-icon"><edit-pen /></el-icon>
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="创建">
                {{ detailRow.createdBy || "-" }} / {{ parseTime(detailRow.createdAt) || "-" }}
              </el-descriptions-item>
              <el-descriptions-item label="最后修改">
                {{ detailRow.updatedBy || "-" }} / {{ parseTime(detailRow.updatedAt) || "-" }}
              </el-descriptions-item>
              <el-descriptions-item v-if="detailRow.lifecycleStatus === 'VOIDED'" label="作废">
                {{ detailRow.voidedBy || "-" }} / {{ detailRow.voidReason || "-" }}
              </el-descriptions-item>
            </el-descriptions>

            <el-tabs v-model="detailTab" class="detail-tabs">
              <el-tab-pane label="BOM 与台账" name="ledger">
                <div>
                  <el-table
                    :data="ledgerTableRows"
                    :class="{ 'editable-table': canEnterEdit }"
                    stripe
                    border
                    @row-dblclick="handleRowDblclick"
                  >
                    <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="200">
                      <template #default="{ row }">
                        <el-select
                          v-if="row.__new"
                          v-model="rowDraft.materialId"
                          filterable
                          remote
                          reserve-keyword
                          placeholder="物料编码或名称"
                          :remote-method="searchMaterials"
                          :loading="materialLoading"
                          size="small"
                          style="width: 100%"
                          @change="handleDraftMaterialSelected"
                        >
                          <el-option
                            v-for="item in materialSelectOptions"
                            :key="item.id"
                            :label="`${item.materialCode} ${item.materialName}`"
                            :value="item.id"
                          />
                        </el-select>
                        <template v-else>{{ row.materialCodeSnapshot }}</template>
                      </template>
                    </el-table-column>
                    <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="180">
                      <template #default="{ row }">
                        {{ row.__new ? rowDraft.materialName || "-" : row.materialNameSnapshot }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="materialSpecSnapshot" label="型号" min-width="120">
                      <template #default="{ row }">
                        {{ row.__new ? rowDraft.specModel || "-" : row.materialSpecSnapshot }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="unitCodeSnapshot" label="单位" min-width="80">
                      <template #default="{ row }">
                        {{ row.__new ? rowDraft.unitCode || "-" : row.unitCodeSnapshot }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="plannedQty" label="计划量" min-width="130">
                      <template #default="{ row }">
                        <el-input-number
                          v-if="isRowEditing(row)"
                          v-model="rowDraft.quantity"
                          :min="0.000001"
                          :precision="2"
                          :controls="false"
                          size="small"
                          style="width: 100%"
                        />
                        <template v-else>{{ formatQty(row.plannedQty) }}</template>
                      </template>
                    </el-table-column>
                    <el-table-column prop="plannedUnitPrice" label="参考单价" min-width="135" class-name="numeric-column">
                      <template #default="{ row }">
                        <el-input-number
                          v-if="isRowEditing(row)"
                          v-model="rowDraft.unitPrice"
                          :min="0"
                          :precision="4"
                          :controls="false"
                          size="small"
                          style="width: 100%"
                        />
                        <template v-else>{{ formatAmount(row.plannedUnitPrice) }}</template>
                      </template>
                    </el-table-column>
                    <el-table-column prop="currentAvailableQty" label="当前可用" min-width="130" class-name="numeric-column">
                      <template #default="{ row }">
                        {{ formatQty(row.currentAvailableQty) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="pickedQty" label="已领" min-width="125" class-name="numeric-column">
                      <template #default="{ row }">
                        {{ formatQty(row.pickedQty) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="returnedQty" label="已退" min-width="125" class-name="numeric-column">
                      <template #default="{ row }">
                        {{ formatQty(row.returnedQty) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="scrappedQty" label="已报废" min-width="125" class-name="numeric-column">
                      <template #default="{ row }">
                        {{ formatQty(row.scrappedQty) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="handoffInQty" label="交接入项目" min-width="130" class-name="numeric-column">
                      <template #default="{ row }">
                        {{ formatQty(row.handoffInQty) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="netConsumedQty" label="净耗用" min-width="110">
                      <template #default="{ row }">
                        {{ formatQty(row.netConsumedQty) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="netCost" label="净耗用成本" min-width="130">
                      <template #default="{ row }">
                        {{ formatAmount(row.netCost) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="handoffInCostAmount" label="交接入成本" min-width="130">
                      <template #default="{ row }">
                        {{ formatAmount(row.handoffInCostAmount) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="onHandCostAmount" label="在库成本" min-width="130">
                      <template #default="{ row }">
                        {{ formatAmount(row.onHandCostAmount) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="manufacturer" label="厂家" min-width="140">
                      <template #default="{ row }">
                        <el-input
                          v-if="isRowEditing(row)"
                          v-model="rowDraft.manufacturer"
                          maxlength="128"
                          size="small"
                          placeholder="厂家"
                        />
                        <template v-else>{{ row.manufacturer || "-" }}</template>
                      </template>
                    </el-table-column>
                    <el-table-column prop="productLink" label="链接" min-width="180">
                      <template #default="{ row }">
                        <el-input
                          v-if="isRowEditing(row)"
                          v-model="rowDraft.productLink"
                          maxlength="500"
                          size="small"
                          placeholder="购买/参考链接"
                        />
                        <el-link
                          v-else-if="isHttpUrl(row.productLink)"
                          type="primary"
                          :href="row.productLink"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          链接
                        </el-link>
                        <span v-else>{{ row.productLink || "-" }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column prop="remark" label="备注" min-width="160">
                      <template #default="{ row }">
                        <el-input
                          v-if="isRowEditing(row)"
                          v-model="rowDraft.remark"
                          maxlength="500"
                          size="small"
                        />
                        <template v-else>{{ row.remark || "-" }}</template>
                      </template>
                    </el-table-column>
                    <el-table-column v-if="canEnterEdit" label="操作" width="120" fixed="right">
                      <template #default="{ row }">
                        <template v-if="isRowEditing(row)">
                          <el-button link type="primary" :loading="rowSaving" @click="saveRowEdit">
                            保存
                          </el-button>
                          <el-button link :disabled="rowSaving" @click="cancelRowEdit">取消</el-button>
                        </template>
                        <el-button
                          v-else-if="hasBomLine(row)"
                          link
                          type="danger"
                          :disabled="editingRowKey !== null || rowSaving"
                          @click="removeLedgerRow(row)"
                        >
                          删除
                        </el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                  <el-button
                    v-if="canEnterEdit"
                    class="add-line-button"
                    plain
                    type="primary"
                    icon="Plus"
                    :disabled="editingRowKey !== null"
                    @click="startAddRow"
                  >
                    新增 BOM 物料
                  </el-button>
                </div>
              </el-tab-pane>

              <el-tab-pane label="研发项目物料动作" name="actions">
                <div class="section-toolbar compact">
                  <div>
                    <div class="section-title">领料 / 退料 / 报废</div>
                    <div class="section-subtitle">库存事实统一通过 inventory-core 落账，并持续挂到当前研发项目。</div>
                  </div>
                  <el-button
                    v-if="canEdit"
                    type="primary"
                    v-hasPermi="['rd:project:create']"
                    @click="openActionDialog"
                  >
                    新增项目动作
                  </el-button>
                </div>

                <el-table :data="actionRows" stripe border v-loading="actionLoading">
                  <el-table-column type="expand">
                    <template #default="{ row }">
                      <el-table :data="row.lines || []" stripe size="small">
                        <el-table-column prop="lineNo" label="行号" width="70" />
                        <el-table-column prop="materialCodeSnapshot" label="物料编码" min-width="130" />
                        <el-table-column prop="materialNameSnapshot" label="物料名称" min-width="160" />
                        <el-table-column label="数量" min-width="130" class-name="numeric-column">
                          <template #default="{ row: line }">
                            {{ formatQty(line.quantity) }}
                          </template>
                        </el-table-column>
                        <el-table-column label="参考金额" min-width="135" class-name="numeric-column">
                          <template #default="{ row: line }">
                            {{ formatAmount(line.amount) }}
                          </template>
                        </el-table-column>
                        <el-table-column label="成本金额" min-width="135" class-name="numeric-column">
                          <template #default="{ row: line }">
                            {{ formatAmount(line.costAmount) }}
                          </template>
                        </el-table-column>
                        <el-table-column label="可退数量" min-width="130" class-name="numeric-column">
                          <template #default="{ row: line }">
                            {{ line.availableReturnQty == null ? "-" : formatQty(line.availableReturnQty) }}
                          </template>
                        </el-table-column>
                        <el-table-column prop="remark" label="备注" min-width="160" />
                      </el-table>
                    </template>
                  </el-table-column>
                  <el-table-column prop="documentNo" label="单号" min-width="140" />
                  <el-table-column label="动作类型" min-width="110">
                    <template #default="{ row }">
                      <el-tag :type="actionTagType(row.actionType)">{{ actionLabel(row.actionType) }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="业务日期" min-width="120">
                    <template #default="{ row }">
                      {{ formatDateValue(row.bizDate) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="总数量" min-width="130" class-name="numeric-column">
                    <template #default="{ row }">
                      {{ formatQty(row.totalQty) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="总金额" min-width="135" class-name="numeric-column">
                    <template #default="{ row }">
                      {{ formatAmount(row.totalAmount) }}
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" min-width="100">
                    <template #default="{ row }">
                      <el-tag :type="row.lifecycleStatus === 'VOIDED' ? 'info' : 'success'">
                        {{ row.lifecycleStatus === "VOIDED" ? "已作废" : "有效" }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="100" fixed="right">
                    <template #default="{ row }">
                      <el-button
                        link
                        type="danger"
                        :disabled="row.lifecycleStatus === 'VOIDED'"
                        v-hasPermi="['rd:project:void']"
                        @click="handleVoidAction(row.id)"
                      >
                        作废
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <div v-if="actionRows.length >= 100" class="list-hint">
                  仅显示最近 100 条动作单
                </div>
              </el-tab-pane>

              <el-tab-pane label="变更记录" name="changes">
                <div v-loading="changeLogLoading" class="change-log-pane">
                  <el-empty
                    v-if="!changeLogLoading && changeLogRows.length === 0"
                    description="暂无变更记录"
                  />
                  <el-timeline v-else class="change-log-timeline">
                    <el-timeline-item
                      v-for="log in changeLogRows"
                      :key="log.id"
                      :type="changeActionMeta(log.action).color"
                      :timestamp="`${parseTime(log.changedAt)} · ${log.changedBy || '未知操作人'}`"
                      placement="top"
                    >
                      <div class="change-log-card">
                        <div class="change-log-head">
                          <el-tag size="small" :type="changeActionMeta(log.action).color" effect="plain">
                            {{ changeActionMeta(log.action).label }}
                          </el-tag>
                          <span class="change-log-summary">{{ log.summary }}</span>
                        </div>
                        <ul v-if="log.changes?.length" class="change-log-list">
                          <li
                            v-for="(entry, index) in log.changes"
                            :key="index"
                            :class="`change-entry-${changeEntryKind(entry)}`"
                          >
                            {{ formatChangeEntry(entry) }}
                          </li>
                        </ul>
                      </div>
                    </el-timeline-item>
                  </el-timeline>
                  <div v-if="changeLogRows.length >= 200" class="list-hint">
                    仅显示最近 200 条变更
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>
        </template>
      </div>
    </el-card>

    <div v-if="editing" class="save-bar">
      <span class="save-bar-tip">填写完成后保存，项目编码将自动生成</span>
      <div class="save-bar-actions">
        <el-button @click="cancelEdit">取消</el-button>
        <el-button type="primary" :loading="projectSubmitting" @click="submitProject">
          保存研发项目
        </el-button>
      </div>
    </div>

    <el-dialog
      v-model="actionDialogOpen"
      title="新增研发项目物料动作"
      width="min(980px, 94vw)"
      destroy-on-close
      :close-on-click-modal="false"
      :before-close="handleActionDialogBeforeClose"
    >
      <el-form
        ref="actionFormRef"
        :model="actionForm"
        :rules="actionFormRules"
        label-width="100px"
        class="action-form"
      >
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-form-item label="动作类型" prop="actionType">
              <el-select v-model="actionForm.actionType" style="width: 100%">
                <el-option label="研发项目领料" value="PICK" />
                <el-option label="研发项目退料" value="RETURN" />
                <el-option label="研发项目报废" value="SCRAP" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-form-item label="业务日期" prop="bizDate">
              <el-date-picker
                v-model="actionForm.bizDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="actionForm.remark" type="textarea" :rows="2" />
        </el-form-item>

        <div class="section-toolbar">
          <div>
            <div class="section-title">动作明细</div>
            <div class="section-subtitle">
              退料必须关联上游领料行，系统将自动释放对应来源占用并回补成本。
            </div>
          </div>
          <el-button type="primary" plain @click="addActionLine">新增明细</el-button>
        </div>

        <el-table :data="actionForm.lines" border stripe>
          <el-table-column v-if="actionForm.actionType === 'RETURN'" label="来源领料行" min-width="280">
            <template #default="{ row }">
              <el-select
                v-model="row.sourceKey"
                filterable
                clearable
                placeholder="请选择可退的领料行"
                no-data-text="当前项目无可退领料行"
                style="width: 100%"
                @change="handleReturnSourceChange(row)"
              >
                <el-option
                  v-for="item in returnSourceOptions"
                  :key="item.key"
                  :label="item.label"
                  :value="item.key"
                  :disabled="isReturnSourceTaken(item.key, row)"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="物料" min-width="220">
            <template #default="{ row }">
              <el-select
                v-model="row.materialId"
                filterable
                remote
                reserve-keyword
                clearable
                :disabled="actionForm.actionType === 'RETURN'"
                placeholder="请输入物料编码或名称"
                :remote-method="searchMaterials"
                :loading="materialLoading"
                style="width: 100%"
                @change="handleMaterialSelected"
              >
                <el-option
                  v-for="item in materialSelectOptions"
                  :key="item.id"
                  :label="`${item.materialCode} ${item.materialName}`"
                  :value="item.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="数量" min-width="170" class-name="numeric-column">
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                :min="0.000001"
                :max="returnLineMax(row)"
                :precision="2"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="参考单价" min-width="155" class-name="numeric-column">
            <template #default="{ row }">
              <el-input-number
                v-model="row.unitPrice"
                :min="0"
                :precision="4"
                controls-position="right"
                :disabled="actionForm.actionType === 'RETURN'"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.remark" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ $index }">
              <el-button link type="danger" @click="removeActionLine($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>

      <template #footer>
        <el-button @click="closeActionDialog">取消</el-button>
        <el-button type="primary" :loading="actionSubmitting" @click="submitAction">
          保存动作
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="RdProjectDetail">
import { useWindowSize } from "@vueuse/core";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createRdProject,
  createRdProjectMaterialAction,
  getRdProject,
  listRdMaterials,
  listRdProjectChangeLogs,
  listRdProjectMaterialActions,
  updateRdProject,
  voidRdProjectMaterialAction,
} from "@/api/rd-subwarehouse";
import useUserStore from "@/store/modules/user";
import { confirmDocumentSave } from "@/utils/documentConfirm";
import { formatAmount, formatQty } from "@/utils/format";
import { checkPermi } from "@/utils/permission";
import { formatDateOnly, formatDateValue } from "@/utils/rd-documents";
import { parseTime } from "@/utils/ruoyi";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { width: windowWidth } = useWindowSize();

const currentProjectId = computed(() => {
  const parsed = Number(route.params.projectId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
});
const isCreate = computed(() => !currentProjectId.value);

const detailLoading = ref(false);
const actionLoading = ref(false);
const changeLogLoading = ref(false);
const materialLoading = ref(false);
const projectSubmitting = ref(false);
const actionSubmitting = ref(false);
const actionVoiding = ref(false);

const editing = ref(false);
const detailRow = ref(null);
const actionRows = ref([]);
const changeLogRows = ref([]);
const detailTab = ref("ledger");
const actionDialogOpen = ref(false);

const materialOptions = ref([]);
const selectedMaterialCache = ref([]);

const projectForm = ref(createEmptyProjectForm());
const actionForm = ref(createEmptyActionForm());
const projectFormRef = ref(null);
const actionFormRef = ref(null);

const projectFormRules = {
  projectName: [{ required: true, message: "请输入项目名称", trigger: "blur" }],
  bizDate: [{ required: true, message: "请选择业务日期", trigger: "change" }],
};
const actionFormRules = {
  actionType: [{ required: true, message: "请选择动作类型", trigger: "change" }],
  bizDate: [{ required: true, message: "请选择业务日期", trigger: "change" }],
};

let projectFormSnapshot = "";
let actionFormSnapshot = "";
let materialSearchSeq = 0;

const stockScopeLabel = computed(
  () => userStore.stockScope?.stockScopeName || "研发小仓",
);

const descColumn = computed(() => {
  if (windowWidth.value >= 1400) {
    return 3;
  }
  return windowWidth.value >= 900 ? 2 : 1;
});

const headerSubtitle = computed(() => {
  if (detailRow.value) {
    return `${detailRow.value.projectCode || "-"} / ${detailRow.value.projectName || "-"}`;
  }
  if (isCreate.value) {
    return "保存后自动生成项目编码";
  }
  return currentProjectId.value ? `项目 ID ${currentProjectId.value}` : "项目参数无效";
});

const lifecycleLabel = computed(() =>
  detailRow.value?.lifecycleStatus === "VOIDED" ? "已作废" : "生效中",
);
const lifecycleTagType = computed(() =>
  detailRow.value?.lifecycleStatus === "VOIDED" ? "danger" : "success",
);
const canEdit = computed(
  () => Boolean(detailRow.value) && detailRow.value.lifecycleStatus !== "VOIDED",
);
const canEnterEdit = computed(
  () => canEdit.value && checkPermi(["rd:project:update"]),
);
const hasEffectiveActions = computed(() =>
  actionRows.value.some((action) => action.lifecycleStatus === "EFFECTIVE"),
);

const materialSelectOptions = computed(() => {
  const merged = [];
  const seen = new Set();
  for (const item of [...selectedMaterialCache.value, ...materialOptions.value]) {
    if (!item?.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
});

const returnSourceOptions = computed(() =>
  actionRows.value
    .filter((action) => action.actionType === "PICK" && action.lifecycleStatus === "EFFECTIVE")
    .flatMap((action) =>
      (action.lines || [])
        .filter((line) => Number(line.availableReturnQty || 0) > 0)
        .map((line) => ({
          key: `${action.id}:${line.id}`,
          actionId: action.id,
          lineId: line.id,
          materialId: line.materialId,
          materialCode: line.materialCodeSnapshot,
          materialName: line.materialNameSnapshot,
          availableReturnQty: Number(line.availableReturnQty || 0),
          unitPrice: Number(line.costUnitPrice || line.unitPrice || 0),
          label: `${action.documentNo} / ${line.materialCodeSnapshot} ${line.materialNameSnapshot} / 可退 ${formatQty(line.availableReturnQty)}`,
        })),
    ),
);

watch(
  () => actionForm.value.actionType,
  (value, oldValue) => {
    if (value !== "RETURN") {
      const leavingReturn = oldValue === "RETURN";
      actionForm.value.lines = actionForm.value.lines.map((line) => ({
        ...line,
        sourceKey: "",
        sourceDocumentId: null,
        sourceDocumentLineId: null,
        materialId: leavingReturn ? null : line.materialId,
        unitPrice: leavingReturn ? 0 : line.unitPrice,
      }));
      return;
    }

    actionForm.value.lines = actionForm.value.lines.map((line) => ({
      ...line,
      materialId: null,
      unitPrice: 0,
    }));
  },
);

function createEmptyBomLine() {
  return {
    materialId: null,
    quantity: null,
    unitPrice: 0,
    specModel: "",
    unitCode: "",
    manufacturer: "",
    productLink: "",
    remark: "",
  };
}

function createEmptyProjectForm() {
  return {
    projectCode: "",
    projectName: "",
    bizDate: formatDateOnly(),
    remark: "",
    workshopNameSnapshot: "",
    bomLines: [createEmptyBomLine()],
  };
}

function createEmptyActionLine() {
  return {
    materialId: null,
    quantity: null,
    unitPrice: 0,
    sourceKey: "",
    sourceDocumentId: null,
    sourceDocumentLineId: null,
    remark: "",
  };
}

function createEmptyActionForm() {
  return {
    actionType: "PICK",
    bizDate: formatDateOnly(),
    remark: "",
    clientRequestId: createClientRequestId(),
    lines: [createEmptyActionLine()],
  };
}

function createClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function seedMaterialOption(material) {
  if (!material?.id) {
    return;
  }
  if (selectedMaterialCache.value.some((item) => item.id === material.id)) {
    return;
  }
  selectedMaterialCache.value.push(material);
}

function handleMaterialSelected(materialId, bomRow) {
  const option = materialSelectOptions.value.find((item) => item.id === materialId);
  if (option) {
    seedMaterialOption(option);
  }
  if (bomRow) {
    bomRow.specModel = option?.specModel || "";
    bomRow.unitCode = option?.unitCode || "";
  }
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function calculateLineAmount(row) {
  return Number(row.quantity || 0) * Number(row.unitPrice || 0);
}

const CHANGE_ACTION_META = {
  CREATE: { label: "创建", color: "success" },
  UPDATE: { label: "修改", color: "primary" },
  VOID: { label: "作废", color: "danger" },
  ACTION_CREATE: { label: "领退动作", color: "warning" },
  ACTION_VOID: { label: "动作作废", color: "info" },
};

function changeActionMeta(action) {
  return CHANGE_ACTION_META[action] || { label: action || "操作", color: "info" };
}

function changeEntryKind(entry) {
  if (entry.before == null && entry.after != null) return "add";
  if (entry.after == null && entry.before != null) return "remove";
  return "modify";
}

function formatChangeEntry(entry) {
  if (entry.before == null && entry.after != null) {
    return `${entry.label}：${entry.after}`;
  }
  if (entry.after == null && entry.before != null) {
    return `${entry.label}（原：${entry.before}）`;
  }
  return `${entry.label}：${entry.before ?? "空"} → ${entry.after ?? "空"}`;
}

async function searchMaterials(keyword) {
  const seq = ++materialSearchSeq;
  materialLoading.value = true;
  try {
    const response = await listRdMaterials({
      keyword: keyword || undefined,
      limit: 20,
      offset: 0,
    });
    if (seq === materialSearchSeq) {
      materialOptions.value = response.data?.items || [];
    }
  } catch {
    // 拦截器已提示错误
  } finally {
    if (seq === materialSearchSeq) {
      materialLoading.value = false;
    }
  }
}

async function loadProjectDetail(projectId) {
  const response = await getRdProject(projectId);
  detailRow.value = response.data || null;
}

async function loadProjectActions(projectId) {
  actionLoading.value = true;
  try {
    const response = await listRdProjectMaterialActions(projectId, {
      limit: 100,
      offset: 0,
    });
    actionRows.value = response.data?.items || [];
  } finally {
    actionLoading.value = false;
  }
}

async function loadChangeLogs(projectId) {
  changeLogLoading.value = true;
  try {
    const response = await listRdProjectChangeLogs(projectId);
    changeLogRows.value = response.data?.items || [];
  } catch {
    // 拦截器已提示错误
  } finally {
    changeLogLoading.value = false;
  }
}

async function reloadAll() {
  if (!currentProjectId.value) {
    return;
  }
  detailLoading.value = true;
  try {
    await Promise.all([
      loadProjectDetail(currentProjectId.value),
      loadProjectActions(currentProjectId.value),
      loadChangeLogs(currentProjectId.value),
    ]);
  } catch {
    // 拦截器已提示错误
  } finally {
    detailLoading.value = false;
  }
}

function handleBack() {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  router.push("/rd/projects");
}

const vFocus = {
  mounted: (el) => el.querySelector("input, textarea")?.focus(),
};

const headerEditField = ref(null);
const headerEditValue = ref("");
const headerSaving = ref(false);

function headerOriginalValue(field) {
  const row = detailRow.value;
  if (field === "bizDate") {
    return row?.bizDate?.slice?.(0, 10) || "";
  }
  return row?.[field] || "";
}

function startHeaderEdit(field) {
  if (!canEnterEdit.value || headerSaving.value || headerEditField.value) {
    return;
  }
  headerEditValue.value = headerOriginalValue(field);
  headerEditField.value = field;
}

function cancelHeaderEdit() {
  if (headerSaving.value || headerConfirming) {
    return;
  }
  headerEditField.value = null;
}

function handleHeaderBlur() {
  // ponytail: 点击别处 = 放弃修改，杜绝失焦误保存；确认弹窗抢焦点时跳过
  cancelHeaderEdit();
}

function handleBizDateVisibleChange(visible) {
  if (visible || headerEditField.value !== "bizDate") {
    return;
  }
  if (headerEditValue.value === headerOriginalValue("bizDate")) {
    cancelHeaderEdit();
  }
}

const HEADER_FIELD_LABELS = {
  projectName: "项目名称",
  bizDate: "业务日期",
  remark: "备注",
};

let headerConfirming = false;

async function requestHeaderSave() {
  const field = headerEditField.value;
  if (!field || headerSaving.value || headerConfirming) {
    return;
  }
  const value =
    typeof headerEditValue.value === "string" ? headerEditValue.value.trim() : headerEditValue.value;
  const original = headerOriginalValue(field);
  if (value === original) {
    headerEditField.value = null;
    return;
  }
  if (!value && field !== "remark") {
    ElMessage.error(field === "projectName" ? "项目名称不能为空" : "业务日期不能为空");
    return;
  }

  headerConfirming = true;
  try {
    await ElMessageBox.confirm(
      `${HEADER_FIELD_LABELS[field]}：「${original || "空"}」 → 「${value || "空"}」，确认保存吗？`,
      "确认修改",
      { confirmButtonText: "确定保存", cancelButtonText: "放弃修改", type: "warning" },
    );
  } catch {
    headerConfirming = false;
    headerEditField.value = null;
    return;
  }
  headerConfirming = false;

  headerSaving.value = true;
  try {
    await updateRdProject(currentProjectId.value, {
      [field]: field === "remark" ? value || null : value,
    });
    headerEditField.value = null;
    ElMessage.success("已保存");
    await reloadAll();
  } catch {
    // 拦截器已提示错误
  } finally {
    headerSaving.value = false;
  }
}

const editingRowKey = ref(null);
const rowDraft = ref(null);
const rowSaving = ref(false);

const ledgerTableRows = computed(() => {
  const rows = detailRow.value?.materialLedger || [];
  return editingRowKey.value === "__new__" ? [...rows, { __new: true }] : rows;
});

function isRowEditing(row) {
  if (!editingRowKey.value) {
    return false;
  }
  return row.__new ? true : row.materialId === editingRowKey.value;
}

function findBomLine(materialId) {
  return (detailRow.value?.bomLines || []).find((line) => line.materialId === materialId);
}

function hasBomLine(row) {
  return !row.__new && Boolean(findBomLine(row.materialId));
}

function handleRowDblclick(row) {
  if (!canEnterEdit.value || editingRowKey.value || row.__new) {
    return;
  }
  const bomLine = findBomLine(row.materialId);
  rowDraft.value = {
    materialId: row.materialId,
    quantity: Number(row.plannedQty || 0) || null,
    unitPrice: Number((bomLine ? bomLine.unitPrice : row.plannedUnitPrice) || 0),
    manufacturer: row.manufacturer || "",
    productLink: row.productLink || "",
    remark: row.remark || "",
  };
  editingRowKey.value = row.materialId;
}

function startAddRow() {
  if (!canEnterEdit.value || editingRowKey.value) {
    return;
  }
  rowDraft.value = {
    materialId: null,
    materialName: "",
    specModel: "",
    unitCode: "",
    quantity: null,
    unitPrice: 0,
    manufacturer: "",
    productLink: "",
    remark: "",
  };
  editingRowKey.value = "__new__";
}

function handleDraftMaterialSelected(materialId) {
  const option = materialSelectOptions.value.find((item) => item.id === materialId);
  if (option) {
    seedMaterialOption(option);
  }
  rowDraft.value.materialName = option?.materialName || "";
  rowDraft.value.specModel = option?.specModel || "";
  rowDraft.value.unitCode = option?.unitCode || "";
}

function cancelRowEdit() {
  editingRowKey.value = null;
  rowDraft.value = null;
}

function toBomLinePayload(line) {
  return {
    materialId: line.materialId,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice || 0),
    manufacturer: line.manufacturer || undefined,
    productLink: line.productLink || undefined,
    remark: line.remark || undefined,
  };
}

async function saveRowEdit() {
  const draft = rowDraft.value;
  if (!draft || rowSaving.value) {
    return;
  }
  if (!draft.materialId) {
    ElMessage.error("请选择物料");
    return;
  }
  if (!draft.quantity || Number(draft.quantity) <= 0) {
    ElMessage.error("计划数量必须大于 0");
    return;
  }
  const lines = (detailRow.value?.bomLines || []).map(toBomLinePayload);
  const index = lines.findIndex((line) => line.materialId === draft.materialId);
  if (editingRowKey.value === "__new__" && index >= 0) {
    ElMessage.error("该物料已在 BOM 中，请双击对应行修改");
    return;
  }
  const payload = toBomLinePayload(draft);
  if (index >= 0) {
    lines[index] = payload;
  } else {
    lines.push(payload);
  }
  if (!(await confirmDocumentSave({ documentName: "研发项目 BOM", isUpdate: true }))) {
    return;
  }
  await submitBomLines(lines);
}

async function removeLedgerRow(row) {
  if (rowSaving.value || editingRowKey.value) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定删除 BOM 物料「${row.materialCodeSnapshot} ${row.materialNameSnapshot}」吗？`,
      "删除 BOM 行",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
  } catch {
    return;
  }
  const lines = (detailRow.value?.bomLines || [])
    .filter((line) => line.materialId !== row.materialId)
    .map(toBomLinePayload);
  await submitBomLines(lines);
}

async function submitBomLines(lines) {
  rowSaving.value = true;
  try {
    await updateRdProject(currentProjectId.value, { bomLines: lines });
    cancelRowEdit();
    ElMessage.success("BOM 已保存");
    await reloadAll();
  } catch {
    // 拦截器已提示错误
  } finally {
    rowSaving.value = false;
  }
}

async function cancelEdit() {
  if (isProjectFormDirty() && !(await confirmCloseDirtyForm())) {
    return;
  }
  handleBack();
}

function addBomLine() {
  projectForm.value.bomLines.push(createEmptyBomLine());
}

function removeBomLine(index) {
  projectForm.value.bomLines.splice(index, 1);
  if (projectForm.value.bomLines.length === 0) {
    projectForm.value.bomLines.push(createEmptyBomLine());
  }
}

function addActionLine() {
  actionForm.value.lines.push(createEmptyActionLine());
}

function removeActionLine(index) {
  actionForm.value.lines.splice(index, 1);
  if (actionForm.value.lines.length === 0) {
    actionForm.value.lines.push(createEmptyActionLine());
  }
}

function validateProjectForm() {
  const bomLines = projectForm.value.bomLines || [];
  const seenMaterialLineNo = new Map();
  for (let index = 0; index < bomLines.length; index += 1) {
    const line = bomLines[index];
    if (!line.materialId) {
      continue;
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      ElMessage.error(`第 ${index + 1} 行 BOM 数量必须大于 0`);
      return false;
    }
    if (seenMaterialLineNo.has(line.materialId)) {
      ElMessage.error(
        `第 ${index + 1} 行与第 ${seenMaterialLineNo.get(line.materialId)} 行 BOM 物料重复，请合并为一行`,
      );
      return false;
    }
    seenMaterialLineNo.set(line.materialId, index + 1);
  }

  return true;
}

async function submitProject() {
  const headerValid = await projectFormRef.value?.validate().catch(() => false);
  if (!headerValid || !validateProjectForm()) {
    return;
  }
  if (!(await confirmDocumentSave({ documentName: "研发项目" }))) {
    return;
  }

  projectSubmitting.value = true;
  try {
    const payload = {
      projectName: projectForm.value.projectName,
      bizDate: projectForm.value.bizDate,
      remark: projectForm.value.remark || undefined,
      bomLines: (projectForm.value.bomLines || [])
        .filter((line) => line.materialId)
        .map(toBomLinePayload),
    };

    const response = await createRdProject(payload);
    ElMessage.success("研发项目已创建");
    const newId = response.data?.id;
    if (newId) {
      router.replace(`/rd/projects/detail/${newId}`);
    } else {
      handleBack();
    }
  } catch {
    // 拦截器已提示错误
  } finally {
    projectSubmitting.value = false;
  }
}

function openActionDialog() {
  actionForm.value = createEmptyActionForm();
  actionFormSnapshot = JSON.stringify(actionForm.value);
  actionDialogOpen.value = true;
}

async function confirmCloseDirtyForm() {
  try {
    await ElMessageBox.confirm("表单内容尚未保存，确定关闭吗？", "系统提示", {
      confirmButtonText: "确定关闭",
      cancelButtonText: "继续编辑",
      type: "warning",
    });
    return true;
  } catch {
    return false;
  }
}

function isProjectFormDirty() {
  return JSON.stringify(projectForm.value) !== projectFormSnapshot;
}

function isActionFormDirty() {
  return JSON.stringify(actionForm.value) !== actionFormSnapshot;
}

async function closeActionDialog() {
  if (isActionFormDirty() && !(await confirmCloseDirtyForm())) {
    return;
  }
  actionDialogOpen.value = false;
}

function handleActionDialogBeforeClose(done) {
  if (!isActionFormDirty()) {
    done();
    return;
  }
  confirmCloseDirtyForm().then((confirmed) => {
    if (confirmed) {
      done();
    }
  });
}

function handleReturnSourceChange(row) {
  const option = returnSourceOptions.value.find((item) => item.key === row.sourceKey);
  if (!option) {
    row.sourceDocumentId = null;
    row.sourceDocumentLineId = null;
    row.materialId = null;
    row.unitPrice = 0;
    return;
  }
  seedMaterialOption({
    id: option.materialId,
    materialCode: option.materialCode || "",
    materialName: option.materialName || "",
  });
  row.sourceDocumentId = option.actionId;
  row.sourceDocumentLineId = option.lineId;
  row.materialId = option.materialId;
  row.unitPrice = option.unitPrice;
  if (Number(row.quantity || 0) <= 0 || Number(row.quantity || 0) > option.availableReturnQty) {
    row.quantity = option.availableReturnQty;
  }
}

function isReturnSourceTaken(sourceKey, currentLine) {
  return actionForm.value.lines.some(
    (line) => line !== currentLine && line.sourceKey === sourceKey,
  );
}

function returnLineMax(line) {
  if (actionForm.value.actionType !== "RETURN" || !line.sourceKey) {
    return undefined;
  }
  const option = returnSourceOptions.value.find(
    (item) => item.key === line.sourceKey,
  );
  return option ? option.availableReturnQty : undefined;
}

function validateActionForm() {
  const lines = actionForm.value.lines || [];
  const isReturn = actionForm.value.actionType === "RETURN";
  const seenMaterialLineNo = new Map();
  const seenSourceLineNo = new Map();
  let filledCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.materialId) {
      continue;
    }
    filledCount += 1;
    if (isReturn) {
      if (!line.sourceDocumentId || !line.sourceDocumentLineId) {
        ElMessage.error(`第 ${index + 1} 行退料必须关联来源领料行`);
        return false;
      }
      if (seenSourceLineNo.has(line.sourceKey)) {
        ElMessage.error(
          `第 ${index + 1} 行与第 ${seenSourceLineNo.get(line.sourceKey)} 行选择了同一来源领料行，请合并为一行`,
        );
        return false;
      }
      seenSourceLineNo.set(line.sourceKey, index + 1);
    } else {
      if (seenMaterialLineNo.has(line.materialId)) {
        ElMessage.error(
          `第 ${index + 1} 行与第 ${seenMaterialLineNo.get(line.materialId)} 行物料重复，请合并为一行`,
        );
        return false;
      }
      seenMaterialLineNo.set(line.materialId, index + 1);
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      ElMessage.error(`第 ${index + 1} 行数量必须大于 0`);
      return false;
    }
    if (isReturn) {
      const maxQty = returnLineMax(line);
      if (maxQty != null && Number(line.quantity) > maxQty) {
        ElMessage.error(
          `第 ${index + 1} 行退料数量不能超过可退数量 ${formatQty(maxQty)}`,
        );
        return false;
      }
    }
  }

  if (filledCount === 0) {
    ElMessage.error("至少需要一条物料动作明细");
    return false;
  }

  return true;
}

async function submitAction() {
  if (!currentProjectId.value) {
    return;
  }
  const headerValid = await actionFormRef.value?.validate().catch(() => false);
  if (!headerValid || !validateActionForm()) {
    return;
  }

  if (!(await confirmDocumentSave({ documentName: "研发项目物料动作单" }))) {
    return;
  }
  actionSubmitting.value = true;
  try {
    const response = await createRdProjectMaterialAction(currentProjectId.value, {
      actionType: actionForm.value.actionType,
      bizDate: actionForm.value.bizDate,
      remark: actionForm.value.remark || undefined,
      clientRequestId: actionForm.value.clientRequestId,
      lines: actionForm.value.lines
        .filter((line) => line.materialId)
        .map((line) => ({
          materialId: line.materialId,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice || 0),
          sourceDocumentType:
            actionForm.value.actionType === "RETURN" ? "RdProjectMaterialAction" : undefined,
          sourceDocumentId:
            actionForm.value.actionType === "RETURN" ? line.sourceDocumentId : undefined,
          sourceDocumentLineId:
            actionForm.value.actionType === "RETURN" ? line.sourceDocumentLineId : undefined,
          remark: line.remark || undefined,
        })),
    });
    ElMessage.success("研发项目物料动作已创建");
    for (const warning of response.data?.warnings || []) {
      ElMessage.warning(warning);
    }
    actionDialogOpen.value = false;
    await reloadAll();
  } catch {
    // 拦截器已提示错误
  } finally {
    actionSubmitting.value = false;
  }
}

async function handleVoidAction(actionId) {
  if (actionVoiding.value) {
    return;
  }
  let voidReason = "";
  try {
    const result = await ElMessageBox.prompt("请输入作废原因", "作废研发项目物料动作", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputValidator: (value) =>
        value && value.trim() ? true : "作废原因不能为空",
    });
    voidReason = result.value.trim();
  } catch {
    return;
  }

  actionVoiding.value = true;
  try {
    await voidRdProjectMaterialAction(actionId, { voidReason });
    ElMessage.success("研发项目物料动作已作废");
    await reloadAll();
  } catch {
    // 拦截器已提示错误
  } finally {
    actionVoiding.value = false;
  }
}

function actionLabel(value) {
  if (value === "PICK") {
    return "领料";
  }
  if (value === "RETURN") {
    return "退料";
  }
  if (value === "SCRAP") {
    return "报废";
  }
  return value || "-";
}

function actionTagType(value) {
  if (value === "PICK") {
    return "primary";
  }
  if (value === "RETURN") {
    return "success";
  }
  if (value === "SCRAP") {
    return "danger";
  }
  return "info";
}

onMounted(async () => {
  if (isCreate.value) {
    projectForm.value = createEmptyProjectForm();
    projectFormSnapshot = JSON.stringify(projectForm.value);
    editing.value = true;
    return;
  }
  await reloadAll();
});
</script>

<style scoped lang="scss">
.rd-project-detail-page {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.panel-card {
  border-radius: 18px;
  min-width: 0;
  max-width: 100%;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header-copy {
  min-width: 0;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
}

.page-subtitle {
  margin-top: 4px;
  color: #7a877f;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.page-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-body {
  min-height: 240px;
  min-width: 0;
}

.detail-shell {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.edit-hint {
  color: #7a877f;
  font-size: 13px;
}

.edit-hint-icon {
  vertical-align: -2px;
  color: #4f7d5c;
}

// 固定列宽 + 固定行高：编辑器进出不引起任何布局位移
.detail-descriptions :deep(.el-descriptions__table) {
  table-layout: fixed;
}

.detail-descriptions :deep(.el-descriptions__label) {
  width: 96px;
}

.detail-descriptions :deep(.el-descriptions__cell) {
  height: 41px;
}

.editable-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-width: 48px;
  min-height: 24px;
  border-bottom: 1px dashed #b8c7bd;
  cursor: text;
}

.editable-value:hover {
  border-bottom-color: #4f7d5c;

  .edit-icon {
    color: #4f7d5c;
  }
}

.edit-icon {
  flex: none;
  font-size: 13px;
  color: #a3b3a8;
}

.editable-table :deep(.el-table__body tr) {
  cursor: cell;
}

.add-line-button {
  width: 100%;
  margin-top: 8px;
  border-style: dashed;
}

.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin: 8px 0 12px;
}

.section-toolbar.compact {
  margin-top: 0;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
}

.section-subtitle {
  margin-top: 4px;
  color: #7a877f;
  font-size: 13px;
}

.muted-cell {
  color: #7a877f;
}

.list-hint {
  margin-top: 8px;
  color: #7a877f;
  font-size: 13px;
  text-align: center;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.summary-card {
  padding: 14px 16px;
  border: 1px solid #e5ece8;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f7fbf8 100%);
  min-width: 0;
}

.summary-card.accent {
  border-color: #a8d5b3;
  background: linear-gradient(180deg, #f4fcf6 0%, #edf7ef 100%);
}

.summary-card.warning {
  border-color: #f1cf90;
  background: linear-gradient(180deg, #fff9ef 0%, #fff3df 100%);
}

.summary-label {
  color: #708175;
  font-size: 13px;
}

.summary-value {
  margin-top: 6px;
  color: #1f2a1f;
  font-size: clamp(18px, 1.6vw, 24px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.detail-descriptions,
.detail-tabs {
  margin-top: 0;
  min-width: 0;
}

.warn-text {
  color: #cf7a12;
  font-weight: 700;
}

.change-log-pane {
  min-height: 120px;
}

.change-log-timeline {
  padding-left: 4px;
}

.change-log-card {
  padding: 10px 14px;
  border: 1px solid #e5ece8;
  border-radius: 10px;
  background: #fbfdfb;
}

.change-log-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.change-log-summary {
  font-weight: 600;
  color: #1f2a1f;
  overflow-wrap: anywhere;
}

.change-log-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #51625a;
  font-size: 13px;
  line-height: 1.8;

  li {
    overflow-wrap: anywhere;
  }

  .change-entry-add {
    color: #2f9e44;
  }

  .change-entry-remove {
    color: #d13438;
    text-decoration: line-through;
  }

  .change-entry-modify {
    color: #1c6fd9;
  }
}

.save-bar {
  position: sticky;
  bottom: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 16px;
  border: 1px solid #e5ece8;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(31, 42, 31, 0.14);
}

.save-bar-tip {
  color: #7a877f;
  font-size: 13px;
}

.save-bar-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 960px) {
  .page-header,
  .section-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
