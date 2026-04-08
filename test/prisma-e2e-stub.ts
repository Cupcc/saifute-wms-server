/**
 * Stub PrismaService for e2e tests that do not require a database.
 * Batch A (auth/session/rbac) e2e tests use in-memory repositories and do not hit Prisma.
 * This stub allows the app to bootstrap without a real database connection.
 */
import { Injectable } from "@nestjs/common";

function createModelStub() {
  return {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    findFirst: () => Promise.resolve(null),
    create: () => Promise.resolve({}),
    update: () => Promise.resolve({}),
    upsert: () => Promise.resolve({}),
    delete: () => Promise.resolve({}),
    count: () => Promise.resolve(0),
    aggregate: () => Promise.resolve({ _sum: {} }),
    createMany: () => Promise.resolve({ count: 0 }),
    updateMany: () => Promise.resolve({ count: 0 }),
    deleteMany: () => Promise.resolve({ count: 0 }),
  };
}

type MemoryRecord = { id: number; [key: string]: unknown };

function matchesWhere(
  item: MemoryRecord,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!where) {
    return true;
  }

  if (
    Array.isArray(where.OR) &&
    where.OR.length > 0 &&
    !where.OR.some((entry) =>
      matchesWhere(item, entry as Record<string, unknown>),
    )
  ) {
    return false;
  }

  if (
    Array.isArray(where.AND) &&
    where.AND.length > 0 &&
    !where.AND.every((entry) =>
      matchesWhere(item, entry as Record<string, unknown>),
    )
  ) {
    return false;
  }

  return Object.entries(where).every(([key, expected]) => {
    if (typeof expected === "undefined" || key === "OR" || key === "AND") {
      return true;
    }

    const actual = item[key];
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected) &&
      !(expected instanceof Date)
    ) {
      if ("in" in expected && Array.isArray(expected.in)) {
        return expected.in.includes(actual as never);
      }

      if ("not" in expected) {
        return actual !== expected.not;
      }

      if ("contains" in expected) {
        const needle = expected.contains;
        return typeof actual === "string" && actual.includes(String(needle));
      }

      return matchesWhere({ id: item.id, value: actual }, {
        value: expected,
      } as Record<string, unknown>);
    }

    return actual === expected;
  });
}

function compareByOrder(
  left: MemoryRecord,
  right: MemoryRecord,
  orderBy:
    | Record<string, "asc" | "desc">
    | Array<Record<string, "asc" | "desc">>
    | undefined,
): number {
  const normalized = Array.isArray(orderBy)
    ? orderBy
    : orderBy
      ? [orderBy]
      : [];

  for (const entry of normalized) {
    const [field, direction] = Object.entries(entry)[0] ?? [];
    if (!field || !direction) {
      continue;
    }

    const leftValue = left[field];
    const rightValue = right[field];
    const leftComparable =
      leftValue instanceof Date ? leftValue.getTime() : leftValue;
    const rightComparable =
      rightValue instanceof Date ? rightValue.getTime() : rightValue;

    if (leftComparable === rightComparable) {
      continue;
    }

    if (
      typeof leftComparable === "number" &&
      typeof rightComparable === "number"
    ) {
      if (direction === "asc") {
        return leftComparable > rightComparable ? 1 : -1;
      }

      return leftComparable < rightComparable ? 1 : -1;
    }

    const leftText = String(leftComparable ?? "");
    const rightText = String(rightComparable ?? "");
    if (direction === "asc") {
      return leftText.localeCompare(rightText);
    }

    return rightText.localeCompare(leftText);
  }

  return right.id - left.id;
}

function createMemoryModel<T extends MemoryRecord>() {
  const items: T[] = [];
  let nextId = 1;

  return {
    findMany: async ({
      where,
      take,
      skip,
      orderBy,
    }: {
      where?: Record<string, unknown>;
      take?: number;
      skip?: number;
      orderBy?:
        | Record<string, "asc" | "desc">
        | Array<Record<string, "asc" | "desc">>;
    } = {}) => {
      const filtered = items
        .filter((item) => matchesWhere(item, where))
        .sort((left, right) => compareByOrder(left, right, orderBy));
      const offset = skip ?? 0;
      const limit = typeof take === "number" ? offset + take : undefined;
      return filtered.slice(offset, limit);
    },
    findUnique: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      items.find((item) => matchesWhere(item, where)) ?? null,
    findFirst: async ({
      where,
      orderBy,
    }: {
      where?: Record<string, unknown>;
      orderBy?:
        | Record<string, "asc" | "desc">
        | Array<Record<string, "asc" | "desc">>;
    } = {}) =>
      items
        .filter((item) => matchesWhere(item, where))
        .sort((left, right) => compareByOrder(left, right, orderBy))[0] ?? null,
    create: async ({ data }: { data: Omit<T, "id"> }) => {
      const created = { ...data, id: nextId++ } as T;
      items.push(created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: number };
      data: Partial<T>;
    }) => {
      const index = items.findIndex((item) => item.id === where.id);
      if (index < 0) {
        throw new Error(`Record not found: ${where.id}`);
      }
      items[index] = { ...items[index], ...data };
      return items[index];
    },
    upsert: async () => ({}),
    delete: async ({ where }: { where: { id: number } }) => {
      const index = items.findIndex((item) => item.id === where.id);
      if (index < 0) {
        throw new Error(`Record not found: ${where.id}`);
      }
      const [removed] = items.splice(index, 1);
      return removed;
    },
    count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      items.filter((item) => matchesWhere(item, where)).length,
    createMany: async ({ data }: { data: Array<Omit<T, "id">> }) => {
      for (const item of data) {
        items.push({ ...item, id: nextId++ } as T);
      }
      return { count: data.length };
    },
    updateMany: async () => ({ count: 0 }),
    deleteMany: async () => {
      const count = items.length;
      items.splice(0, items.length);
      return { count };
    },
  };
}

function createSeededWorkshopModel() {
  const model = createMemoryModel<{
    id: number;
    workshopCode: string;
    workshopName: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>();

  const now = new Date("2026-03-30T00:00:00.000Z");
  void model.createMany({
    data: [
      {
        workshopCode: "MAIN",
        workshopName: "主仓",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        workshopCode: "RD",
        workshopName: "研发小仓",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  return model;
}

function createSeededStockScopeModel() {
  const model = createMemoryModel<{
    id: number;
    scopeCode: string;
    scopeName: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>();

  const now = new Date("2026-03-30T00:00:00.000Z");
  void model.createMany({
    data: [
      {
        scopeCode: "MAIN",
        scopeName: "主仓",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        scopeCode: "RD_SUB",
        scopeName: "研发小仓",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  return model;
}

function createSupplierModel() {
  return createMemoryModel<{
    id: number;
    supplierCode: string;
    supplierName: string;
    status: string;
    creationMode?: string;
    sourceDocumentType?: string | null;
    sourceDocumentId?: number | null;
    createdBy?: string | null;
    updatedBy?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }>();
}

@Injectable()
export class PrismaE2eStub {
  material = createModelStub();
  materialCategory = createModelStub();
  customer = createModelStub();
  supplier = createSupplierModel();
  personnel = createModelStub();
  workshop = createSeededWorkshopModel();
  stockScope = createSeededStockScopeModel();
  inventoryBalance = createModelStub();
  inventoryLog = createModelStub();
  inventorySourceUsage = createModelStub();
  factoryNumberReservation = createModelStub();
  approvalDocument = createModelStub();
  stockInOrder = createModelStub();
  stockInOrderLine = createModelStub();
  customerStockOrder = createModelStub();
  customerStockOrderLine = createModelStub();
  workshopMaterialOrder = createModelStub();
  workshopMaterialOrderLine = createModelStub();
  project = createModelStub();
  projectMaterialLine = createModelStub();
  documentRelation = createModelStub();
  documentLineRelation = createModelStub();
  loginLog = createMemoryModel<{
    id: number;
    username?: string | null;
    userId?: number | null;
    sessionId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    result: string;
    reason?: string | null;
    message?: string | null;
    occurredAt: Date;
  }>();
  operLog = createMemoryModel<{
    id: number;
    title: string;
    businessType: string;
    method?: string | null;
    requestMethod?: string | null;
    requestUrl?: string | null;
    operatorId?: number | null;
    operatorName?: string | null;
    departmentName?: string | null;
    operatorIp?: string | null;
    userAgent?: string | null;
    requestParams?: string | null;
    responseBody?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
    status: string;
    occurredAt: Date;
  }>();
  schedulerJob = createMemoryModel<{
    id: number;
    jobName: string;
    invokeTarget: string;
    cronExpression: string;
    status: string;
    concurrencyPolicy: string;
    misfirePolicy: string;
    remark?: string | null;
    lastRunAt?: Date | null;
    createdBy?: string | null;
    createdAt: Date;
    updatedBy?: string | null;
    updatedAt: Date;
  }>();
  schedulerJobLog = createMemoryModel<{
    id: number;
    jobId?: number | null;
    jobName: string;
    invokeTarget: string;
    status: string;
    message?: string | null;
    errorMessage?: string | null;
    durationMs: number;
    startedAt: Date;
    finishedAt: Date;
    createdAt: Date;
  }>();

  sysDept = createModelStub();
  sysPost = createModelStub();
  sysMenu = createModelStub();
  sysRole = createModelStub();
  sysUser = createModelStub();
  sysDictType = createModelStub();
  sysDictData = createModelStub();
  sysConfig = createModelStub();
  sysNotice = createModelStub();
  sysUserRole = createModelStub();
  sysUserPost = createModelStub();
  sysRoleMenu = createModelStub();
  sysRoleDept = createModelStub();

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
  async $transaction<R>(handler: (tx: unknown) => Promise<R>): Promise<R> {
    return handler(this);
  }

  async runInTransaction<R>(handler: (tx: unknown) => Promise<R>): Promise<R> {
    return handler(this);
  }
}
