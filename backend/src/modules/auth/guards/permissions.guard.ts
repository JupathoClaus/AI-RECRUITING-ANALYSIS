import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedPrincipal } from '../interfaces/auth.interface';

export const PERMISSIONS_KEY = 'permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedPrincipal = request.user;
    if (!user) throw new ForbiddenException('No authenticated user');

    const hasPermission = requiredPermissions.every((p) => user.permissions.includes(p));
    if (!hasPermission) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
