import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { TokenPayload } from '../interfaces/auth.interface';

function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 900000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60000;
    case 'h':
      return value * 3600000;
    case 'd':
      return value * 86400000;
    default:
      return 900000;
  }
}

@Injectable()
export class TokenService {
  private readonly jwtSecret: string;
  private readonly jwtExpiration: string;
  private readonly jwtRefreshExpiration: string;
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('jwt.secret')!;
    this.jwtExpiration = this.configService.get<string>('jwt.expiration')!;
    this.jwtRefreshExpiration = this.configService.get<string>('jwt.refreshExpiration')!;
    this.jwtIssuer = this.configService.get<string>('jwt.issuer')!;
    this.jwtAudience = this.configService.get<string>('jwt.audience')!;
  }

  async generateAccessToken(
    userId: string,
    sessionId: string,
    activeCompanyId: string | null,
    membershipId: string | null,
    role: string,
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      sub: userId,
      sid: sessionId,
      cid: activeCompanyId,
      mid: membershipId,
      role,
      type: 'access',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiration,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
    } as Record<string, unknown>);
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.jwtSecret,
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
      });

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  generateRefreshToken(): { rawToken: string; hashedToken: string; familyId: string } {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const familyId = crypto.randomUUID();
    return { rawToken, hashedToken, familyId };
  }

  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  generateVerificationToken(): { rawToken: string; hashedToken: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    return { rawToken, hashedToken };
  }

  getAccessTokenExpiresInMs(): number {
    return parseDurationToMs(this.jwtExpiration);
  }

  getRefreshTokenExpiresInMs(): number {
    return parseDurationToMs(this.jwtRefreshExpiration);
  }
}
