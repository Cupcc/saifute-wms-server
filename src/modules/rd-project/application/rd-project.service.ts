import { Injectable } from "@nestjs/common";
import { type StockScopeCode } from "../../session/domain/user-session";
import type { CreateRdProjectDto } from "../dto/create-rd-project.dto";
import type { CreateRdProjectMaterialActionDto } from "../dto/create-rd-project-material-action.dto";
import type { QueryRdProjectDto } from "../dto/query-rd-project.dto";
import type { UpdateRdProjectDto } from "../dto/update-rd-project.dto";
import { RdProjectMasterService } from "./rd-project-master.service";
import { RdProjectMaterialActionService } from "./rd-project-material-action.service";

@Injectable()
export class RdProjectService {
  constructor(
    private readonly masterService: RdProjectMasterService,
    private readonly materialActionService: RdProjectMaterialActionService,
  ) {}

  listProjects(query: QueryRdProjectDto & { stockScope?: StockScopeCode }) {
    return this.masterService.listProjects(query);
  }

  getProjectById(id: number) {
    return this.masterService.getProjectById(id);
  }

  createProject(dto: CreateRdProjectDto, createdBy?: string) {
    return this.masterService.createProject(dto, createdBy);
  }

  updateProject(id: number, dto: UpdateRdProjectDto, updatedBy?: string) {
    return this.masterService.updateProject(id, dto, updatedBy);
  }

  voidProject(id: number, voidReason?: string, voidedBy?: string) {
    return this.masterService.voidProject(id, voidReason, voidedBy);
  }

  listMaterials(projectId: number) {
    return this.masterService.listMaterials(projectId);
  }

  listMaterialActions(projectId: number, _query?: unknown) {
    return this.materialActionService.listMaterialActions(projectId);
  }

  getMaterialActionById(actionId: number) {
    return this.materialActionService.getMaterialActionById(actionId);
  }

  createMaterialAction(
    projectId: number,
    dto: CreateRdProjectMaterialActionDto,
    createdBy?: string,
  ) {
    return this.materialActionService.createMaterialAction(
      projectId,
      dto,
      createdBy,
    );
  }

  voidMaterialAction(actionId: number, voidedBy?: string) {
    return this.materialActionService.voidMaterialAction(actionId, voidedBy);
  }
}
