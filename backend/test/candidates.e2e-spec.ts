import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Candidates (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let candidateId: string;
  let candidateVersion: number;
  let skillId: string;
  let candidateSkillId: string;
  let employmentId: string;
  let educationId: string;
  let certificationId: string;
  let languageId: string;
  let consentId: string;

  const testUser = {
    companyName: 'Candidates E2E Corp',
    email: 'candidates-e2e-admin@test-corp.com',
    firstName: 'Candidates',
    lastName: 'Admin',
    password: 'E2eStr0ng!Pass',
    passwordConfirmation: 'E2eStr0ng!Pass',
    country: 'US',
    timezone: 'America/New_York',
    acceptTerms: true,
  };

  const testCandidate = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1-555-123-4567',
    city: 'New York',
    countryCode: 'US',
    headline: 'Senior Software Engineer',
    source: 'RECRUITER_CREATED',
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    // Clean up any prior test data so the suite is idempotent on re-runs.
    // Each step is wrapped independently so a single FK error doesn't abort all cleanup.
    const prisma = new PrismaClient();
    const safe = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* non-fatal */
      }
    };
    try {
      const normalizedEmail = testUser.email.toLowerCase().trim();
      const testCandidateEmail = testCandidate.email.toLowerCase().trim();
      // normalized form of +1-555-123-4567
      const testCandidatePhone = '+15551234567';

      // ── Step 1: Candidate cleanup (audit events first, then cascade-safe delete) ──
      const testCandidates = await prisma.candidate.findMany({
        where: {
          OR: [{ normalizedEmail: testCandidateEmail }, { normalizedPhone: testCandidatePhone }],
        },
        select: { id: true },
      });
      const testCandidateIds = testCandidates.map((c) => c.id);
      if (testCandidateIds.length > 0) {
        await safe('candidate audit events', () =>
          prisma.candidateAuditEvent.deleteMany({
            where: { candidateId: { in: testCandidateIds } },
          }),
        );
        await safe('candidate merge records', () =>
          prisma.candidateMergeRecord.deleteMany({
            where: {
              OR: [
                { primaryCandidateId: { in: testCandidateIds } },
                { mergedCandidateId: { in: testCandidateIds } },
              ],
            },
          }),
        );
        // CandidateSkill, Employment, Education, Certification, Language, Consent
        // all have onDelete: Cascade so deleteMany on Candidate handles them
        // Phase 2.2: Also delete CompanyCandidate records and their children
        const ccs = await prisma.companyCandidate.findMany({
          where: { candidateId: { in: testCandidateIds } },
          select: { id: true },
        });
        const ccIds = ccs.map((c) => c.id);
        if (ccIds.length > 0) {
          await safe('application audit events (cc)', () =>
            prisma.applicationAuditEvent.deleteMany({
              where: { companyCandidateId: { in: ccIds } },
            }),
          );
          await safe('applications (cc)', () => {
            // Delete applications linked to these company candidates
            return prisma.application
              .findMany({ where: { companyCandidateId: { in: ccIds } }, select: { id: true } })
              .then(async (apps) => {
                const appIds = apps.map((a) => a.id);
                if (appIds.length) {
                  await prisma.applicationAuditEvent.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.applicationDecision.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.applicationFlag.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.applicationNote.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.applicationAssignment.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.applicationStageHistory.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.applicationScreeningAnswer.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.applicationTagAssignment.deleteMany({
                    where: { applicationId: { in: appIds } },
                  });
                  await prisma.application.deleteMany({ where: { id: { in: appIds } } });
                }
              });
          });
          await safe('cc notes', () =>
            prisma.companyCandidateNote.deleteMany({
              where: { companyCandidateId: { in: ccIds } },
            }),
          );
          await safe('cc tags', () =>
            prisma.companyCandidateTag.deleteMany({ where: { companyCandidateId: { in: ccIds } } }),
          );
          await safe('company candidates', () =>
            prisma.companyCandidate.deleteMany({ where: { id: { in: ccIds } } }),
          );
        }
        await safe('candidates', () =>
          prisma.candidate.deleteMany({ where: { id: { in: testCandidateIds } } }),
        );
      }

      // ── Step 2: User/company cleanup ──
      const user = await prisma.user.findUnique({ where: { normalizedEmail } });
      if (user) {
        const memberships = await prisma.companyMembership.findMany({
          where: { userId: user.id },
          select: { id: true, companyId: true },
        });
        const companyIds = memberships.map((m) => m.companyId);
        const membershipIds = memberships.map((m) => m.id);

        // Jobs
        const jobs = await prisma.job.findMany({
          where: { companyId: { in: companyIds } },
          select: { id: true },
        });
        const jobIds = jobs.map((j) => j.id);
        if (jobIds.length > 0) {
          await safe('jobActivityEvents', () =>
            prisma.jobActivityEvent.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobCollaborators(job)', () =>
            prisma.jobCollaborator.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobApprovals', () =>
            prisma.jobApproval.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobPublications', () =>
            prisma.jobPublication.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobScreeningQuestions', () =>
            prisma.jobScreeningQuestion.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobScreeningConfig', () =>
            prisma.jobScreeningConfiguration.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobAccessibilityConfig', () =>
            prisma.jobAccessibilityConfiguration.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          const pipelines = await prisma.jobPipeline.findMany({
            where: { jobId: { in: jobIds } },
            select: { id: true },
          });
          await safe('pipelineStages', () =>
            prisma.jobPipelineStage.deleteMany({
              where: { pipelineId: { in: pipelines.map((p) => p.id) } },
            }),
          );
          await safe('pipelines', () =>
            prisma.jobPipeline.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobSkills', () =>
            prisma.jobSkill.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobEduReqs', () =>
            prisma.jobEducationRequirement.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobExpReqs', () =>
            prisma.jobExperienceRequirement.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobLangReqs', () =>
            prisma.jobLanguageRequirement.deleteMany({ where: { jobId: { in: jobIds } } }),
          );
          await safe('jobs', () =>
            prisma.job.deleteMany({ where: { companyId: { in: companyIds } } }),
          );
        }

        // Membership deps
        await safe('jobCollaborators(membership)', () =>
          prisma.jobCollaborator.deleteMany({
            where: { companyMembershipId: { in: membershipIds } },
          }),
        );
        await safe('deptMemberships', () =>
          prisma.departmentMembership.deleteMany({
            where: { companyMembershipId: { in: membershipIds } },
          }),
        );
        await safe('invitations', () =>
          prisma.companyInvitation.deleteMany({ where: { companyId: { in: companyIds } } }),
        );
        await safe('orgAuditEvents', () =>
          prisma.organizationAuditEvent.deleteMany({ where: { companyId: { in: companyIds } } }),
        );
        await safe('authAuditEvents', () =>
          prisma.authAuditEvent.deleteMany({ where: { userId: user.id } }),
        );
        await safe('sessions', () => prisma.userSession.deleteMany({ where: { userId: user.id } }));
        await safe('verificationTokens', () =>
          prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
        );

        // Company resources
        await safe('departments', () =>
          prisma.department.deleteMany({ where: { companyId: { in: companyIds } } }),
        );
        await safe('locations', () =>
          prisma.companyLocation.deleteMany({ where: { companyId: { in: companyIds } } }),
        );
        await safe('companySettings', () =>
          prisma.companySettings.deleteMany({ where: { companyId: { in: companyIds } } }),
        );
        await safe('companySkills', () =>
          prisma.skill.deleteMany({ where: { companyId: { in: companyIds } } }),
        );
        await safe('jobTemplates', () =>
          prisma.jobTemplate.deleteMany({ where: { companyId: { in: companyIds } } }),
        );
        await safe('companyRoles', () =>
          prisma.role.deleteMany({ where: { companyId: { in: companyIds }, isSystem: false } }),
        );

        // Memberships, companies, user
        await safe('memberships', () =>
          prisma.companyMembership.deleteMany({ where: { userId: user.id } }),
        );
        await safe('companies', () =>
          prisma.company.deleteMany({ where: { id: { in: companyIds } } }),
        );
        await safe('user', () => prisma.user.delete({ where: { id: user.id } }));
      }
    } finally {
      await prisma.$disconnect();
    }

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

  describe('Setup: Register and login', () => {
    it('should register a new company for candidate E2E tests', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register-company')
        .send(testUser)
        .expect(201);

      expect(res.body.data.verificationToken).toBeDefined();

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: res.body.data.verificationToken })
        .expect(200);

      expect(verifyRes.body.data.message).toBe('Email verified successfully');
    });

    it('should login and get access token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      accessToken = res.body.data.tokens.accessToken;
      expect(accessToken).toBeDefined();
    });

    it('should find a global skill for testing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/skills?search=TypeScript')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      skillId = res.body.data[0].id;
    });
  });

  describe('POST /api/v1/candidates', () => {
    it('should create a candidate', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(testCandidate)
        .expect(201);

      candidateId = res.body.data.id;
      candidateVersion = res.body.data.version;
      expect(res.body.data.firstName).toBe('John');
      expect(res.body.data.lastName).toBe('Doe');
      expect(res.body.data.email).toBeUndefined(); // no sensitive permission
      expect(res.body.data.version).toBe(1);
    });

    it('should reject duplicate candidate', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(testCandidate)
        .expect(409);
    });

    it('should reject candidate without email and phone', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'No', lastName: 'Contact', source: 'RECRUITER_CREATED' })
        .expect(400);
    });
  });

  describe('GET /api/v1/candidates', () => {
    it('should list candidates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candidates')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('should search candidates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candidates?search=John')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candidates?status=ACTIVE')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/candidates/:candidateId', () => {
    it('should get candidate by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(candidateId);
    });

    it('should return 404 for non-existent candidate', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/candidates/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/candidates/:candidateId', () => {
    it('should update candidate', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${candidateId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ headline: 'Lead Software Engineer', expectedVersion: candidateVersion })
        .expect(200);

      expect(res.body.data.headline).toBe('Lead Software Engineer');
      expect(res.body.data.version).toBe(candidateVersion + 1);
      candidateVersion = res.body.data.version;
    });

    it('should reject stale version update', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${candidateId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ headline: 'Should fail', expectedVersion: 1 })
        .expect(409);
    });
  });

  describe('Skills sub-resource', () => {
    it('should add a skill', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/skills`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ skillId, proficiencyLevel: 'Advanced', yearsOfExperience: 5 })
        .expect(201);

      candidateSkillId = res.body.data.id;
      expect(res.body.data.skillId).toBe(skillId);
    });

    it('should reject duplicate skill', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/skills`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ skillId })
        .expect(409);
    });

    it('should get candidate skills', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}/skills`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should update a skill', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${candidateId}/skills/${candidateSkillId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ proficiencyLevel: 'Expert' })
        .expect(200);

      expect(res.body.data.proficiencyLevel).toBe('Expert');
    });

    it('should delete a skill', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${candidateId}/skills/${candidateSkillId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('Employment sub-resource', () => {
    it('should add employment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/employment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          type: 'EMPLOYMENT',
          companyName: 'Acme Corp',
          jobTitle: 'Software Engineer',
          startDate: '2020-01-15T00:00:00.000Z',
          currentlyWorking: true,
        })
        .expect(201);

      employmentId = res.body.data.id;
    });

    it('should get employment records', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}/employment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should delete employment', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${candidateId}/employment/${employmentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('Education sub-resource', () => {
    it('should add education', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/education`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          institution: 'MIT',
          level: 'BACHELORS',
          fieldOfStudy: 'Computer Science',
          status: 'COMPLETED',
          startDate: '2016-09-01T00:00:00.000Z',
          endDate: '2020-06-01T00:00:00.000Z',
        })
        .expect(201);

      educationId = res.body.data.id;
    });

    it('should get education records', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}/education`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should delete education', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${candidateId}/education/${educationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('Certification sub-resource', () => {
    it('should add certification', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/certifications`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'AWS Certified Developer',
          issuingOrganization: 'Amazon',
          issuedAt: '2022-03-15T00:00:00.000Z',
        })
        .expect(201);

      certificationId = res.body.data.id;
    });

    it('should get certifications', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}/certifications`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should delete certification', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${candidateId}/certifications/${certificationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('Language sub-resource', () => {
    it('should add a language', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/languages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ languageCode: 'en', proficiency: 'NATIVE', preferredInterviewLanguage: true })
        .expect(201);

      languageId = res.body.data.id;
    });

    it('should get languages', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}/languages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should set preferred language', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/languages/${languageId}/set-preferred`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should delete language', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${candidateId}/languages/${languageId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('Consent sub-resource', () => {
    it('should grant consent', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/consents/grant`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'PRIVACY_POLICY', policyVersion: '1.0' })
        .expect(201);

      consentId = res.body.data.id;
    });

    it('should get consents', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}/consents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should revoke consent', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/consents/${consentId}/revoke`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('Archive/Restore', () => {
    it('should archive candidate', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedVersion: candidateVersion, reason: 'No longer interested' })
        .expect(200);

      expect(res.body.data.archived).toBe(true);
      candidateVersion = res.body.data.version;
    });

    it('should restore candidate', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/candidates/${candidateId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expectedVersion: candidateVersion })
        .expect(200);

      expect(res.body.data.restored).toBe(true);
      candidateVersion = res.body.data.version;
    });
  });

  describe('Activity', () => {
    it('should return activity history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates/${candidateId}/activity`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Unauthorized access', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/v1/candidates').expect(401);
    });
  });
});
