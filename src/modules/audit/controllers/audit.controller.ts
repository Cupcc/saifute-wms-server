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
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { AuditService } from "../application/audit.service";
import { CreateAuditDocumentDto } from "../dto/create-audit-document.dto";
import { QueryAuditStatusDto } from "../dto/query-audit-status.dto";
import { QueryAuditsDto } from "../dto/query-audits.dto";
import { RejectAuditDto } from "../dto/reject-audit.dto";

@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Permissions("audit:document:status")
  @Get("documents/status")
  async getAuditStatus(@Query() query: QueryAuditStatusDto) {
    return this.auditService.getAuditStatus(
      query.documentType,
      query.documentId,
    );
  }

  @Permissions("audit:document:status")
  @Get("documents/detail")
  async getAuditDocument(@Query() query: QueryAuditStatusDto) {
    return this.auditService.getAuditDocument(
      query.documentType,
      query.documentId,
    );
  }

  @Permissions("audit:document:list")
  @Get("documents")
  async listAudits(@Query() query: QueryAuditsDto) {
    return this.auditService.listAudits({
      documentFamily: query.documentFamily,
      auditStatus: query.auditStatus,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Permissions("audit:document:create")
  @Post("documents")
  async createAuditDocument(
    @Body() dto: CreateAuditDocumentDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.auditService.createOrRefreshAuditDocument({
      documentFamily: dto.documentFamily,
      documentType: dto.documentType,
      documentId: dto.documentId,
      documentNumber: dto.documentNumber,
      submittedBy: dto.submittedBy ?? user?.userId?.toString(),
      createdBy: user?.userId?.toString(),
    });
  }

  @Permissions("audit:document:approve")
  @Post("documents/:id/approve")
  async approve(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.auditService.approve(id, user?.userId?.toString());
  }

  @Permissions("audit:document:reject")
  @Post("documents/:id/reject")
  async reject(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RejectAuditDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.auditService.reject(
      id,
      dto.rejectReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("audit:document:reset")
  @Post("documents/:id/reset")
  async reset(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.auditService.reset(id, user?.userId?.toString());
  }
}
