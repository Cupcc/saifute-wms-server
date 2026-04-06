import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller";
import { AiAssistantModule } from "./modules/ai-assistant/ai-assistant.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuditLogModule } from "./modules/audit-log/audit-log.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CustomerModule } from "./modules/customer/customer.module";
import { FileStorageModule } from "./modules/file-storage/file-storage.module";
import { InboundModule } from "./modules/inbound/inbound.module";
import { InventoryCoreModule } from "./modules/inventory-core/inventory-core.module";
import { MasterDataModule } from "./modules/master-data/master-data.module";
import { ProjectModule } from "./modules/project/project.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { RdSubwarehouseModule } from "./modules/rd-subwarehouse/rd-subwarehouse.module";
import { ReportingModule } from "./modules/reporting/reporting.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { SessionModule } from "./modules/session/session.module";
import { WorkshopMaterialModule } from "./modules/workshop-material/workshop-material.module";
import { ResponseEnvelopeInterceptor } from "./shared/common/interceptors/response-envelope.interceptor";
import { SharedConfigModule } from "./shared/config/shared-config.module";
import { JwtAuthGuard } from "./shared/guards/jwt-auth.guard";
import { PermissionsGuard } from "./shared/guards/permissions.guard";
import { SharedLoggerModule } from "./shared/logger/shared-logger.module";
import { PrismaModule } from "./shared/prisma/prisma.module";
import { RedisModule } from "./shared/redis/redis.module";

@Module({
  imports: [
    SharedConfigModule,
    SharedLoggerModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuditLogModule,
    SessionModule,
    RbacModule,
    AuthModule,
    FileStorageModule,
    MasterDataModule,
    InventoryCoreModule,
    AuditModule,
    InboundModule,
    CustomerModule,
    WorkshopMaterialModule,
    ProjectModule,
    RdSubwarehouseModule,
    ReportingModule,
    SchedulerModule,
    AiAssistantModule,
  ],
  controllers: [AppController],
  providers: [
    ResponseEnvelopeInterceptor,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
