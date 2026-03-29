import {
  Body,
  Controller,
  ForbiddenException,
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
import { ApplyRdProcurementStatusActionDto } from "../dto/apply-rd-procurement-status-action.dto";
import { CreateRdProcurementRequestDto } from "../dto/create-rd-procurement-request.dto";
import { QueryRdProcurementRequestDto } from "../dto/query-rd-procurement-request.dto";
import { VoidRdProcurementRequestDto } from "../dto/void-rd-procurement-request.dto";

const RD_PROCUREMENT_REQUEST_STATUS_ACTION_PERMISSION =
  "rd:procurement-request:status-action";
const RD_PROCUREMENT_REQUEST_RETURN_ACTION_PERMISSION =
  "rd:procurement-request:return-action";

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

  @Permissions("rd:procurement-request:list")
  @AuditLog({
    title: "执行 RD 采购状态动作",
    action: "APPLY_RD_PROCUREMENT_STATUS_ACTION",
  })
  @Post(":id/status-actions")
  async applyStatusAction(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ApplyRdProcurementStatusActionDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const request = await this.rdProcurementRequestService.getRequestById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      request.workshopId,
    );
    this.assertStatusActionPermission(user, dto.actionType);
    return this.rdProcurementRequestService.applyStatusAction(
      id,
      dto,
      user?.userId?.toString(),
    );
  }

  private assertStatusActionPermission(
    user: SessionUserSnapshot | undefined,
    actionType: ApplyRdProcurementStatusActionDto["actionType"],
  ) {
    if (user?.userId === 1) {
      return;
    }
    const requiredPermission =
      actionType === "MANUAL_RETURNED"
        ? RD_PROCUREMENT_REQUEST_RETURN_ACTION_PERMISSION
        : RD_PROCUREMENT_REQUEST_STATUS_ACTION_PERMISSION;
    if (!user?.permissions?.includes(requiredPermission)) {
      throw new ForbiddenException("当前用户缺少所需状态动作权限");
    }
  }
}
