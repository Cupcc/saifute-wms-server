import { Module } from "@nestjs/common";
import { MasterDataModule } from "../master-data/master-data.module";
import { SessionModule } from "../session/session.module";
import { RbacService } from "./application/rbac.service";
import { SystemDictConfigService } from "./application/system-dict-config.service";
import { SystemManagementService } from "./application/system-management.service";
import { SystemResourceService } from "./application/system-resource.service";
import { SystemUserService } from "./application/system-user.service";
import { WorkshopScopeService } from "./application/workshop-scope.service";
import { SystemManagementBootstrapService } from "./bootstrap/system-management-bootstrap.service";
import { RbacController } from "./controllers/rbac.controller";
import { SystemConfigController } from "./controllers/system-config.controller";
import { SystemDeptController } from "./controllers/system-dept.controller";
import { SystemDictDataController } from "./controllers/system-dict-data.controller";
import { SystemDictTypeController } from "./controllers/system-dict-type.controller";
import { SystemMenuController } from "./controllers/system-menu.controller";
import { SystemNoticeController } from "./controllers/system-notice.controller";
import { SystemPostController } from "./controllers/system-post.controller";
import { SystemRoleController } from "./controllers/system-role.controller";
import { SystemUserController } from "./controllers/system-user.controller";
import { InMemoryRbacRepository } from "./infrastructure/in-memory-rbac.repository";
import { RbacDictConfigRepository } from "./infrastructure/rbac-dict-config.repository";
import { RbacPersistenceRepository } from "./infrastructure/rbac-persistence.repository";
import { RbacResourceRepository } from "./infrastructure/rbac-resource.repository";
import { RbacRoutesRepository } from "./infrastructure/rbac-routes.repository";
import { RbacSeedRepairRepository } from "./infrastructure/rbac-seed-repair.repository";
import { RbacState } from "./infrastructure/rbac-state";
import { RbacUserRepository } from "./infrastructure/rbac-user.repository";

@Module({
  imports: [MasterDataModule, SessionModule],
  controllers: [
    RbacController,
    SystemUserController,
    SystemRoleController,
    SystemMenuController,
    SystemDeptController,
    SystemPostController,
    SystemDictTypeController,
    SystemDictDataController,
    SystemConfigController,
    SystemNoticeController,
  ],
  providers: [
    RbacService,
    SystemManagementService,
    SystemUserService,
    SystemResourceService,
    SystemDictConfigService,
    WorkshopScopeService,
    SystemManagementBootstrapService,
    RbacState,
    RbacRoutesRepository,
    RbacUserRepository,
    RbacResourceRepository,
    RbacDictConfigRepository,
    RbacPersistenceRepository,
    RbacSeedRepairRepository,
    InMemoryRbacRepository,
  ],
  exports: [RbacService, SystemManagementService, WorkshopScopeService],
})
export class RbacModule {}
