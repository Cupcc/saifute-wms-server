import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { AuditLog } from "../../audit-log/decorators/audit-log.decorator";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RdProcurementDemandService } from "../application/rd-procurement-demand.service";
import { CreateRdProcurementDemandDto } from "../dto/create-rd-procurement-demand.dto";
import { QueryRdProcurementDemandDto } from "../dto/query-rd-procurement-demand.dto";
import { UpdateRdProcurementDemandDto } from "../dto/update-rd-procurement-demand.dto";

@Controller("rd-subwarehouse/procurement-demand")
export class RdProcurementDemandController {
  constructor(private readonly service: RdProcurementDemandService) {}

  @Permissions("rd:procurement-demand:list")
  @Get()
  list(@Query() query: QueryRdProcurementDemandDto) {
    return this.service.list(query);
  }

  @Permissions("rd:procurement-demand:list")
  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.service.get(id);
  }

  @Permissions("rd:procurement-demand:create")
  @Post()
  @AuditLog({
    title: "新增研发采购需求",
    action: "CREATE_RD_PROCUREMENT_DEMAND",
  })
  create(
    @Body() dto: CreateRdProcurementDemandDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.service.create(dto, this.requireUser(user));
  }

  @Permissions("rd:procurement-demand:update")
  @Patch(":id")
  @AuditLog({
    title: "修改研发采购需求",
    action: "UPDATE_RD_PROCUREMENT_DEMAND",
  })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateRdProcurementDemandDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.service.update(id, dto, this.requireUser(user));
  }

  @Permissions("rd:procurement-demand:delete")
  @Delete(":id")
  @AuditLog({
    title: "删除研发采购需求",
    action: "DELETE_RD_PROCUREMENT_DEMAND",
  })
  remove(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.service.remove(id, this.requireUser(user));
  }

  private requireUser(user?: SessionUserSnapshot) {
    if (!user) throw new ForbiddenException("当前会话无效");
    return user;
  }
}
