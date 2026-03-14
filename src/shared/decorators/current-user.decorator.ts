import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { SessionUserSnapshot } from "../../modules/session/domain/user-session";

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUserSnapshot | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: SessionUserSnapshot }>();
    return request.user;
  },
);
