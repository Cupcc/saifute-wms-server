import { Module } from "@nestjs/common";
import { RbacService } from "./application/rbac.service";
import { RbacController } from "./controllers/rbac.controller";
import { InMemoryRbacRepository } from "./infrastructure/in-memory-rbac.repository";

@Module({
  controllers: [RbacController],
  providers: [RbacService, InMemoryRbacRepository],
  exports: [RbacService],
})
export class RbacModule {}
