import { Module } from "@nestjs/common";
import { RdProjectLookupService } from "./application/rd-project-lookup.service";
import { RdProjectPersistenceService } from "./infrastructure/rd-project-persistence.service";

@Module({
  providers: [RdProjectLookupService, RdProjectPersistenceService],
  exports: [RdProjectLookupService, RdProjectPersistenceService],
})
export class RdProjectSharedModule {}
