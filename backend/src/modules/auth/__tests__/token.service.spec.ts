import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from '../services/token.service';
import { TokenPayload } from '../interfaces/auth.interface';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        'jwt.secret': 'test-secret-that-is-long-enough-for-hs256-12345',
        'jwt.expiration': '15m',
        'jwt.refreshSecret': 'test-refresh-secret-that-is-long-enough-67890',
        'jwt.refreshExpiration': '7d',
        'jwt.issuer': 'talentai-api',
        'jwt.audience': 'talentai-recruiter-web',
      };
      return config[key];
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        JwtService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should generate an access token with expected minimal claims', async () => {
    const token = await service.generateAccessToken(
      'user-123',
      'session-456',
      'company-789',
      'membership-abc',
      'COMPANY_ADMIN',
    );

    const decoded = jwtService.decode(token) as TokenPayload & { iss: string; aud: string };
    expect(decoded.sub).toBe('user-123');
    expect(decoded.sid).toBe('session-456');
    expect(decoded.cid).toBe('company-789');
    expect(decoded.mid).toBe('membership-abc');
    expect(decoded.role).toBe('COMPANY_ADMIN');
    expect(decoded.type).toBe('access');
    expect(decoded.iss).toBe('talentai-api');
    expect(decoded.aud).toBe('talentai-recruiter-web');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('should reject token with wrong issuer', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-1', type: 'access', iss: 'wrong-issuer', aud: 'talentai-recruiter-web' },
      { secret: 'test-secret-that-is-long-enough-for-hs256-12345' },
    );

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('should reject token with wrong audience', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-1', type: 'access', iss: 'talentai-api', aud: 'wrong-audience' },
      { secret: 'test-secret-that-is-long-enough-for-hs256-12345' },
    );

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('should reject token with wrong type', async () => {
    const token = await jwtService.signAsync(
      { sub: 'user-1', type: 'refresh', iss: 'talentai-api', aud: 'talentai-recruiter-web' },
      { secret: 'test-secret-that-is-long-enough-for-hs256-12345' },
    );

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('should generate a secure opaque refresh token', () => {
    const result = service.generateRefreshToken();
    expect(result.rawToken).toBeDefined();
    expect(result.rawToken.length).toBeGreaterThan(32);
    expect(result.hashedToken).toBeDefined();
    expect(result.familyId).toBeDefined();
    expect(result.rawToken).not.toBe(result.hashedToken);
  });

  it('should produce deterministic hash for same token', () => {
    const hash1 = service.hashToken('same-token-value');
    const hash2 = service.hashToken('same-token-value');
    expect(hash1).toBe(hash2);
  });

  it('should generate verification token with hash', () => {
    const result = service.generateVerificationToken();
    expect(result.rawToken).toBeDefined();
    expect(result.hashedToken).toBeDefined();
    expect(result.rawToken).not.toBe(result.hashedToken);
  });

  it('should return positive access token expiry', () => {
    const expiry = service.getAccessTokenExpiresInMs();
    expect(expiry).toBeGreaterThan(0);
  });
});
