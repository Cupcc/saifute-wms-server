import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { ProjectService } from "../application/project.service";
import { CreateProjectDto } from "../dto/create-project.dto";
import { QueryProjectDto } from "../dto/query-project.dto";
import { UpdateProjectDto } from "../dto/update-project.dto";
import { VoidProjectDto } from "../dto/void-project.dto";

@Controller("projects")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Permissions("project:list")
  @Get()
  async listProjects(@Query() query: QueryProjectDto) {
    return this.projectService.listProjects(query);
  }

  @Permissions("project:get")
  @Get(":id")
  async getProject(@Param("id", ParseIntPipe) id: number) {
    return this.projectService.getProjectById(id);
  }

  @Permissions("project:create")
  @Post()
  async createProject(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.projectService.createProject(dto, user?.userId?.toString());
  }

  @Permissions("project:update")
  @Patch(":id")
  async updateProject(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.projectService.updateProject(id, dto, user?.userId?.toString());
  }

  @Permissions("project:void")
  @Post(":id/void")
  async voidProject(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidProjectDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.projectService.voidProject(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("project:get")
  @Get(":id/materials")
  async listMaterials(@Param("id", ParseIntPipe) id: number) {
    return this.projectService.listMaterials(id);
  }
}
