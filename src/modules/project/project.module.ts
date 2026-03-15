import { Module } from "@nestjs/common";
import { InventoryCoreModule } from "../inventory-core/inventory-core.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { ProjectService } from "./application/project.service";
import { ProjectController } from "./controllers/project.controller";
import { ProjectRepository } from "./infrastructure/project.repository";

@Module({
  imports: [MasterDataModule, InventoryCoreModule],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectRepository],
  exports: [ProjectService],
})
export class ProjectModule {}
