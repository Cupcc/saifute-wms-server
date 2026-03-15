import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AppController } from "./app.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { InboundModule } from "./modules/inbound/inbound.module";
import { InventoryCoreModule } from "./modules/inventory-core/inventory-core.module";
import { MasterDataModule } from "./modules/master-data/master-data.module";
import { OutboundModule } from "./modules/outbound/outbound.module";
import { ProjectModule } from "./modules/project/project.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { SessionModule } from "./modules/session/session.module";
import { WorkflowModule } from "./modules/workflow/workflow.module";
import { WorkshopMaterialModule } from "./modules/workshop-material/workshop-material.module";
import { SharedConfigModule } from "./shared/config/shared-config.module";
import { JwtAuthGuard } from "./shared/guards/jwt-auth.guard";
import { PermissionsGuard } from "./shared/guards/permissions.guard";
import { PrismaModule } from "./shared/prisma/prisma.module";
import { RedisModule } from "./shared/redis/redis.module";

@Module({
  imports: [
    SharedConfigModule,
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    SessionModule,
    RbacModule,
    AuthModule,
    MasterDataModule,
    InventoryCoreModule,
    WorkflowModule,
    InboundModule,
    OutboundModule,
    WorkshopMaterialModule,
    ProjectModule,
  ],
  controllers: [AppController],
  providers: [
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
