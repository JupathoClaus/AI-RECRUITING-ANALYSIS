import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PrismaService } from '../src/database/prisma/prisma.service';

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

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;

  const emailA = `auth-e2e-a-${Date.now()}@test-corp.com`;
  const emailB = `auth-e2e-b-${Date.now()}@test-corp.com`;

  const userA = {
    companyName: 'Auth E2E Corp',
    email: emailA,
    firstName: 'Auth',
    lastName: 'Admin',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'US',
    timezone: 'America/New_York',
    acceptTerms: true,
  };

  const userB = {
    companyName: 'Auth E2E Corp B',
    email: emailB,
    firstName: 'Beta',
    lastName: 'Admin',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'US',
    timezone: 'America/New_York',
    acceptTerms: true,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  let prisma: PrismaClient;

  async function cleanupUser(email: string) {
    const norm = email.toLowerCase().trim();
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ DECLARE uid TEXT; cids TEXT[]; BEGIN
          SELECT id INTO uid FROM "User" WHERE "normalizedEmail" = '${norm}';
          IF uid IS NULL THEN RETURN; END IF;
          SELECT ARRAY(SELECT "companyId" FROM "CompanyMembership" WHERE "userId" = uid) INTO cids;
          DELETE FROM "AuthAuditEvent" WHERE "userId" = uid;
          DELETE FROM "UserSession" WHERE "userId" = uid;
          DELETE FROM "VerificationToken" WHERE "userId" = uid;
          DELETE FROM "CandidateAuditEvent" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateConsent" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateLanguage" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateCertification" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateEducation" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateEmployment" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CandidateSkill" WHERE "candidateId" IN (SELECT id FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CompanyCandidate" WHERE "companyId" = ANY(cids);
          DELETE FROM "CandidateMergeRecord" WHERE "primaryCandidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids))) OR "mergedCandidateId" IN (SELECT id FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids)));
          DELETE FROM "Candidate" WHERE id IN (SELECT "candidateId" FROM "CompanyCandidate" WHERE "companyId" = ANY(cids));
          DELETE FROM "CompanySettings" WHERE "companyId" = ANY(cids);
          DELETE FROM "DepartmentMembership" WHERE "companyMembershipId" IN (SELECT id FROM "CompanyMembership" WHERE "userId" = uid);
          DELETE FROM "CompanyMembership" WHERE "userId" = uid;
          DELETE FROM "Company" WHERE id = ANY(cids);
          DELETE FROM "User" WHERE id = uid;
        END $$;
      `);
    } catch {
      /* non-fatal */
    }
  }

  async function registerAndLogin(
    user: typeof userA,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    await request(app.getHttpServer()).post('/api/v1/auth/register-company').send(user).expect(201);
    // The verification token is sent by email, not returned in API response.
    // Activate the user directly via DB for testing purposes.
    const norm = user.email.toLowerCase().trim();
    const dbUser = await prisma.user.findUnique({ where: { normalizedEmail: norm } });
    if (dbUser && dbUser.status !== 'ACTIVE') {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
    }
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    return {
      accessToken: loginRes.body.data.tokens.accessToken,
      refreshToken: loginRes.body.data.tokens.refreshToken,
    };
  }

  // ── Setup / Teardown ───────────────────────────────────────────────────────

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    await cleanupUser(userA.email);
    await cleanupUser(userB.email);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ── Registration & Verification (4) ───────────────────────────────────────

  describe('Registration & Verification', () => {
    it('POST /auth/register-company creates company + user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register-company')
        .send(userA)
        .expect(201);
      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.companyId).toBeDefined();
      expect(res.body.data.membershipId).toBeDefined();
    });

    it('POST /auth/login returns 401 before email verification', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: userA.email, password: userA.password })
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('activate user via DB (verify-email token is not returned by API)', async () => {
      // The verification token is sent by email, not returned in the API response.
      // Since the raw token is not stored, we activate the user directly via DB.
      const norm = userA.email.toLowerCase().trim();
      const dbUser = await prisma.user.findUnique({ where: { normalizedEmail: norm } });
      expect(dbUser).toBeDefined();
      if (dbUser) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
        });
      }
    });

    it('POST /auth/login returns tokens after verification', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: userA.email, password: userA.password })
        .expect(200);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(userA.email);
      expect(res.body.data.activeCompany.name).toBe(userA.companyName);
      expect(res.body.data.role).toBe('COMPANY_ADMIN');
      expect(res.body.data.sessionId).toBeDefined();
      accessToken = res.body.data.tokens.accessToken;
      refreshToken = res.body.data.tokens.refreshToken;
    });
  });

  // ── Authenticated Endpoints (2) ────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.user.email).toBe(userA.email);
      expect(res.body.data.user.firstName).toBe(userA.firstName);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.company).toBeDefined();
    });

    it('returns 401 without Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
      expect(res.body.statusCode).toBe(401);
    });
  });

  // ── Refresh Token (10) ─────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('rotates refresh token and returns new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({ refreshToken })
        .expect(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
      refreshToken = res.body.data.refreshToken;
      accessToken = res.body.data.accessToken;
    });

    it('rejects reuse of an already-rotated refresh token', async () => {
      const oldToken = refreshToken;
      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({ refreshToken: oldToken })
        .expect(200);
      refreshToken = first.body.data.refreshToken;
      accessToken = first.body.data.accessToken;
      // Reuse the now-rotated old token
      const second = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({ refreshToken: oldToken })
        .expect(401);
      expect(second.body.statusCode).toBe(401);
    });

    it('rejects an unparseable refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({ refreshToken: 'invalid-hex-string' })
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('rejects missing refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({})
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('refresh works without CSRF header (guard not deployed as global)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(res.body.data.accessToken).toBeDefined();
      refreshToken = res.body.data.refreshToken;
      accessToken = res.body.data.accessToken;
    });

    it('rejects refresh after logout', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({ refreshToken })
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });
  });

  // Login to get fresh tokens
  async function reLoginUserA() {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: userA.password })
      .expect(200);
    accessToken = loginRes.body.data.tokens.accessToken;
    refreshToken = loginRes.body.data.tokens.refreshToken;
  }

  describe('POST /auth/refresh (continued)', () => {
    beforeAll(async () => {
      await reLoginUserA();
    });

    it('rejects refresh after logout-all', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({ refreshToken })
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('any valid refresh token works on the public refresh endpoint', async () => {
      await reLoginUserA();
      const tokensB = await registerAndLogin(userB);
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-talentai-client', 'recruiter-web')
        .send({ refreshToken: tokensB.refreshToken })
        .expect(200);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });

  // ── Partial Token Rejection (4) ───────────────────────────────────────────

  describe('Partial / malformed token rejection', () => {
    it('rejects empty Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer ')
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('rejects malformed non-JWT Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('rejects token with wrong signature (tampered)', async () => {
      const tampered =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0YW1wZXJlZCJ9.' +
        'tampered-signature-value';
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });

    it('rejects token with valid signature but no session (ghost token)', async () => {
      const tokenSvc = app.get<TokenService>(TokenService);
      const ghostToken = await tokenSvc.generateAccessToken(
        '00000000-0000-0000-0000-000000000000', // nonexistent userId
        '00000000-0000-0000-0000-000000000000', // nonexistent sessionId
        null,
        null,
        'COMPANY_ADMIN',
      );
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ghostToken}`)
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });
  });

  // Re-register for remaining test suites
  describe('Re-register userA', () => {
    beforeAll(async () => {
      await reLoginUserA();
    });
    it('has valid session for subsequent tests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.user.email).toBe(userA.email);
    });
  });

  // ── Logout (2) ─────────────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('revokes the session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.message).toBe('Logged out successfully');
    });

    it('/me fails after logout', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
      expect(res.body.statusCode).toBe(401);
    });
  });

  // ── Password Management (3) ────────────────────────────────────────────────

  describe('Password management', () => {
    it('POST /auth/forgot-password returns generic message', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: userA.email })
        .expect(200);
      expect(res.body.data.message).toMatch(/If the email is registered/i);
    });

    it('POST /auth/reset-password returns 400 for invalid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'invalid-token',
          newPassword: 'NewE2eStr0ng!Pass',
          passwordConfirmation: 'NewE2eStr0ng!Pass',
        })
        .expect(400);
      expect(res.body.statusCode).toBe(400);
    });

    it('POST /auth/change-password changes password for authenticated user', async () => {
      // Re-login since the session was revoked by logout tests
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: userA.email, password: userA.password })
        .expect(200);
      accessToken = loginRes.body.data.tokens.accessToken;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: userA.password,
          newPassword: 'ChangedE2eStr0ng!',
          passwordConfirmation: 'ChangedE2eStr0ng!',
          revokeOtherSessions: false,
        })
        .expect(200);
      expect(res.body.data.message).toBe('Password changed successfully');
    });
  });

  // ── Tenant Isolation (6) ───────────────────────────────────────────────────

  describe('Tenant isolation', () => {
    let tokenA: string;
    let tokenB: string;
    let candidateId: string;

    beforeAll(async () => {
      userA.email = `auth-iso-a-${Date.now()}@e2e.com`;
      userB.email = `auth-iso-b-${Date.now()}@e2e.com`;
      const a = await registerAndLogin(userA);
      tokenA = a.accessToken;
      const b = await registerAndLogin(userB);
      tokenB = b.accessToken;
    });

    it('Company A can access its own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.data.user.email).toBe(userA.email);
    });

    it('Company B cannot access Company A resources', async () => {
      // B's token should not reveal A's data
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(res.body.data.user.email).not.toBe(userA.email);
      expect(res.body.data.user.email).toBe(userB.email);
    });

    it('Company B cannot read Company A candidates', async () => {
      // Create a candidate under Company A
      const candRes = await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          firstName: 'Tenant',
          lastName: 'Test',
          email: `tenant-test-${Date.now()}@e2e.com`,
          source: 'RECRUITER_CREATED',
        })
        .expect(201);
      candidateId = candRes.body.data.id;

      // Company B tries to read it — should get 404 (company-scoped)
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
      expect(res.body.statusCode).toBe(404);
    });

    it('Company B can create and read its own candidate independently', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          firstName: 'B-Only',
          lastName: 'Candidate',
          email: `b-only-${Date.now()}@e2e.com`,
          source: 'RECRUITER_CREATED',
        })
        .expect(201);
      const bCandidateId = res.body.data.id;

      // Company B can read it
      await request(app.getHttpServer())
        .get(`/api/v1/candidates/${bCandidateId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // Company A cannot access it either
      const cross = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${bCandidateId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
      expect(cross.body.statusCode).toBe(404);
    });

    it('Listing endpoints return only each company own data', async () => {
      // Company A listing
      const listA = await request(app.getHttpServer())
        .get('/api/v1/candidates')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const idsA = listA.body.data.map((c: { id: string }) => c.id);
      expect(idsA).toContain(candidateId);
      expect(idsA.length).toBe(1); // only A's candidate

      // Company B listing
      const listB = await request(app.getHttpServer())
        .get('/api/v1/candidates')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      const idsB = listB.body.data.map((c: { id: string }) => c.id);
      expect(idsB).not.toContain(candidateId);
      expect(idsB.length).toBe(1); // only B's candidate
    });

    it('Company A resources unchanged after B operations', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.data.firstName).toBe('Tenant');
    });
  });
});
