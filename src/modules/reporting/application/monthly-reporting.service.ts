import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { AppConfigService } from "../../../shared/config/app-config.service";
import type { StockScopeCode } from "../../session/domain/user-session";
import {
  type MonthlySalesProjectEntry,
  ReportingRepository,
} from "../infrastructure/reporting.repository";
import {
  formatDecimal,
  formatMoney,
  formatYearMonth,
  getMonthlyReportingDomainMeta,
  getMonthlyReportingTopicMeta,
  MONTHLY_REPORTING_ABNORMAL_LABELS,
  MONTHLY_REPORTING_DOMAIN_META,
  MONTHLY_REPORTING_MATERIAL_CATEGORY_TOPIC_OPTIONS,
  type MonthlyMaterialCategoryEntry,
  type MonthlyReportEntry,
  MonthlyReportingDirection,
  type MonthlyReportingDomainKey,
  type MonthlyReportingTopicKey,
  MonthlyReportingViewMode,
  sumDecimals,
} from "./monthly-reporting.shared";

export interface MonthlyReportDomainCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  sortOrder: number;
}

export interface MonthlyReportDocumentTypeCatalogItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  documentTypeLabel: string;
  sortOrder: number;
}

export interface MonthlyReportSummaryTotals {
  domainCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  totalInQuantity: string;
  totalInAmount: string;
  totalOutQuantity: string;
  totalOutAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportDomainSummaryItem
  extends Omit<MonthlyReportSummaryTotals, "domainCount"> {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
}

export interface MonthlyReportDocumentTypeSummaryItem
  extends Omit<MonthlyReportSummaryTotals, "domainCount"> {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  documentTypeLabel: string;
}

export interface MonthlyReportWorkshopSummaryItem {
  workshopId: number | null;
  workshopName: string;
  documentCount: number;
  abnormalDocumentCount: number;
  pickQuantity: string;
  pickAmount: string;
  returnQuantity: string;
  returnAmount: string;
  scrapQuantity: string;
  scrapAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportSalesProjectSummaryItem {
  salesProjectId: number | null;
  salesProjectCode: string | null;
  salesProjectName: string;
  documentCount: number;
  abnormalDocumentCount: number;
  salesOutboundQuantity: string;
  salesOutboundAmount: string;
  salesReturnQuantity: string;
  salesReturnAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportRdProjectSummaryItem {
  rdProjectId: number | null;
  rdProjectCode: string | null;
  rdProjectName: string;
  documentCount: number;
  abnormalDocumentCount: number;
  handoffInQuantity: string;
  handoffInAmount: string;
  pickQuantity: string;
  pickAmount: string;
  returnQuantity: string;
  returnAmount: string;
  scrapQuantity: string;
  scrapAmount: string;
  netQuantity: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportDocumentItem {
  domainKey: MonthlyReportingDomainKey;
  domainLabel: string;
  direction: MonthlyReportingDirection;
  documentType: string;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  bizDate: string;
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
  workshopId: number | null;
  workshopName: string | null;
  salesProjectLabel: string | null;
  rdProjectCode: string | null;
  rdProjectName: string | null;
  sourceStockScopeName: string | null;
  targetStockScopeName: string | null;
  sourceWorkshopName: string | null;
  targetWorkshopName: string | null;
  quantity: string;
  amount: string;
  cost: string;
  abnormalFlags: string[];
  abnormalLabels: string[];
  sourceBizMonth: string | null;
  sourceDocumentNo: string | null;
  createdAt: string;
}

export interface MonthlyReportExportResult {
  fileName: string;
  content: string;
  contentType: string;
}

export interface MonthlyReportMaterialCategorySummaryTotals {
  categoryCount: number;
  lineCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  acceptanceInboundAmount: string;
  productionReceiptAmount: string;
  salesOutboundAmount: string;
  salesReturnAmount: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportMaterialCategorySummaryItem {
  nodeKey: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  lineCount: number;
  documentCount: number;
  abnormalDocumentCount: number;
  acceptanceInboundAmount: string;
  productionReceiptAmount: string;
  salesOutboundAmount: string;
  salesReturnAmount: string;
  netAmount: string;
  totalCost: string;
}

export interface MonthlyReportMaterialCategoryDetailItem {
  direction: MonthlyReportingDirection;
  documentType: string;
  documentTypeLabel: string;
  documentId: number;
  documentNo: string;
  documentLineId: number;
  lineNo: number;
  bizDate: string;
  stockScope: StockScopeCode | null;
  stockScopeName: string | null;
  workshopId: number | null;
  workshopName: string | null;
  materialId: number;
  materialCode: string;
  materialName: string;
  materialSpec: string | null;
  unitCode: string;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string;
  salesProjectCode: string | null;
  salesProjectName: string | null;
  quantity: string;
  amount: string;
  cost: string;
  abnormalFlags: string[];
  abnormalLabels: string[];
  sourceBizMonth: string | null;
  sourceDocumentNo: string | null;
  createdAt: string;
}

interface MonthlyReportQuery {
  yearMonth: string;
  viewMode?: MonthlyReportingViewMode;
  stockScope?: StockScopeCode;
  workshopId?: number;
  domainKey?: MonthlyReportingDomainKey;
  documentTypeLabel?: string;
  topicKey?: MonthlyReportingTopicKey;
  abnormalOnly?: boolean;
  keyword?: string;
  categoryId?: number;
  categoryNodeKey?: string;
  limit?: number;
  offset?: number;
}

interface MonthlyReportDomainFilters {
  viewMode: MonthlyReportingViewMode.DOMAIN;
  stockScope: StockScopeCode | null;
  workshopId: number | null;
  domainKey: MonthlyReportingDomainKey | null;
  documentTypeLabel: string | null;
  abnormalOnly: boolean;
  keyword: string | null;
}

interface MonthlyReportMaterialCategoryFilters {
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  stockScope: StockScopeCode | null;
  workshopId: number | null;
  documentTypeLabel: string | null;
  categoryId: number | null;
  categoryNodeKey: string | null;
  abnormalOnly: boolean;
  keyword: string | null;
}

export interface MonthlyReportDomainSummaryResult {
  yearMonth: string;
  filters: MonthlyReportDomainFilters;
  viewMode: MonthlyReportingViewMode.DOMAIN;
  domainCatalog: MonthlyReportDomainCatalogItem[];
  documentTypeCatalog: MonthlyReportDocumentTypeCatalogItem[];
  domains: MonthlyReportDomainSummaryItem[];
  documentTypes: MonthlyReportDocumentTypeSummaryItem[];
  workshopItems: MonthlyReportWorkshopSummaryItem[];
  salesProjectItems: MonthlyReportSalesProjectSummaryItem[];
  rdProjectItems: MonthlyReportRdProjectSummaryItem[];
  summary: MonthlyReportSummaryTotals;
}

export interface MonthlyReportMaterialCategorySummaryResult {
  yearMonth: string;
  filters: MonthlyReportMaterialCategoryFilters;
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  documentTypeCatalog: MonthlyReportDocumentTypeCatalogItem[];
  categories: MonthlyReportMaterialCategorySummaryItem[];
  summary: MonthlyReportMaterialCategorySummaryTotals;
}

export interface MonthlyReportDomainDocumentsResult {
  yearMonth: string;
  viewMode: MonthlyReportingViewMode.DOMAIN;
  total: number;
  items: MonthlyReportDocumentItem[];
  summary: Omit<MonthlyReportSummaryTotals, "domainCount">;
}

export interface MonthlyReportMaterialCategoryDocumentsResult {
  yearMonth: string;
  viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
  total: number;
  items: MonthlyReportMaterialCategoryDetailItem[];
  summary: Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount">;
}

interface MonthlyReportSourceData {
  rows: MonthlyReportEntry[];
  salesProjectEntries: MonthlySalesProjectEntry[];
}

const RESERVED_STOCK_SCOPE_WORKSHOP_NAMES = new Set(["主仓", "研发小仓"]);
const MATERIAL_CATEGORY_DEFAULT_LABEL = "未分类";

@Injectable()
export class MonthlyReportingService {
  constructor(
    private readonly repository: ReportingRepository,
    private readonly appConfigService: AppConfigService,
  ) {}

  async getMonthlyReportSummary(
    query: MonthlyReportQuery & {
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
    },
  ): Promise<MonthlyReportMaterialCategorySummaryResult>;
  async getMonthlyReportSummary(
    query: MonthlyReportQuery & {
      viewMode?: MonthlyReportingViewMode.DOMAIN;
    },
  ): Promise<MonthlyReportDomainSummaryResult>;
  async getMonthlyReportSummary(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainSummaryResult
    | MonthlyReportMaterialCategorySummaryResult
  >;
  async getMonthlyReportSummary(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainSummaryResult
    | MonthlyReportMaterialCategorySummaryResult
  > {
    if (query.viewMode === MonthlyReportingViewMode.MATERIAL_CATEGORY) {
      return this.getMaterialCategoryMonthlyReportSummary(query);
    }

    const { rows, salesProjectEntries } = await this.loadSourceData(query);
    const rowsBeforeDocumentTypeFilter = this.filterRows(rows, query, {
      ignoreDocumentTypeLabel: true,
    });
    const filteredRows = this.filterRows(rowsBeforeDocumentTypeFilter, query);
    const filteredSalesProjectEntries = this.filterSalesProjectEntries(
      salesProjectEntries,
      query,
    );
    const domainItems = this.buildDomainItems(filteredRows);

    return {
      yearMonth: query.yearMonth,
      filters: {
        viewMode: MonthlyReportingViewMode.DOMAIN,
        stockScope: query.stockScope ?? null,
        workshopId: query.workshopId ?? null,
        domainKey: query.domainKey ?? null,
        documentTypeLabel: query.documentTypeLabel?.trim() || null,
        abnormalOnly: query.abnormalOnly ?? false,
        keyword: query.keyword?.trim() || null,
      },
      viewMode: MonthlyReportingViewMode.DOMAIN,
      domainCatalog: this.buildDomainCatalog(),
      documentTypeCatalog: this.buildDocumentTypeCatalog(
        rowsBeforeDocumentTypeFilter,
      ),
      domains: domainItems,
      documentTypes: this.buildDocumentTypeItems(filteredRows),
      workshopItems: this.buildWorkshopItems(filteredRows),
      salesProjectItems: this.buildSalesProjectItems(
        filteredSalesProjectEntries,
      ),
      rdProjectItems: this.buildRdProjectItems(filteredRows),
      summary: {
        domainCount: domainItems.length,
        ...this.buildTotals(filteredRows),
      },
    };
  }

  async getMonthlyReportDocuments(
    query: MonthlyReportQuery & {
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY;
    },
  ): Promise<MonthlyReportMaterialCategoryDocumentsResult>;
  async getMonthlyReportDocuments(
    query: MonthlyReportQuery & {
      viewMode?: MonthlyReportingViewMode.DOMAIN;
    },
  ): Promise<MonthlyReportDomainDocumentsResult>;
  async getMonthlyReportDocuments(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainDocumentsResult
    | MonthlyReportMaterialCategoryDocumentsResult
  >;
  async getMonthlyReportDocuments(
    query: MonthlyReportQuery,
  ): Promise<
    | MonthlyReportDomainDocumentsResult
    | MonthlyReportMaterialCategoryDocumentsResult
  > {
    if (query.viewMode === MonthlyReportingViewMode.MATERIAL_CATEGORY) {
      return this.getMaterialCategoryMonthlyReportDocuments(query);
    }

    const { rows } = await this.loadSourceData(query);
    const filteredRows = this.filterRows(rows, query);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 200);

    return {
      yearMonth: query.yearMonth,
      viewMode: MonthlyReportingViewMode.DOMAIN,
      total: filteredRows.length,
      items: filteredRows
        .slice(offset, offset + limit)
        .map((row) => this.toDocumentItem(row)),
      summary: this.buildTotals(filteredRows),
    };
  }

  async exportMonthlyReport(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportExportResult> {
    if (query.viewMode === MonthlyReportingViewMode.MATERIAL_CATEGORY) {
      return this.exportMaterialCategoryMonthlyReport(query);
    }

    const { rows, salesProjectEntries } = await this.loadSourceData(query);
    const filteredRows = this.filterRows(rows, query);
    const filteredSalesProjectEntries = this.filterSalesProjectEntries(
      salesProjectEntries,
      query,
    );
    const totals = this.buildTotals(filteredRows);
    const domainItems = this.buildDomainItems(filteredRows);
    const documentTypeItems = this.buildDocumentTypeItems(filteredRows);
    const workshopItems = this.buildWorkshopItems(filteredRows);
    const salesProjectItems = this.buildSalesProjectItems(
      filteredSalesProjectEntries,
    );
    const rdProjectItems = this.buildRdProjectItems(filteredRows);

    return {
      fileName: `monthly-reporting-${query.yearMonth}.xls`,
      content: this.buildExcelXmlWorkbook([
        {
          name: "总览",
          columns: ["指标", "值"],
          rows: [
            ["总入数量", totals.totalInQuantity],
            ["总入金额", totals.totalInAmount],
            ["总出数量", totals.totalOutQuantity],
            ["总出金额", totals.totalOutAmount],
            ["净发生数量", totals.netQuantity],
            ["净发生金额", totals.netAmount],
            ["单据数", totals.documentCount],
            ["异常单据数", totals.abnormalDocumentCount],
            ["总成本", totals.totalCost],
          ],
        },
        {
          name: "领域汇总",
          columns: [
            "领域",
            "单据数",
            "异常单据数",
            "总入金额",
            "总出金额",
            "净发生金额",
            "总成本",
          ],
          rows: domainItems.map((item) => [
            item.domainLabel,
            item.documentCount,
            item.abnormalDocumentCount,
            item.totalInAmount,
            item.totalOutAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "单据类型汇总",
          columns: [
            "领域",
            "单据类型",
            "单据数",
            "异常单据数",
            "总入金额",
            "总出金额",
            "净发生金额",
            "总成本",
          ],
          rows: documentTypeItems.map((item) => [
            item.domainLabel,
            item.documentTypeLabel,
            item.documentCount,
            item.abnormalDocumentCount,
            item.totalInAmount,
            item.totalOutAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "车间汇总",
          columns: [
            "车间",
            "单据数",
            "异常单据数",
            "领料金额",
            "退料金额",
            "报废金额",
            "净发生金额",
            "总成本",
          ],
          rows: workshopItems.map((item) => [
            item.workshopName,
            item.documentCount,
            item.abnormalDocumentCount,
            item.pickAmount,
            item.returnAmount,
            item.scrapAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "销售项目汇总",
          columns: [
            "销售项目编码",
            "销售项目名称",
            "单据数",
            "异常单据数",
            "销售出库金额",
            "销售退货金额",
            "净发生金额",
            "总成本",
          ],
          rows: salesProjectItems.map((item) => [
            item.salesProjectCode ?? "",
            item.salesProjectName,
            item.documentCount,
            item.abnormalDocumentCount,
            item.salesOutboundAmount,
            item.salesReturnAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "研发项目汇总",
          columns: [
            "研发项目编码",
            "研发项目名称",
            "单据数",
            "异常单据数",
            "项目交接入金额",
            "项目领用金额",
            "项目退回金额",
            "项目报废金额",
            "净发生金额",
            "总成本",
          ],
          rows: rdProjectItems.map((item) => [
            item.rdProjectCode ?? "",
            item.rdProjectName,
            item.documentCount,
            item.abnormalDocumentCount,
            item.handoffInAmount,
            item.pickAmount,
            item.returnAmount,
            item.scrapAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "单据头明细",
          columns: [
            "领域",
            "单据类型",
            "单据编号",
            "业务日期",
            "仓别",
            "车间",
            "销售项目",
            "研发项目编码",
            "研发项目名称",
            "来源仓别",
            "目标仓别",
            "来源车间",
            "目标车间",
            "数量",
            "金额",
            "成本",
            "异常标识",
            "来源月份",
            "来源单据",
          ],
          rows: filteredRows.map((row) => {
            const item = this.toDocumentItem(row);
            return [
              item.domainLabel,
              item.documentTypeLabel,
              item.documentNo,
              item.bizDate,
              item.stockScopeName ?? "",
              item.workshopName ?? "",
              item.salesProjectLabel ?? "",
              item.rdProjectCode ?? "",
              item.rdProjectName ?? "",
              item.sourceStockScopeName ?? "",
              item.targetStockScopeName ?? "",
              item.sourceWorkshopName ?? "",
              item.targetWorkshopName ?? "",
              item.quantity,
              item.amount,
              item.cost,
              item.abnormalLabels.join("、"),
              item.sourceBizMonth ?? "",
              item.sourceDocumentNo ?? "",
            ];
          }),
        },
      ]),
      contentType: "application/vnd.ms-excel; charset=utf-8",
    };
  }

  private async getMaterialCategoryMonthlyReportSummary(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportMaterialCategorySummaryResult> {
    const entries = await this.loadMaterialCategorySourceData(query);
    const entriesBeforeDocumentTypeFilter = this.filterMaterialCategoryEntries(
      entries,
      query,
      {
        ignoreDocumentTypeLabel: true,
      },
    );
    const filteredEntries = this.filterMaterialCategoryEntries(
      entriesBeforeDocumentTypeFilter,
      query,
    );
    const categoryItems = this.buildMaterialCategoryItems(filteredEntries);

    return {
      yearMonth: query.yearMonth,
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      filters: {
        viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
        stockScope: query.stockScope ?? null,
        workshopId: query.workshopId ?? null,
        documentTypeLabel: query.documentTypeLabel?.trim() || null,
        categoryId: query.categoryId ?? null,
        categoryNodeKey: query.categoryNodeKey?.trim() || null,
        abnormalOnly: query.abnormalOnly ?? false,
        keyword: query.keyword?.trim() || null,
      },
      documentTypeCatalog: this.buildMaterialCategoryDocumentTypeCatalog(
        entriesBeforeDocumentTypeFilter,
      ),
      categories: categoryItems,
      summary: {
        categoryCount: categoryItems.length,
        ...this.buildMaterialCategoryTotals(filteredEntries),
      },
    };
  }

  private async getMaterialCategoryMonthlyReportDocuments(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportMaterialCategoryDocumentsResult> {
    const entries = await this.loadMaterialCategorySourceData(query);
    const filteredEntries = this.filterMaterialCategoryEntries(entries, query);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? 50, 200);

    return {
      yearMonth: query.yearMonth,
      viewMode: MonthlyReportingViewMode.MATERIAL_CATEGORY,
      total: filteredEntries.length,
      items: filteredEntries
        .slice(offset, offset + limit)
        .map((entry) => this.toMaterialCategoryDetailItem(entry)),
      summary: this.buildMaterialCategoryTotals(filteredEntries),
    };
  }

  private async exportMaterialCategoryMonthlyReport(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportExportResult> {
    const entries = await this.loadMaterialCategorySourceData(query);
    const filteredEntries = this.filterMaterialCategoryEntries(entries, query);
    const categoryItems = this.buildMaterialCategoryItems(filteredEntries);
    const totals = this.buildMaterialCategoryTotals(filteredEntries);

    return {
      fileName: `monthly-reporting-material-category-${query.yearMonth}.xls`,
      content: this.buildExcelXmlWorkbook([
        {
          name: "总览",
          columns: ["指标", "值"],
          rows: [
            ["验收入库金额", totals.acceptanceInboundAmount],
            ["生产入库金额", totals.productionReceiptAmount],
            ["销售出库金额", totals.salesOutboundAmount],
            ["销售退货金额", totals.salesReturnAmount],
            ["净发生金额", totals.netAmount],
            ["单据行数", totals.lineCount],
            ["单据数", totals.documentCount],
            ["异常单据数", totals.abnormalDocumentCount],
            ["总成本", totals.totalCost],
          ],
        },
        {
          name: "分类汇总",
          columns: [
            "分类编码",
            "分类名称",
            "单据行数",
            "单据数",
            "异常单据数",
            "验收入库金额",
            "生产入库金额",
            "销售出库金额",
            "销售退货金额",
            "净发生金额",
            "总成本",
          ],
          rows: categoryItems.map((item) => [
            item.categoryCode ?? "",
            item.categoryName,
            item.lineCount,
            item.documentCount,
            item.abnormalDocumentCount,
            item.acceptanceInboundAmount,
            item.productionReceiptAmount,
            item.salesOutboundAmount,
            item.salesReturnAmount,
            item.netAmount,
            item.totalCost,
          ]),
        },
        {
          name: "单据行明细",
          columns: [
            "分类编码",
            "分类名称",
            "单据类型",
            "单据编号",
            "行号",
            "业务日期",
            "仓别",
            "车间",
            "物料编码",
            "物料名称",
            "规格型号",
            "单位",
            "销售项目编码",
            "销售项目名称",
            "数量",
            "金额",
            "成本",
            "异常标识",
            "来源月份",
            "来源单据",
          ],
          rows: filteredEntries.map((entry) => {
            const item = this.toMaterialCategoryDetailItem(entry);
            return [
              item.categoryCode ?? "",
              item.categoryName,
              item.documentTypeLabel,
              item.documentNo,
              item.lineNo,
              item.bizDate,
              item.stockScopeName ?? "",
              item.workshopName ?? "",
              item.materialCode,
              item.materialName,
              item.materialSpec ?? "",
              item.unitCode,
              item.salesProjectCode ?? "",
              item.salesProjectName ?? "",
              item.quantity,
              item.amount,
              item.cost,
              item.abnormalLabels.join("、"),
              item.sourceBizMonth ?? "",
              item.sourceDocumentNo ?? "",
            ];
          }),
        },
      ]),
      contentType: "application/vnd.ms-excel; charset=utf-8",
    };
  }

  private async loadMaterialCategorySourceData(query: MonthlyReportQuery) {
    const { start, end } = this.resolveMonthRange(query.yearMonth);
    return this.repository.findMonthlyMaterialCategoryEntries({
      start,
      end,
      stockScope: query.stockScope,
      workshopId: query.workshopId,
    });
  }

  private async loadSourceData(
    query: MonthlyReportQuery,
  ): Promise<MonthlyReportSourceData> {
    const { start, end } = this.resolveMonthRange(query.yearMonth);
    const [rows, salesProjectEntries] = await Promise.all([
      this.repository.findMonthlyReportEntries({
        start,
        end,
        stockScope: query.stockScope,
        workshopId: query.workshopId,
      }),
      this.repository.findMonthlySalesProjectEntries({
        start,
        end,
        stockScope: query.stockScope,
        workshopId: query.workshopId,
      }),
    ]);

    return {
      rows,
      salesProjectEntries,
    };
  }

  private filterRows(
    rows: MonthlyReportEntry[],
    query: MonthlyReportQuery,
    options: {
      ignoreDocumentTypeLabel?: boolean;
    } = {},
  ) {
    const documentTypeLabel = query.documentTypeLabel?.trim() || null;

    return [...rows]
      .filter((row) =>
        query.domainKey
          ? getMonthlyReportingTopicMeta(row.topicKey).domainKey ===
            query.domainKey
          : true,
      )
      .filter((row) =>
        query.topicKey ? row.topicKey === query.topicKey : true,
      )
      .filter((row) =>
        options.ignoreDocumentTypeLabel || !documentTypeLabel
          ? true
          : row.documentTypeLabel === documentTypeLabel,
      )
      .filter((row) =>
        query.abnormalOnly ? row.abnormalFlags.length > 0 : true,
      )
      .filter((row) => this.matchesKeyword(row, query.keyword))
      .sort((left, right) => {
        const leftDomainKey = getMonthlyReportingTopicMeta(
          left.topicKey,
        ).domainKey;
        const rightDomainKey = getMonthlyReportingTopicMeta(
          right.topicKey,
        ).domainKey;
        const leftDomainOrder =
          getMonthlyReportingDomainMeta(leftDomainKey).order;
        const rightDomainOrder =
          getMonthlyReportingDomainMeta(rightDomainKey).order;

        if (leftDomainOrder !== rightDomainOrder) {
          return leftDomainOrder - rightDomainOrder;
        }

        const leftTopicOrder = getMonthlyReportingTopicMeta(
          left.topicKey,
        ).order;
        const rightTopicOrder = getMonthlyReportingTopicMeta(
          right.topicKey,
        ).order;
        if (leftTopicOrder !== rightTopicOrder) {
          return leftTopicOrder - rightTopicOrder;
        }

        const leftBizName = this.resolveRowBusinessName(left);
        const rightBizName = this.resolveRowBusinessName(right);
        if (leftBizName !== rightBizName) {
          return leftBizName.localeCompare(rightBizName, "zh-Hans-CN");
        }

        if (left.bizDate.getTime() !== right.bizDate.getTime()) {
          return left.bizDate.getTime() - right.bizDate.getTime();
        }

        return left.documentNo.localeCompare(right.documentNo);
      });
  }

  private filterSalesProjectEntries(
    entries: MonthlySalesProjectEntry[],
    query: MonthlyReportQuery,
  ) {
    const documentTypeLabel = query.documentTypeLabel?.trim() || null;

    if (query.domainKey && query.domainKey !== "SALES") {
      return [];
    }

    if (
      query.topicKey &&
      query.topicKey !== "SALES_OUTBOUND" &&
      query.topicKey !== "SALES_RETURN"
    ) {
      return [];
    }

    return entries
      .filter((entry) =>
        query.topicKey ? entry.topicKey === query.topicKey : true,
      )
      .filter((entry) =>
        documentTypeLabel
          ? entry.documentTypeLabel === documentTypeLabel
          : true,
      )
      .filter((entry) =>
        query.abnormalOnly ? entry.abnormalFlags.length > 0 : true,
      )
      .filter((entry) => this.matchesSalesProjectKeyword(entry, query.keyword));
  }

  private toDocumentItem(row: MonthlyReportEntry): MonthlyReportDocumentItem {
    const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
    const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
    const workshopRef = this.normalizeWorkshopRef(
      row.workshopId,
      row.workshopName,
    );

    return {
      domainKey: topicMeta.domainKey,
      domainLabel: domainMeta.label,
      direction: row.direction,
      documentType: row.documentType,
      documentTypeLabel: row.documentTypeLabel,
      documentId: row.documentId,
      documentNo: row.documentNo,
      bizDate: this.toDateOnly(row.bizDate),
      stockScope: row.stockScope,
      stockScopeName: row.stockScopeName,
      workshopId: workshopRef.workshopId,
      workshopName: workshopRef.workshopName,
      salesProjectLabel: this.formatSalesProjectLabel(
        row.salesProjectCodes,
        row.salesProjectNames,
      ),
      rdProjectCode: row.rdProjectCode,
      rdProjectName: row.rdProjectName,
      sourceStockScopeName: row.sourceStockScopeName,
      targetStockScopeName: row.targetStockScopeName,
      sourceWorkshopName: this.normalizeWorkshopName(row.sourceWorkshopName),
      targetWorkshopName: this.normalizeWorkshopName(row.targetWorkshopName),
      quantity: formatDecimal(row.quantity),
      amount: formatMoney(row.amount),
      cost: formatMoney(row.cost),
      abnormalFlags: row.abnormalFlags,
      abnormalLabels: row.abnormalFlags.map(
        (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
      ),
      sourceBizMonth: row.sourceBizDate
        ? formatYearMonth(
            row.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      sourceDocumentNo: row.sourceDocumentNo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private buildDomainItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportDomainSummaryItem[] {
    const grouped = new Map<MonthlyReportingDomainKey, MonthlyReportEntry[]>();

    for (const row of rows) {
      const domainKey = getMonthlyReportingTopicMeta(row.topicKey).domainKey;
      const current = grouped.get(domainKey) ?? [];
      current.push(row);
      grouped.set(domainKey, current);
    }

    return [...grouped.entries()]
      .map(([domainKey, domainRows]) => ({
        domainKey,
        domainLabel: getMonthlyReportingDomainMeta(domainKey).label,
        ...this.buildTotals(domainRows),
      }))
      .sort(
        (left, right) =>
          getMonthlyReportingDomainMeta(left.domainKey).order -
          getMonthlyReportingDomainMeta(right.domainKey).order,
      );
  }

  private buildDocumentTypeItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportDocumentTypeSummaryItem[] {
    const grouped = new Map<
      string,
      {
        domainKey: MonthlyReportingDomainKey;
        documentTypeLabel: string;
        sortOrder: number;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of rows) {
      const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
      const mapKey = `${topicMeta.domainKey}:${row.documentTypeLabel}`;
      const current = grouped.get(mapKey) ?? {
        domainKey: topicMeta.domainKey,
        documentTypeLabel: row.documentTypeLabel,
        sortOrder: topicMeta.order,
        rows: [],
      };
      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => ({
        domainKey: item.domainKey,
        domainLabel: getMonthlyReportingDomainMeta(item.domainKey).label,
        documentTypeLabel: item.documentTypeLabel,
        sortOrder: item.sortOrder,
        ...this.buildTotals(item.rows),
      }))
      .sort((left, right) => {
        const leftDomainOrder = getMonthlyReportingDomainMeta(
          left.domainKey,
        ).order;
        const rightDomainOrder = getMonthlyReportingDomainMeta(
          right.domainKey,
        ).order;
        if (leftDomainOrder !== rightDomainOrder) {
          return leftDomainOrder - rightDomainOrder;
        }

        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.documentTypeLabel.localeCompare(
          right.documentTypeLabel,
          "zh-Hans-CN",
        );
      })
      .map(({ sortOrder: _sortOrder, ...item }) => item);
  }

  private buildWorkshopItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportWorkshopSummaryItem[] {
    const workshopRows = rows.filter(
      (row) =>
        getMonthlyReportingTopicMeta(row.topicKey).domainKey === "WORKSHOP",
    );
    const grouped = new Map<
      string,
      {
        workshopId: number | null;
        workshopName: string;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of workshopRows) {
      const workshopRef = this.normalizeWorkshopRef(
        row.workshopId,
        row.workshopName,
      );
      const workshopId = workshopRef.workshopId;
      const workshopName = workshopRef.workshopName ?? "未区分车间";
      const mapKey = `${workshopId ?? "null"}:${workshopName}`;
      const current = grouped.get(mapKey) ?? {
        workshopId,
        workshopName,
        rows: [],
      };
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const pickRows = item.rows.filter(
          (row) => row.topicKey === "WORKSHOP_PICK",
        );
        const returnRows = item.rows.filter(
          (row) => row.topicKey === "WORKSHOP_RETURN",
        );
        const scrapRows = item.rows.filter(
          (row) => row.topicKey === "WORKSHOP_SCRAP",
        );
        const pickQuantity = sumDecimals(pickRows.map((row) => row.quantity));
        const returnQuantity = sumDecimals(
          returnRows.map((row) => row.quantity),
        );
        const scrapQuantity = sumDecimals(scrapRows.map((row) => row.quantity));
        const pickAmount = sumDecimals(pickRows.map((row) => row.amount));
        const returnAmount = sumDecimals(returnRows.map((row) => row.amount));
        const scrapAmount = sumDecimals(scrapRows.map((row) => row.amount));
        const documentKeys = new Set(
          item.rows.map((row) => `${row.documentType}:${row.documentId}`),
        );
        const abnormalDocumentKeys = new Set(
          item.rows
            .filter((row) => row.abnormalFlags.length > 0)
            .map((row) => `${row.documentType}:${row.documentId}`),
        );

        return {
          workshopId: item.workshopId,
          workshopName: item.workshopName,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          pickQuantity: formatDecimal(pickQuantity),
          pickAmount: formatMoney(pickAmount),
          returnQuantity: formatDecimal(returnQuantity),
          returnAmount: formatMoney(returnAmount),
          scrapQuantity: formatDecimal(scrapQuantity),
          scrapAmount: formatMoney(scrapAmount),
          netQuantity: formatDecimal(
            returnQuantity.sub(pickQuantity).sub(scrapQuantity),
          ),
          netAmount: formatMoney(returnAmount.sub(pickAmount).sub(scrapAmount)),
          totalCost: formatMoney(sumDecimals(item.rows.map((row) => row.cost))),
        };
      })
      .sort((left, right) =>
        right.netAmount.localeCompare(left.netAmount, "en"),
      );
  }

  private buildSalesProjectItems(
    entries: MonthlySalesProjectEntry[],
  ): MonthlyReportSalesProjectSummaryItem[] {
    const grouped = new Map<
      string,
      {
        salesProjectId: number | null;
        salesProjectCode: string | null;
        salesProjectName: string;
        entries: MonthlySalesProjectEntry[];
      }
    >();

    for (const entry of entries) {
      const salesProjectName = entry.salesProjectName ?? "未关联销售项目";
      const mapKey = [
        entry.salesProjectId ?? "null",
        entry.salesProjectCode ?? "",
        salesProjectName,
      ].join(":");
      const current = grouped.get(mapKey) ?? {
        salesProjectId: entry.salesProjectId,
        salesProjectCode: entry.salesProjectCode,
        salesProjectName,
        entries: [],
      };
      current.entries.push(entry);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const outboundEntries = item.entries.filter(
          (entry) => entry.topicKey === "SALES_OUTBOUND",
        );
        const returnEntries = item.entries.filter(
          (entry) => entry.topicKey === "SALES_RETURN",
        );
        const documentKeys = new Set(
          item.entries.map((entry) => `SalesStockOrder:${entry.documentId}`),
        );
        const abnormalDocumentKeys = new Set(
          item.entries
            .filter((entry) => entry.abnormalFlags.length > 0)
            .map((entry) => `SalesStockOrder:${entry.documentId}`),
        );
        const outboundQuantity = sumDecimals(
          outboundEntries.map((entry) => entry.quantity),
        );
        const returnQuantity = sumDecimals(
          returnEntries.map((entry) => entry.quantity),
        );
        const outboundAmount = sumDecimals(
          outboundEntries.map((entry) => entry.amount),
        );
        const returnAmount = sumDecimals(
          returnEntries.map((entry) => entry.amount),
        );

        return {
          salesProjectId: item.salesProjectId,
          salesProjectCode: item.salesProjectCode,
          salesProjectName: item.salesProjectName,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          salesOutboundQuantity: formatDecimal(outboundQuantity),
          salesOutboundAmount: formatMoney(outboundAmount),
          salesReturnQuantity: formatDecimal(returnQuantity),
          salesReturnAmount: formatMoney(returnAmount),
          netQuantity: formatDecimal(outboundQuantity.sub(returnQuantity)),
          netAmount: formatMoney(outboundAmount.sub(returnAmount)),
          totalCost: formatMoney(
            sumDecimals(item.entries.map((entry) => entry.cost)),
          ),
        };
      })
      .sort((left, right) =>
        right.netAmount.localeCompare(left.netAmount, "en"),
      );
  }

  private buildRdProjectItems(
    rows: MonthlyReportEntry[],
  ): MonthlyReportRdProjectSummaryItem[] {
    const rdProjectRows = rows.filter((row) => {
      if (
        row.topicKey === "RD_PROJECT_PICK" ||
        row.topicKey === "RD_PROJECT_RETURN" ||
        row.topicKey === "RD_PROJECT_SCRAP"
      ) {
        return true;
      }

      return (
        row.topicKey === "RD_HANDOFF" &&
        row.direction !== MonthlyReportingDirection.OUT &&
        (row.rdProjectId != null ||
          Boolean(row.rdProjectCode) ||
          Boolean(row.rdProjectName))
      );
    });
    const grouped = new Map<
      string,
      {
        rdProjectId: number | null;
        rdProjectCode: string | null;
        rdProjectName: string;
        rows: MonthlyReportEntry[];
      }
    >();

    for (const row of rdProjectRows) {
      const rdProjectName = row.rdProjectName ?? "未区分研发项目";
      const mapKey = [
        row.rdProjectId ?? "null",
        row.rdProjectCode ?? "",
        rdProjectName,
      ].join(":");
      const current = grouped.get(mapKey) ?? {
        rdProjectId: row.rdProjectId,
        rdProjectCode: row.rdProjectCode,
        rdProjectName,
        rows: [],
      };
      current.rows.push(row);
      grouped.set(mapKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const handoffRows = item.rows.filter(
          (row) => row.topicKey === "RD_HANDOFF",
        );
        const pickRows = item.rows.filter(
          (row) => row.topicKey === "RD_PROJECT_PICK",
        );
        const returnRows = item.rows.filter(
          (row) => row.topicKey === "RD_PROJECT_RETURN",
        );
        const scrapRows = item.rows.filter(
          (row) => row.topicKey === "RD_PROJECT_SCRAP",
        );
        const documentKeys = new Set(
          item.rows.map((row) => `${row.documentType}:${row.documentId}`),
        );
        const abnormalDocumentKeys = new Set(
          item.rows
            .filter((row) => row.abnormalFlags.length > 0)
            .map((row) => `${row.documentType}:${row.documentId}`),
        );
        const handoffInQuantity = sumDecimals(
          handoffRows.map((row) => row.quantity),
        );
        const pickQuantity = sumDecimals(pickRows.map((row) => row.quantity));
        const returnQuantity = sumDecimals(
          returnRows.map((row) => row.quantity),
        );
        const scrapQuantity = sumDecimals(scrapRows.map((row) => row.quantity));
        const handoffInAmount = sumDecimals(
          handoffRows.map((row) => row.amount),
        );
        const pickAmount = sumDecimals(pickRows.map((row) => row.amount));
        const returnAmount = sumDecimals(returnRows.map((row) => row.amount));
        const scrapAmount = sumDecimals(scrapRows.map((row) => row.amount));

        return {
          rdProjectId: item.rdProjectId,
          rdProjectCode: item.rdProjectCode,
          rdProjectName: item.rdProjectName,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          handoffInQuantity: formatDecimal(handoffInQuantity),
          handoffInAmount: formatMoney(handoffInAmount),
          pickQuantity: formatDecimal(pickQuantity),
          pickAmount: formatMoney(pickAmount),
          returnQuantity: formatDecimal(returnQuantity),
          returnAmount: formatMoney(returnAmount),
          scrapQuantity: formatDecimal(scrapQuantity),
          scrapAmount: formatMoney(scrapAmount),
          netQuantity: formatDecimal(
            handoffInQuantity
              .add(returnQuantity)
              .sub(pickQuantity)
              .sub(scrapQuantity),
          ),
          netAmount: formatMoney(
            handoffInAmount.add(returnAmount).sub(pickAmount).sub(scrapAmount),
          ),
          totalCost: formatMoney(sumDecimals(item.rows.map((row) => row.cost))),
        };
      })
      .sort((left, right) =>
        right.netAmount.localeCompare(left.netAmount, "en"),
      );
  }

  private buildMaterialCategoryItems(
    entries: MonthlyMaterialCategoryEntry[],
  ): MonthlyReportMaterialCategorySummaryItem[] {
    const grouped = new Map<
      string,
      {
        nodeKey: string;
        categoryId: number | null;
        categoryCode: string | null;
        categoryName: string;
        entries: MonthlyMaterialCategoryEntry[];
      }
    >();

    for (const entry of entries) {
      const leafCategory = this.resolveMaterialCategoryLeaf(entry);
      const nodeKey = this.buildMaterialCategoryNodeKey(leafCategory);
      const current = grouped.get(nodeKey) ?? {
        nodeKey,
        categoryId: leafCategory.id,
        categoryCode: leafCategory.categoryCode,
        categoryName: leafCategory.categoryName,
        entries: [],
      };
      current.entries.push(entry);
      grouped.set(nodeKey, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const acceptanceRows = item.entries.filter(
          (entry) => entry.topicKey === "ACCEPTANCE_INBOUND",
        );
        const productionRows = item.entries.filter(
          (entry) => entry.topicKey === "PRODUCTION_RECEIPT",
        );
        const outboundRows = item.entries.filter(
          (entry) => entry.topicKey === "SALES_OUTBOUND",
        );
        const returnRows = item.entries.filter(
          (entry) => entry.topicKey === "SALES_RETURN",
        );
        const documentKeys = new Set(
          item.entries.map(
            (entry) => `${entry.documentType}:${entry.documentId}`,
          ),
        );
        const abnormalDocumentKeys = new Set(
          item.entries
            .filter((entry) => entry.abnormalFlags.length > 0)
            .map((entry) => `${entry.documentType}:${entry.documentId}`),
        );
        const acceptanceInboundAmount = sumDecimals(
          acceptanceRows.map((entry) => entry.amount),
        );
        const productionReceiptAmount = sumDecimals(
          productionRows.map((entry) => entry.amount),
        );
        const salesOutboundAmount = sumDecimals(
          outboundRows.map((entry) => entry.amount),
        );
        const salesReturnAmount = sumDecimals(
          returnRows.map((entry) => entry.amount),
        );

        return {
          nodeKey: item.nodeKey,
          categoryId: item.categoryId,
          categoryCode: item.categoryCode,
          categoryName: item.categoryName,
          lineCount: item.entries.length,
          documentCount: documentKeys.size,
          abnormalDocumentCount: abnormalDocumentKeys.size,
          acceptanceInboundAmount: formatMoney(acceptanceInboundAmount),
          productionReceiptAmount: formatMoney(productionReceiptAmount),
          salesOutboundAmount: formatMoney(salesOutboundAmount),
          salesReturnAmount: formatMoney(salesReturnAmount),
          netAmount: formatMoney(
            acceptanceInboundAmount
              .add(productionReceiptAmount)
              .add(salesReturnAmount)
              .sub(salesOutboundAmount),
          ),
          totalCost: formatMoney(
            sumDecimals(item.entries.map((entry) => entry.cost)),
          ),
        };
      })
      .sort((left, right) => {
        if (left.categoryName !== right.categoryName) {
          return left.categoryName.localeCompare(
            right.categoryName,
            "zh-Hans-CN",
          );
        }

        if ((left.categoryCode ?? "") !== (right.categoryCode ?? "")) {
          return (left.categoryCode ?? "").localeCompare(
            right.categoryCode ?? "",
            "zh-Hans-CN",
          );
        }

        return left.nodeKey.localeCompare(right.nodeKey, "zh-Hans-CN");
      });
  }

  private buildDomainCatalog(): MonthlyReportDomainCatalogItem[] {
    return Object.entries(MONTHLY_REPORTING_DOMAIN_META)
      .map(([domainKey, meta]) => ({
        domainKey: domainKey as MonthlyReportingDomainKey,
        domainLabel: meta.label,
        sortOrder: meta.order,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  private buildDocumentTypeCatalog(
    rows: MonthlyReportEntry[],
  ): MonthlyReportDocumentTypeCatalogItem[] {
    const grouped = new Map<
      string,
      {
        domainKey: MonthlyReportingDomainKey;
        domainLabel: string;
        documentTypeLabel: string;
        sortOrder: number;
      }
    >();

    for (const row of rows) {
      const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
      const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
      const mapKey = `${topicMeta.domainKey}:${row.documentTypeLabel}`;
      const current = grouped.get(mapKey);

      if (!current) {
        grouped.set(mapKey, {
          domainKey: topicMeta.domainKey,
          domainLabel: domainMeta.label,
          documentTypeLabel: row.documentTypeLabel,
          sortOrder: topicMeta.order,
        });
        continue;
      }

      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
    }

    return [...grouped.values()].sort((left, right) => {
      const leftDomainOrder = getMonthlyReportingDomainMeta(
        left.domainKey,
      ).order;
      const rightDomainOrder = getMonthlyReportingDomainMeta(
        right.domainKey,
      ).order;
      if (leftDomainOrder !== rightDomainOrder) {
        return leftDomainOrder - rightDomainOrder;
      }

      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.documentTypeLabel.localeCompare(
        right.documentTypeLabel,
        "zh-Hans-CN",
      );
    });
  }

  private buildMaterialCategoryDocumentTypeCatalog(
    entries: MonthlyMaterialCategoryEntry[],
  ): MonthlyReportDocumentTypeCatalogItem[] {
    const grouped = new Map<
      string,
      {
        domainKey: MonthlyReportingDomainKey;
        domainLabel: string;
        documentTypeLabel: string;
        sortOrder: number;
      }
    >();

    for (const entry of entries) {
      const topicMeta = getMonthlyReportingTopicMeta(entry.topicKey);
      const domainMeta = getMonthlyReportingDomainMeta(topicMeta.domainKey);
      const current = grouped.get(entry.documentTypeLabel);

      if (!current) {
        grouped.set(entry.documentTypeLabel, {
          domainKey: topicMeta.domainKey,
          domainLabel: domainMeta.label,
          documentTypeLabel: entry.documentTypeLabel,
          sortOrder: topicMeta.order,
        });
        continue;
      }

      current.sortOrder = Math.min(current.sortOrder, topicMeta.order);
    }

    return [...grouped.values()].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.documentTypeLabel.localeCompare(
        right.documentTypeLabel,
        "zh-Hans-CN",
      );
    });
  }

  private buildTotals(
    rows: MonthlyReportEntry[],
  ): Omit<MonthlyReportSummaryTotals, "domainCount"> {
    const documentKeys = new Set(
      rows.map((row) => `${row.documentType}:${row.documentId}`),
    );
    const abnormalDocumentKeys = new Set(
      rows
        .filter((row) => row.abnormalFlags.length > 0)
        .map((row) => `${row.documentType}:${row.documentId}`),
    );
    const inRows = rows.filter(
      (row) => row.direction === MonthlyReportingDirection.IN,
    );
    const outRows = rows.filter(
      (row) => row.direction === MonthlyReportingDirection.OUT,
    );
    const totalInQuantity = sumDecimals(inRows.map((row) => row.quantity));
    const totalOutQuantity = sumDecimals(outRows.map((row) => row.quantity));
    const totalInAmount = sumDecimals(inRows.map((row) => row.amount));
    const totalOutAmount = sumDecimals(outRows.map((row) => row.amount));

    return {
      documentCount: documentKeys.size,
      abnormalDocumentCount: abnormalDocumentKeys.size,
      totalInQuantity: formatDecimal(totalInQuantity),
      totalInAmount: formatMoney(totalInAmount),
      totalOutQuantity: formatDecimal(totalOutQuantity),
      totalOutAmount: formatMoney(totalOutAmount),
      netQuantity: formatDecimal(totalInQuantity.sub(totalOutQuantity)),
      netAmount: formatMoney(totalInAmount.sub(totalOutAmount)),
      totalCost: formatMoney(sumDecimals(rows.map((row) => row.cost))),
    };
  }

  private buildMaterialCategoryTotals(
    entries: MonthlyMaterialCategoryEntry[],
  ): Omit<MonthlyReportMaterialCategorySummaryTotals, "categoryCount"> {
    const documentKeys = new Set(
      entries.map((entry) => `${entry.documentType}:${entry.documentId}`),
    );
    const abnormalDocumentKeys = new Set(
      entries
        .filter((entry) => entry.abnormalFlags.length > 0)
        .map((entry) => `${entry.documentType}:${entry.documentId}`),
    );
    const acceptanceInboundAmount = sumDecimals(
      entries
        .filter((entry) => entry.topicKey === "ACCEPTANCE_INBOUND")
        .map((entry) => entry.amount),
    );
    const productionReceiptAmount = sumDecimals(
      entries
        .filter((entry) => entry.topicKey === "PRODUCTION_RECEIPT")
        .map((entry) => entry.amount),
    );
    const salesOutboundAmount = sumDecimals(
      entries
        .filter((entry) => entry.topicKey === "SALES_OUTBOUND")
        .map((entry) => entry.amount),
    );
    const salesReturnAmount = sumDecimals(
      entries
        .filter((entry) => entry.topicKey === "SALES_RETURN")
        .map((entry) => entry.amount),
    );

    return {
      lineCount: entries.length,
      documentCount: documentKeys.size,
      abnormalDocumentCount: abnormalDocumentKeys.size,
      acceptanceInboundAmount: formatMoney(acceptanceInboundAmount),
      productionReceiptAmount: formatMoney(productionReceiptAmount),
      salesOutboundAmount: formatMoney(salesOutboundAmount),
      salesReturnAmount: formatMoney(salesReturnAmount),
      netAmount: formatMoney(
        acceptanceInboundAmount
          .add(productionReceiptAmount)
          .add(salesReturnAmount)
          .sub(salesOutboundAmount),
      ),
      totalCost: formatMoney(sumDecimals(entries.map((entry) => entry.cost))),
    };
  }

  private filterMaterialCategoryEntries(
    entries: MonthlyMaterialCategoryEntry[],
    query: MonthlyReportQuery,
    options: {
      ignoreDocumentTypeLabel?: boolean;
    } = {},
  ) {
    const documentTypeLabel = query.documentTypeLabel?.trim() || null;

    if (
      query.topicKey &&
      !MONTHLY_REPORTING_MATERIAL_CATEGORY_TOPIC_OPTIONS.includes(
        query.topicKey,
      )
    ) {
      return [];
    }
    const categoryNodeKey = query.categoryNodeKey?.trim() || null;

    return [...entries]
      .filter((entry) =>
        query.topicKey ? entry.topicKey === query.topicKey : true,
      )
      .filter((entry) =>
        options.ignoreDocumentTypeLabel || !documentTypeLabel
          ? true
          : entry.documentTypeLabel === documentTypeLabel,
      )
      .filter((entry) =>
        categoryNodeKey
          ? this.resolveMaterialCategoryNodeKey(entry) === categoryNodeKey
          : query.categoryId
            ? this.resolveMaterialCategoryLeaf(entry).id === query.categoryId
            : true,
      )
      .filter((entry) =>
        query.abnormalOnly ? entry.abnormalFlags.length > 0 : true,
      )
      .filter((entry) =>
        this.matchesMaterialCategoryKeyword(entry, query.keyword),
      )
      .sort((left, right) => {
        const leftCategory = this.resolveMaterialCategoryLeaf(left);
        const rightCategory = this.resolveMaterialCategoryLeaf(right);
        if (leftCategory.categoryName !== rightCategory.categoryName) {
          return leftCategory.categoryName.localeCompare(
            rightCategory.categoryName,
            "zh-Hans-CN",
          );
        }

        if (
          (leftCategory.categoryCode ?? "") !==
          (rightCategory.categoryCode ?? "")
        ) {
          return (leftCategory.categoryCode ?? "").localeCompare(
            rightCategory.categoryCode ?? "",
            "zh-Hans-CN",
          );
        }

        const leftTopicOrder = getMonthlyReportingTopicMeta(
          left.topicKey,
        ).order;
        const rightTopicOrder = getMonthlyReportingTopicMeta(
          right.topicKey,
        ).order;
        if (leftTopicOrder !== rightTopicOrder) {
          return leftTopicOrder - rightTopicOrder;
        }

        if (left.bizDate.getTime() !== right.bizDate.getTime()) {
          return left.bizDate.getTime() - right.bizDate.getTime();
        }

        if (left.documentNo !== right.documentNo) {
          return left.documentNo.localeCompare(right.documentNo);
        }

        return left.lineNo - right.lineNo;
      });
  }

  private toMaterialCategoryDetailItem(
    entry: MonthlyMaterialCategoryEntry,
  ): MonthlyReportMaterialCategoryDetailItem {
    const workshopRef = this.normalizeWorkshopRef(
      entry.workshopId,
      entry.workshopName,
    );

    return {
      direction: entry.direction,
      documentType: entry.documentType,
      documentTypeLabel: entry.documentTypeLabel,
      documentId: entry.documentId,
      documentNo: entry.documentNo,
      documentLineId: entry.documentLineId,
      lineNo: entry.lineNo,
      bizDate: this.toDateOnly(entry.bizDate),
      stockScope: entry.stockScope,
      stockScopeName: entry.stockScopeName,
      workshopId: workshopRef.workshopId,
      workshopName: workshopRef.workshopName,
      materialId: entry.materialId,
      materialCode: entry.materialCode,
      materialName: entry.materialName,
      materialSpec: entry.materialSpec,
      unitCode: entry.unitCode,
      categoryId: entry.categoryId,
      categoryCode: entry.categoryCode,
      categoryName: entry.categoryName,
      salesProjectCode: entry.salesProjectCode,
      salesProjectName: entry.salesProjectName,
      quantity: formatDecimal(entry.quantity),
      amount: formatMoney(entry.amount),
      cost: formatMoney(entry.cost),
      abnormalFlags: entry.abnormalFlags,
      abnormalLabels: entry.abnormalFlags.map(
        (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
      ),
      sourceBizMonth: entry.sourceBizDate
        ? formatYearMonth(
            entry.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      sourceDocumentNo: entry.sourceDocumentNo,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private matchesKeyword(row: MonthlyReportEntry, keyword?: string) {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const topicMeta = getMonthlyReportingTopicMeta(row.topicKey);
    const domainLabel = getMonthlyReportingDomainMeta(
      topicMeta.domainKey,
    ).label;
    const abnormalLabels = row.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      row.documentNo,
      row.documentTypeLabel,
      domainLabel,
      row.stockScopeName,
      this.normalizeWorkshopName(row.workshopName),
      row.sourceStockScopeName,
      row.targetStockScopeName,
      this.normalizeWorkshopName(row.sourceWorkshopName),
      this.normalizeWorkshopName(row.targetWorkshopName),
      row.rdProjectCode,
      row.rdProjectName,
      this.formatSalesProjectLabel(
        row.salesProjectCodes,
        row.salesProjectNames,
      ),
      row.sourceDocumentNo,
      row.sourceBizDate
        ? formatYearMonth(
            row.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }

  private matchesMaterialCategoryKeyword(
    entry: MonthlyMaterialCategoryEntry,
    keyword?: string,
  ) {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const abnormalLabels = entry.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      entry.documentNo,
      entry.documentTypeLabel,
      entry.stockScopeName,
      this.normalizeWorkshopName(entry.workshopName),
      entry.materialCode,
      entry.materialName,
      entry.materialSpec,
      entry.categoryCode,
      entry.categoryName,
      entry.salesProjectCode,
      entry.salesProjectName,
      entry.sourceDocumentNo,
      entry.sourceBizDate
        ? formatYearMonth(
            entry.sourceBizDate,
            this.appConfigService.businessTimezone,
          )
        : null,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }

  private matchesSalesProjectKeyword(
    entry: MonthlySalesProjectEntry,
    keyword?: string,
  ) {
    const normalizedKeyword = keyword?.trim().toLowerCase();
    if (!normalizedKeyword) {
      return true;
    }

    const abnormalLabels = entry.abnormalFlags.map(
      (flag) => MONTHLY_REPORTING_ABNORMAL_LABELS[flag],
    );

    return [
      entry.documentNo,
      entry.documentTypeLabel,
      entry.salesProjectCode,
      entry.salesProjectName,
      ...abnormalLabels,
    ]
      .filter(Boolean)
      .some((candidate) =>
        String(candidate).toLowerCase().includes(normalizedKeyword),
      );
  }

  private resolveRowBusinessName(row: MonthlyReportEntry) {
    if (row.topicKey === "RD_HANDOFF") {
      return [
        row.sourceStockScopeName ?? "",
        row.targetStockScopeName ?? "",
        this.normalizeWorkshopName(row.sourceWorkshopName) ?? "",
        this.normalizeWorkshopName(row.targetWorkshopName) ?? "",
      ].join(" ");
    }

    if (row.rdProjectName) {
      return `${row.rdProjectCode ?? ""} ${row.rdProjectName}`.trim();
    }

    if (row.salesProjectNames.length > 0) {
      return row.salesProjectNames.join("、");
    }

    return this.normalizeWorkshopName(row.workshopName) ?? "";
  }

  private resolveMaterialCategoryPath(entry: MonthlyMaterialCategoryEntry) {
    if (entry.categoryPath.length > 0) {
      return entry.categoryPath;
    }

    return [
      {
        id: entry.categoryId,
        categoryCode: entry.categoryCode,
        categoryName: entry.categoryName || MATERIAL_CATEGORY_DEFAULT_LABEL,
      },
    ];
  }

  private resolveMaterialCategoryLeaf(entry: MonthlyMaterialCategoryEntry) {
    const categoryPath = this.resolveMaterialCategoryPath(entry);
    return categoryPath[categoryPath.length - 1];
  }

  private resolveMaterialCategoryNodeKey(entry: MonthlyMaterialCategoryEntry) {
    return this.buildMaterialCategoryNodeKey(
      this.resolveMaterialCategoryLeaf(entry),
    );
  }

  private buildMaterialCategoryNodeKey(node: {
    id: number | null;
    categoryCode: string | null;
    categoryName: string;
  }) {
    return `${node.id ?? "null"}:${node.categoryCode ?? ""}:${node.categoryName}`;
  }

  private normalizeWorkshopRef(
    workshopId: number | null,
    workshopName: string | null,
  ) {
    const normalizedWorkshopName = this.normalizeWorkshopName(workshopName);

    return {
      workshopId: normalizedWorkshopName ? workshopId : null,
      workshopName: normalizedWorkshopName,
    };
  }

  private normalizeWorkshopName(workshopName: string | null) {
    const normalizedWorkshopName = workshopName?.trim() || null;
    if (!normalizedWorkshopName) {
      return null;
    }

    return RESERVED_STOCK_SCOPE_WORKSHOP_NAMES.has(normalizedWorkshopName)
      ? null
      : normalizedWorkshopName;
  }

  private formatSalesProjectLabel(
    salesProjectCodes: string[],
    salesProjectNames: string[],
  ) {
    if (salesProjectNames.length === 0 && salesProjectCodes.length === 0) {
      return null;
    }

    const pairs = salesProjectNames.map((name, index) => {
      const code = salesProjectCodes[index];
      return code ? `${code} / ${name}` : name;
    });
    const extraCodes = salesProjectCodes
      .slice(salesProjectNames.length)
      .filter((code) => !pairs.includes(code));
    return [...pairs, ...extraCodes].join("、");
  }

  private resolveMonthRange(yearMonth: string) {
    const [year, month] = yearMonth.split("-").map((item) => Number(item));
    const start = this.createDateInBusinessTimezone(year, month, 1);
    const end = this.createDateInBusinessTimezone(
      year,
      month + 1,
      0,
      23,
      59,
      59,
      999,
    );
    return { start, end };
  }

  private toDateOnly(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.appConfigService.businessTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(value);
  }

  private createDateInBusinessTimezone(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ) {
    const utcGuess = Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      millisecond,
    );
    const offset = this.getTimeZoneOffsetMilliseconds(new Date(utcGuess));
    return new Date(utcGuess - offset);
  }

  private getTimeZoneOffsetMilliseconds(value: Date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: this.appConfigService.businessTimezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = formatter.formatToParts(value);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const second = Number(parts.find((part) => part.type === "second")?.value);
    return (
      Date.UTC(year, month - 1, day, hour, minute, second) -
      value.getTime() +
      value.getMilliseconds()
    );
  }

  private buildExcelXmlWorkbook(
    sheets: Array<{
      name: string;
      columns: string[];
      rows: Array<Array<string | number>>;
    }>,
  ) {
    const worksheetXml = sheets
      .map(
        (sheet) => `
    <Worksheet ss:Name="${this.escapeXml(sheet.name)}">
      <Table>
        ${this.buildExcelRow(sheet.columns, true)}
        ${sheet.rows.map((row) => this.buildExcelRow(row)).join("")}
      </Table>
    </Worksheet>`,
      )
      .join("");

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" />
    </Style>
  </Styles>
  ${worksheetXml}
</Workbook>`;
  }

  private buildExcelRow(values: Array<string | number>, isHeader = false) {
    return `<Row>${values
      .map((value) => {
        const dataType = typeof value === "number" ? "Number" : "String";
        const styleId = isHeader ? ' ss:StyleID="Header"' : "";
        return `<Cell${styleId}><Data ss:Type="${dataType}">${this.escapeXml(
          value,
        )}</Data></Cell>`;
      })
      .join("")}</Row>`;
  }

  private escapeXml(value: string | number) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }
}
