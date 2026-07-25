import { PrismaClient, RoleScope } from '@prisma/client';
import * as bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

// Deterministic UUIDs for idempotent seeding
const USER_ID = '00000000-0000-0000-0000-00000000d001';
const COMPANY_ID = '00000000-0000-0000-0000-00000000d010';
const MEMBERSHIP_ID = '00000000-0000-0000-0000-00000000d020';
const DEPARTMENT_ID = '00000000-0000-0000-0000-00000000d030';
const LOCATION_ID = '00000000-0000-0000-0000-00000000d040';
const JOB_ID = '00000000-0000-0000-0000-00000000d050';

const PIPELINE_ID = '00000000-0000-0000-0000-00000000d100';
const STAGE_APPLIED = '00000000-0000-0000-0000-00000000d110';
const STAGE_SCREENING = '00000000-0000-0000-0000-00000000d111';
const STAGE_INTERVIEW = '00000000-0000-0000-0000-00000000d112';
const STAGE_OFFER = '00000000-0000-0000-0000-00000000d113';
const STAGE_HIRED = '00000000-0000-0000-0000-00000000d114';
const STAGE_REJECTED = '00000000-0000-0000-0000-00000000d115';

const CANDIDATE_ALICE = '00000000-0000-0000-0000-00000000d200';
const CANDIDATE_BOB = '00000000-0000-0000-0000-00000000d201';
const CANDIDATE_CAROL = '00000000-0000-0000-0000-00000000d202';

const CC_ALICE = '00000000-0000-0000-0000-00000000d210';
const CC_BOB = '00000000-0000-0000-0000-00000000d211';
const CC_CAROL = '00000000-0000-0000-0000-00000000d212';

const APP_ALICE = '00000000-0000-0000-0000-00000000d300';
const APP_BOB = '00000000-0000-0000-0000-00000000d301';
const APP_CAROL = '00000000-0000-0000-0000-00000000d302';

async function main() {
  console.log('Seeding dev data...\n');

  // Ensure the COMPANY_ADMIN role exists (created by seed.ts)
  const adminRole = await prisma.role.findUnique({
    where: { code_scope: { code: 'COMPANY_ADMIN', scope: 'COMPANY' } },
  });
  if (!adminRole) {
    throw new Error('COMPANY_ADMIN role not found. Run `prisma db seed` (seed.ts) first.');
  }

  // 1. User
  const passwordHash = await bcryptjs.hash('admin123', 10);
  await prisma.user.upsert({
    where: { normalizedEmail: 'sarah@airecruiter.com' },
    update: { status: 'ACTIVE', emailVerifiedAt: new Date(), passwordHash },
    create: {
      id: USER_ID,
      email: 'sarah@airecruiter.com',
      normalizedEmail: 'sarah@airecruiter.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Chen',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  console.log('  User sarah@airecruiter.com ready');

  // 2. Company
  const companyData: any = { id: COMPANY_ID, name: 'AI Recruiter Co', slug: 'ai-recruiter-dev', status: 'ACTIVE', city: 'San Francisco', countryCode: 'US' };
  await prisma.company.upsert({ where: { slug: 'ai-recruiter-dev' }, update: companyData, create: companyData });
  console.log('  Company ai-recruiter-dev ready');

  // 3. Company settings — key: allow publishing without approval
  const settingsData: any = { companyId: COMPANY_ID, requireJobApproval: false, recruitersCanPublish: true };
  await prisma.companySettings.upsert({ where: { companyId: COMPANY_ID }, update: settingsData, create: settingsData });
  console.log('  Company settings ready (requireJobApproval=false)');

  // 4. Membership
  const membershipData: any = { id: MEMBERSHIP_ID, userId: USER_ID, companyId: COMPANY_ID, roleId: adminRole.id, status: 'ACTIVE', jobTitle: 'Company Admin', joinedAt: new Date() };
  await prisma.companyMembership.upsert({ where: { userId_companyId: { userId: USER_ID, companyId: COMPANY_ID } }, update: membershipData, create: membershipData });
  console.log('  Membership ready');

  // 5. Department
  const deptData: any = { id: DEPARTMENT_ID, companyId: COMPANY_ID, name: 'Engineering', status: 'ACTIVE', createdByUserId: USER_ID };
  await prisma.department.upsert({ where: { id: DEPARTMENT_ID }, update: deptData, create: deptData });
  console.log('  Department ready');

  // 6. Location
  const locData: any = { id: LOCATION_ID, companyId: COMPANY_ID, name: 'San Francisco HQ', addressLine1: '123 Market St', city: 'San Francisco', countryCode: 'US', status: 'ACTIVE' };
  await prisma.companyLocation.upsert({ where: { id: LOCATION_ID }, update: locData, create: locData });
  console.log('  Location ready');

  // 7. Job — PUBLISHED so it accepts applications
  const jobData: any = {
    id: JOB_ID, companyId: COMPANY_ID, title: 'Product Manager', slug: 'product-manager-dev',
    jobCode: 'PM-DEV-001', description: 'Lead product strategy and execution for our AI recruitment platform.',
    status: 'PUBLISHED', employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'SENIOR',
    departmentId: DEPARTMENT_ID, locationId: LOCATION_ID, numberOfOpenings: 2,
    salaryMin: 150000, salaryMax: 200000, salaryCurrency: 'USD', salaryVisible: true,
    ownerMembershipId: MEMBERSHIP_ID, createdByMembershipId: MEMBERSHIP_ID,
  };
  await prisma.job.upsert({ where: { id: JOB_ID }, update: jobData, create: jobData });
  console.log('  Job "Product Manager" (PUBLISHED) ready');

  // 8. Pipeline with stages
  const pipelineData: any = { id: PIPELINE_ID, jobId: JOB_ID, name: 'Default Pipeline', isActive: true, createdByMembershipId: MEMBERSHIP_ID };
  await prisma.jobPipeline.upsert({ where: { id: PIPELINE_ID }, update: pipelineData, create: pipelineData });

  const stages = [
    { id: STAGE_APPLIED, name: 'Applied', type: 'APPLIED', sortOrder: 0 },
    { id: STAGE_SCREENING, name: 'Screening', type: 'SCREENING', sortOrder: 1 },
    { id: STAGE_INTERVIEW, name: 'Interview', type: 'RECRUITER_INTERVIEW', sortOrder: 2 },
    { id: STAGE_OFFER, name: 'Offer', type: 'OFFER', sortOrder: 3 },
    { id: STAGE_HIRED, name: 'Hired', type: 'HIRED', sortOrder: 4 },
    { id: STAGE_REJECTED, name: 'Rejected', type: 'REJECTED', sortOrder: 5 },
  ];
  for (const s of stages) {
    const stageData: any = { id: s.id, pipelineId: PIPELINE_ID, name: s.name, type: s.type as any, sortOrder: s.sortOrder, required: true, autoAdvanceEnabled: false };
    await prisma.jobPipelineStage.upsert({ where: { id: s.id }, update: stageData, create: stageData });
  }
  console.log('  Pipeline with 6 stages ready');

  // 9. Candidates
  const candidateData = [
    { id: CANDIDATE_ALICE, firstName: 'Alice', lastName: 'Johnson', email: 'alice.j@example.com', ccId: CC_ALICE },
    { id: CANDIDATE_BOB, firstName: 'Bob', lastName: 'Smith', email: 'bob.s@example.com', ccId: CC_BOB },
    { id: CANDIDATE_CAROL, firstName: 'Carol', lastName: 'Davis', email: 'carol.d@example.com', ccId: CC_CAROL },
  ];
  for (const cd of candidateData) {
    const candData: any = { id: cd.id, firstName: cd.firstName, lastName: cd.lastName, email: cd.email, normalizedEmail: cd.email.toLowerCase(), status: 'ACTIVE', source: 'RECRUITER_CREATED' };
    await prisma.candidate.upsert({ where: { id: cd.id }, update: candData, create: candData });

    const ccData: any = { id: cd.ccId, companyId: COMPANY_ID, candidateId: cd.id, source: 'RECRUITER_CREATED', ownerMembershipId: MEMBERSHIP_ID, createdByMembershipId: MEMBERSHIP_ID };
    await prisma.companyCandidate.upsert({ where: { id: cd.ccId }, update: ccData, create: ccData });
  }
  console.log('  Candidates (Alice, Bob, Carol) ready');

  // 10. Applications — SUBMITTED with consent confirmed, in different stages
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  const counterData: any = { companyId: COMPANY_ID, year: 2026, lastValue: 10 };
  await prisma.applicationCounter.upsert({
    where: { companyId_year: { companyId: COMPANY_ID, year: 2026 } },
    update: counterData,
    create: counterData,
  });

  const appData = [
    {
      id: APP_ALICE,
      candidateId: CANDIDATE_ALICE,
      ccId: CC_ALICE,
      status: 'SUBMITTED',
      submittedAt: daysAgo(3),
      currentStageId: STAGE_APPLIED,
      version: 2,
    },
    {
      id: APP_BOB,
      candidateId: CANDIDATE_BOB,
      ccId: CC_BOB,
      status: 'UNDER_REVIEW',
      submittedAt: daysAgo(10),
      currentStageId: STAGE_SCREENING,
      version: 3,
    },
    {
      id: APP_CAROL,
      candidateId: CANDIDATE_CAROL,
      ccId: CC_CAROL,
      status: 'UNDER_REVIEW',
      submittedAt: daysAgo(7),
      currentStageId: STAGE_INTERVIEW,
      version: 3,
    },
  ];

  for (const app of appData) {
    const appData2: any = {
      id: app.id, companyId: COMPANY_ID, jobId: JOB_ID, candidateId: app.candidateId,
      companyCandidateId: app.ccId, applicationNumber: `APP-2026-${String(appData.indexOf(app) + 1).padStart(4, '0')}`,
      publicReference: `PUB-DEV-${app.id.slice(-4)}`, status: app.status as any, source: 'RECRUITER_CREATED',
      consentConfirmed: true, submittedAt: app.submittedAt, currentStageId: app.currentStageId, version: app.version,
    };
    await prisma.application.upsert({
      where: { id: app.id },
      update: appData2,
      create: appData2,
    });

    // Stage history entry for submission
    await prisma.applicationStageHistory.create({
      data: {
        applicationId: app.id,
        toStageId: app.currentStageId,
        toStatus: app.status === 'SUBMITTED' ? 'SUBMITTED' : 'UNDER_REVIEW',
        actorType: 'RECRUITER',
        occurredAt: app.submittedAt,
      },
    }).catch(() => {}); // ignore duplicates

    // Stage history for initial creation
    await prisma.applicationStageHistory.create({
      data: {
        applicationId: app.id,
        toStageId: STAGE_APPLIED,
        toStatus: 'DRAFT',
        actorType: 'RECRUITER',
        occurredAt: daysAgo(14),
      },
    }).catch(() => {});
  }

  // Bob moved from Applied -> Screening: add stage history
  await prisma.applicationStageHistory.create({
    data: {
      applicationId: APP_BOB,
      fromStageId: STAGE_APPLIED,
      toStageId: STAGE_SCREENING,
      toStatus: 'UNDER_REVIEW',
      actorType: 'RECRUITER',
      occurredAt: daysAgo(5),
    },
  }).catch(() => {});

  // Carol moved from Applied -> Screening -> Interview: add stage histories
  await prisma.applicationStageHistory.create({
    data: {
      applicationId: APP_CAROL,
      fromStageId: STAGE_APPLIED,
      toStageId: STAGE_SCREENING,
      toStatus: 'UNDER_REVIEW',
      actorType: 'RECRUITER',
      occurredAt: daysAgo(6),
    },
  }).catch(() => {});
  await prisma.applicationStageHistory.create({
    data: {
      applicationId: APP_CAROL,
      fromStageId: STAGE_SCREENING,
      toStageId: STAGE_INTERVIEW,
      toStatus: 'UNDER_REVIEW',
      actorType: 'RECRUITER',
      occurredAt: daysAgo(4),
    },
  }).catch(() => {});

  console.log('  Applications (Alice=Applied, Bob=Screening, Carol=Interview) ready');

  // 11. Update the user's active company in session — most recent membership
  await prisma.user.update({
    where: { normalizedEmail: 'sarah@airecruiter.com' },
    data: { preferredLocale: 'en' }, // just a no-op to ensure user record is complete
  });
  console.log('  User record finalized');

  console.log('\nDev data seeding completed successfully!');
  console.log('  Login: sarah@airecruiter.com / admin123');
  console.log('  Job:   Product Manager (PUBLISHED)');
  console.log('  Pipeline: 6 stages');
  console.log('  Alice Johnson -> Applied (movable)');
  console.log('  Bob Smith    -> Screening (movable)');
  console.log('  Carol Davis  -> Interview (movable)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
