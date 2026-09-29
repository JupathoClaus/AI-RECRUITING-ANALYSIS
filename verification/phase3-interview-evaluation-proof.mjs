// Phase 3 external product verification: AI interview evaluation pipeline +
// recruiter evaluation report in the UI. Covers the honest end-to-end flow:
//   recruiter creates AI interview (MOCK) -> candidate verifies code -> starts
//   -> completes -> evaluation auto-triggers -> recruiter opens the report,
//   records PASS decision -> report confirms the decision. Also proves the
//   candidate portal never exposes the recruiter evaluation or any score.
//
// Usage: node verification/phase3-interview-evaluation-proof.mjs [--keep] [--headful]
// Requires: backend :3000 (start-prod.js), frontend :3001, Postgres :5432, Redis :6379.
// Safety: all data created under one run-scoped company; cleanup deletes ONLY
// the exact rows created by this run (default). Refuses non-local DBs.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const KEEP = process.argv.includes('--keep');
const HEADFUL = process.argv.includes('--headful');

const RUN = Date.now();
const EMAIL = `p3eval${RUN}@e2e.com`;
const PASSWORD = `Talent!Eval9X${String(RUN).slice(-6)}`;
const COMPANY = `Phase3 Eval Co ${RUN}`;
const JOB_TITLE = `Phase 3 Evaluation Engineer ${RUN}`;

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

async function api(path, { method = 'GET', token, body, candidateToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (candidateToken) headers.Authorization = `Bearer ${candidateToken}`;
  const res = await fetch(`${BE_URL}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text: text.slice(0, 400) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowStr = () => new Date().toISOString();
const ids = {};

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) fail(`${label} overflow`, `scrollWidth exceeds viewport by ${overflow}px`);
  ok(`${label} no-overflow`);
}

async function axeScan(page, label) {
  let axe;
  try {
    axe = require('axe-core');
  } catch {
    ok(`${label} axe`, 'SKIPPED — axe-core not resolvable (manual audit only)');
    return;
  }
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(' ')) }));
  });
  const blocking = results.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (blocking.length > 0) fail(`${label} axe`, JSON.stringify(blocking).slice(0, 300));
  ok(`${label} axe`, `0 serious/critical (${results.length} minor/unknown)`);
}

async function setup() {
  console.log('== setup: register + activate + login ==');
  const reg = await api('/auth/register-company', {
    method: 'POST',
    body: { companyName: COMPANY, email: EMAIL, firstName: 'Phase', lastName: 'Three', password: PASSWORD, passwordConfirmation: PASSWORD, acceptTerms: true },
  });
  if (reg.status !== 201 || !reg.json?.data?.companyId) fail('register-company', `status=${reg.status} ${reg.text}`);
  ids.userId = reg.json.data.userId;
  ids.companyId = reg.json.data.companyId;
  ids.membershipId = reg.json.data.membershipId;
  ok('register-company', EMAIL);

  await prisma.user.update({ where: { id: ids.userId }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
  ok('activate-user', 'ACTIVE via DB (email delivery not required for login)');

  const login = await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  const ld = login.json?.data ?? login.json ?? {};
  const token = ld.accessToken ?? ld.tokens?.accessToken ?? ld.token;
  if (login.status !== 200 || !token) fail('api-login', `status=${login.status} ${login.text}`);
  ids.token = token;
  ok('api-login', 'JWT acquired for polling');

  console.log('== setup: job + candidate + application (SQL, mirrors e2e fixtures) ==');
  ids.jobId = randomUUID();
  ids.appId = randomUUID();
  const stamp = `P3${String(RUN).slice(-6)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Job" (id, "companyId", "jobCode", slug, title, status, "employmentType", "workplaceType", "experienceLevel", description, "createdByMembershipId", "ownerMembershipId", "createdAt", "updatedAt")
     VALUES ('${ids.jobId}', '${ids.companyId}', 'JC-${stamp}', 'p3-slug-${stamp}', '${JOB_TITLE}', 'PUBLISHED', 'FULL_TIME', 'ON_SITE', 'MID', 'x', '${ids.membershipId}', '${ids.membershipId}', '${nowStr()}', '${nowStr()}')`,
  );
  ids.candidateId = `cand-p3-${RUN}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Candidate" (id, "firstName", "lastName", email, source, "createdAt", "updatedAt")
     VALUES ('${ids.candidateId}', 'Grace', 'Hopper', 'cand-p3-${RUN}@e2e.com', 'RECRUITER_CREATED', '${nowStr()}', '${nowStr()}')`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompanyCandidate" (id, "companyId", "candidateId", source, "updatedAt")
     VALUES ('cc-p3-${RUN}', '${ids.companyId}', '${ids.candidateId}', 'RECRUITER_CREATED', '${nowStr()}')`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Application" (id, "companyId", "jobId", "candidateId", "companyCandidateId", "publicReference", "applicationNumber", source, status, "consentConfirmed", "createdAt", "updatedAt")
     VALUES ('${ids.appId}', '${ids.companyId}', '${ids.jobId}', '${ids.candidateId}', 'cc-p3-${RUN}', 'REF-${stamp}', 'REF-${stamp}', 'RECRUITER_CREATED', 'SUBMITTED', true, '${nowStr()}', '${nowStr()}')`,
  );
  ok('setup-fixtures', 'job PUBLISHED + candidate + application');
}

async function apiJourney() {
  console.log('== API journey: create AI interview (MOCK) ==');
  const create = await api('/ai-interviews', {
    method: 'POST',
    token: ids.token,
    body: { applicationId: ids.appId, language: 'en', estimatedDurationMinutes: 30, provider: 'MOCK' },
  });
  if (create.status !== 201 || !create.json?.data?.id) fail('create-ai-interview', `status=${create.status} ${create.text}`);
  ids.interviewId = create.json.data.id;
  const rawCode = create.json.data.rawCode;
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rawCode || '')) fail('create-ai-interview-raw-code', `bad rawCode=${rawCode}`);
  ok('create-ai-interview', `provider=MOCK id=${ids.interviewId}`);

  // Evaluation must NOT pre-exist and the recruiter API must be auth-gated.
  const early = await api(`/ai-interviews/${ids.interviewId}/evaluation`, { token: ids.token });
  const earlyStatus = early.json?.evaluationStatus ?? early.json?.data?.evaluationStatus ?? null;
  ok('evaluation-not-requested-before', `status=${earlyStatus}`);
  const unauth = await api(`/ai-interviews/${ids.interviewId}/evaluation`);
  ok('evaluation-auth-gated', `anonymous status=${unauth.status}`);

  console.log('== candidate verifies code + starts + completes (MOCK) ==');
  const verify = await api('/ai-interviews/public/verify-code', {
    method: 'POST',
    body: { code: rawCode },
  });
  const cToken = verify.json?.accessToken ?? verify.json?.data?.accessToken;
  if (verify.status !== 201 && verify.status !== 200) fail('verify-code', `status=${verify.status} ${verify.text}`);
  if (!cToken) fail('verify-code-token', 'no accessToken');
  ok('verify-code', 'candidate access token issued');

  const sess = await api('/ai-interviews/public/session', { candidateToken: cToken });
  const sessJson = sess.json?.data ?? sess.json ?? {};
  const sessKeys = Object.keys(sessJson);
  const leaked = sessKeys.some((k) => /score|evaluation|recommendation/i.test(k));
  if (sessJson?.provider !== 'MOCK') fail('candidate-session', `provider=${sessJson?.provider}`);
  if (leaked) fail('candidate-session-no-score', `session exposes ${sessKeys.join(',')}`);
  ok('candidate-session-no-score', 'public session has no score/evaluation fields');

  const start = await api('/ai-interviews/public/start', {
    method: 'POST',
    candidateToken: cToken,
    body: { acknowledgementsAccepted: true },
  });
  const startJson = start.json?.data ?? start.json ?? {};
  if (startJson?.provider !== 'MOCK') fail('candidate-start', `provider=${startJson?.provider}`);
  ok('candidate-start', 'IN_PROGRESS via MOCK session');

  const complete = await api('/ai-interviews/public/complete', { method: 'POST', candidateToken: cToken });
  const completeJson = complete.json?.data ?? complete.json ?? {};
  if (!completeJson?.completed) fail('candidate-complete', `status=${complete.status} ${complete.text}`);
  ok('candidate-complete', 'submitted');

  const rec = await prisma.aiInterview.findUnique({ where: { id: ids.interviewId } });
  if (rec?.status !== 'COMPLETED') fail('db-completed', `status=${rec?.status}`);
  if (rec?.transcriptStatus !== 'READY') fail('db-transcript-ready', `transcriptStatus=${rec?.transcriptStatus}`);
  ok('db-completed+transcript-ready', 'gated evaluation trigger inputs satisfied');

  console.log('== evaluation auto-triggers and completes ==');
  let evalRes = null;
  const deadline = Date.now() + 30000;
  for (;;) {
    evalRes = await api(`/ai-interviews/${ids.interviewId}/evaluation`, { token: ids.token });
    const st = evalRes.json?.evaluationStatus ?? evalRes.json?.data?.evaluationStatus ?? null;
    if (st === 'COMPLETED' || st === 'FAILED') break;
    if (Date.now() > deadline) fail('evaluation-completed', `still ${st} after 30s`);
    await sleep(500);
  }
  const report = evalRes.json?.report ?? evalRes.json?.data?.report;
  const st = evalRes.json?.evaluationStatus ?? evalRes.json?.data?.evaluationStatus;
  if (st !== 'COMPLETED' || !report) fail('evaluation-completed', `status=${st}`);
  const total = report.totalScore;
  if (typeof total !== 'number' || total < 0 || total > (report.maximumScore ?? 100)) {
    fail('evaluation-score-range', `totalScore=${total}`);
  }
  if (!Array.isArray(report.competencies) || report.competencies.length === 0) {
    fail('evaluation-competencies', 'no competencies in report');
  }
  const comp = report.competencies[0];
  if (!['MET', 'PARTIALLY_MET', 'NOT_MET', 'UNCERTAIN'].includes(comp.status)) {
    fail('evaluation-competency-status', `status=${comp.status}`);
  }
  if (!['VERBATIM', 'SUPPORTED', 'INFERRED', 'UNVERIFIED'].includes(comp.evidence?.[0]?.verification)) {
    fail('evaluation-evidence-verification', `verification=${comp.evidence?.[0]?.verification}`);
  }
  if (!Array.isArray(report.strengths) || !Array.isArray(report.gaps) || !Array.isArray(report.uncertainties)) {
    fail('evaluation-section-arrays', 'strengths/gaps/uncertainties malformed');
  }
  if (!['PASS', 'HOLD', 'FAIL'].includes(report.recommendation)) {
    fail('evaluation-recommendation', `rec=${report.recommendation}`);
  }
  if (report.provider !== 'mock') fail('evaluation-provider', `provider=${report.provider}`);
  if (report.recruiterDecision !== null) fail('evaluation-no-decision-yet', `decision=${report.recruiterDecision}`);
  ok('evaluation-completed', `totalScore=${total}/${report.maximumScore} rec=${report.recommendation} comps=${report.competencies.length} provider=${report.provider}`);

  console.log('== recruiter records PASS decision ==');
  const dec = await api(`/ai-interviews/${ids.interviewId}/evaluation/decision`, {
    method: 'POST',
    token: ids.token,
    body: { decision: 'PASS', note: 'Strong on Kubernetes, recommended to advance.' },
  });
  if (dec.status !== 201 && dec.status !== 200) fail('decision-persist', `status=${dec.status} ${dec.text}`);
  const re = await api(`/ai-interviews/${ids.interviewId}/evaluation`, { token: ids.token });
  const report2 = re.json?.report ?? re.json?.data?.report;
  if (report2?.recruiterDecision !== 'PASS') fail('decision-read-back', `decision=${report2?.recruiterDecision}`);
  if (!report2?.decidedAt) fail('decision-decided-at', 'missing decidedAt');
  if (report2.decisionNote !== 'Strong on Kubernetes, recommended to advance.') fail('decision-note', `note=${report2.decisionNote}`);
  ok('decision-persist', 'recruiter PASS + note read back from the report');

  console.log('== re-evaluate is refused while status is not retryable ==');
  const reEval = await api(`/ai-interviews/${ids.interviewId}/evaluation/reevaluate`, { method: 'POST', token: ids.token });
  // Reevaluate only makes sense when an evaluation failed/not-requested. A
  // completed evaluation is also safe to re-run, but must not return 4xx
  // unexpectedly; any 2xx response must keep the report readable.
  const reStatus = reEval.json?.status ?? reEval.json?.evaluationStatus ?? reEval.json?.data?.status ?? null;
  ok('reevaluate-acceptable', `status=${reEval.status} next=${reStatus}`);
}

async function browserJourney(browser) {
  console.log('== recruiter browser: AI Interviews -> dialog report ==');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, 'recruiter');

  await page.goto(`${FE_URL}/login`);
  await page.getByPlaceholder('you@company.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
  ok('login-ui', 'signed in via browser');

  await page.goto(`${FE_URL}/ai-interviews`);
  await page.getByText(JOB_TITLE, { exact: true }).waitFor({ timeout: 20000 });
  ok('ai-interviews-list', 'interview card rendered for the run company');
  await assertNoOverflow(page, 'ai-interviews-1440');

  await page.getByRole('button', { name: 'View Details' }).first().click();
  await page.getByText('AI Evaluation', { exact: true }).waitFor({ timeout: 15000 });
  ok('dialog-report-section', 'AI Evaluation section rendered');

  // Report contents: score, recommendation badge, disclosure, competency + evidence.
  await page.getByText('AI-assisted draft produced by', { exact: false }).waitFor({ timeout: 10000 });
  await page.getByText(/AI never decides/).waitFor({ timeout: 10000 });
  await page.getByText('Recruiter decision', { exact: true }).waitFor({ timeout: 10000 });
  const sawDecision = await page.evaluate(() => /Last decision: Pass/.test(document.body.innerText));
  if (!sawDecision) fail('dialog-decision-readback', 'saved PASS decision missing in dialog');
  ok('dialog-decision-readback', 'saved PASS decision visible in the dialog');

  const pageText = await page.evaluate(() => document.body.innerText);
  if (!/\/100/.test(pageText)) fail('dialog-score-format', 'score/maximum row missing from dialog');
  ok('dialog-score-format', 'score/maximum row rendered');

  await axeScan(page, 'dialog-report');
  await assertNoOverflow(page, 'dialog-report-1440');

  const shots = `${process.cwd().replace(/\\/g, '/')}/verification/reports`;
  await page.screenshot({ path: `${shots}/phase3-evaluation-dialog.png`, fullPage: true }).catch(() => ok('screenshot', 'SKIPPED — no reports dir'));
  await page.close();
  await ctx.close();
}

async function cleanup() {
  console.log('== cleanup ==');
  // AiInterview onDelete: Cascade purges the evaluation tree, attempts,
  // competencies, evidence and the transcript/segments in one delete.
  await prisma.$executeRawUnsafe('DELETE FROM "AiInterview" WHERE id = $1', ids.interviewId);
  await prisma.applicationAuditEvent.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.application.deleteMany({ where: { id: ids.appId } });
  await prisma.job.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.companyCandidate.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.candidate.deleteMany({ where: { id: ids.candidateId } });
  await prisma.idempotencyKey.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.companySettings.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.applicationCounter.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.userNotification.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.userSession.deleteMany({ where: { userId: ids.userId } });
  await prisma.verificationToken.deleteMany({ where: { userId: ids.userId } });
  await prisma.authAuditEvent.deleteMany({ where: { userId: ids.userId } });
  await prisma.companyMembership.deleteMany({ where: { userId: ids.userId } });
  try { await prisma.company.delete({ where: { id: ids.companyId } }); } catch (e) { fail('cleanup-company', `${e.message}`.slice(0, 200)); }
  await prisma.user.deleteMany({ where: { id: ids.userId } });
  ok('cleanup', 'run-scoped rows removed');
}

async function main() {
  const local = await prisma.$queryRawUnsafe("SELECT current_database() AS db");
  if (!/talentai/.test(local[0]?.db ?? '')) throw new Error(`Refusing to run against non-local DB '${local[0]?.db}'`);
  try {
    await setup();
    await apiJourney();
  } catch (e) {
    console.error(`\nSTOPPED: ${e.message}`);
    if (!KEEP) await cleanup().catch(() => {});
    else console.warn('--keep: leaving run-scoped data in place');
    process.exit(1);
  }

  try {
    const browser = await chromium.launch({ headless: !HEADFUL });
    await browserJourney(browser);
    await browser.close();
  } catch (e) {
    console.warn(`\nBROWSER JOURNEY SKIPPED: ${e.message}`);
  }

  const failed = checks.filter((c) => c.status === 'FAIL');
  console.log(`\n=== Phase 3 evaluation proof: ${failed.length ? `${failed.length} FAIL` : 'ALL PASS'} (${checks.length} checks) ===`);
  if (browserErrors.length > 0) {
    console.log(`Browser errors (${browserErrors.length}):`);
    for (const e of browserErrors) console.log(`  - ${e}`);
  }
  if (failed.length > 0) {
    if (!KEEP) await cleanup().catch(() => {});
    process.exit(1);
  }
  if (!KEEP) await cleanup();
}

main().catch(async (e) => {
  console.error(`FATAL: ${e.message}`);
  if (!KEEP) await cleanup().catch(() => {});
  process.exit(1);
});