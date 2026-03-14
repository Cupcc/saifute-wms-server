import { Controller, Delete, Get, Param } from "@nestjs/common";
import { Permissions } from "../../../shared/decorators/permissions.decorator";
import { SessionService } from "../application/session.service";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionService: SessionService) {}

  @Get("online")
  @Permissions("monitor:online:list")
  async listOnlineSessions() {
    const items = await this.sessionService.listOnlineSessions();
    return {
      items,
      total: items.length,
    };
  }

  @Delete(":sessionId")
  @Permissions("monitor:online:forceLogout")
  async forceLogout(@Param("sessionId") sessionId: string) {
    return this.sessionService.invalidateSession(sessionId);
  }
}
