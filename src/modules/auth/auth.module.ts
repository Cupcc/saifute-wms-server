import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { SessionModule } from "../session/session.module";
import { AuthService } from "./application/auth.service";
import { AuthController } from "./controllers/auth.controller";
import { AuthStateRepository } from "./infrastructure/auth-state.repository";

@Module({
  imports: [RbacModule, SessionModule],
  controllers: [AuthController],
  providers: [AuthService, AuthStateRepository],
})
export class AuthModule {}
