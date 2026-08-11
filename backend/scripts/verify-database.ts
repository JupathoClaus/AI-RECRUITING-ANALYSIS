import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Database verification...');
  let passed = 0;
  let failed = 0;

  // 1. Upsert and read SystemMetadata
  try {
    const record = await prisma.systemMetadata.upsert({
      where: { key: 'database_initialized' },
      update: { value: { verifiedAt: new Date().toISOString() } },
      create: { key: 'database_initialized', value: { verifiedAt: new Date().toISOString() } },
    });
    const readBack = await prisma.systemMetadata.findUnique({
      where: { key: 'database_initialized' },
    });
    if (readBack && readBack.key === 'database_initialized') {
      console.log('[PASS] SystemMetadata upsert and read-back');
      passed++;
    } else {
      console.log('[FAIL] SystemMetadata read-back failed');
      failed++;
    }
  } catch (e) {
    console.log('[FAIL] SystemMetadata:', (e as Error).message);
    failed++;
  }

  // 2. Confirm seeded roles exist
  try {
    const roleCount = await prisma.role.count();
    const expectedRoles = ['PLATFORM_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'VIEWER'];
    const foundRoles = await prisma.role.findMany({ where: { code: { in: expectedRoles } } });
    if (foundRoles.length === expectedRoles.length) {
      console.log(`[PASS] Roles: ${roleCount} total, ${foundRoles.length}/7 system roles present`);
      passed++;
    } else {
      console.log(`[FAIL] Roles: expected ${expectedRoles.length}, found ${foundRoles.length}`);
      failed++;
    }
  } catch (e) {
    console.log('[FAIL] Role query:', (e as Error).message);
    failed++;
  }

  // 3. Confirm permissions exist
  try {
    const permissionCount = await prisma.permission.count();
    if (permissionCount >= 49) {
      console.log(`[PASS] Permissions: ${permissionCount}`);
      passed++;
    } else {
      console.log(`[FAIL] Permissions: expected >= 49, got ${permissionCount}`);
      failed++;
    }
  } catch (e) {
    console.log('[FAIL] Permission query:', (e as Error).message);
    failed++;
  }

  // 4. Confirm role-permission relationships exist
  try {
    const rpCount = await prisma.rolePermission.count();
    if (rpCount >= 180) {
      console.log(`[PASS] Role-Permission mappings: ${rpCount}`);
      passed++;
    } else {
      console.log(`[FAIL] Role-Permission mappings: expected >= 180, got ${rpCount}`);
      failed++;
    }
  } catch (e) {
    console.log('[FAIL] RolePermission query:', (e as Error).message);
    failed++;
  }

  // 5. Confirm global skills exist
  try {
    const skillCount = await prisma.skill.count({ where: { isGlobal: true } });
    if (skillCount >= 20) {
      console.log(`[PASS] Global skills: ${skillCount}`);
      passed++;
    } else {
      console.log(`[FAIL] Global skills: expected >= 20, got ${skillCount}`);
      failed++;
    }
  } catch (e) {
    console.log('[FAIL] Skill query:', (e as Error).message);
    failed++;
  }

  // 6. Confirm candidate tables exist
  const candidateModels: [string, () => Promise<number>] [] = [
    ['Candidate', () => prisma.candidate.count()],
    ['CandidateSkill', () => prisma.candidateSkill.count()],
    ['CandidateEmployment', () => prisma.candidateEmployment.count()],
    ['CandidateEducation', () => prisma.candidateEducation.count()],
    ['CandidateCertification', () => prisma.candidateCertification.count()],
    ['CandidateLanguage', () => prisma.candidateLanguage.count()],
    ['CandidateConsent', () => prisma.candidateConsent.count()],
    ['CandidateAuditEvent', () => prisma.candidateAuditEvent.count()],
    ['CandidateMergeRecord', () => prisma.candidateMergeRecord.count()],
    // Phase 2.2
    ['CompanyCandidate', () => prisma.companyCandidate.count()],
    ['CandidateTag', () => prisma.candidateTag.count()],
    ['CompanyCandidateTag', () => prisma.companyCandidateTag.count()],
    ['CompanyCandidateNote', () => prisma.companyCandidateNote.count()],
    ['Application', () => prisma.application.count()],
    ['ApplicationCounter', () => prisma.applicationCounter.count()],
    ['ApplicationScreeningAnswer', () => prisma.applicationScreeningAnswer.count()],
    ['ApplicationStageHistory', () => prisma.applicationStageHistory.count()],
    ['ApplicationAssignment', () => prisma.applicationAssignment.count()],
    ['ApplicationNote', () => prisma.applicationNote.count()],
    ['ApplicationFlag', () => prisma.applicationFlag.count()],
    ['ApplicationDecision', () => prisma.applicationDecision.count()],
    ['ApplicationAuditEvent', () => prisma.applicationAuditEvent.count()],
    // Phase 2.3
    ['Interview', () => prisma.interview.count()],
    ['InterviewParticipant', () => prisma.interviewParticipant.count()],
    ['InterviewHistory', () => prisma.interviewHistory.count()],
  ];

  for (const [name, countFn] of candidateModels) {
    try {
      const count = await countFn();
      console.log(`[PASS] ${name} table accessible (${count} rows)`);
      passed++;
    } catch (e) {
      console.log(`[FAIL] ${name} table:`, (e as Error).message);
      failed++;
    }
  }

  console.log('');
  if (failed === 0) {
    console.log(`Database verification PASSED (${passed}/${passed + failed} checks)`);
  } else {
    console.log(`Database verification FAILED (${passed}/${passed + failed} checks)`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Verification failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
