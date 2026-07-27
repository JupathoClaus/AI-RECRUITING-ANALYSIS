import { PrismaClient } from '@prisma/client';
import * as bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

// Deterministic UUIDs for idempotent seeding
const USER_ID = '00000000-0000-4000-8000-000000000001';
const COMPANY_ID = '00000000-0000-4000-8000-000000000010';
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000020';
const DEPARTMENT_ENG = '00000000-0000-4000-8000-000000000030';
const DEPARTMENT_HR = '00000000-0000-4000-8000-000000000031';
const JOB_1 = '00000000-0000-4000-8000-000000000040';
const JOB_2 = '00000000-0000-4000-8000-000000000041';
const JOB_3 = '00000000-0000-4000-8000-000000000042';

const CANDIDATE_IDS = [
  '00000000-0000-4000-8000-000000000100',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000106',
  '00000000-0000-4000-8000-000000000107',
];

const CC_IDS = [
  '00000000-0000-4000-8000-000000000200',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000203',
  '00000000-0000-4000-8000-000000000204',
  '00000000-0000-4000-8000-000000000205',
  '00000000-0000-4000-8000-000000000206',
  '00000000-0000-4000-8000-000000000207',
];

const APP_IDS = [
  '00000000-0000-4000-8000-000000000300',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000303',
  '00000000-0000-4000-8000-000000000304',
  '00000000-0000-4000-8000-000000000305',
  '00000000-0000-4000-8000-000000000306',
  '00000000-0000-4000-8000-000000000307',
];

const INTERVIEW_IDS = [
  '00000000-0000-4000-8000-000000000400',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000402',
];

const PARTICIPANT_IDS = [
  '00000000-0000-4000-8000-000000000500',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000502',
];

const AUDIT_EVENT_IDS = [
  '00000000-0000-4000-8000-000000000600',
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000602',
  '00000000-0000-4000-8000-000000000603',
  '00000000-0000-4000-8000-000000000604',
];

const PIPELINE_ID = '00000000-0000-4000-8000-000000000700';
const STAGE_APPLIED = '00000000-0000-4000-8000-000000000710';
const STAGE_SCREENING = '00000000-0000-4000-8000-000000000711';
const STAGE_INTERVIEW = '00000000-0000-4000-8000-000000000712';
const STAGE_OFFER = '00000000-0000-4000-8000-000000000713';
const STAGE_HIRED = '00000000-0000-4000-8000-000000000714';
// JOB_2 and JOB_3 get unique stage IDs
const STAGE_J2_APPLIED = '00000000-0000-4000-8000-000000000810';
const STAGE_J2_SCREENING = '00000000-0000-4000-8000-000000000811';
const STAGE_J2_INTERVIEW = '00000000-0000-4000-8000-000000000812';
const STAGE_J2_OFFER = '00000000-0000-4000-8000-000000000813';
const STAGE_J2_HIRED = '00000000-0000-4000-8000-000000000814';
const STAGE_J3_APPLIED = '00000000-0000-4000-8000-000000000820';
const STAGE_J3_SCREENING = '00000000-0000-4000-8000-000000000821';
const STAGE_J3_INTERVIEW = '00000000-0000-4000-8000-000000000822';
const STAGE_J3_OFFER = '00000000-0000-4000-8000-000000000823';
const STAGE_J3_HIRED = '00000000-0000-4000-8000-000000000824';

async function main() {
  console.log('Seeding reports development data...\n');

  // 1. Ensure system role exists
  let adminRole = await prisma.role.findUnique({
    where: { code_scope: { code: 'COMPANY_ADMIN', scope: 'COMPANY' } },
  });
  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: { code: 'COMPANY_ADMIN', name: 'Company Administrator', scope: 'COMPANY', isSystem: true },
    });
    console.log('  Created COMPANY_ADMIN role');
  }

  // 2. User
  const passwordHash = await bcryptjs.hash('Password123!', 10);
  await prisma.user.upsert({
    where: { normalizedEmail: 'admin@reports.test' },
    update: {},
    create: {
      id: USER_ID,
      email: 'admin@reports.test',
      normalizedEmail: 'admin@reports.test',
      passwordHash,
      firstName: 'Reports',
      lastName: 'Admin',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  console.log('  User admin@reports.test ready');

  // 3. Company
  await prisma.company.upsert({
    where: { slug: 'reports-dev-co' },
    update: {},
    create: {
      id: COMPANY_ID,
      name: 'Reports Dev Co',
      slug: 'reports-dev-co',
      status: 'ACTIVE',
    },
  });
  console.log('  Company reports-dev-co ready');

  // 4. Company settings
  await prisma.companySettings.upsert({
    where: { companyId: COMPANY_ID },
    update: {},
    create: {
      companyId: COMPANY_ID,
      requireJobApproval: false,
      recruitersCanPublish: true,
    },
  });

  // 5. Membership
  await prisma.companyMembership.upsert({
    where: { userId_companyId: { userId: USER_ID, companyId: COMPANY_ID } },
    update: {},
    create: {
      id: MEMBERSHIP_ID,
      userId: USER_ID,
      companyId: COMPANY_ID,
      roleId: adminRole.id,
      status: 'ACTIVE',
      jobTitle: 'Reports Admin',
      joinedAt: new Date(),
    },
  });
  console.log('  Membership ready');

  // 6. Departments
  await prisma.department.upsert({
    where: { id: DEPARTMENT_ENG },
    update: {},
    create: {
      id: DEPARTMENT_ENG,
      companyId: COMPANY_ID,
      name: 'Engineering',
      status: 'ACTIVE',
      createdByUserId: USER_ID,
    },
  });
  await prisma.department.upsert({
    where: { id: DEPARTMENT_HR },
    update: {},
    create: {
      id: DEPARTMENT_HR,
      companyId: COMPANY_ID,
      name: 'Human Resources',
      status: 'ACTIVE',
      createdByUserId: USER_ID,
    },
  });
  console.log('  Departments ready');

  // 7. Jobs (create before pipelines since JobPipeline has FK to Job)
  type JobEnum = { status: any; employmentType: any; workplaceType: any; experienceLevel: any };
  const jobs: ({ id: string; title: string; departmentId: string; slug: string; description: string } & JobEnum)[] = [
    { id: JOB_1, title: 'Senior Software Engineer', departmentId: DEPARTMENT_ENG, status: 'PUBLISHED' as any, slug: 'senior-sw-eng-reports', employmentType: 'FULL_TIME' as any, workplaceType: 'HYBRID' as any, experienceLevel: 'SENIOR' as any, description: 'Build the future' },
    { id: JOB_2, title: 'HR Coordinator', departmentId: DEPARTMENT_HR, status: 'PUBLISHED' as any, slug: 'hr-coordinator-reports', employmentType: 'FULL_TIME' as any, workplaceType: 'ON_SITE' as any, experienceLevel: 'MID' as any, description: 'Support HR operations' },
    { id: JOB_3, title: 'Junior Developer', departmentId: DEPARTMENT_ENG, status: 'DRAFT' as any, slug: 'junior-dev-reports', employmentType: 'FULL_TIME' as any, workplaceType: 'REMOTE' as any, experienceLevel: 'JUNIOR' as any, description: 'Learn and grow' },
  ];
  for (const j of jobs) {
    await prisma.job.upsert({
      where: { id: j.id },
      update: {},
      create: {
        ...j,
        companyId: COMPANY_ID,
        jobCode: j.slug,
        ownerMembershipId: MEMBERSHIP_ID,
        createdByMembershipId: MEMBERSHIP_ID,
      } as any,
    });
  }
  console.log('  Jobs ready');

  // 8. Pipelines + Stages
  const stageData = [
    { id: STAGE_APPLIED, name: 'Applied', type: 'APPLIED' as any, sortOrder: 0 },
    { id: STAGE_SCREENING, name: 'Screening', type: 'SCREENING' as any, sortOrder: 1 },
    { id: STAGE_INTERVIEW, name: 'Interview', type: 'RECRUITER_INTERVIEW' as any, sortOrder: 2 },
    { id: STAGE_OFFER, name: 'Offer', type: 'OFFER' as any, sortOrder: 3 },
    { id: STAGE_HIRED, name: 'Hired', type: 'HIRED' as any, sortOrder: 4 },
  ];
  const J2_PIPELINE_ID = '00000000-0000-4000-8000-000000000701';
  const J3_PIPELINE_ID = '00000000-0000-4000-8000-000000000702';
  const pipelines = [
    { id: PIPELINE_ID, jobId: JOB_1, stageIds: [STAGE_APPLIED, STAGE_SCREENING, STAGE_INTERVIEW, STAGE_OFFER, STAGE_HIRED] },
    { id: J2_PIPELINE_ID, jobId: JOB_2, stageIds: [STAGE_J2_APPLIED, STAGE_J2_SCREENING, STAGE_J2_INTERVIEW, STAGE_J2_OFFER, STAGE_J2_HIRED] },
    { id: J3_PIPELINE_ID, jobId: JOB_3, stageIds: [STAGE_J3_APPLIED, STAGE_J3_SCREENING, STAGE_J3_INTERVIEW, STAGE_J3_OFFER, STAGE_J3_HIRED] },
  ];
  for (const p of pipelines) {
    await prisma.jobPipeline.upsert({
      where: { id: p.id },
      update: {},
      create: { id: p.id, jobId: p.jobId, name: 'Default Pipeline', createdByMembershipId: MEMBERSHIP_ID },
    });
    for (let i = 0; i < stageData.length; i++) {
      await prisma.jobPipelineStage.upsert({
        where: { id: p.stageIds[i] },
        update: {},
        create: { ...stageData[i], id: p.stageIds[i], pipelineId: p.id, required: true, autoAdvanceEnabled: false },
      });
    }
  }
  console.log('  Pipelines + stages ready');

  // 9. Candidates
  const candidates: { id: string; firstName: string; lastName: string; email: string; source: any; city: string }[] = [
    { id: CANDIDATE_IDS[0], firstName: 'Alice', lastName: 'Wang', email: 'alice@example.com', source: 'LINKEDIN' as any, city: 'San Francisco' },
    { id: CANDIDATE_IDS[1], firstName: 'Bob', lastName: 'Smith', email: 'bob@example.com', source: 'REFERRAL' as any, city: 'New York' },
    { id: CANDIDATE_IDS[2], firstName: 'Carol', lastName: 'Davis', email: 'carol@example.com', source: 'CAREERS_PAGE' as any, city: 'Austin' },
    { id: CANDIDATE_IDS[3], firstName: 'Dan', lastName: 'Lee', email: 'dan@example.com', source: 'JOB_BOARD' as any, city: 'Seattle' },
    { id: CANDIDATE_IDS[4], firstName: 'Eve', lastName: 'Chen', email: 'eve@example.com', source: 'LINKEDIN' as any, city: 'Chicago' },
    { id: CANDIDATE_IDS[5], firstName: 'Frank', lastName: 'Jones', email: 'frank@example.com', source: 'AGENCY' as any, city: 'Boston' },
    { id: CANDIDATE_IDS[6], firstName: 'Grace', lastName: 'Kim', email: 'grace@example.com', source: 'RECRUITER_CREATED' as any, city: 'Denver' },
    { id: CANDIDATE_IDS[7], firstName: 'Henry', lastName: 'Brown', email: 'henry@example.com', source: 'CAREERS_PAGE' as any, city: 'Portland' },
  ];
  for (const c of candidates) {
    await prisma.candidate.upsert({
      where: { id: c.id },
      update: {},
      create: {
        ...c,
        normalizedEmail: c.email!.toLowerCase(),
        status: 'ACTIVE' as any,
      } as any,
    });
  }
  console.log('  Candidates ready');

  // 10. CompanyCandidates
  const ccData = CANDIDATE_IDS.map((cid, i) => ({
    id: CC_IDS[i], companyId: COMPANY_ID, candidateId: cid, source: candidates[i].source as any, ownerMembershipId: MEMBERSHIP_ID, createdByMembershipId: MEMBERSHIP_ID,
  }));
  for (const cc of ccData) {
    await prisma.companyCandidate.upsert({
      where: { id: cc.id },
      update: {},
      create: cc,
    });
  }
  console.log('  CompanyCandidates ready');

  // 11. Applications — varied statuses / sources for comprehensive report data
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  const apps = [
    { id: APP_IDS[0], jobId: JOB_1, candidateId: CANDIDATE_IDS[0], ccId: CC_IDS[0], status: 'HIRED', source: 'LINKEDIN', submittedAt: daysAgo(30), hiredAt: daysAgo(2), currentStageId: STAGE_HIRED },
    { id: APP_IDS[1], jobId: JOB_1, candidateId: CANDIDATE_IDS[1], ccId: CC_IDS[1], status: 'INTERVIEW', source: 'REFERRAL', submittedAt: daysAgo(14), currentStageId: STAGE_INTERVIEW },
    { id: APP_IDS[2], jobId: JOB_1, candidateId: CANDIDATE_IDS[2], ccId: CC_IDS[2], status: 'REJECTED', source: 'CAREERS_PAGE', submittedAt: daysAgo(20), rejectedAt: daysAgo(5), rejectionReasonCode: 'SKILLS_MISMATCH', currentStageId: STAGE_SCREENING },
    { id: APP_IDS[3], jobId: JOB_2, candidateId: CANDIDATE_IDS[3], ccId: CC_IDS[3], status: 'SUBMITTED', source: 'JOB_BOARD', submittedAt: daysAgo(7), currentStageId: STAGE_J2_APPLIED },
    { id: APP_IDS[4], jobId: JOB_2, candidateId: CANDIDATE_IDS[4], ccId: CC_IDS[4], status: 'UNDER_REVIEW', source: 'LINKEDIN', submittedAt: daysAgo(10), currentStageId: STAGE_J2_SCREENING },
    { id: APP_IDS[5], jobId: JOB_2, candidateId: CANDIDATE_IDS[5], ccId: CC_IDS[5], status: 'HIRED', source: 'AGENCY', submittedAt: daysAgo(45), hiredAt: daysAgo(1), currentStageId: STAGE_J2_HIRED },
    { id: APP_IDS[6], jobId: JOB_3, candidateId: CANDIDATE_IDS[6], ccId: CC_IDS[6], status: 'DRAFT', source: 'RECRUITER_CREATED', currentStageId: STAGE_J3_APPLIED },
    { id: APP_IDS[7], jobId: JOB_3, candidateId: CANDIDATE_IDS[7], ccId: CC_IDS[7], status: 'WITHDRAWN', source: 'CAREERS_PAGE', submittedAt: daysAgo(3), withdrawnAt: daysAgo(1), currentStageId: STAGE_J3_APPLIED },
  ];

  // Also create ApplicationCounter records
  for (const app of apps) {
    // ApplicationCounter upsert for year 2026
    await prisma.applicationCounter.upsert({
      where: { companyId_year: { companyId: COMPANY_ID, year: 2026 } },
      update: {},
      create: { companyId: COMPANY_ID, year: 2026, lastValue: 10 },
    });
    await prisma.application.upsert({
      where: { id: app.id },
      update: {},
      create: {
        id: app.id,
        companyId: COMPANY_ID,
        jobId: app.jobId,
        candidateId: app.candidateId,
        companyCandidateId: app.ccId,
        applicationNumber: `APP-2026-${String(APP_IDS.indexOf(app.id) + 1).padStart(4, '0')}`,
        publicReference: `PUB-REF-${app.id.slice(-4)}`,
        status: app.status as any,
        source: app.source as any,
        submittedAt: app.submittedAt ?? undefined,
        hiredAt: app.hiredAt ?? undefined,
        rejectedAt: app.rejectedAt ?? undefined,
        rejectionReasonCode: app.rejectionReasonCode ?? undefined,
        withdrawnAt: app.withdrawnAt ?? undefined,
        currentStageId: app.currentStageId ?? undefined,
      },
    });

    // Stage history entry
    if (app.submittedAt) {
      await prisma.applicationStageHistory.create({
        data: {
          applicationId: app.id,
          fromStageId: undefined,
          toStageId: app.currentStageId ?? STAGE_APPLIED,
          toStatus: (app.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED') as any,
          actorType: 'CANDIDATE',
          occurredAt: app.submittedAt,
        },
      }).catch(() => {}); // Ignore duplicate key errors
    }
  }
  console.log('  Applications ready');

  // 12. Interviews (for reports that need interview data)
  const interviews: { id: string; applicationId: string; jobId: string; type: any; status: any; result: any; title: string; jobPipelineStageId: any; scheduledAt: Date; completedAt?: Date; durationMinutes: number }[] = [
    { id: INTERVIEW_IDS[0], applicationId: APP_IDS[0], jobId: JOB_1, type: 'FINAL' as any, status: 'COMPLETED' as any, result: 'PASS' as any, title: 'Final round with Alice', jobPipelineStageId: STAGE_INTERVIEW, scheduledAt: daysAgo(5), completedAt: daysAgo(5), durationMinutes: 60 },
    { id: INTERVIEW_IDS[1], applicationId: APP_IDS[1], jobId: JOB_1, type: 'TECHNICAL' as any, status: 'SCHEDULED' as any, result: 'PENDING' as any, title: 'Tech screen with Bob', jobPipelineStageId: STAGE_INTERVIEW, scheduledAt: daysAgo(1), durationMinutes: 45 },
    { id: INTERVIEW_IDS[2], applicationId: APP_IDS[4], jobId: JOB_2, type: 'PHONE' as any, status: 'COMPLETED' as any, result: 'PASS' as any, title: 'Phone screen with Eve', jobPipelineStageId: STAGE_J2_INTERVIEW, scheduledAt: daysAgo(3), completedAt: daysAgo(3), durationMinutes: 30 },
  ];
  for (const iv of interviews) {
    await prisma.interview.upsert({
      where: { id: iv.id },
      update: {},
      create: {
        ...iv,
        companyId: COMPANY_ID,
        createdByMembershipId: MEMBERSHIP_ID,
      } as any,
    });
  }

  // Interview participants
  const participants: { id: string; interviewId: string; membershipId: string; role: any; status: any; addedByMembershipId: string }[] = [
    { id: PARTICIPANT_IDS[0], interviewId: INTERVIEW_IDS[0], membershipId: MEMBERSHIP_ID, role: 'INTERVIEWER' as any, status: 'ATTENDED' as any, addedByMembershipId: MEMBERSHIP_ID },
    { id: PARTICIPANT_IDS[1], interviewId: INTERVIEW_IDS[1], membershipId: MEMBERSHIP_ID, role: 'INTERVIEWER' as any, status: 'CONFIRMED' as any, addedByMembershipId: MEMBERSHIP_ID },
    { id: PARTICIPANT_IDS[2], interviewId: INTERVIEW_IDS[2], membershipId: MEMBERSHIP_ID, role: 'INTERVIEWER' as any, status: 'ATTENDED' as any, addedByMembershipId: MEMBERSHIP_ID },
  ];
  for (const p of participants) {
    await prisma.interviewParticipant.upsert({
      where: { id: p.id },
      update: {},
      create: p as any,
    });
  }
  console.log('  Interviews ready');

  // 13. Audit events for Activity report
  const auditEvents: { id: string; applicationId: string; eventType: any; description: string; actorType: any; occurredAt: Date }[] = [
    { id: AUDIT_EVENT_IDS[0], applicationId: APP_IDS[0], eventType: 'APPLICATION_CREATED' as any, description: 'Application created by candidate', actorType: 'CANDIDATE' as any, occurredAt: daysAgo(30) },
    { id: AUDIT_EVENT_IDS[1], applicationId: APP_IDS[1], eventType: 'APPLICATION_CREATED' as any, description: 'Application created via referral', actorType: 'CANDIDATE' as any, occurredAt: daysAgo(14) },
    { id: AUDIT_EVENT_IDS[2], applicationId: APP_IDS[2], eventType: 'APPLICATION_REJECTED' as any, description: 'Candidate rejected - skills mismatch', actorType: 'RECRUITER' as any, occurredAt: daysAgo(5) },
    { id: AUDIT_EVENT_IDS[3], applicationId: APP_IDS[5], eventType: 'APPLICATION_HIRED' as any, description: 'Candidate hired', actorType: 'RECRUITER' as any, occurredAt: daysAgo(1) },
    { id: AUDIT_EVENT_IDS[4], applicationId: APP_IDS[0], eventType: 'APPLICATION_HIRED' as any, description: 'Application moved to hired', actorType: 'RECRUITER' as any, occurredAt: daysAgo(2) },
  ];
  for (const ev of auditEvents) {
    await prisma.applicationAuditEvent.upsert({
      where: { id: ev.id },
      update: {},
      create: {
        ...ev,
        companyId: COMPANY_ID,
        entityType: 'APPLICATION',
        actorMembershipId: ev.actorType === 'RECRUITER' ? MEMBERSHIP_ID : undefined,
      } as any,
    });
  }
  console.log('  Audit events ready');

  console.log('\nReports dev data seeding completed successfully!');
  console.log('  Login: admin@reports.test / Password123!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
