import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../../../shared/decorators/current-user.decorator";
import type { SessionUserSnapshot } from "../../session/domain/user-session";
import { RbacService } from "../application/rbac.service";

@Controller("rbac")
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get("routes/current")
  async getCurrentRoutes(@CurrentUser() user: SessionUserSnapshot) {
    return this.rbacService.getRoutesForUser(user.userId);
  }
}
