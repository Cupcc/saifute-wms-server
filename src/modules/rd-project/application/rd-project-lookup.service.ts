import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DocumentLifecycleStatus,
  type Prisma,
} from "../../../../generated/prisma/client";
import type { StockScopeCode } from "../../session/domain/user-session";
import { RdProjectBomCatalogRepository } from "../infrastructure/rd-project-bom-catalog.repository";
import { RdProjectPersistenceService } from "../infrastructure/rd-project-persistence.service";
import { ensureProjectTarget } from "./rd-project.shared";

type RdProjectRecord = NonNullable<
  Awaited<ReturnType<RdProjectPersistenceService["findProjectById"]>>
>;

type RdProjectCodeRecord = NonNullable<
  Awaited<ReturnType<RdProjectPersistenceService["findProjectByCode"]>>
>;

@Injectable()
export class RdProjectLookupService {
  constructor(
    private readonly repository: RdProjectPersistenceService,
    private readonly bomCatalogRepository: RdProjectBomCatalogRepository,
  ) {}

  async listEffectiveProjects(params: {
    workshopId?: number;
    stockScope?: StockScopeCode;
    limit: number;
    offset: number;
  }) {
    return this.repository.findProjects(params);
  }

  async requireEffectiveProjectById(
    rdProjectId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<RdProjectRecord> {
    const project = await this.repository.findProjectById(rdProjectId, tx);
    if (!project) {
      throw new BadRequestException(`研发项目不存在: ${rdProjectId}`);
    }
    if (project.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException(`研发项目已失效: ${project.projectCode}`);
    }
    return project;
  }

  async requireEffectiveProjectByCode(
    projectCode: string,
  ): Promise<RdProjectCodeRecord> {
    const project = await this.repository.findProjectByCode(projectCode);
    if (!project) {
      throw new BadRequestException(
        `RD 采购需求项目编码未映射到研发项目: ${projectCode}`,
      );
    }
    if (project.lifecycleStatus !== DocumentLifecycleStatus.EFFECTIVE) {
      throw new BadRequestException(`研发项目已失效: ${projectCode}`);
    }
    return project;
  }

  async listEffectiveBomMaterialSuggestions(params: {
    currentProjectCode: string;
    keyword?: string;
    limit: number;
    offset: number;
  }) {
    await this.requireEffectiveProjectByCode(params.currentProjectCode);
    return this.bomCatalogRepository.findSuggestions(params);
  }

  async assertMaterialInEffectiveBomCatalog(materialId: number) {
    const material =
      await this.bomCatalogRepository.findCatalogMaterial(materialId);
    if (!material) {
      throw new BadRequestException(
        `所选物料不属于任何有效研发项目 BOM: ${materialId}`,
      );
    }
    return material;
  }

  ensureProjectTarget(params: {
    project: RdProjectRecord;
    updatedBy?: string;
    tx: Prisma.TransactionClient;
  }) {
    return ensureProjectTarget({
      ...params,
      repository: this.repository,
    });
  }
}
