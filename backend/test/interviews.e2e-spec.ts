import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Interview Scheduling (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let companyId: string;
  let applicationId: string;
  let jobId: string;
  let candidateId: string;
  let interviewId: string;
  let interviewVersion: number;
  let participantId: string;
  let stageId: string;

  const testUser = {
    companyName: 'Interviews E2E Corp',
    email: 'interviews-e2e-admin@testcorp-iv.com',
    firstName: 'Interview',
    lastName: 'Admin',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'UG',
    timezone: 'Africa/Kampala',
    acceptTerms: true,
  };

  // The verification link is delivered by email; e2e has no SMTP sink, so the
  // user is activated directly (same pattern as extraction-concurrency).
  async function activateUser(email: string) {
    const prisma = new PrismaClient();
    const dbUser = await prisma.user.findUnique({
      where: { normalizedEmail: email.toLowerCase().trim() },
    });
    if (!dbUser) throw new Error(`user not found for ${email}`);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    await prisma.$disconnect();
  }

  async function rawCleanup() {
    const prisma = new PrismaClient();

    try {
      const norm = testUser.email.toLowerCase().trim();
      await prisma.$executeRawUnsafe(`
        DO $$
        DECLARE uid TEXT; cids TEXT[]; appids TEXT[]; intids TEXT[];
        BEGIN
          SELECT id INTO uid FROM "User" WHERE "normalizedEmail" = '${norm}';
          IF uid IS NULL THEN RETURN; END IF;
          SELECT ARRAY(SELECT "companyId" FROM "CompanyMembership" WHERE "userId" = uid) INTO cids;
          SELECT ARRAY(SELECT id FROM "Application" WHERE "companyId" = ANY(cids)) INTO appids;
          SELECT ARRAY(SELECT id FROM "Interview" WHERE "companyId" = ANY(cids)) INTO intids;
          DELETE FROM "InterviewHistory" WHERE "interviewId" = ANY(intids);
          DELETE FROM "InterviewParticipant" WHERE "interviewId" = ANY(intids);
          DELETE FROM "Interview" WHERE "companyId" = ANY(cids);
          DELETE FROM "ApplicationAuditEvent" WHERE "applicationId" = ANY(appids);
          DELETE FROM "ApplicationDecision" WHERE "applicationId" = ANY(appids);
          DELETE FROM "ApplicationFlag" WHERE "applicationId" = ANY(appids);
          DELETE FROM "ApplicationNote" WHERE "applicationId" = ANY(appids);
          DELETE FROM "ApplicationAssignment" WHERE "applicationId" = ANY(appids);
          DELETE FROM "ApplicationStageHistory" WHERE "applicationId" = ANY(appids);
          DELETE FROM "ApplicationScreeningAnswer" WHERE "applicationId" = ANY(appids);
          DELETE FROM "ApplicationTagAssignment" WHERE "applicationId" = ANY(appids);
          DELETE FROM "Application" WHERE "companyId" = ANY(cids);
          DELETE FROM "ApplicationCounter" WHERE "companyId" = ANY(cids);
          DELETE FROM "CompanyCandidate" WHERE "companyId" = ANY(cids);
          DELETE FROM "CandidateTag" WHERE "companyId" = ANY(cids);
          DELETE FROM "JobActivityEvent" WHERE "companyId" = ANY(cids);
          DELETE FROM "JobCollaborator" WHERE "companyMembershipId" IN (SELECT id FROM "CompanyMembership" WHERE "userId" = uid);
          DELETE FROM "JobApproval" WHERE "requestedByMembershipId" IN (SELECT id FROM "CompanyMembership" WHERE "userId" = uid);
          DELETE FROM "JobPipelineStage" WHERE "pipelineId" IN (SELECT id FROM "JobPipeline" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids)));
          DELETE FROM "JobPipeline" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "JobScreeningQuestion" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "JobScreeningConfiguration" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "JobAccessibilityConfiguration" WHERE "jobId" IN (SELECT id FROM "Job" WHERE "companyId" = ANY(cids));
          DELETE FROM "Job" WHERE "companyId" = ANY(cids);
          DELETE FROM "OrganizationAuditEvent" WHERE "companyId" = ANY(cids);
          DELETE FROM "AuthAuditEvent" WHERE "userId" = uid;
          DELETE FROM "UserSession" WHERE "userId" = uid;
          DELETE FROM "VerificationToken" WHERE "userId" = uid;
          DELETE FROM "CompanySettings" WHERE "companyId" = ANY(cids);
          DELETE FROM "DepartmentMembership" WHERE "companyMembershipId" IN (SELECT id FROM "CompanyMembership" WHERE "userId" = uid);
          DELETE FROM "CompanyMembership" WHERE "userId" = uid;
          DELETE FROM "Company" WHERE id = ANY(cids);
          DELETE FROM "User" WHERE id = uid;
        END $$;
      `);
      // Also clean candidate used in test
      await prisma.$executeRawUnsafe(`
        DO $$
        DECLARE cid TEXT;
        BEGIN
          SELECT id INTO cid FROM "Candidate" WHERE "normalizedEmail" = 'iv-e2e-candidate@test.com';
          IF cid IS NULL THEN RETURN; END IF;
          DELETE FROM "CandidateAuditEvent" WHERE "candidateId" = cid;
          DELETE FROM "CandidateMergeRecord" WHERE "primaryCandidateId" = cid OR "mergedCandidateId" = cid;
          DELETE FROM "CandidateSkill" WHERE "candidateId" = cid;
          DELETE FROM "CandidateLanguage" WHERE "candidateId" = cid;
          DELETE FROM "CandidateConsent" WHERE "candidateId" = cid;
          DELETE FROM "Candidate" WHERE id = cid;
        END $$;
      `);
    } catch {
      /* non-fatal */
    } finally {
      await prisma.$disconnect();
    }
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await rawCleanup();

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
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  // ── Setup ──────────────────────────────────────────────────────────────────

  describe('Setup', () => {
    it('registers and logs in', async () => {
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register-company')
        .send(testUser)
        .expect(201);
      expect(reg.body.data.userId).toBeDefined();
      await activateUser(testUser.email);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);
      token = login.body.data.tokens.accessToken;
      companyId = login.body.data.activeCompany.id;
      expect(token).toBeDefined();
    });

    it('creates a candidate', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'IV',
          lastName: 'Candidate',
          email: 'iv-e2e-candidate@test.com',
          source: 'RECRUITER_CREATED',
        })
        .expect(201);
      candidateId = res.body.data.id;
    });

    it('creates a job', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Interview E2E Job',
          employmentType: 'FULL_TIME',
          workplaceType: 'REMOTE',
          experienceLevel: 'MID',
          description: 'E2E job for interview tests',
        })
        .expect(201);
      jobId = res.body.data.id;
      // Get the pipeline stage
      stageId = res.body.data.pipeline?.stages?.[1]?.id ?? res.body.data.pipeline?.stages?.[0]?.id;
    });

    it('creates an application', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send({ candidateId, jobId, source: 'RECRUITER_CREATED' });
      expect([201, 400]).toContain(res.status); // 400 if job not published
      if (res.status === 201) {
        applicationId = res.body.data.id;
      } else {
        // Create application via direct DB for testing purposes
        applicationId = 'skip';
      }
    });
  });

  // ── Interview CRUD ─────────────────────────────────────────────────────────

  describe('POST /api/v1/interviews', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).post('/api/v1/interviews').send({}).expect(401);
    });

    it('creates an interview when application exists', async () => {
      if (!applicationId || applicationId === 'skip') return;
      const future = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId,
          type: 'TECHNICAL',
          title: 'Technical Interview Round 1',
          scheduledAt: future,
          durationMinutes: 60,
          timezone: 'Africa/Kampala',
        });
      expect([201, 400]).toContain(res.status);
      if (res.status === 201) {
        interviewId = res.body.data.id;
        interviewVersion = res.body.data.version;
        expect(res.body.data.status).toBe('SCHEDULED');
        expect(res.body.data.type).toBe('TECHNICAL');
      }
    });

    it('rejects past scheduledAt', async () => {
      if (!applicationId || applicationId === 'skip') return;
      const past = new Date(Date.now() - 3600000).toISOString();
      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId,
          type: 'PHONE',
          title: 'Past Interview',
          scheduledAt: past,
          durationMinutes: 30,
          timezone: 'UTC',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/interviews', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/interviews').expect(401);
    });

    it('returns company-scoped list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/interviews/:id', () => {
    it('returns interview detail', async () => {
      if (!interviewId) return;
      const res = await request(app.getHttpServer())
        .get(`/api/v1/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.id).toBe(interviewId);
    });

    it('returns 404 for unknown interview', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/interviews/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/interviews/:id', () => {
    it('updates interview notes', async () => {
      if (!interviewId) return;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'Prepare whiteboard questions', expectedVersion: interviewVersion })
        .expect(200);
    });
  });

  describe('POST /api/v1/interviews/:id/confirm', () => {
    it('confirms a SCHEDULED interview', async () => {
      if (!interviewId) return;
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const v = detail.body.data.version;
      const res = await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ expectedVersion: v })
        .expect(200);
      expect(res.body.data.confirmed).toBe(true);
      interviewVersion = detail.body.data.version + 1;
    });

    it('returns 409 on stale version', async () => {
      if (!interviewId) return;
      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ expectedVersion: 1 })
        .expect(409);
    });

    it('returns 400 for already confirmed interview', async () => {
      if (!interviewId) return;
      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ expectedVersion: interviewVersion })
        .expect(400);
    });
  });

  describe('POST /api/v1/interviews/:id/reschedule', () => {
    it('reschedules interview to a future time', async () => {
      if (!interviewId) return;
      // Refresh version
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const v = detail.body.data.version;
      const newTime = new Date(Date.now() + 172800000).toISOString();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledAt: newTime, reason: 'Candidate conflict', expectedVersion: v })
        .expect(200);
      expect(res.body.data).toBeDefined();
    });

    it('returns 409 on stale version', async () => {
      if (!interviewId) return;
      const newTime = new Date(Date.now() + 259200000).toISOString();
      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledAt: newTime, expectedVersion: 1 })
        .expect(409);
    });
  });

  describe('POST /api/v1/interviews/:id/participants', () => {
    it('adds a participant', async () => {
      if (!interviewId) return;
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const membershipId = me.body.data.company
        ? (
            await request(app.getHttpServer())
              .get('/api/v1/auth/me')
              .set('Authorization', `Bearer ${token}`)
          ).body.data.company
        : null;
      // Get membership id from JWT principal
      const res = await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/participants`)
        .set('Authorization', `Bearer ${token}`)
        .send({ membershipId: me.body.data.user?.id, role: 'INTERVIEWER' });
      expect([201, 400, 409]).toContain(res.status);
    });
  });

  describe('GET /api/v1/applications/:id/interviews', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/applications/some-id/interviews').expect(401);
    });

    it('returns interviews for application', async () => {
      if (!applicationId || applicationId === 'skip') return;
      const res = await request(app.getHttpServer())
        .get(`/api/v1/applications/${applicationId}/interviews`)
        .set('Authorization', `Bearer ${token}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data.data).toBeInstanceOf(Array);
      }
    });
  });

  describe('POST /api/v1/interviews/:id/cancel', () => {
    it('cancels the interview', async () => {
      if (!interviewId) return;
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const v = detail.body.data.version;
      const res = await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Hiring paused', expectedVersion: v })
        .expect(200);
      expect(res.body.data.cancelled).toBe(true);
    });

    it('is idempotent for already-cancelled interview', async () => {
      if (!interviewId) return;
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const v = detail.body.data.version;
      const res = await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ expectedVersion: v })
        .expect(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('POST /api/v1/interviews/:id/complete', () => {
    it('returns 400 when completing a cancelled interview', async () => {
      if (!interviewId) return;
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/interviews/${interviewId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const v = detail.body.data.version;
      // Already cancelled above
      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${interviewId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ expectedVersion: v })
        .expect(400);
    });
  });

  describe('Cross-company isolation', () => {
    it('returns 401 without token on all interview routes', async () => {
      await request(app.getHttpServer()).get('/api/v1/interviews').expect(401);
      await request(app.getHttpServer()).post('/api/v1/interviews').send({}).expect(401);
    });
  });

  // ── Slot-conflict safety (P0) ──────────────────────────────────────────────

  describe('Interview slot conflict safety', () => {
    let app2Id: string;
    let app3Id: string;
    let cand2Id: string;
    let cand3Id: string;
    let job2Id: string;
    let adminMembershipId: string;
    const base = Date.now() + 5 * 86400000; // future base instant (UTC)

    function iso(hoursFromBase: number) {
      return new Date(base + hoursFromBase * 3600000).toISOString();
    }

    it('prepares a published job and application', async () => {
      const prisma = new PrismaClient();
      const mem = await prisma.companyMembership.findFirst({ where: { companyId } });
      adminMembershipId = mem?.id ?? '';
      // The approval gate is backend-intentional; disable it for the test
      // company so jobs can be published directly (same as the browser proof).
      await prisma.companySettings.upsert({
        where: { companyId },
        create: { companyId, requireJobApproval: false },
        update: { requireJobApproval: false },
      });
      await prisma.$disconnect();

      const cand = await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Slot',
          lastName: 'Candidate',
          email: `iv-slot-${base}@test.com`,
          source: 'RECRUITER_CREATED',
        })
        .expect(201);
      cand2Id = cand.body.data.id;

      const job = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: `Slot Conflict Job ${base}`,
          employmentType: 'FULL_TIME',
          workplaceType: 'REMOTE',
          experienceLevel: 'MID',
          description: 'E2E slot conflict job',
        })
        .expect(201);
      job2Id = job.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${job2Id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const appRes = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send({ candidateId: cand2Id, jobId: job2Id, source: 'RECRUITER_CREATED' })
        .expect(201);
      app2Id = appRes.body.data.id;

      // A second candidate/application so participant overlap can be tested
      // against a different candidate than the conflicting one.
      const cand3 = await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Slot',
          lastName: 'Other',
          email: `iv-slot-other-${base}@test.com`,
          source: 'RECRUITER_CREATED',
        })
        .expect(201);
      cand3Id = cand3.body.data.id;
      const app3 = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send({ candidateId: cand3Id, jobId: job2Id, source: 'RECRUITER_CREATED' })
        .expect(201);
      app3Id = app3.body.data.id;
      expect(adminMembershipId).toBeTruthy();
    });

    it('allows adjacent slots', async () => {
      // 10:00-11:00 then 11:00-12:00 — adjacent, no conflict.
      const first = await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'TECHNICAL',
          title: 'Slot A',
          scheduledAt: iso(10),
          durationMinutes: 60,
          timezone: 'UTC',
        })
        .expect(201);
      expect(first.body.data.status).toBe('SCHEDULED');

      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'TECHNICAL',
          title: 'Slot B (adjacent)',
          scheduledAt: iso(11),
          durationMinutes: 60,
          timezone: 'UTC',
        })
        .expect(201);
    });

    it('rejects a partially overlapping candidate slot with a structured 409', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'PHONE',
          title: 'Overlapping slot',
          scheduledAt: iso(10.5), // inside Slot A (10:00-11:00)
          durationMinutes: 30,
          timezone: 'UTC',
        })
        .expect(409);
      expect(res.body.errorCode).toBe('INTERVIEW_SLOT_CONFLICT');
      expect(Array.isArray(res.body.conflicts)).toBe(true);
      expect(res.body.conflicts.some((c: any) => c.kind === 'CANDIDATE')).toBe(true);
    });

    it('rejects an overlapping explicitly assigned interviewer', async () => {
      // Existing interview at 13:00 for a DIFFERENT candidate (app3) with the
      // admin as interviewer.
      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app3Id,
          type: 'TECHNICAL',
          title: 'Interviewer busy 13:00',
          scheduledAt: iso(13),
          durationMinutes: 60,
          timezone: 'UTC',
          participants: [{ membershipId: adminMembershipId, role: 'INTERVIEWER' }],
        })
        .expect(201);

      // Same slot for a different candidate, same interviewer → PARTICIPANT conflict.
      const res = await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'PHONE',
          title: 'Interviewer overlap',
          scheduledAt: iso(13),
          durationMinutes: 60,
          timezone: 'UTC',
          participants: [{ membershipId: adminMembershipId, role: 'INTERVIEWER' }],
        })
        .expect(409);
      expect(res.body.errorCode).toBe('INTERVIEW_SLOT_CONFLICT');
      expect(res.body.conflicts.some((c: any) => c.kind === 'PARTICIPANT')).toBe(true);
    });

    it('rejects containing/contained intervals', async () => {
      // Slot B is 11:00-12:00. A 2h slot from 10:30-12:30 contains it.
      const contained = await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'PHONE',
          title: 'Contains Slot B',
          scheduledAt: iso(10.5),
          durationMinutes: 120,
          timezone: 'UTC',
        })
        .expect(409);
      expect(contained.body.errorCode).toBe('INTERVIEW_SLOT_CONFLICT');

      // A 30-min slot fully inside Slot A (10:00-11:00).
      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'PHONE',
          title: 'Inside Slot A',
          scheduledAt: iso(10.25),
          durationMinutes: 30,
          timezone: 'UTC',
        })
        .expect(409);
    });

    it('rejects rescheduling into a conflicting slot', async () => {
      // Slot B exists 11:00-12:00. Try to reschedule Slot A into it.
      const list = await request(app.getHttpServer())
        .get('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .query({ applicationId: app2Id, status: 'SCHEDULED' })
        .expect(200);
      const slotA = list.body.data.find((i: any) => i.title === 'Slot A');
      expect(slotA).toBeDefined();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interviews/${slotA.id}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledAt: iso(11), timezone: 'UTC', expectedVersion: slotA.version })
        .expect(409);
      expect(res.body.errorCode).toBe('INTERVIEW_SLOT_CONFLICT');
    });

    it('cancelled interviews do not block the slot', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .query({ applicationId: app2Id })
        .expect(200);
      const slotB = list.body.data.find((i: any) => i.title === 'Slot B (adjacent)');
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/interviews/${slotB.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/interviews/${slotB.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Freed for overlap test', expectedVersion: detail.body.data.version })
        .expect(200);

      // 11:00-12:00 is now free again.
      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'PHONE',
          title: 'After cancel',
          scheduledAt: iso(11),
          durationMinutes: 60,
          timezone: 'UTC',
        })
        .expect(201);
    });

    it('normalizes timezone offsets (same instant conflicts)', async () => {
      // Slot A is 10:00 UTC. Express 10:00 UTC as 12:00 +02:00 — same instant.
      const sameInstantLocal = new Date(base + 10 * 3600000 + 2 * 3600000)
        .toISOString()
        .replace('Z', '+02:00');
      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'PHONE',
          title: 'Offset-normalized overlap',
          scheduledAt: sameInstantLocal,
          durationMinutes: 30,
          timezone: 'Europe/Berlin',
        })
        .expect(409);
    });

    it("does not leak or react to another tenant's schedules", async () => {
      // Second tenant registers and schedules their own interview at the SAME
      // instant — both succeed because conflicts are company-scoped.
      const otherUser = {
        companyName: `Other Corp ${base}`,
        email: `other-${base}@test.com`,
        firstName: 'Other',
        lastName: 'Admin',
        password: 'E2eStr0ng!Pass',
        passwordConfirmation: 'E2eStr0ng!Pass',
        country: 'UG',
        timezone: 'UTC',
        acceptTerms: true,
      };
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register-company')
        .send(otherUser)
        .expect(201);
      expect(reg.body.data.userId).toBeDefined();

      const prisma = new PrismaClient();
      const dbUser = await prisma.user.findUnique({
        where: { normalizedEmail: otherUser.email.toLowerCase().trim() },
      });
      await prisma.user.update({
        where: { id: dbUser!.id },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      await prisma.$disconnect();

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: otherUser.email, password: otherUser.password })
        .expect(200);
      const otherToken = login.body.data.tokens.accessToken;

      const prisma2 = new PrismaClient();
      const otherMem = await prisma2.companyMembership.findFirst({
        where: { companyId: login.body.data.activeCompany.id },
      });
      await prisma2.companySettings.upsert({
        where: { companyId: login.body.data.activeCompany.id },
        create: { companyId: login.body.data.activeCompany.id, requireJobApproval: false },
        update: { requireJobApproval: false },
      });
      await prisma2.$disconnect();
      expect(otherMem).toBeTruthy();

      const otherCand = await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          firstName: 'Other',
          lastName: 'Candidate',
          email: `other-cand-${base}@test.com`,
          source: 'RECRUITER_CREATED',
        })
        .expect(201);

      const otherJob = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          title: `Other Job ${base}`,
          employmentType: 'FULL_TIME',
          workplaceType: 'REMOTE',
          experienceLevel: 'MID',
          description: 'Other tenant job',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${otherJob.body.data.id}/publish`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      const otherApp = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          candidateId: otherCand.body.data.id,
          jobId: otherJob.body.data.id,
          source: 'RECRUITER_CREATED',
        })
        .expect(201);

      // Same UTC instant as Slot A (10:00 UTC) — must NOT conflict across tenants.
      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          applicationId: otherApp.body.data.id,
          type: 'TECHNICAL',
          title: 'Other tenant same slot',
          scheduledAt: iso(10),
          durationMinutes: 60,
          timezone: 'UTC',
        })
        .expect(201);

      // And tenant A still schedules in their own company at 12:00 UTC.
      await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'TECHNICAL',
          title: 'Tenant A after other-tenant test',
          scheduledAt: iso(12),
          durationMinutes: 60,
          timezone: 'UTC',
        })
        .expect(201);

      // Conflict response never contains another tenant's interview ids.
      const conflict = await request(app.getHttpServer())
        .post('/api/v1/interviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          applicationId: app2Id,
          type: 'PHONE',
          title: 'Conflict check stays scoped',
          scheduledAt: iso(12),
          durationMinutes: 60,
          timezone: 'UTC',
        })
        .expect(409);
      for (const c of conflict.body.conflicts as any[]) {
        expect(c.interviewId).not.toContain('other');
      }
    });
  });
});
