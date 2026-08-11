// Exact-ID, dependency-ordered cleanup for verification scripts.
//
// Deletes ONLY the exact resources created by the verification run
// (identified by captured IDs). Every step is a Prisma operation (which is
// parameterized by construction — no identifiers are interpolated into raw
// SQL). Every step reports its row count; failures are collected, printed,
// and surfaced to the caller so they are never silently swallowed.
//
// Physical resume files: storedFile rows carry a storageKey pointing at
// <uploadDir>/<companyId>/<uuid>.<ext>. Before the storedFile rows are
// deleted, the EXACT files behind the captured storedFile IDs are removed
// from disk too. Only single files are unlinked (never a recursive delete);
// the resolved path must stay inside the upload root; an already-missing
// file is skipped (idempotent). The upload root comes from backend/.env
// UPLOAD_DIR (override: VERIFY_UPLOAD_DIR), resolved against the backend
// directory.
//
// Deletion order follows foreign-key dependencies (children before parents):
//   screening results -> screening answers -> notes/flags/assignments
//   -> interview children -> interviews -> stored files -> extraction dispatch
//   -> extractions -> applications -> candidate children -> company-candidate
//   -> links -> job children -> jobs -> candidates -> idempotency keys
//   -> audit events -> sessions -> verification tokens -> memberships
//   -> company -> user.

import { readFileSync } from 'node:fs';
import { unlink, rmdir } from 'node:fs/promises';
import { join, resolve, normalize, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = fileURLToPath(new URL('../backend', import.meta.url));

// Mirrors backend config: UPLOAD_DIR=./uploads resolves against the backend
// working directory. VERIFY_UPLOAD_DIR overrides it for tests.
export function resolveUploadRoot() {
  const override = process.env.VERIFY_UPLOAD_DIR;
  if (override) return resolve(override);
  let configured = './uploads';
  try {
    const envFile = readFileSync(join(BACKEND_DIR, '.env'), 'utf8');
    const match = envFile.match(/^UPLOAD_DIR=(.+)$/m);
    if (match) configured = match[1].trim();
  } catch {
    // no backend/.env: keep the default
  }
  return resolve(BACKEND_DIR, configured);
}

// Containment check for a storage key: the resolved path must be a file
// strictly inside the upload root. Never the root itself, never outside it.
export function resolvePhysicalFile(uploadRoot, storageKey) {
  if (typeof storageKey !== 'string' || storageKey.length === 0 || storageKey.includes('\0')) {
    throw new Error(`refusing to resolve unsafe storage key ${JSON.stringify(storageKey)}`);
  }
  const root = resolve(uploadRoot);
  const absolutePath = resolve(root, storageKey);
  const rel = relative(root, absolutePath);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`refusing to delete path outside upload root: ${JSON.stringify(storageKey)}`);
  }
  return absolutePath;
}

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
    add('aiInterview', { applicationId: { in: ids.applicationIds } }, 'AI interviews');
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

  // ── Physical resume files ──────────────────────────────────────────────
  // Collect the exact storage keys of the captured storedFile rows BEFORE
  // the DB rows are deleted, then unlink exactly those files. Missing rows
  // or already-deleted files are not errors (idempotent cleanup).
  const storageKeys = [];
  if (any(ids.storedFileIds)) {
    try {
      const rows = await prisma.storedFile.findMany({
        where: { id: { in: ids.storedFileIds } },
        select: { storageKey: true },
      });
      storageKeys.push(...rows.map((r) => r.storageKey));
    } catch (e) {
      failures.push(
        new Error(`cleanup could not read stored files for physical deletion: ${e.message}`),
      );
    }
  }

  const uploadRoot = resolveUploadRoot();
  const deletedPaths = [];
  for (const storageKey of storageKeys) {
    let absolutePath;
    try {
      absolutePath = resolvePhysicalFile(uploadRoot, storageKey);
    } catch (e) {
      failures.push(new Error(`cleanup refused to delete physical file: ${e.message}`));
      continue;
    }
    try {
      await unlink(absolutePath);
      deletedPaths.push(absolutePath);
      // Best-effort: drop the now-empty company directory (never recursive).
      await rmdir(dirname(absolutePath)).catch(() => {});
    } catch (e) {
      if (e && e.code === 'ENOENT') continue; // already gone — idempotent
      failures.push(
        new Error(`cleanup failed to delete physical file ${storageKey}: ${e.message}`),
      );
    }
  }
  if (deletedPaths.length > 0) {
    for (const p of deletedPaths) notes.push(`  physical file deleted: ${p}`);
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
      {
        OR: [{ primaryCandidateId: { in: ids.candidateIds } }, { mergedCandidateId: { in: ids.candidateIds } }],
      },
      'candidate merge records',
    );
    add('candidateSkill', { candidateId: { in: ids.candidateIds } }, 'candidate skills');
    add('candidateEmployment', { candidateId: { in: ids.candidateIds } }, 'candidate employments');
    add('candidateEducation', { candidateId: { in: ids.candidateIds } }, 'candidate educations');
    add('candidateCertification', { candidateId: { in: ids.candidateIds } }, 'candidate certifications');
    add('candidateLanguage', { candidateId: { in: ids.candidateIds } }, 'candidate languages');
    add('candidateConsent', { candidateId: { in: ids.candidateIds } }, 'candidate consents');
    add(
      'companyCandidateNote',
      { companyCandidate: { candidateId: { in: ids.candidateIds } } },
      'company-candidate notes',
    );
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
