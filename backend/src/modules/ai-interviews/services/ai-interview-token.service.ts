import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AiInterviewTokenPayload {
  sub: string;
  purpose: 'talentai-ai-interview-access';
  cv: string;
  iat: number;
  exp?: number;
}

@Injectable()
export class AiInterviewTokenService {
  private readonly logger = new Logger(AiInterviewTokenService.name);
  private readonly secret: string;
  private readonly ttlMinutes: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.secret = this.configService.get<string>('aiInterview.accessTokenSecret') || '';
    this.ttlMinutes = this.configService.get<number>('aiInterview.accessTokenTtlMinutes') || 60;
  }

  generate(interviewId: string, codeHash: string): string {
    if (!this.secret) {
      throw new Error('AI_INTERVIEW_ACCESS_TOKEN_SECRET is not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload: AiInterviewTokenPayload = {
      sub: interviewId,
      purpose: 'talentai-ai-interview-access',
      cv: codeHash.slice(0, 16),
      iat: now,
    };

    return this.jwtService.sign(payload, {
      secret: this.secret,
      expiresIn: `${this.ttlMinutes}m`,
    });
  }

  verify(token: string): AiInterviewTokenPayload {
    try {
      const payload = this.jwtService.verify<AiInterviewTokenPayload>(token, {
        secret: this.secret,
      });

      if (payload.purpose !== 'talentai-ai-interview-access') {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN_PURPOSE', message: 'Invalid token purpose' });
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({ code: 'INVALID_ACCESS_TOKEN', message: 'Invalid or expired access token' });
    }
  }

  extractInterviewId(token: string): string | null {
    try {
      const payload = this.verify(token);
      return payload.sub;
    } catch {
      return null;
    }
  }
}
