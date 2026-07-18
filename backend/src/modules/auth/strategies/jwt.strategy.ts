import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma/prisma.service';
import { AuthenticatedPrincipal, TokenPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
      issuer: configService.get<string>('jwt.issuer'),
      audience: configService.get<string>('jwt.audience'),
      passReqToCallback: false,
      jsonWebTokenOptions: {
        issuer: configService.get<string>('jwt.issuer'),
        audience: configService.get<string>('jwt.audience'),
      },
    });
  }

  async validate(payload: TokenPayload): Promise<AuthenticatedPrincipal> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    if (session.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const userStatus = session.user.status;
    if (userStatus === 'SUSPENDED' || userStatus === 'DISABLED' || userStatus === 'DELETED') {
      throw new UnauthorizedException('Account not accessible');
    }

    if (userStatus === 'LOCKED') {
      if (session.user.lockedUntil && session.user.lockedUntil > new Date()) {
        throw new UnauthorizedException('Account locked');
      }
    }

    let effectivePermissions: string[] = [];
    let membershipId: string | null = null;
    let role: string = payload.role;

    if (payload.cid && payload.mid) {
      const membership = await this.prisma.companyMembership.findUnique({
        where: { id: payload.mid },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
          company: true,
        },
      });

      if (!membership || membership.status !== 'ACTIVE') {
        throw new UnauthorizedException('Membership not active');
      }

      if (membership.company.status !== 'ACTIVE') {
        throw new UnauthorizedException('Company not active');
      }

      membershipId = membership.id;
      role = membership.role.code;
      effectivePermissions = membership.role.rolePermissions.map((rp) => rp.permission.code);
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      activeCompanyId: payload.cid,
      membershipId,
      role,
      permissions: effectivePermissions,
    };
  }
}
