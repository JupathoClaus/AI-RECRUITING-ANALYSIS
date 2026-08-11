import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedPrincipal } from '../interfaces/auth.interface';

export const TENANT_ACCESS_KEY = 'tenantAccess';

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireTenant = this.reflector.getAllAndOverride<boolean>(TENANT_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requireTenant) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedPrincipal = request.user;
    if (!user) throw new ForbiddenException('No authenticated user');

    if (!user.activeCompanyId || !user.membershipId) {
      throw new ForbiddenException('No active company context');
    }

    return true;
  }
}
