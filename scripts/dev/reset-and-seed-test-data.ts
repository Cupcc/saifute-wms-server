import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  RdProjectMaterialActionType,
  StockInOrderType,
  WorkshopMaterialOrderType,
} from "../../generated/prisma/client";
import { AppModule } from "../../src/app.module";
import { InboundService } from "../../src/modules/inbound/application/inbound.service";
import { MasterDataService } from "../../src/modules/master-data/application/master-data.service";
import { RdProjectService } from "../../src/modules/rd-project/application/rd-project.service";
import { RdProjectMaterialActionService } from "../../src/modules/rd-project/application/rd-project-material-action.service";
import { RdHandoffService } from "../../src/modules/rd-subwarehouse/application/rd-handoff.service";
import { RdProcurementRequestService } from "../../src/modules/rd-subwarehouse/application/rd-procurement-request.service";
import { MonthlyReportingService } from "../../src/modules/reporting/application/monthly-reporting.service";
import { SalesService } from "../../src/modules/sales/application/sales.service";
import { SalesProjectService } from "../../src/modules/sales-project/application/sales-project.service";
import { WorkshopMaterialService } from "../../src/modules/workshop-material/application/workshop-material.service";
import { BusinessDocumentType } from "../../src/shared/domain/business-document-type";
import { PrismaService } from "../../src/shared/prisma/prisma.service";
import {
  closePools,
  createMariaDbPool,
  withPoolConnection,
} from "../migration/db";

const RESET_ACTOR = "dev-reset";
const FIXTURE_MONTH = "2026-04";

const PRESERVED_TABLES = new Set([
  "sys_config",
  "sys_dept",
  "sys_dict_data",
  "sys_dict_type",
  "sys_job",
  "sys_menu",
  "sys_notice",
  "sys_post",
  "sys_role",
  "sys_role_dept",
  "sys_role_menu",
  "sys_user",
  "sys_user_post",
  "sys_user_role",
]);

type FixtureRefs = {
  workshops: {
    equip: number;
    electronics: number;
    rd: number;
    office: number;
  };
  materials: {
    motor: number;
    controller: number;
    cable: number;
  };
  supplierId: number;
  customerId: number;
  personnel: {
    storekeeper: number;
    operator: number;
    manager: number;
  };
};

function assertSafeDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const isLocalHost =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const databaseName = url.pathname.replace(/^\/+/u, "");

  if (!isLocalHost || databaseName !== "saifute-wsm") {
    throw new Error(
      `Refusing to reset non-dev database: host=${url.hostname} db=${databaseName}`,
    );
  }
}

async function listTables(databaseUrl: string) {
  const pool = createMariaDbPool(databaseUrl);
  try {
    return await withPoolConnection(pool, async (connection) => {
      const rows = (await connection.query("SHOW TABLES")) as Array<
        Record<string, string>
      >;
      return rows
        .map((row) => Object.values(row)[0])
        .filter((table): table is string => typeof table === "string");
    });
  } finally {
    await closePools(pool);
  }
}

async function truncateTables(databaseUrl: string, tables: string[]) {
  if (tables.length === 0) {
    return;
  }

  const pool = createMariaDbPool(databaseUrl);
  try {
    await withPoolConnection(pool, async (connection) => {
      await connection.query("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const table of tables) {
          const quoted = `\`${table.replace(/`/gu, "``")}\``;
          try {
            await connection.query(`TRUNCATE TABLE ${quoted}`);
          } catch {
            await connection.query(`DELETE FROM ${quoted}`);
            await connection.query(`ALTER TABLE ${quoted} AUTO_INCREMENT = 1`);
          }
        }
      } finally {
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      }
    });
  } finally {
    await closePools(pool);
  }
}

async function createMasterFixture(
  masterDataService: MasterDataService,
  prisma: PrismaService,
): Promise<FixtureRefs> {
  await masterDataService.createWorkshop(
    {
      workshopName: "研发",
    },
    RESET_ACTOR,
  );
  await masterDataService.createWorkshop(
    {
      workshopName: "内勤",
    },
    RESET_ACTOR,
  );

  const category = await masterDataService.createMaterialCategory(
    {
      categoryCode: "TEST-ASM",
      categoryName: "测试装配件",
      sortOrder: 10,
    },
    RESET_ACTOR,
  );

  const supplier = await masterDataService.createSupplier(
    {
      supplierCode: "TEST-SUP-001",
      supplierName: "测试供应商A",
      contactPerson: "周工",
      contactPhone: "13800000001",
      address: "开发测试区 1 号",
    },
    RESET_ACTOR,
  );
  const customer = await masterDataService.createCustomer(
    {
      customerCode: "TEST-CUS-001",
      customerName: "测试客户A",
      contactPerson: "陈工",
      contactPhone: "13800000002",
      address: "开发测试区 2 号",
    },
    RESET_ACTOR,
  );
  const storekeeper = await masterDataService.createPersonnel(
    {
      personnelName: "测试库管",
      contactPhone: "13800000011",
    },
    RESET_ACTOR,
  );
  const operator = await masterDataService.createPersonnel(
    {
      personnelName: "测试操作员",
      contactPhone: "13800000012",
    },
    RESET_ACTOR,
  );
  const manager = await masterDataService.createPersonnel(
    {
      personnelName: "测试项目经理",
      contactPhone: "13800000013",
    },
    RESET_ACTOR,
  );

  await masterDataService.createMaterial(
    {
      materialCode: "TEST-MOTOR-001",
      materialName: "测试电机",
      specModel: "MTR-90",
      unitCode: "台",
      categoryId: category.id,
      warningMinQty: "1",
    },
    RESET_ACTOR,
  );
  await masterDataService.createMaterial(
    {
      materialCode: "TEST-CTRL-001",
      materialName: "测试控制器",
      specModel: "CTRL-220",
      unitCode: "套",
      categoryId: category.id,
      warningMinQty: "1",
    },
    RESET_ACTOR,
  );
  await masterDataService.createMaterial(
    {
      materialCode: "TEST-CABLE-001",
      materialName: "测试线束",
      specModel: "CBL-8M",
      unitCode: "根",
      categoryId: category.id,
      warningMinQty: "5",
    },
    RESET_ACTOR,
  );

  const [equip, electronics, rd, office, motor, controller, cable] =
    await Promise.all([
      prisma.workshop.findFirstOrThrow({
        where: { workshopName: "装备车间", status: "ACTIVE" },
      }),
      prisma.workshop.findFirstOrThrow({
        where: { workshopName: "电子车间", status: "ACTIVE" },
      }),
      prisma.workshop.findFirstOrThrow({
        where: { workshopName: "研发", status: "ACTIVE" },
      }),
      prisma.workshop.findFirstOrThrow({
        where: { workshopName: "内勤", status: "ACTIVE" },
      }),
      prisma.material.findUniqueOrThrow({
        where: { materialCode: "TEST-MOTOR-001" },
      }),
      prisma.material.findUniqueOrThrow({
        where: { materialCode: "TEST-CTRL-001" },
      }),
      prisma.material.findUniqueOrThrow({
        where: { materialCode: "TEST-CABLE-001" },
      }),
    ]);

  return {
    workshops: {
      equip: equip.id,
      electronics: electronics.id,
      rd: rd.id,
      office: office.id,
    },
    materials: {
      motor: motor.id,
      controller: controller.id,
      cable: cable.id,
    },
    supplierId: supplier.id,
    customerId: customer.id,
    personnel: {
      storekeeper: storekeeper.id,
      operator: operator.id,
      manager: manager.id,
    },
  };
}

async function seedBusinessFixture(
  refs: FixtureRefs,
  services: {
    inboundService: InboundService;
    workshopMaterialService: WorkshopMaterialService;
    salesProjectService: SalesProjectService;
    salesService: SalesService;
    rdProcurementRequestService: RdProcurementRequestService;
    rdHandoffService: RdHandoffService;
    rdProjectService: RdProjectService;
    rdProjectMaterialActionService: RdProjectMaterialActionService;
  },
) {
  const acceptance = await services.inboundService.createOrder(
    {
      orderType: StockInOrderType.ACCEPTANCE,
      bizDate: "2026-04-02",
      supplierId: refs.supplierId,
      handlerPersonnelId: refs.personnel.storekeeper,
      workshopId: refs.workshops.electronics,
      remark: "开发重置脚本: 验收入库样例",
      lines: [
        {
          materialId: refs.materials.motor,
          quantity: "20",
          unitPrice: "500",
        },
        {
          materialId: refs.materials.controller,
          quantity: "12",
          unitPrice: "300",
        },
      ],
    },
    RESET_ACTOR,
  );

  const productionReceipt = await services.inboundService.createOrder(
    {
      orderType: StockInOrderType.PRODUCTION_RECEIPT,
      bizDate: "2026-04-03",
      handlerPersonnelId: refs.personnel.operator,
      workshopId: refs.workshops.equip,
      remark: "开发重置脚本: 生产入库样例",
      lines: [
        {
          materialId: refs.materials.cable,
          quantity: "30",
          unitPrice: "20",
        },
      ],
    },
    RESET_ACTOR,
  );

  const workshopPick = await services.workshopMaterialService.createPickOrder(
    {
      orderType: WorkshopMaterialOrderType.PICK,
      bizDate: "2026-04-08",
      handlerPersonnelId: refs.personnel.operator,
      workshopId: refs.workshops.electronics,
      remark: "开发重置脚本: 车间领料样例",
      lines: [
        {
          materialId: refs.materials.motor,
          quantity: "4",
          unitPrice: "500",
        },
      ],
    },
    RESET_ACTOR,
  );

  const pickLine = workshopPick.lines[0];
  const workshopReturn =
    await services.workshopMaterialService.createReturnOrder(
      {
        orderType: WorkshopMaterialOrderType.RETURN,
        bizDate: "2026-04-09",
        handlerPersonnelId: refs.personnel.operator,
        workshopId: refs.workshops.electronics,
        remark: "开发重置脚本: 车间退料样例",
        lines: [
          {
            materialId: refs.materials.motor,
            quantity: "1",
            unitPrice: "500",
            sourceDocumentType: BusinessDocumentType.WorkshopMaterialOrder,
            sourceDocumentId: workshopPick.id,
            sourceDocumentLineId: pickLine.id,
          },
        ],
      },
      RESET_ACTOR,
    );

  const workshopScrap = await services.workshopMaterialService.createScrapOrder(
    {
      orderType: WorkshopMaterialOrderType.SCRAP,
      bizDate: "2026-04-10",
      handlerPersonnelId: refs.personnel.operator,
      workshopId: refs.workshops.equip,
      remark: "开发重置脚本: 车间报废样例",
      lines: [
        {
          materialId: refs.materials.cable,
          quantity: "2",
          unitPrice: "20",
        },
      ],
    },
    RESET_ACTOR,
  );

  const salesProject = await services.salesProjectService.createProject(
    {
      salesProjectCode: "TEST-SP-001",
      salesProjectName: "测试销售项目",
      bizDate: "2026-04-05",
      customerId: refs.customerId,
      managerPersonnelId: refs.personnel.manager,
      workshopId: refs.workshops.electronics,
      remark: "开发重置脚本: 销售项目样例",
      materialLines: [
        {
          materialId: refs.materials.motor,
          quantity: "6",
          unitPrice: "650",
        },
      ],
    },
    RESET_ACTOR,
  );

  const salesOutbound = await services.salesService.createOrder(
    {
      bizDate: "2026-04-11",
      customerId: refs.customerId,
      handlerPersonnelId: refs.personnel.storekeeper,
      workshopId: refs.workshops.electronics,
      remark: "开发重置脚本: 销售出库样例",
      lines: [
        {
          materialId: refs.materials.motor,
          salesProjectId: salesProject.id,
          quantity: "3",
          selectedUnitCost: "500",
          unitPrice: "650",
        },
      ],
    },
    RESET_ACTOR,
  );

  const salesReturn = await services.salesService.createSalesReturn(
    {
      bizDate: "2026-04-12",
      sourceOutboundOrderId: salesOutbound.id,
      customerId: refs.customerId,
      handlerPersonnelId: refs.personnel.storekeeper,
      workshopId: refs.workshops.electronics,
      remark: "开发重置脚本: 销售退货样例",
      lines: [
        {
          materialId: refs.materials.motor,
          quantity: "1",
          sourceOutboundLineId: salesOutbound.lines[0].id,
          unitPrice: "650",
        },
      ],
    },
    RESET_ACTOR,
  );

  const rdProject = await services.rdProjectService.createProject(
    {
      projectCode: "TEST-RDP-001",
      projectName: "测试研发项目",
      bizDate: "2026-04-06",
      supplierId: refs.supplierId,
      managerPersonnelId: refs.personnel.manager,
      workshopId: refs.workshops.rd,
      remark: "开发重置脚本: RD 项目样例",
      bomLines: [
        {
          materialId: refs.materials.controller,
          quantity: "2",
          unitPrice: "300",
        },
      ],
    },
    RESET_ACTOR,
  );

  const rdRequest = await services.rdProcurementRequestService.createRequest(
    {
      bizDate: "2026-04-06",
      projectCode: rdProject.projectCode,
      projectName: rdProject.projectName,
      supplierId: refs.supplierId,
      handlerPersonnelId: refs.personnel.manager,
      workshopId: refs.workshops.rd,
      remark: "开发重置脚本: RD 采购需求样例",
      lines: [
        {
          materialId: refs.materials.controller,
          quantity: "3",
          unitPrice: "300",
        },
      ],
    },
    RESET_ACTOR,
  );

  await services.rdProcurementRequestService.applyStatusAction(
    rdRequest.id,
    {
      actionType: "ACCEPTANCE_CONFIRMED",
      lineId: rdRequest.lines[0].id,
      quantity: "3",
      note: "开发重置脚本: 为 RD 交接准备的验收确认",
    },
    RESET_ACTOR,
  );

  const rdHandoff = await services.rdHandoffService.createOrder(
    {
      bizDate: "2026-04-13",
      handlerPersonnelId: refs.personnel.storekeeper,
      remark: "开发重置脚本: 主仓到 RD 交接样例",
      lines: [
        {
          materialId: refs.materials.controller,
          quantity: "3",
          unitPrice: "300",
          sourceDocumentType: BusinessDocumentType.RdProcurementRequest,
          sourceDocumentId: rdRequest.id,
          sourceDocumentLineId: rdRequest.lines[0].id,
        },
      ],
    },
    RESET_ACTOR,
  );

  const rdAction =
    await services.rdProjectMaterialActionService.createMaterialAction(
      rdProject.id,
      {
        actionType: RdProjectMaterialActionType.PICK,
        bizDate: "2026-04-15",
        remark: "开发重置脚本: RD 项目领料样例",
        lines: [
          {
            materialId: refs.materials.controller,
            quantity: "2",
            unitPrice: "300",
          },
        ],
      },
      RESET_ACTOR,
    );

  return {
    acceptance,
    productionReceipt,
    workshopPick,
    workshopReturn,
    workshopScrap,
    salesProject,
    salesOutbound,
    salesReturn,
    rdRequest,
    rdHandoff,
    rdProject,
    rdAction,
  };
}

async function printVerification(
  monthlyReportingService: MonthlyReportingService,
  prisma: PrismaService,
) {
  const summary = await monthlyReportingService.getMonthlyReportSummary({
    yearMonth: FIXTURE_MONTH,
  });

  const counts = await Promise.all([
    prisma.stockInOrder.count(),
    prisma.workshopMaterialOrder.count(),
    prisma.salesStockOrder.count(),
    prisma.rdProcurementRequest.count(),
    prisma.rdHandoffOrder.count(),
    prisma.rdProject.count(),
    prisma.rdProjectMaterialAction.count(),
  ]);

  console.log("");
  console.log("Reset complete.");
  console.log(`Month: ${FIXTURE_MONTH}`);
  console.log(
    `Counts: stockIn=${counts[0]} workshop=${counts[1]} sales=${counts[2]} rdRequest=${counts[3]} rdHandoff=${counts[4]} rdProject=${counts[5]} rdAction=${counts[6]}`,
  );
  console.log(
    `Summary: documents=${summary.summary.documentCount} abnormal=${summary.summary.abnormalDocumentCount} netAmount=${summary.summary.netAmount}`,
  );
  console.log(
    `Workshop summary: ${summary.workshopItems.map((item) => `${item.workshopName}:${item.documentCount}`).join(", ")}`,
  );
  console.log(
    `Sales projects: ${summary.salesProjectItems.map((item) => `${item.salesProjectName}:${item.documentCount}`).join(", ")}`,
  );
  console.log(
    `RD projects: ${summary.rdProjectItems.map((item) => `${item.rdProjectName}:${item.documentCount}`).join(", ")}`,
  );
  console.log(
    `RD handoff: ${summary.rdHandoffItems.map((item) => `${item.sourceWorkshopName}->${item.targetWorkshopName}:${item.documentCount}`).join(", ")}`,
  );
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertSafeDatabaseUrl(databaseUrl);

  const allTables = await listTables(databaseUrl);
  const tablesToReset = allTables.filter(
    (table) => !PRESERVED_TABLES.has(table),
  );

  console.log(`Resetting ${tablesToReset.length} tables in saifute-wsm...`);
  await truncateTables(databaseUrl, tablesToReset);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const masterDataService = app.get(MasterDataService);
    const inboundService = app.get(InboundService);
    const workshopMaterialService = app.get(WorkshopMaterialService);
    const salesProjectService = app.get(SalesProjectService);
    const salesService = app.get(SalesService);
    const rdProcurementRequestService = app.get(RdProcurementRequestService);
    const rdHandoffService = app.get(RdHandoffService);
    const rdProjectService = app.get(RdProjectService);
    const rdProjectMaterialActionService = app.get(
      RdProjectMaterialActionService,
    );
    const monthlyReportingService = app.get(MonthlyReportingService);

    const refs = await createMasterFixture(masterDataService, prisma);
    await seedBusinessFixture(refs, {
      inboundService,
      workshopMaterialService,
      salesProjectService,
      salesService,
      rdProcurementRequestService,
      rdHandoffService,
      rdProjectService,
      rdProjectMaterialActionService,
    });
    await printVerification(monthlyReportingService, prisma);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
