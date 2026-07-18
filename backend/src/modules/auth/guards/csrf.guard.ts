import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const CSRF_PROTECTED_KEY = 'csrfProtected';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isProtected = this.reflector.getAllAndOverride<boolean>(CSRF_PROTECTED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isProtected) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const clientHeader = request.headers['x-talentai-client'];

    if (!clientHeader || clientHeader !== 'recruiter-web') {
      throw new ForbiddenException('CSRF validation failed');
    }

    const origin = request.headers['origin'];
    const referer = request.headers['referer'];

    if (origin || referer) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const allowedOrigins = [frontendUrl];
      const validOrigin = origin && allowedOrigins.some((o) => origin.startsWith(o));
      const validReferer = referer && allowedOrigins.some((o) => referer.startsWith(o));
      if (!validOrigin && !validReferer) {
        throw new ForbiddenException('Origin validation failed');
      }
    }

    return true;
  }
}
