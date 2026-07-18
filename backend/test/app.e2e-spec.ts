import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('/api/v1/health/live (GET)', () => {
    it('should return HTTP 200 with liveness status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
          expect(res.body.uptimeSeconds).toBeDefined();
          expect(typeof res.body.uptimeSeconds).toBe('number');
        });
    });
  });

  describe('/api/v1/health/ready (GET)', () => {
    it('should return HTTP 200 or 503 based on dependencies', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .then((res) => {
          expect([200, 503]).toContain(res.status);
          expect(res.body.status).toBeDefined();
          expect(res.body.checks).toBeDefined();
          expect(res.body.checks.database).toBeDefined();
          expect(res.body.checks.redis).toBeDefined();
          expect(res.body.checks.queues).toBeDefined();
        });
    });
  });

  describe('/api/v1/health/version (GET)', () => {
    it('should return HTTP 200 with version info', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/version')
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('TalentAI');
          expect(res.body.version).toBe('1.0.0');
          expect(res.body.nodeVersion).toBeDefined();
        });
    });
  });

  describe('/api/v1/health (GET)', () => {
    it('should return HTTP 200 or 503', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .then((res) => {
          expect([200, 503]).toContain(res.status);
          expect(res.body.status).toBeDefined();
          expect(res.body.checks).toBeDefined();
          expect(res.body.checks.memory).toBeDefined();
        });
    });
  });

  describe('X-Request-Id', () => {
    it('should include X-Request-Id in response', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.headers['x-request-id']).toBeDefined();
        });
    });

    it('should echo back provided valid X-Request-Id', () => {
      const testId = '12345678-1234-1234-1234-123456789abc';
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('X-Request-Id', testId)
        .expect(200)
        .expect((res) => {
          expect(res.headers['x-request-id']).toBe(testId);
        });
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', () => {
      return request(app.getHttpServer())
        .get('/api/v1/nonexistent')
        .expect(404)
        .expect((res) => {
          expect(res.body.statusCode).toBe(404);
          expect(res.body.requestId).toBeDefined();
        });
    });
  });
});

// BLOCKED: requires Docker infrastructure (PostgreSQL + Redis)
describe('Auth (e2e)', () => {
  let app: INestApplication;

  const testUser = {
    companyName: 'E2E Test Corp',
    email: 'e2e-admin@test-corp.com',
    firstName: 'E2E',
    lastName: 'Admin',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'US',
    timezone: 'America/New_York',
    acceptTerms: true,
  };

  let verificationToken: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register-company', () => {
    it.skip('should register a new company and return userId, companyId, and verificationToken', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register-company')
        .send(testUser)
        .expect(201)
        .expect((res) => {
          expect(res.body.data.userId).toBeDefined();
          expect(res.body.data.companyId).toBeDefined();
          expect(res.body.data.membershipId).toBeDefined();
          expect(res.body.data.verificationRequired).toBe(true);
          expect(res.body.data.verificationToken).toBeDefined();

          verificationToken = res.body.data.verificationToken;
        });
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it.skip('should fail with 401 because email is not verified', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(401)
        .expect((res) => {
          expect(res.body.statusCode).toBe(401);
          expect(res.body.errorCode).toMatch(/EMAIL_NOT_VERIFIED|UNAUTHORIZED/);
        });
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    it.skip('should verify the email using the token from registration', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: verificationToken })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.message).toBe('Email verified successfully');
        });
    });
  });

  describe('POST /api/v1/auth/login (after verification)', () => {
    it.skip('should login successfully and return tokens, user, and activeCompany', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.tokens).toBeDefined();
          expect(res.body.data.tokens.accessToken).toBeDefined();
          expect(res.body.data.tokens.refreshToken).toBeDefined();
          expect(res.body.data.user).toBeDefined();
          expect(res.body.data.user.id).toBeDefined();
          expect(res.body.data.user.email).toBe(testUser.email);
          expect(res.body.data.activeCompany).toBeDefined();
          expect(res.body.data.activeCompany.name).toBe(testUser.companyName);
          expect(res.body.data.role).toBe('COMPANY_ADMIN');
          expect(res.body.data.sessionId).toBeDefined();

          accessToken = res.body.data.tokens.accessToken;
          refreshToken = res.body.data.tokens.refreshToken;
        });
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it.skip('should return current user profile without passwordHash', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.user).toBeDefined();
          expect(res.body.data.user.id).toBeDefined();
          expect(res.body.data.user.email).toBe(testUser.email);
          expect(res.body.data.user.firstName).toBe(testUser.firstName);
          expect(res.body.data.passwordHash).toBeUndefined();
          expect(res.body.data.company).toBeDefined();
        });
    });

    it.skip('should return 401 when accessing without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401)
        .expect((res) => {
          expect(res.body.statusCode).toBe(401);
        });
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it.skip('should rotate the refresh token and return new tokens', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.accessToken).toBeDefined();
          expect(res.body.data.refreshToken).toBeDefined();
          expect(res.body.data.refreshToken).not.toBe(refreshToken);

          refreshToken = res.body.data.refreshToken;
          accessToken = res.body.data.accessToken;
        });
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it.skip('should revoke the session', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.message).toBe('Logged out successfully');
        });
    });

    it.skip('should fail accessing /me with the revoked session token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it.skip('should return a generic message regardless of email existence', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: testUser.email })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.message).toMatch(/If the email is registered/i);
        });
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it.skip('should reset password using a valid reset token', () => {
      const resetToken = 'test-reset-token-from-forgot-password-flow';
      return request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewE2eStr0ng!Pass',
          passwordConfirmation: 'NewE2eStr0ng!Pass',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.message).toBe('Password has been reset successfully');
        });
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it.skip('should change password for an authenticated user', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'ChangedE2eStr0ng!',
          passwordConfirmation: 'ChangedE2eStr0ng!',
          revokeOtherSessions: false,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.message).toBe('Password changed successfully');
        });
    });
  });
});
