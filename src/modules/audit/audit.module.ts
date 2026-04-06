import { Module } from "@nestjs/common";
import { AuditService } from "./application/audit.service";
import { AuditController } from "./controllers/audit.controller";
import { AuditRepository } from "./infrastructure/audit.repository";

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
