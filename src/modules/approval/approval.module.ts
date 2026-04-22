import { Module } from "@nestjs/common";
import { ApprovalService } from "./application/approval.service";
import { ApprovalController } from "./controllers/approval.controller";
import { ApprovalRepository } from "./infrastructure/approval.repository";

@Module({
  controllers: [ApprovalController],
  providers: [ApprovalService, ApprovalRepository],
  exports: [ApprovalService],
})
export class ApprovalModule {}
