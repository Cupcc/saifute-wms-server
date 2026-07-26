import { Module } from "@nestjs/common";
import { RdProjectLookupService } from "./application/rd-project-lookup.service";
import { RdProjectBomCatalogRepository } from "./infrastructure/rd-project-bom-catalog.repository";
import { RdProjectPersistenceService } from "./infrastructure/rd-project-persistence.service";

@Module({
  providers: [
    RdProjectLookupService,
    RdProjectBomCatalogRepository,
    RdProjectPersistenceService,
  ],
  exports: [RdProjectLookupService, RdProjectPersistenceService],
})
export class RdProjectSharedModule {}
