import { Injectable } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma/client";
import { PrismaService } from "../../../shared/prisma/prisma.service";

@Injectable()
export class RdProjectBomCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSuggestions(params: {
    currentProjectCode: string;
    keyword?: string;
    limit: number;
    offset: number;
  }) {
    const keyword = params.keyword?.trim();
    const keywordPattern = keyword ? `%${keyword}%` : undefined;
    const keywordSql = keywordPattern
      ? Prisma.sql`AND (
          material.material_code LIKE ${keywordPattern}
          OR material.material_name LIKE ${keywordPattern}
          OR material.spec_model LIKE ${keywordPattern}
        )`
      : Prisma.empty;

    type SuggestionRow = {
      materialId: number;
      materialCode: string;
      materialName: string;
      specModel: string | null;
      unitCode: string;
      creationMode: string;
      sourceProjectId: number;
      sourceProjectCode: string;
      sourceProjectName: string;
      sourceBomLineId: number;
      referenceUnitPrice: Prisma.Decimal;
      manufacturer: string | null;
      productLink: string | null;
      currentProjectMatch: number | bigint;
      usageProjectCount: number | bigint;
    };

    const items = await this.prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
      WITH eligible_bom_lines AS (
        SELECT
          material.id AS materialId,
          material.material_code AS materialCode,
          material.material_name AS materialName,
          material.spec_model AS specModel,
          material.unit_code AS unitCode,
          material.creation_mode AS creationMode,
          project.id AS sourceProjectId,
          project.project_code AS sourceProjectCode,
          project.project_name AS sourceProjectName,
          bom_line.id AS sourceBomLineId,
          bom_line.unit_price AS referenceUnitPrice,
          bom_line.manufacturer AS manufacturer,
          bom_line.product_link AS productLink,
          CASE WHEN project.project_code = ${params.currentProjectCode}
            THEN 1 ELSE 0 END AS currentProjectMatch,
          ROW_NUMBER() OVER (
            PARTITION BY material.id
            ORDER BY
              CASE WHEN project.project_code = ${params.currentProjectCode}
                THEN 0 ELSE 1 END,
              project.project_code ASC,
              project.id ASC,
              bom_line.line_no ASC,
              bom_line.id ASC
          ) AS rowRank
        FROM rd_project_bom_line AS bom_line
        INNER JOIN rd_project AS project
          ON project.id = bom_line.project_id
          AND project.lifecycle_status = 'EFFECTIVE'
        INNER JOIN material AS material
          ON material.id = bom_line.material_id
          AND material.status = 'ACTIVE'
        WHERE 1 = 1
        ${keywordSql}
      ),
      usage_counts AS (
        SELECT materialId, COUNT(DISTINCT sourceProjectId) AS usageProjectCount
        FROM eligible_bom_lines
        GROUP BY materialId
      )
      SELECT
        eligible.materialId,
        eligible.materialCode,
        eligible.materialName,
        eligible.specModel,
        eligible.unitCode,
        eligible.creationMode,
        eligible.sourceProjectId,
        eligible.sourceProjectCode,
        eligible.sourceProjectName,
        eligible.sourceBomLineId,
        eligible.referenceUnitPrice,
        eligible.manufacturer,
        eligible.productLink,
        eligible.currentProjectMatch,
        usage_counts.usageProjectCount
      FROM eligible_bom_lines AS eligible
      INNER JOIN usage_counts ON usage_counts.materialId = eligible.materialId
      WHERE eligible.rowRank = 1
      ORDER BY
        eligible.currentProjectMatch DESC,
        eligible.materialCode ASC,
        eligible.materialId ASC
      LIMIT ${params.limit}
      OFFSET ${params.offset}
    `);

    const totals = await this.prisma.$queryRaw<
      Array<{ total: number | bigint }>
    >(Prisma.sql`
      SELECT COUNT(DISTINCT bom_line.material_id) AS total
      FROM rd_project_bom_line AS bom_line
      INNER JOIN rd_project AS project
        ON project.id = bom_line.project_id
        AND project.lifecycle_status = 'EFFECTIVE'
      INNER JOIN material AS material
        ON material.id = bom_line.material_id
        AND material.status = 'ACTIVE'
      WHERE 1 = 1
      ${keywordSql}
    `);

    return {
      items: items.map((item) => ({
        ...item,
        sourceScope:
          Number(item.currentProjectMatch) === 1
            ? ("CURRENT_PROJECT" as const)
            : ("OTHER_RD_PROJECT" as const),
        usageProjectCount: Number(item.usageProjectCount),
      })),
      total: Number(totals[0]?.total ?? 0),
    };
  }

  findCatalogMaterial(materialId: number) {
    return this.prisma.material.findFirst({
      where: {
        id: materialId,
        status: "ACTIVE",
        rdProjectBomLines: {
          some: { rdProject: { lifecycleStatus: "EFFECTIVE" } },
        },
      },
      select: {
        id: true,
        materialCode: true,
        materialName: true,
        specModel: true,
        unitCode: true,
        creationMode: true,
      },
    });
  }
}
