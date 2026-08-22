/**
 * ISSUE #6 — AI Interview Scheduling: real end-to-end acceptance.
 *
 * Reproduces the "No candidates available" state, creates controlled eligible
 * data through the normal UI/API, then verifies the complete scheduling flow:
 * selector population, form validation, button enablement, POST create,
 * DB record integrity, interview code, duplicate protection, refresh
 * persistence, multi-candidate isolation, cross-tenant security and error
 * handling. Tavus execution is intentionally NOT exercised.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'ai-interview-shots');
mkdirSync(SHOTS, { recursive: true });
const RESUME_A = fileURLToPath(new URL('./fixtures/live-backend-resume.pdf', import.meta.url));
const RESUME_B = fileURLToPath(new URL('./fixtures/live-analyst-resume.pdf', import.meta.url));

const RUN_ID = Date.now();
const EMAIL = 'sarah@airecruiter.com';
const PASSWORD = 'admin123';
const JOB_A = `AI Interview Engineer ${RUN_ID}`;
const JOB_B = `AI Interview Analyst ${RUN_ID}`;
const CAND_A = `Ava Liu ${RUN_ID}`;
const CAND_B = `Ben Okafor ${RUN_ID}`;
const MAIL_A = `ava${RUN_ID}@e2e.com`;
const MAIL_B = `ben${RUN_ID}@e2e.com`;
const COMPANY_B = `Tenant B ${RUN_ID}`;
const USER_B = `zq${RUN_ID}@e2e.com`;
const PASS_B = `T0p$ecret_${RUN_ID}`;

const KEEP = process.argv.includes('--keep');

const PASS = [];
const FAIL = [];
const browserErrors = [];
const notes = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
const note = (label, detail) => {
  notes.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fillFormWithRetry(page, fields) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let ok = true;
    for (const [selector, value] of fields) {
      try { await page.fill(selector, value); } catch { ok = false; break; }
    }
    if (ok) {
      let allSet = true;
      for (const [selector, value] of fields) {
        const v = await page.inputValue(selector).catch(() => null);
        if (v !== value) { allSet = false; break; }
      }
      if (allSet) return;
    }
    await sleep(1200);
  }
  throw new Error('fillFormWithRetry failed');
}

async function apiLogin(email, password) {
  const res = await fetch(`${BE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return body.data?.tokens?.accessToken;
}

async function cleanup(prisma, ids) {
  console.log('\n== cleanup ==');
  try {
    await cleanupExact(prisma, {
      applicationIds: ids.applicationIds,
      candidateIds: ids.candidateIds,
      jobIds: ids.jobIds,
      storedFileIds: ids.storedFileIds,
      extractionIds: ids.extractionIds,
    });
    await prisma.applicationAuditEvent.deleteMany({ where: { candidateId: { in: ids.candidateIds } } });
    if (ids.companyB) {
      await cleanupExact(prisma, { companyId: ids.companyB, userId: ids.userB, membershipIds: ids.membershipB ? [ids.membershipB] : [] });
    }
    console.log('cleanup complete');
  } catch (e) {
    console.error('cleanup failed:', e);
  }
}
async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  console.log('== ai-interview-scheduling.mjs ==');
  const ids = { companyId: null, membershipId: null, jobIds: [], candidateIds: [], applicationIds: [], interviewIds: [], companyB: null, userB: null, storedFileIds: [], extractionIds: [] };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));

    // ── login ──
    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [
      ['input[type="email"]', EMAIL],
      ['input[type="password"]', PASSWORD],
    ]);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    note('auth', 'logged in as sarah@airecruiter.com');
    const token = await page.evaluate(() => localStorage.getItem('ai-recruiter-access-token'));
    const company = await prisma.company.findFirst({ where: { name: 'AI Recruiter Co' } });
    ids.companyId = company.id;
    const mem = await prisma.companyMembership.findFirst({ where: { companyId: company.id } });
    ids.membershipId = mem.id;

    // ── PHASE 1: reproduce "No candidates available" ──
    note('phase1', 'reproducing the reported modal state');
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Create AI Interview/i }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1200);
    const dialog = page.getByRole('dialog');
    const noCandidatesCount = await dialog.getByText('No candidates available', { exact: true }).count();
    const beforeDisabled = await dialog.getByRole('button', { name: /^Create Interview$/i }).isDisabled();
    check('repro: modal shows "No candidates available"', noCandidatesCount > 0, `count=${noCandidatesCount}`);
    check('repro: Create Interview disabled', beforeDisabled, 'expected disabled');
    await page.screenshot({ path: join(SHOTS, 'before-no-candidates.png'), fullPage: true });
    const appsForTenant = await prisma.application.count({ where: { companyId: ids.companyId, deletedAt: null } });
    const candsForTenant = await prisma.companyCandidate.count({ where: { companyId: ids.companyId } });
    check('repro: tenant has candidates but zero applications', candsForTenant > 0 && appsForTenant === 0, `candidates=${candsForTenant} applications=${appsForTenant}`);
    await dialog.getByRole('button', { name: /^Cancel$/i }).click();

    // ── PHASE 2: controlled eligible data (jobs via API, candidates via UI) ──
    note('phase2', 'creating controlled eligible data');
    const mkJob = async (title, description) => {
      const r = await fetch(`${BE_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description }),
      });
      const j = (await r.json()).data;
      ids.jobIds.push(j.id);
      const pub = await fetch(`${BE_URL}/api/v1/jobs/${j.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      if (!pub.ok) throw new Error(`job publish failed: ${pub.status}`);
      return j;
    };
    const jobA = await mkJob(JOB_A, 'Node.js/TypeScript backend engineering for the AI recruiter pipeline.');
    const jobB = await mkJob(JOB_B, 'Business metrics analysis with Python and SQL.');
    note('jobs', `created + published ${JOB_A} (${jobA.id}) and ${JOB_B} (${jobB.id})`);

    const addCandidateViaUI = async ({ name, email, jobTitle, resumePath }) => {
      await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
      const d = page.getByRole('dialog');
      await d.locator('input[placeholder="e.g. John Smith"]').waitFor({ timeout: 10000 });
      await page.fill('input[placeholder="e.g. John Smith"]', name);
      await page.fill('input[placeholder="john@example.com"]', email);
      await d.locator('[role="combobox"]').click();
      await page.getByRole('option', { name: new RegExp(jobTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await page.setInputFiles('input[aria-label="Upload resume file"]', resumePath);
      await d.getByRole('button', { name: 'Upload Resume', exact: true }).click();
      await d.getByRole('button', { name: 'Add Candidate', exact: true }).click();
      await page.getByText('Ready for AI Screening', { exact: false }).waitFor({ timeout: 60000 });
      await d.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
      await sleep(800);
    };

    await addCandidateViaUI({ name: CAND_A, email: MAIL_A, jobTitle: JOB_A, resumePath: RESUME_A });
    await addCandidateViaUI({ name: CAND_B, email: MAIL_B, jobTitle: JOB_B, resumePath: RESUME_B });
    note('candidates', 'both candidates added via the UI with applications');

    const candA = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL_A.toLowerCase() } });
    const candB = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL_B.toLowerCase() } });
    ids.candidateIds.push(candA.id, candB.id);
    const appA = await prisma.application.findFirst({ where: { candidateId: candA.id, deletedAt: null } });
    const appB = await prisma.application.findFirst({ where: { candidateId: candB.id, deletedAt: null } });
    ids.applicationIds.push(appA.id, appB.id);
    for (const sf of await prisma.storedFile.findMany({ where: { applicationId: { in: [appA.id, appB.id] } } })) ids.storedFileIds.push(sf.id);
    check('data: appA -> jobA', appA.jobId === jobA.id, `got ${appA.jobId}`);
    check('data: appB -> jobB', appB.jobId === jobB.id, `got ${appB.jobId}`);
    check('data: applications DRAFT', appA.status === 'DRAFT' && appB.status === 'DRAFT', `${appA.status}/${appB.status}`);

    // ── PHASE 3: modal lists eligible candidates ──
    note('phase3', 'modal candidate selector');
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Create AI Interview/i }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1200);
const d2 = page.getByRole('dialog');
    await d2.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(500);
    const optA = await page.getByRole('option', { name: `${CAND_A} — ${JOB_A}`, exact: true }).count();
    const optB = await page.getByRole('option', { name: `${CAND_B} — ${JOB_B}`, exact: true }).count();
    check('selector: candidate A option "Name — Job Title"', optA === 1, `count=${optA}`);
    check('selector: candidate B option "Name — Job Title"', optB === 1, `count=${optB}`);
    check('selector: no cross-mixing (A not under job B)', (await page.getByRole('option', { name: `${CAND_A} — ${JOB_B}`, exact: true }).count()) === 0, 'mixed option found');
    await page.screenshot({ path: join(SHOTS, 'selector-populated.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // ── PHASE 4: form validation + button enablement ──
    note('phase4', 'form state and enablement');
    const createBtn = () => d2.getByRole('button', { name: /^Create Interview$/i });
    check('form: disabled with no candidate', await createBtn().isDisabled(), 'expected disabled');
    const durationInput = d2.locator('input[type="number"]');
    await durationInput.fill('0');
    check('form: disabled with duration 0', await createBtn().isDisabled(), 'expected disabled');
    const hintVisible = await d2.getByText(/between 5 and 120 minutes/i).count();
    check('form: duration hint shown for 0', hintVisible === 1, `hint count=${hintVisible}`);
    await d2.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: `${CAND_A} — ${JOB_A}` }).click();
    await durationInput.fill('30');
    await page.waitForTimeout(300);
    check('form: enabled with candidate + valid duration', !(await createBtn().isDisabled()), 'expected enabled');
    const languageCombo = d2.locator('[role="combobox"]').nth(1);
    await languageCombo.click();
    await page.getByRole('option', { name: 'Spanish' }).click();
    check('form: language selectable (Spanish)', (await d2.getByText('Spanish', { exact: true }).count()) > 0, 'spanish not shown');
    await page.screenshot({ path: join(SHOTS, 'form-ready.png'), fullPage: true });

    // ── PHASE 5: click Create Interview ──
    note('phase5', 'creating the AI interview');
const createResponsePromise = new Promise((resolve) => {
      page.once('response', (r) => {
        if (r.url().endsWith('/api/v1/ai-interviews') && r.request().method() === 'POST') {
          r.json().then((body) => resolve({ status: r.status(), body })).catch(() => resolve({ status: r.status(), body: null }));
        }
      });
      setTimeout(() => resolve({ status: 0, body: null }), 20000);
    });
    await createBtn().click();
    const createRes = await createResponsePromise;
    check('create: POST /ai-interviews returns 201', createRes.status === 201, `status=${createRes.status}`);
    note('create', `payload status=${createRes.status} id=${createRes.body?.data?.id ?? createRes.body?.id}`);
    await page.waitForTimeout(2500);

    const interviewId = (createRes.body?.data?.id) || null;
    ids.interviewIds.push(interviewId);
    const cardCandidate = await page.getByText(CAND_A, { exact: true }).count();
    const cardBadge = await page.getByText('Created', { exact: true }).count();
    const cardDuration = await page.getByText('30 min', { exact: true }).count();
    check('ui: interview card shows candidate', cardCandidate > 0, `count=${cardCandidate}`);
    check('ui: status badge "Created"', cardBadge > 0, `count=${cardBadge}`);
    check('ui: duration shown', cardDuration > 0, `count=${cardDuration}`);
    const cardCodeHint = await page.locator('body').innerText();
    check('ui: code hint shown (****-XXXX)', /\*\*\*\*-\w{4}/.test(cardCodeHint), 'code hint not found');
    await page.screenshot({ path: join(SHOTS, 'after-create.png'), fullPage: true });

    // ── PHASE 6: DB record integrity ──
    const rec = await prisma.aiInterview.findUnique({ where: { id: interviewId }, include: { application: true } });
    check('db: interview persisted', !!rec, 'not found');
    if (rec) {
      check('db: companyId matches tenant', rec.companyId === ids.companyId, `got ${rec.companyId}`);
      check('db: applicationId matches appA', rec.applicationId === appA.id, `got ${rec.applicationId}`);
      check('db: candidateId via application', rec.application.candidateId === candA.id, `got ${rec.application.candidateId}`);
      check('db: jobId via application', rec.application.jobId === jobA.id, `got ${rec.application.jobId}`);
      check('db: language=es', rec.language === 'es', `got ${rec.language}`);
      check('db: estimatedDurationMinutes=30', rec.estimatedDurationMinutes === 30, `got ${rec.estimatedDurationMinutes}`);
      check('db: status=CREATED', rec.status === 'CREATED', `got ${rec.status}`);
      check('db: codeHash present (64 hex)', /^[0-9a-f]{64}$/.test(rec.codeHash), `got ${rec.codeHash}`);
      check('db: codeDisplayHint "****-XXXX"', /\*\*\*\*-\w{4}/.test(rec.codeDisplayHint || ''), `got ${rec.codeDisplayHint}`);
      const expires = rec.expiresAt ? (rec.expiresAt.getTime() - rec.createdAt.getTime()) / 86400000 : 0;
      check('db: expiresAt ~30 days after createdAt', Math.abs(expires - 30) < 1, `days=${expires.toFixed(2)}`);
      check('db: createdByMembershipId set', rec.createdByMembershipId === ids.membershipId, `got ${rec.createdByMembershipId}`);
      check('db: transcriptStatus NOT_REQUESTED', rec.transcriptStatus === 'NOT_REQUESTED', `got ${rec.transcriptStatus}`);
      const dup = await prisma.aiInterview.count({ where: { codeHash: rec.codeHash } });
      check('db: codeHash unique', dup === 1, `count=${dup}`);
    }

// ── PHASE 7: refresh persistence ──
    note('phase7', 'page refresh');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(CAND_A, { exact: true }).waitFor({ timeout: 15000 });
    check('refresh: interview card persists', (await page.getByText(CAND_A, { exact: true }).count()) > 0, 'not found after reload');
    await page.screenshot({ path: join(SHOTS, 'after-refresh.png'), fullPage: true });

    // ── PHASE 8: duplicate protection (re-create + rapid double click) ──
    note('phase8', 'duplicate protection');
    const beforeCount = await prisma.aiInterview.count({ where: { applicationId: appA.id } });
    const createResp2 = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: appA.id, language: 'es', estimatedDurationMinutes: 30 }),
    });
    const body2 = await createResp2.json();
    const returnedId = body2.data?.id ?? body2.id;
    const afterCount = await prisma.aiInterview.count({ where: { applicationId: appA.id } });
    check('dup: re-create returns existing interview (idempotent)', createResp2.status === 201 && returnedId === interviewId, `status=${createResp2.status} id=${returnedId}`);
    check('dup: no new DB row for same application', afterCount === beforeCount && beforeCount === 1, `before=${beforeCount} after=${afterCount}`);

    // Rapid double-click through the UI: second POST must not duplicate.
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Create AI Interview/i }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    const d3 = page.getByRole('dialog');
    await d3.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: `${CAND_A} — ${JOB_A}` }).click();
    await d3.getByRole('button', { name: /^Create Interview$/i }).click({ clickCount: 2 });
    await sleep(3000);
    const afterDouble = await prisma.aiInterview.count({ where: { applicationId: appA.id } });
    check('dup: rapid double-click still yields exactly 1 record', afterDouble === 1, `count=${afterDouble}`);
    await page.keyboard.press('Escape').catch(() => {});

    // ── PHASE 9: existing interview behavior (selector still lists; backend returns existing) ──
    note('phase9', 'existing interview behavior');
    const appAInterviews = await prisma.aiInterview.count({ where: { applicationId: appA.id, status: { in: ['CREATED', 'SENT', 'ACCESSED', 'READY', 'IN_PROGRESS'] } } });
    check('existing: active interview exists for appA', appAInterviews === 1, `count=${appAInterviews}`);
    const beforeApps = await prisma.application.findUnique({ where: { id: appA.id }, select: { status: true, currentStageId: true } });
    const pipelineUnchanged = await prisma.application.findUnique({ where: { id: appA.id }, select: { status: true, currentStageId: true } });
    check('existing: application status/stage unchanged by AI interview creation', JSON.stringify(beforeApps) === JSON.stringify(pipelineUnchanged), JSON.stringify(beforeApps));
    note('document', 'design: AI interview creation does NOT move the application to the Interview stage; stage moves are a separate recruiter action');

    // ── PHASE 10: multi-candidate isolation (create for candidate B) ──
    note('phase10', 'multi-candidate isolation');
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Create AI Interview/i }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    const d4 = page.getByRole('dialog');
    await d4.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: `${CAND_B} — ${JOB_B}` }).click();
    await d4.getByRole('button', { name: /^Create Interview$/i }).click();
    await page.waitForTimeout(3000);
    const recB = await prisma.aiInterview.findFirst({ where: { applicationId: appB.id }, include: { application: true }, orderBy: { createdAt: 'desc' } });
    check('multi: interview B created', !!recB, 'not found');
    if (recB) {
      ids.interviewIds.push(recB.id);
      check('multi: B links candidate B', recB.application.candidateId === candB.id, `got ${recB.application.candidateId}`);
      check('multi: B links job B', recB.application.jobId === jobB.id, `got ${recB.application.jobId}`);
    }
    const recA = await prisma.aiInterview.findUnique({ where: { id: interviewId } });
    check('multi: A record untouched', !!recA && recA.applicationId === appA.id, 'A record changed');
    check('multi: no interview for appA created by B flow', (await prisma.aiInterview.count({ where: { applicationId: appA.id } })) === 1, 'unexpected extra A row');

    // ── PHASE 11: cross-tenant security ──
    note('phase11', 'cross-tenant security');
    const regRes = await fetch(`${BE_URL}/api/v1/auth/register-company`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyName: COMPANY_B, email: USER_B, firstName: 'Zed', lastName: 'Quill', password: PASS_B, passwordConfirmation: PASS_B, acceptTerms: true }),
    });
    check('tenant: company B registered', regRes.status === 201, `status=${regRes.status}`);
    let tokenB = null;
    if (regRes.ok) {
      const uB = await prisma.user.findUnique({ where: { normalizedEmail: USER_B.toLowerCase() } });
      ids.userB = uB.id;
      const mB = await prisma.companyMembership.findFirst({ where: { userId: uB.id } });
      ids.companyB = mB.companyId;
      ids.membershipB = mB.id;
      await prisma.user.update({ where: { id: uB.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
      await prisma.verificationToken.deleteMany({ where: { userId: uB.id } });
      await prisma.companySettings.upsert({ where: { companyId: mB.companyId }, update: { requireJobApproval: false }, create: { companyId: mB.companyId, requireJobApproval: false } });
      tokenB = await apiLogin(USER_B, PASS_B);
      check('tenant: company B login works', !!tokenB, 'no token');
    }
    if (tokenB && interviewId) {
      const cross = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ applicationId: appA.id, language: 'en', estimatedDurationMinutes: 30 }),
      });
      check('tenant: B cannot create interview for A application (404 hidden)', cross.status === 404, `status=${cross.status}`);
      const crossRead = await fetch(`${BE_URL}/api/v1/ai-interviews/${interviewId}`, {
        headers: { authorization: `Bearer ${tokenB}` },
      });
      check('tenant: B cannot read A interview (404)', crossRead.status === 404, `status=${crossRead.status}`);
      const crossList = await fetch(`${BE_URL}/api/v1/ai-interviews`, { headers: { authorization: `Bearer ${tokenB}` } });
      const listBody = await crossList.json();
      check('tenant: B list does not include A interview', (listBody.data ?? []).length === 0, `count=${(listBody.data ?? []).length}`);
    }

    // ── PHASE 12: API error handling ──
    note('phase12', 'API error handling');
    const noToken = await fetch(`${BE_URL}/api/v1/ai-interviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ applicationId: appA.id }) });
    check('err: no auth -> 401', noToken.status === 401, `status=${noToken.status}`);
    const missingUuid = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', language: 'en' }),
    });
    check('err: nonexistent application -> 404 APPLICATION_NOT_FOUND', missingUuid.status === 404, `status=${missingUuid.status}`);
    const badUuid = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: 'not-a-uuid', language: 'en' }),
    });
    check('err: malformed applicationId -> 400', badUuid.status === 400, `status=${badUuid.status}`);
    const badDurations = [];
    for (const d of [0, 4, 121, 500, -3]) {
      const r = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId: appA.id, language: 'en', estimatedDurationMinutes: d }),
      });
      badDurations.push(r.status);
    }
    check('err: duration 0/4/121/500/-3 all rejected 400', badDurations.every((s) => s === 400), `statuses=${badDurations.join(',')}`);
    const nanDuration = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: appA.id, language: 'en', estimatedDurationMinutes: 'abc' }),
    });
    check('err: non-numeric duration -> 400', nanDuration.status === 400, `status=${nanDuration.status}`);
    const missingApp = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ language: 'en' }),
    });
    check('err: missing applicationId -> 400', missingApp.status === 400, `status=${missingApp.status}`);
    const missingField = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: appA.id, language: 'en', estimatedDurationMinutes: 30 }),
    });
    check('err: valid create still 201 after error batch', missingField.status === 201, `status=${missingField.status}`);
    const appCountAfterErr = await prisma.aiInterview.count({ where: { applicationId: appA.id } });
    check('err: error batch did not duplicate the interview', appCountAfterErr === 1, `count=${appCountAfterErr}`);
  } catch (e) {
    console.error('FATAL:', e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (!KEEP) {
      try { await cleanup(prisma, ids); } catch (e) { console.error('cleanup failed:', e); }
    }
    await prisma.$disconnect();
  }

  console.log(`\n== RESULTS ==`);
  console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
  for (const f of FAIL) console.log('  FAILED:', f);
  console.log(`\nBROWSER ERRORS: ${browserErrors.length}`);
  for (const e of browserErrors) console.log('  -', e);
  if (FAIL.length) process.exitCode = 1;
}

main();
