/**
 * ISSUE #7 — Complete Candidate AI Interview Journey.
 *
 * Real end-to-end acceptance:
 *   EMAIL → CODE → BRANDED PORTAL → INSTRUCTIONS → CONSENT → DEVICE CHECK
 *   → SESSION → COMPLETION → WEBHOOK (transcript/recording) → RECRUITER RESULTS
 *
 * Interview A is explicitly MOCK so the browser journey never consumes Tavus
 * minutes. Live Tavus is exercised by a separate controlled script. Also covers
 * security (invalid/expired/cancelled/completed codes, throttling, webhook
 * spoofing, cross-tenant), isolation, console/network audit and mobile.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const MH_API = process.env.MAILHOG_API ?? 'http://localhost:8025/api/v2/messages';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'interview-journey-shots');
mkdirSync(SHOTS, { recursive: true });
const RESUME_A = fileURLToPath(new URL('./fixtures/live-backend-resume.pdf', import.meta.url));
const RESUME_B = fileURLToPath(new URL('./fixtures/live-analyst-resume.pdf', import.meta.url));

const RUN_ID = Date.now();
const EMAIL = 'sarah@airecruiter.com';
const PASSWORD = 'admin123';
const JOB_A = `Journey Engineer ${RUN_ID}`;
const JOB_B = `Journey Analyst ${RUN_ID}`;
const CAND_A = `Maya Chen ${RUN_ID}`;
const CAND_B = `Leo Garcia ${RUN_ID}`;
const MAIL_A = `maya${RUN_ID}@e2e.com`;
const MAIL_B = `leo${RUN_ID}@e2e.com`;
const COMPANY_B = `Tenant J ${RUN_ID}`;
const USER_B = `zj${RUN_ID}@e2e.com`;
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

function decodeSubject(subject) {
  if (!subject) return '';
  return subject
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
      try {
        if (encoding.toLowerCase() === 'q') {
          const bytes = text
            .replace(/_/g, ' ')
            .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          return Buffer.from(bytes, 'latin1').toString('utf8');
        }
        if (encoding.toLowerCase() === 'b') {
          return Buffer.from(text, 'base64').toString('utf8');
        }
        return text;
      } catch {
        return text;
      }
    })
    .trim();
}

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

async function fetchMailhogMessages() {
  const res = await fetch(MH_API);
  return res.json();
}

function mailhogPlainBody(message) {
  const body = message?.Content?.Body || '';
  return body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function hashNormalized(code) {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '').replace(/[O0I1]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

function extractCode(plain) {
  const m = plain.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
  return m ? m[1] : '';
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
  console.log('== candidate-interview-journey.mjs ==');
  const ids = { companyId: null, membershipId: null, jobIds: [], candidateIds: [], applicationIds: [], interviewIds: [], companyB: null, userB: null, membershipB: null, storedFileIds: [], extractionIds: [] };
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 400/.test(m.text())) {
        browserErrors.push(`console: ${m.text()}`);
      }
    });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('response', (r) => {
      if (r.status() >= 400) browserErrors.push(`http ${r.status()}: ${r.url()}`);
    });

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

    // ── controlled data (jobs via API, candidates via UI) ──
    note('setup', 'creating controlled eligible data');
    const mkJob = async (title, description) => {
      const r = await fetch(`${BE_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description, qualifications: 'Strong communication skills. Relevant experience in the field.', responsibilities: 'Own delivery of assigned work; collaborate with the team.' }),
      });
      const j = (await r.json()).data;
      ids.jobIds.push(j.id);
      const pub = await fetch(`${BE_URL}/api/v1/jobs/${j.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      if (!pub.ok) throw new Error(`job publish failed: ${pub.status}`);
      return j;
    };
    const jobA = await mkJob(JOB_A, 'Backend engineering for the AI recruiter pipeline with Node.js and TypeScript.');
    const jobB = await mkJob(JOB_B, 'Business metrics analysis with Python and SQL.');

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

    const candA = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL_A.toLowerCase() } });
    const candB = await prisma.candidate.findFirst({ where: { normalizedEmail: MAIL_B.toLowerCase() } });
    ids.candidateIds.push(candA.id, candB.id);
    const appA = await prisma.application.findFirst({ where: { candidateId: candA.id, deletedAt: null } });
    const appB = await prisma.application.findFirst({ where: { candidateId: candB.id, deletedAt: null } });
    ids.applicationIds.push(appA.id, appB.id);
    for (const sf of await prisma.storedFile.findMany({ where: { applicationId: { in: [appA.id, appB.id] } } })) ids.storedFileIds.push(sf.id);
    check('data: appA -> jobA', appA.jobId === jobA.id, `got ${appA.jobId}`);
    check('data: appB -> jobB', appB.jobId === jobB.id, `got ${appB.jobId}`);

    // ── PHASE 1: EMAIL ACCEPTANCE ──
    // Interview A: explicit MOCK provider so the browser journey is offline-safe.
    note('email', 'creating interview A via API (provider=MOCK)');
    const createA = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: appA.id, language: 'en', estimatedDurationMinutes: 30, provider: 'MOCK' }),
    });
    const interviewA = (await createA.json()).data;
    const interviewAId = interviewA.id;
    ids.interviewIds.push(interviewAId);
    const rawCodeA = interviewA.rawCode;
    check('email-phase: interview A created with rawCode (MOCK)', createA.status === 201 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rawCodeA || ''), `status=${createA.status} raw=${rawCodeA}`);
    const recA0 = await prisma.aiInterview.findUnique({ where: { id: interviewAId } });
    check('email-phase: A provider is MOCK', recA0?.provider === 'MOCK', `provider=${recA0?.provider}`);

    const sendA = await fetch(`${BE_URL}/api/v1/ai-interviews/${interviewAId}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ rawCode: rawCodeA }),
    });
    check('email-phase: send A with rawCode accepted', sendA.status === 200, `status=${sendA.status}`);
    await sleep(1500);

    const emailA = await fetchMailhogMessages();
    const mailA = emailA.items?.find((m) =>
      m.Content?.Headers?.To?.[0]?.includes(MAIL_A) &&
      (m.Content?.Headers?.Subject?.[0] || '').toLowerCase().includes('interview'),
    );
    check('email: captured in MailHog for exact recipient', !!mailA, 'no message found');
    let emailCodeA = '';
    if (mailA) {
      const subject = decodeSubject(mailA.Content.Headers.Subject?.[0] || '');
      const plain = mailhogPlainBody(mailA);
      note('email', `subject: ${subject}`);
      emailCodeA = extractCode(plain);
      check('email: subject mentions the job title', subject.replace(/\s+/g, '').includes(JOB_A.replace(/\s+/g, '')), `subject=${subject}`);
      check('email: subject says AI interview invitation', /AI interview invitation/i.test(subject.replace(/\s+/g, ' ')), `subject=${subject}`);
      check('email: contains raw interview code XXXX-XXXX', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(emailCodeA), `found=${emailCodeA}`);
      check('email: code not masked (no ****)', !plain.includes('****'), 'masked hint found');
      check('email: candidate name present', plain.includes(CAND_A.split(' ')[0]) && plain.includes(CAND_A.split(' ')[1]), 'name missing');
      check('email: job title present', plain.includes(JOB_A), 'job missing');
      check('email: public interview link present', plain.includes(`${FE_URL}/interview/access`), 'link missing');
      check('email: estimated duration present', plain.includes('30 minutes'), 'duration missing');
      check('email: expiry date present', /expires|Expires|invitation expires/i.test(plain), 'expiry missing');
      check('email: recording/transcription notice present', /transcrib|recorded|recording/i.test(plain), 'notice missing');
      check('email: no internal IDs leaked', !plain.includes(interviewAId) && !plain.includes(appA.id), 'internal id leaked');
      check('email: no Tavus/provider terminology', !/tavus|conversation_url|api_key/i.test(plain), 'provider terms leaked');
      const recA = await prisma.aiInterview.findUnique({ where: { id: interviewAId } });
      check('email: emailed code matches DB hash', !!recA && hashNormalized(emailCodeA) === recA.codeHash, 'hash mismatch');
      check('email: status now SENT + invitationEmail recorded', !!recA && recA.status === 'SENT' && recA.invitationEmail === MAIL_A, `status=${recA?.status}`);
      check('email: DB stores masked hint, not raw code', !!recA && /^\*\*\*\*-/.test(recA.codeDisplayHint || ''), `hint=${recA?.codeDisplayHint}`);
      const mhPage = await context.newPage();
      await mhPage.goto('http://localhost:8025', { waitUntil: 'domcontentloaded' });
      await mhPage.waitForTimeout(2000);
      await mhPage.screenshot({ path: join(SHOTS, 'mailhog-inbox.png') });
      await mhPage.close();
    }

    // Interview B: created through the UI (default provider), sent from the
    // list page WITHOUT rawCode -> server generates a fresh code for the email.
    note('email', 'creating interview B via the UI and sending from list page');
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Create AI Interview/i }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1200);
    const d1 = page.getByRole('dialog');
    await d1.locator('[role="combobox"]').first().click();
    await page.waitForTimeout(600);
    const createBResPromise = new Promise((resolve) => {
      page.once('response', (r) => {
        if (r.url().endsWith('/api/v1/ai-interviews') && r.request().method() === 'POST') {
          r.json().then((body) => resolve({ status: r.status(), body })).catch(() => resolve({ status: r.status(), body: null }));
        }
      });
      setTimeout(() => resolve({ status: 0, body: null }), 20000);
    });
    await page.getByRole('option', { name: `${CAND_B} — ${JOB_B}` }).click();
    await d1.getByRole('button', { name: /^Create Interview$/i }).click();
    const createBRes = await createBResPromise;
    const interviewBId = createBRes.body?.data?.id || null;
    ids.interviewIds.push(interviewBId);
    const uiRawCodeB = createBRes.body?.data?.rawCode;
    check('email-phase: interview B created via UI (201 + rawCode)', createBRes.status === 201 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(uiRawCodeB || ''), `status=${createBRes.status}`);
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Send Invitation/i }).first().click();
    await page.waitForTimeout(3000);
    const emailB = await fetchMailhogMessages();
    const mailB = emailB.items?.find((m) =>
      m.Content?.Headers?.To?.[0]?.includes(MAIL_B) &&
      (m.Content?.Headers?.Subject?.[0] || '').toLowerCase().includes('interview'),
    );
    const plainB = mailB ? mailhogPlainBody(mailB) : '';
    const emailCodeB = extractCode(plainB);
    check('email: no-rawCode path emails a fresh raw code', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(emailCodeB), `found=${emailCodeB}`);
    const recB = await prisma.aiInterview.findUnique({ where: { id: interviewBId } });
    check('email: B fresh code matches DB hash', !!recB && hashNormalized(emailCodeB) === recB.codeHash, 'hash mismatch B');
    check('email: B code differs from the UI-returned code (regenerated server-side)', !!uiRawCodeB && emailCodeB !== uiRawCodeB, 'same code used');
    check('email: B status SENT', !!recB && recB.status === 'SENT', `status=${recB?.status}`);

    // ── PHASE 2: EARLY SECURITY (no valid-code calls yet) ──
    note('security', 'early security checks');
    const badCode = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'ZZZZ-ZZZZ' }),
    });
    const badBody = await badCode.json();
    check('sec: invalid code -> 400 INVALID_CODE', badCode.status === 400 && badBody.errorCode === 'INVALID_CODE', `status=${badCode.status} code=${badBody.errorCode}`);

    const publicRead = await fetch(`${BE_URL}/api/v1/ai-interviews/${interviewAId}`);
    check('sec: public read of recruiter endpoint -> 401', publicRead.status === 401, `status=${publicRead.status}`);

    const regRes = await fetch(`${BE_URL}/api/v1/auth/register-company`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyName: COMPANY_B, email: USER_B, firstName: 'Zed', lastName: 'Quill', password: PASS_B, passwordConfirmation: PASS_B, acceptTerms: true }),
    });
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
    }
    if (tokenB && interviewAId) {
      const crossRead = await fetch(`${BE_URL}/api/v1/ai-interviews/${interviewAId}`, { headers: { authorization: `Bearer ${tokenB}` } });
      check('sec: company B recruiter cannot read company A interview (404)', crossRead.status === 404, `status=${crossRead.status}`);
    }

    // ── PHASE 3: PUBLIC PORTAL JOURNEY (interview A, MOCK) ──
    note('portal', 'candidate journey with the emailed code');
    const freshCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const portal = await freshCtx.newPage();
    portal.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 400/.test(m.text())) {
        browserErrors.push(`portal console: ${m.text()}`);
      }
    });
    portal.on('pageerror', (e) => browserErrors.push(`portal pageerror: ${e.message}`));
    portal.on('requestfailed', (r) => browserErrors.push(`portal requestfailed: ${r.url()}`));
    portal.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('/ai-interviews/public/')) {
        browserErrors.push(`portal http ${r.status()}: ${r.url()}`);
      }
    });

    await portal.goto(`${FE_URL}/interview/access`, { waitUntil: 'domcontentloaded' });
    await portal.waitForTimeout(2500);
    const logoCount = await portal.locator('img[alt="AI Recruiter"]').count();
    check('portal: AI Recruiter logo visible', logoCount > 0, 'logo missing');
    check('portal: branded headline', (await portal.getByText('Welcome to your interview').count()) > 0, 'headline missing');
    await portal.screenshot({ path: join(SHOTS, '01-code-entry.png') });

    // invalid code state
    const codeInput = portal.getByLabel('Interview code');
    await codeInput.fill('ZZZZ-ZZZZ');
    await portal.getByRole('button', { name: /Continue/i }).click();
    await portal.waitForTimeout(1500);
    const invalidAlert = await portal.locator('#code-error').textContent();
    check('portal: invalid-code error state', /could not verify/i.test(invalidAlert || ''), `alert=${invalidAlert}`);
    await portal.screenshot({ path: join(SHOTS, '02-invalid-code.png') });
    await codeInput.fill('');

    // valid code from the EMAIL (interview A)
    await codeInput.fill(emailCodeA);
    await portal.getByRole('button', { name: /Continue/i }).click();
    await portal.waitForURL(/\/interview\/welcome/, { timeout: 20000 });
    await portal.waitForTimeout(2500);
    check('portal: welcome shows candidate first name', (await portal.getByText(`Welcome, ${CAND_A.split(' ')[0]}`).count()) > 0, 'name missing');
    check('portal: welcome shows job title', (await portal.getByText(JOB_A).count()) > 0, 'job missing');
    check('portal: welcome shows duration ~30 minutes', (await portal.getByText(/~30 minutes/).count()) > 0, 'duration missing');
    check('portal: welcome shows language English', (await portal.getByText('English').count()) > 0, 'language missing');
    await portal.screenshot({ path: join(SHOTS, '03-welcome.png') });

    await portal.getByRole('button', { name: /Continue to instructions/i }).click();
    await portal.waitForURL(/\/interview\/preparation/, { timeout: 15000 });
    await portal.waitForTimeout(2000);
    check('portal: instruction cards shown', (await portal.getByText('Camera & Microphone').count()) > 0 && (await portal.getByText('Quiet Environment').count()) > 0, 'instructions missing');
    check('portal: recording & transcript card shown', (await portal.getByText('Recording & Transcript').count()) > 0, 'recording card missing');
    await portal.screenshot({ path: join(SHOTS, '04-instructions.png') });

    await portal.getByLabel('Yes, I need an adjustment.').click();
    await portal.waitForTimeout(400);
    const notesField = portal.getByLabel(/adjustment would help you/);
    check('portal: accommodation text field appears', (await notesField.count()) === 1, 'notes field missing');
    await notesField.fill('Extended response time would help me participate.');
    await portal.screenshot({ path: join(SHOTS, '05-accommodation.png') });

    const continueBtn = portal.getByRole('button', { name: /Check camera & microphone/i });
    const consentBoxes = portal.locator('input[type="checkbox"]');
    check('portal: continue disabled before consent', await continueBtn.isDisabled(), 'expected disabled');
    await consentBoxes.nth(0).check();
    check('portal: continue still disabled after one consent', await continueBtn.isDisabled(), 'expected disabled');
    await consentBoxes.nth(1).check();
    check('portal: continue enabled after both consents', !(await continueBtn.isDisabled()), 'expected enabled');
    await portal.screenshot({ path: join(SHOTS, '06-consent.png') });

    await continueBtn.click();
    await portal.waitForURL(/\/interview\/device-check/, { timeout: 15000 });
    await portal.waitForTimeout(4000);
    check('portal: device check camera Ready', (await portal.getByText('Ready', { exact: true }).count()) >= 1, 'camera not ready');
    const startBtn = portal.getByRole('button', { name: /Start AI Interview/i });
    check('portal: start enabled after device check', !(await startBtn.isDisabled()), 'start disabled');
    await portal.screenshot({ path: join(SHOTS, '07-device-check.png') });

    // denied-permission recovery state (separate browser WITHOUT fake-ui grant)
    note('portal', 'denied-permission recovery state');
    const denyBrowser = await chromium.launch({ headless: true });
    const denyCtx = await denyBrowser.newContext({ viewport: { width: 1440, height: 900 } });
    const denyPage = await denyCtx.newPage();
    denyPage.on('pageerror', (e) => browserErrors.push(`deny pageerror: ${e.message}`));
    await denyPage.goto(`${FE_URL}/interview/access`, { waitUntil: 'domcontentloaded' });
    await denyPage.waitForTimeout(1500);
    await denyPage.getByLabel('Interview code').fill(emailCodeA);
    await denyPage.getByRole('button', { name: /Continue/i }).click();
    await denyPage.waitForURL(/\/interview\/welcome/, { timeout: 20000 });
    await denyPage.getByRole('button', { name: /Continue to instructions/i }).click();
    await denyPage.waitForURL(/\/interview\/preparation/, { timeout: 15000 });
    await denyPage.locator('input[type="checkbox"]').nth(0).check();
    await denyPage.locator('input[type="checkbox"]').nth(1).check();
    await denyPage.getByRole('button', { name: /Check camera & microphone/i }).click();
    await denyPage.waitForURL(/\/interview\/device-check/, { timeout: 15000 });
    await denyPage.waitForTimeout(4000);
    await denyPage.screenshot({ path: join(SHOTS, '08-device-denied.png') });
    const deniedText = await denyPage.locator('body').innerText();
    check('portal: denied state shows recovery steps', /How to fix permission issues/.test(deniedText), 'recovery steps missing');
    check('portal: start disabled when permissions denied', await denyPage.getByRole('button', { name: /Start AI Interview/i }).isDisabled(), 'start enabled while denied');
    await denyCtx.close();
    await denyBrowser.close();

    // start the interview (fake media context)
    await startBtn.click();
    await portal.waitForURL(/\/interview\/session/, { timeout: 30000 });
    await portal.waitForTimeout(4000);
    check('portal: live shell shows AI Interview header', (await portal.getByText('AI Interview').count()) > 0, 'shell header missing');
    check('portal: live shell shows candidate + job', (await portal.getByText(CAND_A.split(' ')[0]).count()) > 0 && (await portal.getByText(JOB_A).count()) > 0, 'context missing');
    check('portal: live shell shows in-progress status', (await portal.getByText('In progress').count()) > 0, 'status missing');
    check('portal: mock mode simulation visible', (await portal.getByText('AI Interview Simulation').count()) > 0, 'mock sim missing');
    await portal.screenshot({ path: join(SHOTS, '09-session-live.png') });

    const midRec = await prisma.aiInterview.findUnique({ where: { id: interviewAId } });
    check('db: status IN_PROGRESS during session', midRec?.status === 'IN_PROGRESS', `status=${midRec?.status}`);
    check('db: startedAt + consentAcceptedAt persisted', !!midRec?.startedAt && !!midRec?.consentAcceptedAt, 'start/consent missing');
    check('db: accommodation persisted', midRec?.accommodationRequested === true && (midRec?.accommodationNotes || '').includes('Extended response'), `acc=${midRec?.accommodationRequested} ${midRec?.accommodationNotes}`);

    await portal.getByRole('button', { name: /Leave/i }).click();
    await portal.waitForURL(/\/interview\/complete/, { timeout: 20000 });
    await portal.waitForTimeout(2000);
    check('portal: completion page headline', (await portal.getByText('Interview Completed').count()) > 0, 'headline missing');
    check('portal: completion thanks candidate', (await portal.getByText(`Thank you, ${CAND_A.split(' ')[0]}`).count()) > 0, 'thanks missing');
    await portal.screenshot({ path: join(SHOTS, '10-completion.png') });

    const doneRec = await prisma.aiInterview.findUnique({ where: { id: interviewAId } });
    check('db: status COMPLETED after session end', doneRec?.status === 'COMPLETED', `status=${doneRec?.status}`);
    check('db: completedAt persisted', !!doneRec?.completedAt, 'completedAt missing');

    // completed re-entry
    const reentry = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: emailCodeA }),
    });
    const reentryBody = await reentry.json();
    check('sec: completed interview re-entry -> INTERVIEW_COMPLETED', reentry.status === 400 && reentryBody.errorCode === 'INTERVIEW_COMPLETED', `status=${reentry.status} code=${reentryBody.errorCode}`);

    // ── PHASE 4: WEBHOOK + TRANSCRIPT + RECORDING ──
    note('webhook', 'tavus-style callbacks');
    const envFile = readFileSync(join(ROOT, 'backend', '.env'), 'utf8');
    const callbackSecret = process.env.VERIFY_CALLBACK_SECRET || (envFile.match(/^TAVUS_CALLBACK_SECRET=(.+)$/m)?.[1] || '');
    const convIdA = `mock-${interviewAId}`;
    const spoof = await fetch(`${BE_URL}/api/v1/ai-interviews/callback/wrong-secret`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'system.shutdown', conversation_id: convIdA }),
    });
    check('webhook: wrong secret rejected (400)', spoof.status === 400, `status=${spoof.status}`);

    const unknown = await fetch(`${BE_URL}/api/v1/ai-interviews/callback/${callbackSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'system.shutdown', conversation_id: 'unknown-conv-xyz' }),
    });
    const unknownBody = await unknown.json();
    const unknownReceived = unknownBody.data?.received ?? unknownBody.received;
    check('webhook: unknown conversation ignored safely', unknown.status === 200 && unknownReceived === true, `status=${unknown.status} body=${JSON.stringify(unknownBody)}`);

    const transcript = [
      { role: 'assistant', content: 'Welcome to your interview for the Backend Engineer position. Is that correct?', timestamp: 1779475657.84, seconds_from_start: 0.0, duration: 2.15 },
      { role: 'user', content: 'Yes, that is correct. I am excited about this role.', timestamp: 1779475684.88, seconds_from_start: 27.04, duration: 1.84 },
      { role: 'assistant', content: 'Great. Tell me about a challenging project you shipped.', timestamp: 1779475700.1, seconds_from_start: 42.3, duration: 2.5 },
      { role: 'user', content: 'I led the migration of our auth service to TypeScript.', timestamp: 1779475720.5, seconds_from_start: 62.7, duration: 3.2 },
    ];
    const wbTranscription = await fetch(`${BE_URL}/api/v1/ai-interviews/callback/${callbackSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_type: 'application.transcription_ready',
        conversation_id: convIdA,
        message_type: 'application',
        properties: { transcript, transcript_url: 'https://tavus.test/transcript/abc' },
      }),
    });
    check('webhook: transcription_ready accepted', wbTranscription.status === 200, `status=${wbTranscription.status}`);
    const wbRecording = await fetch(`${BE_URL}/api/v1/ai-interviews/callback/${callbackSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_type: 'application.recording_ready',
        conversation_id: convIdA,
        properties: { storage_provider: 's3', storage_uri: 's3://recordings/tavus/conv-a/1234', duration: 240 },
      }),
    });
    check('webhook: recording_ready accepted', wbRecording.status === 200, `status=${wbRecording.status}`);

    const wbDuplicate = await fetch(`${BE_URL}/api/v1/ai-interviews/callback/${callbackSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'application.transcription_ready', conversation_id: convIdA, properties: { transcript } }),
    });
    check('webhook: duplicate transcription safe', wbDuplicate.status === 200, `status=${wbDuplicate.status}`);

    const wbShutdown = await fetch(`${BE_URL}/api/v1/ai-interviews/callback/${callbackSecret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'system.shutdown', conversation_id: convIdA, properties: { shutdown_reason: 'participant_left' } }),
    });
    check('webhook: shutdown after completion idempotent', wbShutdown.status === 200, `status=${wbShutdown.status}`);

    const recAAfter = await prisma.aiInterview.findUnique({ where: { id: interviewAId } });
    check('db: transcript status READY + turns persisted', recAAfter?.transcriptStatus === 'READY' && Array.isArray(recAAfter?.transcript) && recAAfter?.transcript?.length === 4, `status=${recAAfter?.transcriptStatus} len=${recAAfter?.transcript?.length}`);
    const turns = recAAfter?.transcript || [];
    const hasUserTurn = turns.some((t) => t.role === 'user' && typeof t.content === 'string');
    const hasAssistantTurn = turns.some((t) => t.role === 'assistant' && t.content?.includes('challenging'));
    const hasTimestamps = turns.every((t) => typeof t.timestamp === 'number' && typeof t.seconds_from_start === 'number');
    check('db: transcript has speaker/text/timestamps', hasUserTurn && hasAssistantTurn && hasTimestamps, `user=${hasUserTurn} assistant=${hasAssistantTurn} ts=${hasTimestamps}`);
    check('db: recording reference persisted', recAAfter?.recordingStatus === 'READY' && recAAfter?.recordingUrl === 's3://recordings/tavus/conv-a/1234', `rec=${recAAfter?.recordingStatus} ${recAAfter?.recordingUrl}`);
    check('db: completedAt not overwritten by duplicate shutdown', !!recAAfter?.completedAt, 'completedAt missing');

    // isolation: interview B untouched by A webhooks
    const recBAfter = await prisma.aiInterview.findUnique({ where: { id: interviewBId } });
    check('isolation: B has no transcript from A webhooks', recBAfter?.transcript == null && recBAfter?.transcriptStatus === 'NOT_REQUESTED', `B transcript=${recBAfter?.transcriptStatus}`);
    check('isolation: B still SENT (never accessed/started)', recBAfter?.status === 'SENT', `B status=${recBAfter?.status}`);

    // ── PHASE 5: RECRUITER RESULTS VIEW ──
    note('recruiter', 'completed interview in recruiter UI');
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    // Target the exact card: it shows the candidate name, the masked code hint
    // and the View Details button.
    const recATarget = await prisma.aiInterview.findUnique({ where: { id: interviewAId } });
    const hintA = recATarget?.codeDisplayHint || '';
    const targetCard = page
      .locator('div')
      .filter({ hasText: hintA })
      .filter({ has: page.getByRole('button', { name: /View Details/i }) })
      .last();
    await targetCard.getByRole('button', { name: /View Details/i }).click();
    await page.waitForTimeout(2500);
    const detailText = await page.locator('[role="dialog"]').innerText();
    const recordingHref = await page
      .locator('[role="dialog"] a[href*="s3://recordings/tavus/conv-a/1234"]')
      .count();
    check('recruiter: details dialog shows candidate + job', detailText.includes(CAND_A.split(' ')[0]) && detailText.includes(JOB_A), 'candidate/job missing');
    check('recruiter: details shows transcript turns', detailText.includes('I led the migration') && detailText.includes('Tell me about a challenging project'), 'transcript missing');
    check('recruiter: details shows recording reference', recordingHref > 0 && detailText.includes('Open recording reference'), `href=${recordingHref}`);
    check('recruiter: details shows provider reference', detailText.includes(convIdA), 'conversation ref missing');
    await page.screenshot({ path: join(SHOTS, '11-recruiter-details.png') });

    // ── PHASE 6: EXPIRED / CANCELLED (after journey so create makes fresh rows) ──
    note('security', 'expired + cancelled codes');
    const createC = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: appA.id, language: 'en', estimatedDurationMinutes: 30, provider: 'MOCK' }),
    });
    const interviewC = (await createC.json()).data;
    ids.interviewIds.push(interviewC.id);
    await prisma.aiInterview.update({ where: { id: interviewC.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredCheck = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: interviewC.rawCode }),
    });
    const expiredBody = await expiredCheck.json();
    const expiredRec = await prisma.aiInterview.findUnique({ where: { id: interviewC.id } });
    check('sec: expired code -> 400 INTERVIEW_EXPIRED + status flipped to EXPIRED', expiredCheck.status === 400 && expiredBody.errorCode === 'INTERVIEW_EXPIRED' && expiredRec?.status === 'EXPIRED', `status=${expiredCheck.status} code=${expiredBody.errorCode} db=${expiredRec?.status}`);

    await fetch(`${BE_URL}/api/v1/ai-interviews/${interviewBId}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    const cancelledCheck = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: emailCodeB }),
    });
    const cancelledBody = await cancelledCheck.json();
    check('sec: cancelled code -> 400 INTERVIEW_UNAVAILABLE', cancelledCheck.status === 400 && cancelledBody.errorCode === 'INTERVIEW_UNAVAILABLE', `status=${cancelledCheck.status} code=${cancelledBody.errorCode}`);

    // ── PHASE 7: MOBILE RESPONSIVE (fresh MOCK interview E) ──
    note('responsive', '390px mobile portal with a fresh MOCK interview');
    const createE = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: appA.id, language: 'en', estimatedDurationMinutes: 30, provider: 'MOCK' }),
    });
    const interviewE = (await createE.json()).data;
    ids.interviewIds.push(interviewE.id);
    const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mob = await mobCtx.newPage();
    mob.on('pageerror', (e) => browserErrors.push(`mobile pageerror: ${e.message}`));
    mob.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/ai-interviews/public/')) browserErrors.push(`mobile http ${r.status()}: ${r.url()}`); });
    await mob.goto(`${FE_URL}/interview/access`, { waitUntil: 'domcontentloaded' });
    await mob.waitForTimeout(2500);
    const overflow1 = await mob.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('mobile: no horizontal overflow on code entry', !overflow1, `overflow=${await mob.evaluate(() => document.documentElement.scrollWidth)} vs ${await mob.evaluate(() => document.documentElement.clientWidth)}`);
    await mob.screenshot({ path: join(SHOTS, '12-mobile-code-entry.png') });
    await mob.getByLabel('Interview code').fill(interviewE.rawCode);
    await mob.getByRole('button', { name: /Continue/i }).click();
    await mob.waitForURL(/\/interview\/welcome/, { timeout: 20000 });
    await mob.waitForTimeout(2000);
    await mob.screenshot({ path: join(SHOTS, '13-mobile-welcome.png') });
    await mob.getByRole('button', { name: /Continue to instructions/i }).click();
    await mob.waitForURL(/\/interview\/preparation/, { timeout: 15000 });
    await mob.waitForTimeout(2000);
    const overflow2 = await mob.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('mobile: no horizontal overflow on preparation', !overflow2, 'overflow detected');
    await mob.screenshot({ path: join(SHOTS, '14-mobile-preparation.png') });
    await mob.locator('input[type="checkbox"]').nth(0).check();
    await mob.locator('input[type="checkbox"]').nth(1).check();
    await mob.getByRole('button', { name: /Check camera & microphone/i }).click();
    await mob.waitForURL(/\/interview\/device-check/, { timeout: 15000 });
    await mob.waitForTimeout(4000);
    const overflow3 = await mob.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('mobile: no horizontal overflow on device check', !overflow3, 'overflow detected');
    await mob.screenshot({ path: join(SHOTS, '15-mobile-device-check.png') });
    await mob.getByRole('button', { name: /Start AI Interview/i }).click();
    await mob.waitForURL(/\/interview\/session/, { timeout: 30000 });
    await mob.waitForTimeout(4000);
    const overflow4 = await mob.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check('mobile: no horizontal overflow on session shell', !overflow4, 'overflow detected');
    await mob.screenshot({ path: join(SHOTS, '16-mobile-session.png') });
    await mob.getByRole('button', { name: /Leave/i }).click();
    await mob.waitForURL(/\/interview\/complete/, { timeout: 20000 });
    await mob.waitForTimeout(1500);
    await mob.screenshot({ path: join(SHOTS, '17-mobile-completion.png') });
    await mobCtx.close();
    const recE = await prisma.aiInterview.findUnique({ where: { id: interviewE.id } });
    check('db: mobile journey completed interview E', recE?.status === 'COMPLETED', `status=${recE?.status}`);

    // ── PHASE 8: BRUTE-FORCE THROTTLING (last, so the 60s window is clear) ──
    note('security', 'brute-force throttling');
    let throttled = false;
    let attemptStatuses = [];
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `ZZZZ-ZZZ${i % 10}` }),
      });
      attemptStatuses.push(r.status);
      if (r.status === 429) { throttled = true; break; }
      await sleep(120);
    }
    check('sec: repeated bad codes eventually throttled (429)', throttled, `statuses=${attemptStatuses.join(',')}`);

    writeFileSync(join(SHOTS, 'summary.json'), JSON.stringify({ pass: PASS, fail: FAIL, notes, browserErrors }, null, 2));
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
  console.log(`\nBROWSER/HTTP ERRORS: ${browserErrors.length}`);
  for (const e of browserErrors) console.log('  -', e);
  if (FAIL.length) process.exitCode = 1;
}

main();