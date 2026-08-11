// Exact-ID, dependency-ordered cleanup for verification scripts.
//
// Deletes ONLY the exact resources created by the verification run
// (identified by captured IDs). Every step is a Prisma operation (which is
// parameterized by construction — no identifiers are interpolated into raw
// SQL). Every step reports its row count; failures are collected, printed,
// and surfaced to the caller so they are never silently swallowed.
//
// Deletion order follows foreign-key dependencies (children before parents):
//   screening results -> screening answers -> notes/flags/assignments
//   -> interview children -> interviews -> stored files -> extraction dispatch
//   -> extractions -> applications -> candidate children -> company-candidate
//   links -> job children -> jobs -> candidates -> idempotency keys
//   -> audit events -> sessions -> verification tokens -> memberships
//   -> company -> user.

export async function cleanupExact(prisma, ids, log = console.log) {
  const notes = [];
  const failures = [];
  const arr = (a) => (a && a.length ? a : null);
  const any = (arr2) => arr(arr2) !== null;

  log('[cleanup] deleting exact verification resources in dependency order...');

  const steps = [];
  const add = (model, where, label) => {
    if (where) steps.push([model, where, label]);
  };

  // Application children first (screening results, answers, notes, flags, assignments)
  if (any(ids.applicationIds)) {
    add('aiScreeningResult', { applicationId: { in: ids.applicationIds } }, 'screening results');
    add('applicationScreeningAnswer', { applicationId: { in: ids.applicationIds } }, 'screening answers');
    add('applicationNote', { applicationId: { in: ids.applicationIds } }, 'application notes');
    add('applicationFlag', { applicationId: { in: ids.applicationIds } }, 'application flags');
    add('applicationAssignment', { applicationId: { in: ids.applicationIds } }, 'application assignments');
    add('applicationTagAssignment', { applicationId: { in: ids.applicationIds } }, 'application tag assignments');
    add('applicationStageHistory', { applicationId: { in: ids.applicationIds } }, 'application stage history');
    add('applicationDecision', { applicationId: { in: ids.applicationIds } }, 'application decisions');
    add('interviewHistory', { interview: { applicationId: { in: ids.applicationIds } } }, 'interview history');
    add('interviewParticipant', { interview: { applicationId: { in: ids.applicationIds } } }, 'interview participants');
    add('interview', { applicationId: { in: ids.applicationIds } }, 'interviews');
  }
  if (any(ids.extractionIds)) {
    add('extractionDispatch', { extractionId: { in: ids.extractionIds } }, 'extraction dispatches');
    add('resumeTextExtraction', { id: { in: ids.extractionIds } }, 'resume text extractions');
  }
  if (any(ids.storedFileIds)) {
    add('storedFile', { id: { in: ids.storedFileIds } }, 'stored files (after extractions)');
  }
  if (any(ids.applicationIds)) {
    add('application', { id: { in: ids.applicationIds } }, 'applications');
  }
  if (any(ids.candidateIds)) {
    add('candidateAuditEvent', { candidateId: { in: ids.candidateIds } }, 'candidate audit events');
    add(
      'candidateMergeRecord',
      { OR: [{ primaryCandidateId: { in: ids.candidateIds } }, { mergedCandidateId: { in: ids.candidateIds } }] },
      'candidate merge records',
    );
    add('candidateSkill', { candidateId: { in: ids.candidateIds } }, 'candidate skills');
    add('candidateEmployment', { candidateId: { in: ids.candidateIds } }, 'candidate employments');
    add('candidateEducation', { candidateId: { in: ids.candidateIds } }, 'candidate educations');
    add('candidateCertification', { candidateId: { in: ids.candidateIds } }, 'candidate certifications');
    add('candidateLanguage', { candidateId: { in: ids.candidateIds } }, 'candidate languages');
    add('candidateConsent', { candidateId: { in: ids.candidateIds } }, 'candidate consents');
    add('companyCandidateNote', { companyCandidate: { candidateId: { in: ids.candidateIds } } }, 'company-candidate notes');
    add('companyCandidate', { candidateId: { in: ids.candidateIds } }, 'company-candidate links');
  }
  if (any(ids.jobIds)) {
    add('jobSkill', { jobId: { in: ids.jobIds } }, 'job skills');
    add('jobEducationRequirement', { jobId: { in: ids.jobIds } }, 'job education requirements');
    add('jobExperienceRequirement', { jobId: { in: ids.jobIds } }, 'job experience requirements');
    add('jobLanguageRequirement', { jobId: { in: ids.jobIds } }, 'job language requirements');
    add('jobScreeningQuestion', { jobId: { in: ids.jobIds } }, 'job screening questions');
    add('jobScreeningConfiguration', { jobId: { in: ids.jobIds } }, 'job screening configurations');
    add('jobAccessibilityConfiguration', { jobId: { in: ids.jobIds } }, 'job accessibility configurations');
    add('jobActivityEvent', { jobId: { in: ids.jobIds } }, 'job activity events');
    add('jobPublication', { jobId: { in: ids.jobIds } }, 'job publications');
    add('jobApproval', { jobId: { in: ids.jobIds } }, 'job approvals');
    add('jobCollaborator', { jobId: { in: ids.jobIds } }, 'job collaborators');
    add('jobPipelineStage', { pipeline: { jobId: { in: ids.jobIds } } }, 'job pipeline stages');
    add('jobPipeline', { jobId: { in: ids.jobIds } }, 'job pipelines');
    add('job', { id: { in: ids.jobIds } }, 'jobs');
  }
  if (any(ids.candidateIds)) {
    add('candidate', { id: { in: ids.candidateIds } }, 'candidates');
  }
  if (ids.companyId) {
    add('idempotencyKey', { companyId: ids.companyId }, 'idempotency keys');
    add('companySettings', { companyId: ids.companyId }, 'company settings');
    add('applicationCounter', { companyId: ids.companyId }, 'application counters');
  }
  if (ids.userId) {
    add('authAuditEvent', { userId: ids.userId }, 'auth audit events');
    add('userSession', { userId: ids.userId }, 'user sessions');
    add('verificationToken', { userId: ids.userId }, 'verification tokens');
  }
  if (ids.userId && !any(ids.membershipIds)) {
    add('companyMembership', { userId: ids.userId }, 'company memberships (by user)');
  }
  if (any(ids.membershipIds)) {
    add('companyMembership', { id: { in: ids.membershipIds } }, 'company memberships');
  }
  if (ids.companyId) {
    add('applicationAuditEvent', { companyId: ids.companyId }, 'application audit events');
    add('companyCandidate', { companyId: ids.companyId }, 'company-candidate links (by company)');
    add('company', { id: ids.companyId }, 'company');
  }
  if (ids.userId) {
    add('user', { id: ids.userId }, 'user');
  }

  for (const [model, where, label] of steps) {
    try {
      const { count } = await prisma[model].deleteMany({ where });
      if (count > 0) notes.push(`  ${label}: ${count} row(s) deleted`);
    } catch (e) {
      const msg = `  ${label}: FAILED — ${e.message}`;
      notes.push(msg);
      failures.push(new Error(`cleanup failed for ${label}: ${e.message}`));
    }
  }

  for (const n of notes) log(n);
  if (failures.length) {
    log(`[cleanup] ${failures.length} cleanup step(s) FAILED (see above). Resources may remain in the local database.`);
    return { ok: false, failures };
  }
  log('[cleanup] all exact-ID cleanup steps completed successfully.');
  return { ok: true, failures: [] };
}
