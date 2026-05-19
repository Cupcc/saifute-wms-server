import { Prisma } from "../../../../generated/prisma/client";
import {
  buildSqlWhere,
  naturalCodeOrderBySql,
  orderByIds,
} from "../../../shared/prisma/natural-code-ordering";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

const PERSONNEL_WITH_WORKSHOP_INCLUDE = {
  workshop: {
    select: {
      id: true,
      workshopName: true,
    },
  },
} as const satisfies Prisma.PersonnelInclude;

type PersonnelIdentityParams = {
  contactPhone: string | null;
  excludeId?: number;
  personnelName: string;
  workshopId: number | null;
};

type FindCustomersParams = {
  keyword?: string;
  limit: number;
  offset: number;
  status?: Prisma.CustomerWhereInput["status"];
};

export class MasterDataPartyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findCustomers(params: FindCustomersParams) {
    const where: Prisma.CustomerWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { customerCode: { contains: params.keyword } },
        { customerName: { contains: params.keyword } },
        { contactPerson: { contains: params.keyword } },
        { contactPhone: { contains: params.keyword } },
        { address: { contains: params.keyword } },
      ];
    }

    const [sortedIdRows, total] = await Promise.all([
      this.findCustomerIdsByNaturalCode(params),
      this.prisma.customer.count({ where }),
    ]);
    const sortedIds = sortedIdRows.map((row) => Number(row.id));
    if (sortedIds.length === 0) {
      return { items: [], total };
    }

    const items = await this.prisma.customer.findMany({
      where: { id: { in: sortedIds } },
    });

    return { items: orderByIds(items, sortedIds), total };
  }

  private findCustomerIdsByNaturalCode(params: FindCustomersParams) {
    return this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM customer
      ${this.buildCustomerListWhereSql(params)}
      ORDER BY ${naturalCodeOrderBySql(Prisma.sql`customer_code`)}
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `);
  }

  private buildCustomerListWhereSql(params: FindCustomersParams): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (params.status) {
      conditions.push(Prisma.sql`status = ${params.status}`);
    }
    if (params.keyword) {
      const keyword = `%${params.keyword}%`;
      conditions.push(Prisma.sql`(
        customer_code LIKE ${keyword}
        OR customer_name LIKE ${keyword}
        OR contact_person LIKE ${keyword}
        OR contact_phone LIKE ${keyword}
        OR address LIKE ${keyword}
      )`);
    }

    return buildSqlWhere(conditions);
  }

  async findCustomerById(id: number) {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  async findCustomerByCode(customerCode: string) {
    return this.prisma.customer.findUnique({
      where: { customerCode },
    });
  }

  async createCustomer(
    data: Pick<
      Prisma.CustomerUncheckedCreateInput,
      | "customerCode"
      | "customerName"
      | "contactPerson"
      | "contactPhone"
      | "address"
      | "parentId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.customer.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "MANUAL",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async createAutoCustomer(
    data: Pick<
      Prisma.CustomerUncheckedCreateInput,
      | "customerCode"
      | "customerName"
      | "parentId"
      | "sourceDocumentType"
      | "sourceDocumentId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.customer.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateCustomer(
    id: number,
    data: Prisma.CustomerUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.customer.update({
      where: { id },
      data: { ...data, updatedBy },
    });
  }

  async countActiveChildCustomers(parentId: number) {
    return this.prisma.customer.count({
      where: { parentId, status: "ACTIVE" },
    });
  }

  async findSupplierById(id: number) {
    return this.prisma.supplier.findUnique({
      where: { id },
    });
  }

  async findSupplierByCode(supplierCode: string, db?: DbClient) {
    return this.db(db).supplier.findUnique({
      where: { supplierCode },
    });
  }

  async findSuppliers(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.SupplierWhereInput["status"];
  }) {
    const where: Prisma.SupplierWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.keyword) {
      where.OR = [
        { supplierCode: { contains: params.keyword } },
        { supplierName: { contains: params.keyword } },
        { contactPerson: { contains: params.keyword } },
        { contactPhone: { contains: params.keyword } },
        { address: { contains: params.keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { supplierCode: "asc" },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, total };
  }

  async createSupplier(
    data: Pick<
      Prisma.SupplierUncheckedCreateInput,
      | "supplierCode"
      | "supplierName"
      | "contactPerson"
      | "contactPhone"
      | "address"
    >,
    createdBy?: string,
  ) {
    return this.prisma.supplier.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "MANUAL",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async createAutoSupplier(
    data: Pick<
      Prisma.SupplierUncheckedCreateInput,
      | "supplierCode"
      | "supplierName"
      | "sourceDocumentType"
      | "sourceDocumentId"
    >,
    createdBy?: string,
    db?: DbClient,
  ) {
    return this.db(db).supplier.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        createdBy,
        updatedBy: createdBy,
      },
    });
  }

  async updateSupplier(
    id: number,
    data: Prisma.SupplierUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...data,
        updatedBy,
      },
    });
  }

  async findPersonnel(params: {
    keyword?: string;
    limit: number;
    offset: number;
    status?: Prisma.PersonnelWhereInput["status"];
    workshopId?: number;
  }) {
    const where: Prisma.PersonnelWhereInput = {};
    if (params.status) {
      where.status = params.status;
    }
    if (params.workshopId) {
      where.workshopId = params.workshopId;
    }
    if (params.keyword) {
      where.OR = [
        { personnelName: { contains: params.keyword } },
        { contactPhone: { contains: params.keyword } },
        {
          workshop: {
            is: {
              workshopName: {
                contains: params.keyword,
              },
            },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.personnel.findMany({
        where,
        include: PERSONNEL_WITH_WORKSHOP_INCLUDE,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ personnelName: "asc" }, { id: "asc" }],
      }),
      this.prisma.personnel.count({ where }),
    ]);

    return { items, total };
  }

  async findPersonnelById(id: number) {
    return this.prisma.personnel.findUnique({
      where: { id },
      include: PERSONNEL_WITH_WORKSHOP_INCLUDE,
    });
  }

  async findActivePersonnelByIdentity(params: PersonnelIdentityParams) {
    const where: Prisma.PersonnelWhereInput = {
      personnelName: params.personnelName,
      status: "ACTIVE",
      workshopId: params.workshopId,
    };

    if (params.contactPhone === null) {
      where.OR = [{ contactPhone: null }, { contactPhone: "" }];
    } else {
      where.contactPhone = params.contactPhone;
    }

    if (params.excludeId !== undefined) {
      where.id = { not: params.excludeId };
    }

    return this.prisma.personnel.findFirst({
      where,
      include: PERSONNEL_WITH_WORKSHOP_INCLUDE,
      orderBy: { id: "asc" },
    });
  }

  async createPersonnel(
    data: Pick<
      Prisma.PersonnelUncheckedCreateInput,
      "personnelName" | "contactPhone" | "workshopId"
    >,
    createdBy?: string,
  ) {
    return this.prisma.personnel.create({
      data: {
        ...data,
        status: "ACTIVE",
        createdBy,
        updatedBy: createdBy,
      },
      include: PERSONNEL_WITH_WORKSHOP_INCLUDE,
    });
  }

  async updatePersonnel(
    id: number,
    data: Prisma.PersonnelUncheckedUpdateInput,
    updatedBy?: string,
  ) {
    return this.prisma.personnel.update({
      where: { id },
      data: { ...data, updatedBy },
      include: PERSONNEL_WITH_WORKSHOP_INCLUDE,
    });
  }
}
