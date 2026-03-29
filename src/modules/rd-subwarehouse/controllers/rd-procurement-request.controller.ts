import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { AuditLog } from "../../audit-log/decorators/audit-log.decorator";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RdProcurementRequestService } from "../application/rd-procurement-request.service";
import { CreateRdProcurementRequestDto } from "../dto/create-rd-procurement-request.dto";
import { QueryRdProcurementRequestDto } from "../dto/query-rd-procurement-request.dto";
import { VoidRdProcurementRequestDto } from "../dto/void-rd-procurement-request.dto";

@Controller("rd-subwarehouse/procurement-requests")
export class RdProcurementRequestController {
  constructor(
    private readonly rdProcurementRequestService: RdProcurementRequestService,
    private readonly workshopScopeService: WorkshopScopeService,
  ) {}

  @Permissions("rd:procurement-request:list")
  @Get()
  async listRequests(
    @Query() query: QueryRdProcurementRequestDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const workshopId = await this.workshopScopeService.resolveQueryWorkshopId(
      user,
      query.workshopId,
    );
    return this.rdProcurementRequestService.listRequests({
      ...query,
      workshopId,
    });
  }

  @Permissions("rd:procurement-request:list")
  @Get(":id")
  async getRequest(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const request = await this.rdProcurementRequestService.getRequestById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      request.workshopId,
    );
    return request;
  }

  @Permissions("rd:procurement-request:create")
  @AuditLog({
    title: "新增 RD 采购需求",
    action: "CREATE_RD_PROCUREMENT_REQUEST",
  })
  @Post()
  async createRequest(
    @Body() dto: CreateRdProcurementRequestDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const scopedDto = await this.workshopScopeService.applyFixedWorkshopScope(
      user,
      dto,
    );
    return this.rdProcurementRequestService.createRequest(
      scopedDto,
      user?.userId?.toString(),
    );
  }

  @Permissions("rd:procurement-request:void")
  @AuditLog({
    title: "作废 RD 采购需求",
    action: "VOID_RD_PROCUREMENT_REQUEST",
  })
  @Post(":id/void")
  async voidRequest(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VoidRdProcurementRequestDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const request = await this.rdProcurementRequestService.getRequestById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      request.workshopId,
    );
    return this.rdProcurementRequestService.voidRequest(
      id,
      dto.voidReason,
      user?.userId?.toString(),
    );
  }
}
