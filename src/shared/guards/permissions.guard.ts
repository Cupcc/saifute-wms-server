import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { SessionUserSnapshot } from "../../modules/session/domain/user-session";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: SessionUserSnapshot }>();
    const currentUser = request.user;
    if (!currentUser) {
      throw new UnauthorizedException("当前请求未携带用户上下文");
    }

    if (currentUser.userId === 1) {
      return true;
    }

    const allowed = requiredPermissions.every((permission) =>
      currentUser.permissions.includes(permission),
    );

    if (!allowed) {
      throw new ForbiddenException("当前用户缺少所需权限");
    }

    return true;
  }
}
