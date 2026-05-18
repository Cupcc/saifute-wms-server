import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class InboundAutoMaterialRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(db?: DbClient) {
    return db ?? this.prisma;
  }

  async findMaterialByCode(materialCode: string, db?: DbClient) {
    return this.db(db).material.findUnique({
      where: { materialCode },
      include: { category: true },
    });
  }

  async findMaxMaterialCodeSequence(prefix: string, db?: DbClient) {
    const rows = await this.db(db).$queryRaw<
      Array<{ maxSequence: bigint | null }>
    >`
      SELECT MAX(CAST(SUBSTRING(material_code, ${prefix.length + 1}) AS UNSIGNED)) AS maxSequence
      FROM material
      WHERE material_code REGEXP ${`^${prefix}[0-9]+$`}
    `;
    const value = rows[0]?.maxSequence;
    return value == null ? 0 : Number(value);
  }

  async createAutoMaterial(
    data: Pick<
      Prisma.MaterialUncheckedCreateInput,
      | "materialCode"
      | "materialName"
      | "unitCode"
      | "specModel"
      | "categoryId"
      | "sourceDocumentType"
      | "sourceDocumentId"
    >,
    createdBy?: string,
    db?: DbClient,
  ) {
    return this.db(db).material.create({
      data: {
        ...data,
        status: "ACTIVE",
        creationMode: "AUTO_CREATED",
        createdBy,
        updatedBy: createdBy,
      },
      include: { category: true },
    });
  }

  async updateMaterialSourceDocumentId(
    materialId: number,
    sourceDocumentId: number,
    updatedBy?: string,
    db?: DbClient,
  ) {
    return this.db(db).material.update({
      where: { id: materialId },
      data: {
        sourceDocumentId,
        updatedBy,
      },
    });
  }
}
