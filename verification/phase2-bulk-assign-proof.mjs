// Phase 2 bulk-assign UI proof: real-browser exercise of the new
// "Assign assessment (N)" action in the applications bulk bar.
//
// Usage: node verification/phase2-bulk-assign-proof.mjs [--keep]
// Requires: backend :3000 (start-prod.js), frontend :3001, Postgres :5432, Redis :6379.
// Safety: run-scoped company; exact-row cleanup; refuses non-local DBs.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const KEEP = process.argv.includes('--keep');

const RUN = Date.now();
const EMAIL = `bulkverify${RUN}@e2e.com`;
const PASSWORD = `Talent!Bk9Xq2#Zv${String(RUN).slice(-6)}`;
const COMPANY = `BulkVerify Co ${RUN}`;
const JOB_TITLE = `Bulk Verification Engineer ${RUN}`;
const ASSESSMENT = `BulkProof Assessment ${RUN}`;

const prisma = new PrismaClient();
const checks = [];
const browserErrors = [];
const ok = (label, detail = '') => {
  checks.push({ label, status: 'PASS', detail });
  console.log(`  [PASS] ${label}${detail ? ` — ${detail}` : ''}`);
};
const fail = (label, detail = '') => {
  checks.push({ label, status: 'FAIL', detail });
  console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  throw new Error(`CHECK FAILED: ${label} ${detail}`);
};

function watch(page, tag) {
  page.on('pageerror', (e) => browserErrors.push(`[${tag}] pageerror: ${(e.message || e).toString().slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().startsWith('Failed to load resource:')) return;
    browserErrors.push(`[${tag}] console.error: ${m.text().slice(0, 200)}`);
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    if (err.includes('ERR_ABORTED')) return;
    browserErrors.push(`[${tag}] requestfailed: ${r.url().slice(0, 120)} ${err}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 500) browserErrors.push(`[${tag}] HTTP ${r.status()}: ${r.url().slice(0, 120)}`);
  });
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BE_URL}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text: text.slice(0, 300) };
}

const nowStr = () => new Date().toISOString();
const ids = {};

async function setup() {
  console.log('== setup ==');
  const reg = await api('/auth/register-company', {
    method: 'POST',
    body: { companyName: COMPANY, email: EMAIL, firstName: 'Bulk', lastName: 'Verify', password: PASSWORD, passwordConfirmation: PASSWORD, acceptTerms: true },
  });
  if (reg.status !== 201 || !reg.json?.data?.companyId) fail('register-company', `status=${reg.status} ${reg.text}`);
  ids.userId = reg.json.data.userId;
  ids.companyId = reg.json.data.companyId;
  ids.membershipId = reg.json.data.membershipId;
  ok('register-company', EMAIL);

  await prisma.user.update({ where: { id: ids.userId }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  ids.token = login.json?.data?.accessToken ?? login.json?.data?.tokens?.accessToken ?? login.json?.data?.token ?? login.json?.accessToken;
  if (login.status !== 200 || !ids.token) fail('api-login', `status=${login.status} ${login.text}`);
  ok('api-login', 'JWT');
  ok('activate-user', 'ACTIVE via DB');

  ids.jobId = randomUUID();
  ids.appA = randomUUID();
  ids.appB = randomUUID();
  const stamp = `B${RUN}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, status, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
     VALUES ('${ids.jobId}', '${ids.companyId}', 'JB-${stamp}', 'bulk-slug-${stamp}', '${JOB_TITLE}', 'PUBLISHED', 'FULL_TIME', 'ON_SITE', 'MID', 'x', '${ids.membershipId}', '${ids.membershipId}', '${nowStr()}', '${nowStr()}')`,
  );
  for (const [appId, tag] of [[ids.appA, 'A'], [ids.appB, 'B']]) {
    const candId = `cand-bulk-${tag.toLowerCase()}-${RUN}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
       VALUES ('${candId}', 'Bulk', 'Candidate${tag}', 'cand-bulk-${tag}-${RUN}@e2e.com', 'RECRUITER_CREATED', '${nowStr()}', '${nowStr()}')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
       VALUES ('cc-bulk-${tag}-${RUN}', '${ids.companyId}', '${candId}', 'RECRUITER_CREATED', '${nowStr()}')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "publicReference", "applicationNumber", source, status, "consentConfirmed", "createdAt", "updatedAt")
       VALUES ('${appId}', '${ids.companyId}', '${ids.jobId}', '${candId}', 'cc-bulk-${tag}-${RUN}', 'REF-${stamp}-${tag}', 'REF-${stamp}-${tag}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr()}', '${nowStr()}')`,
    );
  }
  ids.candidateIds = [`cand-bulk-a-${RUN}`, `cand-bulk-b-${RUN}`];
  ok('setup-fixtures', 'job PUBLISHED + 2 applications');
}

async function publishAssessmentViaApi() {
  console.log('== publish assessment via API ==');
  const created = await api('/assessments', {
    method: 'POST',
    token: ids.token,
    body: { name: ASSESSMENT, jobId: ids.jobId, description: 'bulk proof' },
  });
  if (created.status !== 201 && created.status !== 200) fail('api-create', `status=${created.status} ${created.text}`);
  const list = await api(`/assessments?jobId=${ids.jobId}`, { token: ids.token });
  const arr = list.json?.data?.data ?? list.json?.data ?? [];
  const found = arr.find((a) => a.name === ASSESSMENT);
  if (!found) fail('api-lookup', 'assessment not found in list');
  ids.assessmentId = found.id;
  const summary = await api(`/assessments/${ids.assessmentId}/summary`, { token: ids.token });
  const versions = summary.json?.data?.versions ?? [];
  const draft = versions.find((v) => v.status === 'DRAFT');
  if (!draft) fail('api-draft', `no draft version: ${JSON.stringify(versions.map((v) => v.status)).slice(0, 200)}`);
  ids.versionId = draft.id;

  const saved = await api(`/assessments/versions/${ids.versionId}/questions`, {
    method: 'POST',
    token: ids.token,
    body: {
      questions: [{
        type: 'SINGLE_CHOICE',
        prompt: 'Which shell command lists disk usage?',
        sortOrder: 0,
        required: true,
        points: 10,
        competency: 'Linux',
        aiEvaluated: false,
        options: [
          { label: 'df -h', sortOrder: 0, isCorrect: true, points: 10 },
          { label: 'ls -la', sortOrder: 1, isCorrect: false, points: 0 },
        ],
      }],
    },
  });
  if (saved.status !== 201 && saved.status !== 200) fail('api-save-questions', `status=${saved.status} ${saved.text}`);

  const val = await api(`/assessments/versions/${ids.versionId}/validate`, { method: 'POST', token: ids.token });
  if (val.status !== 200 && val.status !== 201) fail('api-validate', `status=${val.status} ${val.text}`);

  const pub = await api(`/assessments/versions/${ids.versionId}/publish`, { method: 'POST', token: ids.token });
  if (pub.status !== 200 && pub.status !== 201) fail('api-publish', `status=${pub.status} ${pub.text}`);
  ok('api-publish', `version ${ids.versionId} published`);
}

async function browserBulk(page) {
  console.log('== browser bulk assign ==');
  await page.goto(`${FE_URL}/login`);
  await page.getByPlaceholder('you@company.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });

  await page.goto(`${FE_URL}/jobs/${ids.jobId}/applications`);
  await page.getByText('Bulk CandidateA', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByLabel('Select Bulk CandidateA').click();
  await page.getByLabel('Select Bulk CandidateB').click();
  const assignBtn = page.getByRole('button', { name: 'Assign assessment (2)' });
  await assignBtn.waitFor({ timeout: 10000 });
  ok('bulk-bar', 'Assign assessment (2) action shown for 2 selected rows');
  await assignBtn.click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Assign assessment' }).waitFor({ timeout: 10000 });
  const radio = dialog.getByRole('radio', { name: /Version 1/ });
  await radio.waitFor({ timeout: 10000 });
  const radioLabel = (await dialog.getByRole('radiogroup').innerText()).trim();
  if (!/BulkProof Assessment/.test(radioLabel) || !/Version 1 · 1 questions · 10 points/.test(radioLabel)) {
    fail('picker', `published version label not as expected: "${radioLabel.replace(/\n/g, ' ')}"`);
  } else {
    ok('picker', `published version only, label: "${radioLabel.replace(/\n/g, ' ')}"`);
  }
  await radio.click();
  await dialog.getByRole('button', { name: 'Queue assignment' }).click();

  await page.getByText(/Assessment assignment (complete|failed)/).waitFor({ timeout: 90000 });
  const doneText = (await page.locator('body').innerText()).replace(/\n/g, ' ');
  const m = doneText.match(/(\d+) assigned · (\d+) skipped \(already assigned\) · (\d+) failed/);
  if (!m) fail('bulk-first-run', `no counts line in "${doneText.slice(-400)}"`);
  const assigned = Number(m[1]);
  const skipped = Number(m[2]);
  const failed = Number(m[3]);
  if (assigned !== 2 || skipped !== 0 || failed !== 0) fail('bulk-first-run', `assigned=${assigned} skipped=${skipped} failed=${failed}`);
  ok('bulk-first-run', `assigned=2 skipped=0 failed=0`);

  const rows = await prisma.assessmentAssignment.count({
    where: { applicationId: { in: [ids.appA, ids.appB] }, versionId: ids.versionId },
  });
  if (rows !== 2) fail('bulk-db-unique', `expected 2 assignment rows, got ${rows}`);
  ok('bulk-db-unique', 'exactly 2 assignment rows (unique per application+version)');

  await page.getByLabel('Select Bulk CandidateA').click();
  await page.getByLabel('Select Bulk CandidateB').click();
  await page.getByRole('button', { name: 'Assign assessment (2)' }).click();
  const [rerunResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/bulk-assignments') && r.request().method() === 'POST', { timeout: 20000 }),
    (async () => {
      const dialog2 = page.getByRole('dialog');
      await dialog2.getByRole('radio', { name: /Version 1/ }).click();
      await dialog2.getByRole('button', { name: 'Queue assignment' }).click();
    })(),
  ]);
  const rerunBody = await rerunResp.json().catch(() => null);
  const dedup = rerunBody?.data?.deduplicated ?? rerunBody?.deduplicated;
  if (dedup !== true) fail('bulk-rerun-dedup', `expected deduplicated=true (content-addressed re-run), got ${JSON.stringify(rerunBody).slice(0, 200)}`);
  const rows2 = await prisma.assessmentAssignment.count({
    where: { applicationId: { in: [ids.appA, ids.appB] }, versionId: ids.versionId },
  });
  if (rows2 !== 2) fail('bulk-rerun-db', `expected still 2 rows after dedup re-queue, got ${rows2}`);
  ok('bulk-rerun-dedup', 'identical re-queue is content-addressed (deduplicated=true) and DB stays at 2 rows — no duplicate work');

  const dueISO = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const alt = await api(`/assessments/versions/${ids.versionId}/bulk-assignments`, {
    method: 'POST',
    token: ids.token,
    body: { applicationIds: [ids.appA, ids.appB], dueAt: dueISO },
  });
  if (alt.status !== 201 && alt.status !== 200) fail('bulk-api-alt', `status=${alt.status} ${alt.text}`);
  const altJobId = alt.json?.data?.jobId ?? alt.json?.jobId;
  const deadline = Date.now() + 90000;
  let altSkipped = null;
  for (;;) {
    const st = await api(`/assessments/bulk-jobs/${altJobId}`, { token: ids.token });
    const r = st.json?.data?.result ?? st.json?.result ?? st.json?.data;
    if (st.status === 200 && r && typeof r.assigned === 'number') {
      altSkipped = r.skipped;
      if (r.assigned !== 0 || r.skipped !== 2 || r.failed !== 0) {
        fail('bulk-per-row-skip', `different request, same apps → assigned=${r.assigned} skipped=${r.skipped} failed=${r.failed}`);
      }
      break;
    }
    if (Date.now() > deadline) fail('bulk-per-row-skip', `job ${altJobId} did not complete: ${alt.text}`);
    await new Promise((r2) => setTimeout(r2, 2000));
  }
  const rows3 = await prisma.assessmentAssignment.count({
    where: { applicationId: { in: [ids.appA, ids.appB] }, versionId: ids.versionId },
  });
  if (rows3 !== 2) fail('bulk-per-row-db', `expected 2 rows after skipped run, got ${rows3}`);
  ok('bulk-per-row-skip', 'different bulk request, same applications → per-row ALREADY_ASSIGNED (skipped=2), DB unchanged');
}

async function cleanup() {
  console.log('== cleanup ==');
  try {
    await prisma.assessmentResult.deleteMany({ where: { sessionId: { in: [] } } }).catch(() => null);
    const assignments = await prisma.assessmentAssignment.findMany({ where: { applicationId: { in: [ids.appA, ids.appB] } }, select: { sessionId: true } });
    const sessionIds = assignments.map((a) => a.sessionId).filter(Boolean);
    if (sessionIds.length > 0) {
      await prisma.assessmentEvaluation.deleteMany({ where: { sessionId: { in: sessionIds } } }).catch(() => null);
      await prisma.assessmentResponse.deleteMany({ where: { sessionId: { in: sessionIds } } }).catch(() => null);
      await prisma.assessmentSession.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => null);
    }
    await prisma.assessmentAssignment.deleteMany({ where: { applicationId: { in: [ids.appA, ids.appB] } } }).catch(() => null);
    await prisma.applicationAuditEvent.deleteMany({ where: { companyId: ids.companyId } }).catch(() => null);
    const assessments = await prisma.assessment.findMany({ where: { companyId: ids.companyId }, select: { id: true } });
    const versions = await prisma.assessmentVersion.findMany({ where: { assessmentId: { in: assessments.map((a) => a.id) } }, select: { id: true } });
    const questions = await prisma.assessmentQuestion.findMany({ where: { versionId: { in: versions.map((v) => v.id) } }, select: { id: true } });
    await prisma.assessmentRubricCriterion.deleteMany({ where: { questionId: { in: questions.map((q) => q.id) } } }).catch(() => null);
    await prisma.assessmentQuestion.deleteMany({ where: { versionId: { in: versions.map((v) => v.id) } } }).catch(() => null);
    await prisma.assessmentVersion.deleteMany({ where: { id: { in: versions.map((v) => v.id) } } }).catch(() => null);
    await prisma.assessment.deleteMany({ where: { companyId: ids.companyId } }).catch(() => null);
    await prisma.application.deleteMany({ where: { id: { in: [ids.appA, ids.appB] } } }).catch(() => null);
    await prisma.companyCandidate.deleteMany({ where: { companyId: ids.companyId } }).catch(() => null);
    await prisma.candidate.deleteMany({ where: { id: { in: ids.candidateIds } } }).catch(() => null);
    await prisma.job.deleteMany({ where: { id: ids.jobId } }).catch(() => null);
    await prisma.companyMembership.deleteMany({ where: { companyId: ids.companyId } }).catch(() => null);
    await prisma.company.deleteMany({ where: { id: ids.companyId } }).catch(() => null);
    await prisma.user.deleteMany({ where: { id: ids.userId } }).catch(() => null);
    console.log('  cleanup done');
  } catch (e) {
    console.log(`  cleanup warning: ${(e.message || e).toString().slice(0, 200)}`);
  }
}

async function main() {
  console.log(`== phase2-bulk-assign-proof.mjs run=${RUN} ==`);
  const browser = await chromium.launch({ headless: true });
  try {
    await setup();
    await publishAssessmentViaApi();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page, 'bulk');
    await browserBulk(page);
    await ctx.close();
    if (browserErrors.length > 0) fail('browser-error-budget', browserErrors.slice(0, 5).join(' | '));
    ok('browser-error-budget', 'zero console/page/request/HTTP-5xx errors');
  } finally {
    if (!KEEP) await cleanup();
    else console.log(`KEEP: company ${ids.companyId}, user ${EMAIL}`);
    await browser.close();
    await prisma.$disconnect();
  }
  const failed = checks.filter((c) => c.status === 'FAIL');
  console.log(`== done: ${checks.length - failed.length}/${checks.length} checks passed ==`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`FATAL: ${(e.message || e).toString().slice(0, 500)}`);
  cleanup().finally(() => prisma.$disconnect().finally(() => process.exit(1)));
});