import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AssessmentTokenPayload {
  sub: string;
  purpose: 'talentai-assessment-access';
  cv: string;
  iat: number;
  exp?: number;
}

/**
 * Short-lived candidate session tokens. The token binds a session id (`sub`)
 * to the session's code hash prefix (`cv`); every candidate endpoint
 * re-validates the binding server-side so tokens cannot be replayed across
 * sessions. Mirrors the AI-interview token pattern with its own purpose and
 * secret.
 */
@Injectable()
export class AssessmentTokenService {
  private readonly logger = new Logger(AssessmentTokenService.name);
  private readonly secret: string;
  private readonly ttlMinutes: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.secret = this.configService.get<string>('assessment.accessTokenSecret') || '';
    this.ttlMinutes = this.configService.get<number>('assessment.accessTokenTtlMinutes') || 120;
  }

  generate(sessionId: string, codeHash: string): string {
    if (!this.secret) {
      this.logger.warn('ASSESSMENT_ACCESS_TOKEN_SECRET is not configured');
      throw new Error('ASSESSMENT_ACCESS_TOKEN_SECRET is not configured');
    }
    const now = Math.floor(Date.now() / 1000);
    const payload: AssessmentTokenPayload = {
      sub: sessionId,
      purpose: 'talentai-assessment-access',
      cv: codeHash.slice(0, 16),
      iat: now,
    };
    return this.jwtService.sign(payload, {
      secret: this.secret,
      expiresIn: `${this.ttlMinutes}m`,
    });
  }

  verify(token: string): AssessmentTokenPayload {
    try {
      const payload = this.jwtService.verify<AssessmentTokenPayload>(token, {
        secret: this.secret,
      });
      if (payload.purpose !== 'talentai-assessment-access') {
        throw new UnauthorizedException({
          code: 'INVALID_TOKEN_PURPOSE',
          message: 'Invalid token purpose',
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Invalid or expired access token',
      });
    }
  }
}
