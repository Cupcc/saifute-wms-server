import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../../generated/prisma/client";
import type { CreateSalesProjectDto } from "../dto/create-sales-project.dto";
import type { CreateSalesProjectOutboundDraftDto } from "../dto/create-sales-project-outbound-draft.dto";
import type { QuerySalesProjectDto } from "../dto/query-sales-project.dto";
import type { UpdateSalesProjectDto } from "../dto/update-sales-project.dto";
import { SalesProjectLifecycleService } from "./sales-project-lifecycle.service";
import { SalesProjectMaterialViewService } from "./sales-project-material-view.service";
import { SalesProjectOutboundDraftService } from "./sales-project-outbound-draft.service";
import { SalesProjectReferenceService } from "./sales-project-reference.service";

export { type SalesProjectBindingReference } from "./sales-project-reference.service";

@Injectable()
export class SalesProjectService {
  constructor(
    private readonly lifecycle: SalesProjectLifecycleService,
    private readonly materialView: SalesProjectMaterialViewService,
    private readonly outboundDraft: SalesProjectOutboundDraftService,
    private readonly reference: SalesProjectReferenceService,
  ) {}

  listProjects(query: QuerySalesProjectDto) {
    return this.lifecycle.listProjects(query);
  }

  getProjectById(id: number) {
    return this.lifecycle.getProjectById(id);
  }

  createProject(dto: CreateSalesProjectDto, createdBy?: string) {
    return this.lifecycle.createProject(dto, createdBy);
  }

  updateProject(id: number, dto: UpdateSalesProjectDto, updatedBy?: string) {
    return this.lifecycle.updateProject(id, dto, updatedBy);
  }

  voidProject(id: number, voidReason?: string, voidedBy?: string) {
    return this.lifecycle.voidProject(id, voidReason, voidedBy);
  }

  listMaterials(projectId: number) {
    return this.materialView.getProjectView(projectId);
  }

  createSalesOutboundDraft(
    projectId: number,
    dto: CreateSalesProjectOutboundDraftDto,
  ) {
    return this.outboundDraft.createSalesOutboundDraft(projectId, dto);
  }

  getProjectReferenceById(
    projectId: number,
    options?: { allowVoided?: boolean },
    tx?: Prisma.TransactionClient,
  ) {
    return this.reference.getProjectReferenceById(projectId, options, tx);
  }

  listProjectReferencesByIds(
    projectIds: number[],
    options?: { allowVoided?: boolean },
    tx?: Prisma.TransactionClient,
  ) {
    return this.reference.listProjectReferencesByIds(projectIds, options, tx);
  }
}
