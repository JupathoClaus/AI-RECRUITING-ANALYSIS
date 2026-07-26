import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AiInterviewTokenService } from './ai-interview-token.service';

describe('AiInterviewTokenService', () => {
  let service: AiInterviewTokenService;
  let jwtService: JwtService;

  const testSecret = 'test-secret-for-jwt-1234567890';
  const testTtlMinutes = 60;
  const interviewId = 'interview-123';
  const codeHash = 'abcdef1234567890abcdef1234567890';

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiInterviewTokenService,
        {
          provide: JwtService,
          useFactory: () =>
            new JwtService({
              secret: testSecret,
              signOptions: { expiresIn: `${testTtlMinutes}m` },
            }),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, any> = {
                'aiInterview.accessTokenSecret': testSecret,
                'aiInterview.accessTokenTtlMinutes': testTtlMinutes,
              };
              return config[key] ?? undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AiInterviewTokenService>(AiInterviewTokenService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('generate', () => {
    it('should produce a valid JWT string', () => {
      const token = service.generate(interviewId, codeHash);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should embed interviewId as sub', () => {
      const token = service.generate(interviewId, codeHash);
      const payload = jwtService.decode(token) as any;
      expect(payload.sub).toBe(interviewId);
    });

    it('should embed purpose', () => {
      const token = service.generate(interviewId, codeHash);
      const payload = jwtService.decode(token) as any;
      expect(payload.purpose).toBe('talentai-ai-interview-access');
    });

    it('should embed cv as first 16 chars of codeHash', () => {
      const token = service.generate(interviewId, codeHash);
      const payload = jwtService.decode(token) as any;
      expect(payload.cv).toBe(codeHash.slice(0, 16));
    });

    it('should include iat and exp', () => {
      const token = service.generate(interviewId, codeHash);
      const payload = jwtService.decode(token) as any;
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('should set exp ~60 minutes in future', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = service.generate(interviewId, codeHash);
      const after = Math.floor(Date.now() / 1000);
      const payload = jwtService.decode(token) as any;
      expect(payload.exp).toBeGreaterThanOrEqual(before + 3540);
      expect(payload.exp).toBeLessThanOrEqual(after + 3660);
    });
  });

  describe('verify', () => {
    it('should return payload for valid token', () => {
      const token = service.generate(interviewId, codeHash);
      const payload = service.verify(token);
      expect(payload.sub).toBe(interviewId);
      expect(payload.purpose).toBe('talentai-ai-interview-access');
      expect(payload.cv).toBe(codeHash.slice(0, 16));
    });

    it('should reject token with wrong purpose', () => {
      const wrongToken = jwtService.sign(
        { sub: interviewId, purpose: 'wrong-purpose', cv: codeHash.slice(0, 16) },
        { secret: testSecret, expiresIn: '60m' },
      );
      expect(() => service.verify(wrongToken)).toThrow(UnauthorizedException);
    });

    it('should reject expired token', async () => {
      const expiredToken = jwtService.sign(
        { sub: interviewId, purpose: 'talentai-ai-interview-access', cv: codeHash.slice(0, 16) },
        { secret: testSecret, expiresIn: '0s' },
      );
      await new Promise(r => setTimeout(r, 100));
      expect(() => service.verify(expiredToken)).toThrow(UnauthorizedException);
    });

    it('should reject token signed with wrong secret', () => {
      const wrongToken = jwtService.sign(
        { sub: interviewId, purpose: 'talentai-ai-interview-access', cv: codeHash.slice(0, 16) },
        { secret: 'wrong-secret', expiresIn: '60m' },
      );
      expect(() => service.verify(wrongToken)).toThrow(UnauthorizedException);
    });

    it('should reject malformed token', () => {
      expect(() => service.verify('not-a-valid-jwt')).toThrow(UnauthorizedException);
    });
  });

  describe('extractInterviewId', () => {
    it('should return interviewId for valid token', () => {
      const token = service.generate(interviewId, codeHash);
      const result = service.extractInterviewId(token);
      expect(result).toBe(interviewId);
    });

    it('should return null for invalid token', () => {
      const result = service.extractInterviewId('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const expiredToken = jwtService.sign(
        { sub: interviewId, purpose: 'talentai-ai-interview-access', cv: codeHash.slice(0, 16) },
        { secret: testSecret, expiresIn: '0s' },
      );
      await new Promise(r => setTimeout(r, 100));
      const result = service.extractInterviewId(expiredToken);
      expect(result).toBeNull();
    });
  });

  describe('secret not configured', () => {
    it('should throw when secret is empty', () => {
      const svc = new AiInterviewTokenService(
        jwtService,
        { get: () => '' } as any,
      );
      expect(() => svc.generate('id', 'hash')).toThrow('AI_INTERVIEW_ACCESS_TOKEN_SECRET is not configured');
    });
  });
});
