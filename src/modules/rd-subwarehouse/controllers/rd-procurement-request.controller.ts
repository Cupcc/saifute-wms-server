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
import { RdMaterialStatusEventType } from "../../../../generated/prisma/client";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { AuditLog } from "../../audit-log/decorators/audit-log.decorator";
import { WorkshopScopeService } from "../../rbac/application/workshop-scope.service";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RdProcurementItemService } from "../application/rd-procurement-item.service";
import { RdProcurementRequestService } from "../application/rd-procurement-request.service";
import { ApplyRdProcurementStatusActionDto } from "../dto/apply-rd-procurement-status-action.dto";
import { CreateRdProcurementRequestDto } from "../dto/create-rd-procurement-request.dto";
import {
  QueryRdAcceptanceMaterialOptionsDto,
  QueryRdProcurementMaterialSuggestionsDto,
} from "../dto/query-rd-procurement-material-options.dto";
import { QueryRdProcurementRequestDto } from "../dto/query-rd-procurement-request.dto";
import { ReverseRdProcurementStatusActionDto } from "../dto/reverse-rd-procurement-status-action.dto";
import { VoidRdProcurementRequestDto } from "../dto/void-rd-procurement-request.dto";

const RD_PROCUREMENT_REQUEST_STATUS_ACTION_PERMISSION =
  "rd:procurement-request:status-action";
const RD_PROCUREMENT_REQUEST_RETURN_ACTION_PERMISSION =
  "rd:procurement-request:return-action";

@Controller("rd-subwarehouse/procurement-requests")
export class RdProcurementRequestController {
  constructor(
    private readonly rdProcurementRequestService: RdProcurementRequestService,
    private readonly rdProcurementItemService: RdProcurementItemService,
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

  @Permissions("rd:procurement-request:create")
  @Get("material-suggestions")
  async listMaterialSuggestions(
    @Query() query: QueryRdProcurementMaterialSuggestionsDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const workshopId =
      await this.rdProcurementItemService.getSuggestionProjectWorkshopId(
        query.projectCode,
      );
    await this.workshopScopeService.assertWorkshopAccess(user, workshopId);
    return this.rdProcurementItemService.listMaterialSuggestions(query);
  }

  @Permissions(RD_PROCUREMENT_REQUEST_STATUS_ACTION_PERMISSION)
  @Get("acceptance-material-options")
  listAcceptanceMaterialOptions(
    @Query() query: QueryRdAcceptanceMaterialOptionsDto,
  ) {
    return this.rdProcurementItemService.listAcceptanceMaterialOptions(query);
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
    return this.rdProcurementRequestService.createRequest(dto, user?.username);
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
      user?.username,
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
      user?.username,
    );
  }

  @Permissions("rd:procurement-request:list")
  @AuditLog({
    title: "回滚 RD 采购状态动作",
    action: "REVERSE_RD_PROCUREMENT_STATUS_ACTION",
  })
  @Post(":id/status-actions/:historyId/reverse")
  async reverseStatusAction(
    @Param("id", ParseIntPipe) id: number,
    @Param("historyId", ParseIntPipe) historyId: number,
    @Body() dto: ReverseRdProcurementStatusActionDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    const request = await this.rdProcurementRequestService.getRequestById(id);
    await this.workshopScopeService.assertWorkshopAccess(
      user,
      request.workshopId,
    );
    const history =
      await this.rdProcurementRequestService.getStatusActionHistory(
        id,
        historyId,
      );
    this.assertManualActionPermission(
      user,
      history.eventType === RdMaterialStatusEventType.MANUAL_RETURNED,
    );
    return this.rdProcurementRequestService.reverseStatusAction(
      id,
      historyId,
      dto.reason,
      user?.username,
    );
  }

  private assertStatusActionPermission(
    user: SessionUserSnapshot | undefined,
    actionType: ApplyRdProcurementStatusActionDto["actionType"],
  ) {
    this.assertManualActionPermission(user, actionType === "MANUAL_RETURNED");
  }

  private assertManualActionPermission(
    user: SessionUserSnapshot | undefined,
    isReturnAction: boolean,
  ) {
    const requiredPermission = isReturnAction
      ? RD_PROCUREMENT_REQUEST_RETURN_ACTION_PERMISSION
      : RD_PROCUREMENT_REQUEST_STATUS_ACTION_PERMISSION;
    if (!user?.permissions?.includes(requiredPermission)) {
      throw new ForbiddenException("当前用户缺少所需状态动作权限");
    }
  }
}
