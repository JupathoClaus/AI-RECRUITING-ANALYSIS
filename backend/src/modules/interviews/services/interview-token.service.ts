/**
 * InterviewTokenService
 *
 * Generates and validates secure, time-limited tokens
 * for candidate interview confirmation/decline/reschedule requests.
 *
 * Token format: HMAC-SHA256 of {interviewId}:{participantId}:{expiresAt}
 * Encoded as: base64url({interviewId}|{participantId}|{expiresAt}|{signature})
 *
 * No authentication required to use confirmation endpoints.
 * Tokens expire after 7 days. Single-use enforced via respondedAt check in controller.
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import * as crypto from 'crypto';

const TOKEN_TTL_HOURS = 168; // 7 days
const TOKEN_SECRET_ENV = 'JWT_SECRET'; // reuse existing secret; replace with dedicated secret in prod

@Injectable()
export class InterviewTokenService {
  private readonly logger = new Logger(InterviewTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Generate a secure confirmation token for a specific participant */
  generateToken(interviewId: string, participantId: string): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000);
    const secret = process.env[TOKEN_SECRET_ENV] ?? 'fallback-secret';
    const payload = `${interviewId}|${participantId}|${expiresAt.getTime()}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = Buffer.from(`${payload}|${sig}`).toString('base64url');
    return { token, expiresAt };
  }

  /** Validate and parse a confirmation token. Throws if invalid/expired. */
  validateToken(token: string): { interviewId: string; participantId: string; expiresAt: Date } {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split('|');
      if (parts.length !== 4) throw new Error('Invalid token format');
      const [interviewId, participantId, expiresAtMs, sig] = parts;
      const expiresAt = new Date(parseInt(expiresAtMs, 10));
      if (expiresAt <= new Date()) throw new Error('Token expired');
      // Verify signature
      const secret = process.env[TOKEN_SECRET_ENV] ?? 'fallback-secret';
      const payload = `${interviewId}|${participantId}|${expiresAtMs}`;
      const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
        throw new Error('Invalid signature');
      }
      return { interviewId, participantId, expiresAt };
    } catch (err) {
      throw new BadRequestException({
        code: 'INTERVIEW_CONFIRMATION_TOKEN_INVALID',
        message: 'Invalid or expired confirmation token',
      });
    }
  }
}
