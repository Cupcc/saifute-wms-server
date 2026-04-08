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
import { ApprovalService } from "../application/approval.service";
import { CreateApprovalDocumentDto } from "../dto/create-approval-document.dto";
import { QueryApprovalStatusDto } from "../dto/query-approval-status.dto";
import { QueryApprovalsDto } from "../dto/query-approvals.dto";
import { RejectApprovalDto } from "../dto/reject-approval.dto";

@Controller("approval")
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Permissions("approval:document:status")
  @Get("documents/status")
  async getApprovalStatus(@Query() query: QueryApprovalStatusDto) {
    return this.approvalService.getApprovalStatus(
      query.documentType,
      query.documentId,
    );
  }

  @Permissions("approval:document:status")
  @Get("documents/detail")
  async getApprovalDocument(@Query() query: QueryApprovalStatusDto) {
    return this.approvalService.getApprovalDocument(
      query.documentType,
      query.documentId,
    );
  }

  @Permissions("approval:document:list")
  @Get("documents")
  async listApprovals(@Query() query: QueryApprovalsDto) {
    return this.approvalService.listApprovals({
      documentFamily: query.documentFamily,
      auditStatus: query.auditStatus,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Permissions("approval:document:create")
  @Post("documents")
  async createApprovalDocument(
    @Body() dto: CreateApprovalDocumentDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.approvalService.createOrRefreshApprovalDocument({
      documentFamily: dto.documentFamily,
      documentType: dto.documentType,
      documentId: dto.documentId,
      documentNumber: dto.documentNumber,
      submittedBy: dto.submittedBy ?? user?.userId?.toString(),
      createdBy: user?.userId?.toString(),
    });
  }

  @Permissions("approval:document:approve")
  @Post("documents/:id/approve")
  async approve(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.approvalService.approve(id, user?.userId?.toString());
  }

  @Permissions("approval:document:reject")
  @Post("documents/:id/reject")
  async reject(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RejectApprovalDto,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.approvalService.reject(
      id,
      dto.rejectReason,
      user?.userId?.toString(),
    );
  }

  @Permissions("approval:document:reset")
  @Post("documents/:id/reset")
  async reset(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user?: SessionUserSnapshot,
  ) {
    return this.approvalService.reset(id, user?.userId?.toString());
  }
}
