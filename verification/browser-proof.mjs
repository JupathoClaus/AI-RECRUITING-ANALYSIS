// Browser-level end-to-end proof of the recruiter AI flow.
//
// Runs against the LOCAL stack (backend + frontend must already be running):
//   - Item 1 (full browser session): register a company from the UI, complete
//     email verification and login, create a job, add a candidate with a real
//     PDF resume, run AI screening end-to-end, and see the screening result
//     rendered in the browser.
//   - Item 2 (extraction request dedup at HTTP level): replay the retry
//     extraction request twice and prove the SAME extraction id is returned
//     and only ONE extraction row exists in the database.
//   - Item 6 (browser evidence + real resume): every UI interaction happens in
//     a real Chromium session and the resume is a real parseable PDF.
//
// Safety: all database writes go through Prisma (parameterized) and cleanup
// deletes ONLY the exact rows created by this run (see cleanup.mjs). The
// script refuses to run against anything but a local talentai* database.
//
// Usage: node verification/browser-proof.mjs [--keep] [--headful]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BACKEND = join(ROOT, 'backend');
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const KEEP = process.argv.includes('--keep');
const HEADFUL = process.argv.includes('--headful');
const RESUME_PDF = fileURLToPath(new URL('./fixtures/minimal-resume.pdf', import.meta.url));

const RUN_ID = Date.now();
const EMAIL = `proof${RUN_ID}@e2e.com`;
const COMPANY = `Proof Co ${RUN_ID}`;
const JOB_TITLE = `Verification Engineer ${RUN_ID}`;
const CANDIDATE_NAME = 'Proof Candidate';
const PASSWORD = `VerifyPass!${RUN_ID}`;

const results = [];
const browserErrors = [];
const note = (label, detail) => {
  results.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};

async function main() {
  console.log('== browser-proof.mjs ==');
  console.log(`run id: ${RUN_ID}`);
  console.log(`targets: frontend ${FE_URL} | backend ${BE_URL}`);

  // ---- guards ----
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);

  const feOk = await ping(`${FE_URL}/register`);
  if (!feOk) {
    throw new Error(`Frontend not reachable at ${FE_URL}. Start it with: npm run dev (in ${ROOT})`);
  }
  const beOk = await ping(`${BE_URL}/api/v1/health`);
  if (!beOk) {
    throw new Error(`Backend not reachable at ${BE_URL}. Start it with: npm run start:dev (in ${BACKEND})`);
  }
  note('preflight', 'frontend and backend are reachable');

  // regenerate the real PDF fixture
  await import('./pdf-fixture.mjs');

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = {
    userId: null,
    companyId: null,
    membershipIds: [],
    candidateIds: [],
    jobIds: [],
    applicationIds: [],
    extractionIds: [],
    storedFileIds: [],
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: !HEADFUL });
    const context = await browser.newContext();
    const page = await context.newPage();
    let expectedExtractionPendingConsoleErrors = 0;

    const recordBrowserError = (kind, detail) => {
      browserErrors.push({ kind, detail });
      console.error(`  [browser.${kind}] ${detail}`);
    };
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const expected409ConsoleError =
        expectedExtractionPendingConsoleErrors > 0 &&
        message.text() === 'Failed to load resource: the server responded with a status of 409 (Conflict)';
      if (expected409ConsoleError) {
        expectedExtractionPendingConsoleErrors--;
        return;
      }
      recordBrowserError('console', message.text());
    });
    page.on('pageerror', (error) => recordBrowserError('pageerror', error.message));
    page.on('requestfailed', (request) => {
      recordBrowserError(
        'requestfailed',
        `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown failure'}`,
      );
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const url = response.url();
      if (/\/(favicon\.ico|manifest\.json)(\?|$)/.test(url)) return;
      // The first screening request deliberately returns this domain response
      // while resume extraction is queued; the UI polls and retries afterward.
      const expectedExtractionPending =
        response.status() === 409 &&
        response.request().method() === 'POST' &&
        /\/api\/v1\/applications\/[^/]+\/ai-screenings(?:\?|$)/.test(url);
      if (expectedExtractionPending) {
        expectedExtractionPendingConsoleErrors++;
      } else {
        recordBrowserError('http', `${response.status()} ${response.request().method()} ${url}`);
      }
    });

    // ---------- item 1a: full browser registration ----------
    note('1a.start', 'registering a brand-new company from the browser UI');
    await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
    await fillFormWithRetry(page, [
      ['input[placeholder="Acme Corp"]', COMPANY],
      ['input[placeholder="you@company.com"]', EMAIL],
      ['input[placeholder="John"]', 'Proof'],
      ['input[placeholder="Doe"]', 'Candidate'],
      ['input[placeholder="At least 12 characters"]', PASSWORD],
      ['input[placeholder="Re-enter your password"]', PASSWORD],
    ]);
    await page.check('#acceptTerms');
    await page.click('button[type="submit"]');
    try {
      await page.getByText('Account created successfully!').waitFor({ timeout: 20000 });
    } catch {
      const txt = (await page.locator('body').innerText()).slice(0, 900).replace(/\n+/g, ' | ');
      throw new Error(`registration success screen not shown. Page: ${txt}`);
    }
    note('1a.registered', `UI accepted registration for ${EMAIL} (${COMPANY})`);

    // ---------- item 1b: complete verification from the DB ----------
    const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
    if (!user) throw new Error('registered user not found in database');
    ids.userId = user.id;
    if (user.status !== 'PENDING_VERIFICATION') {
      throw new Error(`expected PENDING_VERIFICATION user, found ${user.status}`);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
    note('1b.verified', 'email verification completed (user status PENDING_VERIFICATION -> ACTIVE via DB)');

    // Company config step (normally done by an admin in Company Settings, which
    // currently has no UI for this toggle): allow job publishing without an
    // approval cycle so the browser flow can publish the created job.
    const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
    if (!membership) throw new Error('membership not found for registered user');
    ids.membershipIds.push(membership.id);
    ids.companyId = membership.companyId;
    await prisma.companySettings.upsert({
      where: { companyId: membership.companyId },
      update: { requireJobApproval: false },
      create: { companyId: membership.companyId, requireJobApproval: false },
    });
    note('1b.settings', 'company settings configured: requireJobApproval=false (approval gate is backend-intentional; no UI exists)');

    // ---------- item 1c: login ----------
    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await fillFormWithRetry(page, [
      ['input[type="email"]', EMAIL],
      ['input[type="password"]', PASSWORD],
    ]);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    note('1c.login', 'logged in, landed on /dashboard');

    // ---------- item 1d: create a job from the browser ----------
    await page.goto(`${FE_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await clickAndWaitDialog(page, page.getByRole('button', { name: 'Create Job', exact: true }), { timeout: 15000 });
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[required]').fill(JOB_TITLE);
    await dialog.locator('textarea[required]').fill(
      'Build and verify the AI recruiter pipeline: resume parsing, screening, and shortlisting for engineering roles.',
    );
    const combos = dialog.locator('[role="combobox"]');
    await combos.nth(0).click();
    await page.getByRole('option', { name: 'Full-time' }).click();
    await combos.nth(1).click();
    await page.getByRole('option', { name: 'On-site' }).click();
    await combos.nth(2).click();
    await page.getByRole('option', { name: 'Mid' }).click();
    await dialog.locator('button[type="submit"]').click();
    await page.getByText(JOB_TITLE).waitFor({ timeout: 20000 });
    note('1d.job', `job "${JOB_TITLE}" created from the browser UI`);

    // publish the job from the browser UI so it becomes an active position
    const jobCard = page
      .getByText(JOB_TITLE, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await jobCard.locator('button').click();
    await page.getByRole('menuitem', { name: 'Publish' }).click();
    await page.getByText('Active', { exact: true }).waitFor({ timeout: 15000 });
    note('1d.published', 'job published from the browser UI (status -> Active)');

    const job = await prisma.job.findFirst({ where: { title: JOB_TITLE } });
    if (!job) throw new Error('created job not found in database');
    ids.jobIds.push(job.id);
    ids.companyId = job.companyId;

    // ---------- item 1e: add a candidate with a real resume ----------
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await page.fill('input[placeholder="e.g. John Smith"]', CANDIDATE_NAME);
    await page.fill('input[placeholder="john@example.com"]', `proof${RUN_ID}@example.com`);
    await page.fill('input[placeholder="+1 555-0100"]', `+1 555 ${String(RUN_ID).slice(-4)}`);
    await page.fill('input[placeholder="5"]', '4');
    const candDialog = page.getByRole('dialog');
    await candDialog.locator('[role="combobox"]').click();
    await page.getByRole('option', { name: JOB_TITLE }).click();
    await page.setInputFiles('input[aria-label="Upload resume file"]', RESUME_PDF);
    await candDialog.getByRole('button', { name: 'Upload Resume', exact: true }).click();
    await candDialog.getByRole('button', { name: 'Add Candidate', exact: true }).click();
    try {
      await page.getByRole('button', { name: 'Start AI Screening', exact: true }).waitFor({ timeout: 90000 });
    } catch {
      const txt = (await page.locator('body').innerText()).slice(0, 1500).replace(/\n+/g, ' | ');
      throw new Error(`candidate dialog did not finish within 90s. Page: ${txt}`);
    }
    note('1e.candidate', `candidate "${CANDIDATE_NAME}" added, dialog shows "Start AI Screening"`);
    await page.getByRole('button', { name: 'Start AI Screening', exact: true }).click();
    try {
      await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 120000 });
    } catch {
      const txt = (await page.locator('body').innerText()).slice(0, 1500).replace(/\n+/g, ' | ');
      throw new Error(`screening did not finish within 120s. Page: ${txt}`);
    }
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await candDialog.waitFor({ state: 'hidden', timeout: 15000 });
    note('1e.screened', 'AI screening completed in the dialog (auto-extraction + screening flow)');

    const candidate = await prisma.candidate.findFirst({ where: { email: `proof${RUN_ID}@example.com` } });
    if (!candidate) throw new Error('created candidate not found in database');
    ids.candidateIds.push(candidate.id);
    const application = await prisma.application.findFirst({ where: { candidateId: candidate.id } });
    if (!application) throw new Error('application not created for candidate');
    ids.applicationIds.push(application.id);
    const storedFile = await prisma.storedFile.findFirst({ where: { applicationId: application.id } });
    if (storedFile) ids.storedFileIds.push(storedFile.id);
    const extraction = await prisma.resumeTextExtraction.findFirst({
      where: { storedFileId: storedFile?.id ?? 'none' },
    });
    if (extraction) ids.extractionIds.push(extraction.id);
    note('1e.records', `application ${application.id} + candidate ${candidate.id} confirmed in DB`);

    // ---------- item 1f: run AI screening from the browser ----------
    await page.goto(`${FE_URL}/ai-screener`, { waitUntil: 'domcontentloaded' });
    await page
      .locator('button')
      .filter({ hasText: CANDIDATE_NAME })
      .first()
      .click({ timeout: 15000 });
    note('1f.screening', 'selected application in AI Screener (auto-screening starts)');

    const extractionCompleted = await poll(60_000, async () => {
      const e = await prisma.resumeTextExtraction.findFirst({
        where: { storedFileId: storedFile?.id ?? 'none' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, extractedText: true },
      });
      return e && e.status === 'COMPLETED' ? e : null;
    });
    if (!extractionCompleted) throw new Error('resume extraction did not reach COMPLETED within 60s');
    ids.extractionIds.push(extractionCompleted.id);
    note('1f.extraction', `resume extraction COMPLETED (id ${extractionCompleted.id})`);

    const screeningDone = await poll(60_000, async () => {
      const s = await prisma.aiScreeningResult.findFirst({
        where: { applicationId: application.id },
        orderBy: { createdAt: 'desc' },
      });
      return s && s.status === 'COMPLETED' ? s : null;
    });
    if (!screeningDone) throw new Error('AI screening did not reach COMPLETED within 60s');
    note('1f.screeningDone', `AI screening COMPLETED (id ${screeningDone.id})`);

    // ---------- item 1g: screening result rendered in the browser ----------
    await page.getByText('Overall Score').waitFor({ timeout: 30000 });
    const pageText = await page.locator('body').innerText();
    if (!/Overall Score/.test(pageText)) throw new Error('Overall Score not rendered in browser');
    note('1g.ui', 'screening result (Overall Score + recommendation) rendered in the browser');

    // ---------- item 2: extraction dedup via HTTP replay ----------
    const token = await page.evaluate(() => localStorage.getItem('ai-recruiter-access-token'));
    if (!token) throw new Error('no access token in localStorage for HTTP replay');
    const replay = async () => {
      const res = await fetch(`${BE_URL}/api/v1/applications/${application.id}/ai-screenings/retry-extraction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const first = await replay();
    const second = await replay();
    const firstId = first.body?.data?.extraction?.id;
    const secondId = second.body?.data?.extraction?.id;
    if (first.status < 200 || first.status >= 300 || second.status < 200 || second.status >= 300) {
      throw new Error(`dedup replay failed: HTTP ${first.status} then ${second.status}`);
    }
    if (!firstId || !secondId || firstId !== secondId) {
      throw new Error(`dedup failed: replay returned different extraction ids (${first.body?.data?.extraction?.id} vs ${second.body?.data?.extraction?.id})`);
    }
    const extractionRows = await prisma.resumeTextExtraction.count({
      where: { storedFileId: storedFile?.id ?? 'none', sourceFileSha256: storedFile?.checksumSha256 },
    });
    if (extractionRows !== 1) {
      throw new Error(`dedup failed: expected exactly 1 extraction row, found ${extractionRows}`);
    }
    note('2.dedup', `HTTP replay of retry-extraction returns the SAME extraction id ${firstId}; exactly ${extractionRows} extraction row(s) in DB`);

    // ---------- item 6: real resume parsed end-to-end ----------
    const text = extractionCompleted.extractedText ?? '';
    if (!text || !/Senior Fullstack Engineer/.test(text)) {
      throw new Error(`extracted text missing expected resume content; got: ${JSON.stringify(text).slice(0, 200)}`);
    }
    note('6.resume', `real PDF resume parsed end-to-end; extracted text contains resume content`);

    if (browserErrors.length > 0) {
      throw new Error(`browser stability proof failed: ${JSON.stringify(browserErrors.slice(0, 10))}`);
    }
    note('6.browser-stability', 'zero console errors, page errors, failed requests, or unexpected HTTP error responses');

    note('done', 'all browser + HTTP proofs PASSED');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (!KEEP) {
      const res = await cleanupExact(prisma, ids);
      if (!res.ok) process.exitCode = 2;
    } else {
      console.log('[browser-proof] --keep set: leaving verification data in the local database.');
    }
    await prisma.$disconnect().catch(() => {});
  }

  writeReport();
}

// Fills SSR-rendered controlled inputs reliably: React hydration can reset
// values filled before hydration, so verify each input's value and refill
// until it sticks (or the retries are exhausted).
async function fillFormWithRetry(page, fields) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      for (const [selector, value] of fields) {
        await page.fill(selector, value);
      }
      await page.waitForTimeout(250);
      for (const [selector, value] of fields) {
        const current = await page.inputValue(selector);
        if (current !== value) {
          throw new Error(`${selector} value reset (expected "${value}", got "${current}")`);
        }
      }
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`fillFormWithRetry failed after 4 attempts: ${lastError.message}`);
}

async function clickAndWaitDialog(page, trigger, { timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    await trigger.click();
    try {
      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 4000 });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`dialog did not open after clicking ${await trigger.textContent()}`);
    }
  }
}

async function ping(url) {
  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

async function poll(timeoutMs, fn) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function writeReport() {
  const lines = [
    `# Browser Proof Report — ${new Date().toISOString()}`,
    '',
    `Run id: ${RUN_ID}`,
    `Targets: ${FE_URL} (frontend), ${BE_URL} (backend)`,
    '',
    '## Results',
    '',
    ...results.map((r) => `- **${r.label}**: ${r.detail}`),
    ...(browserErrors.length
      ? ['', '## Browser errors', '', ...browserErrors.map((e) => `- **${e.kind}**: ${e.detail}`)]
      : []),
    '',
    `Total checks: ${results.length}`,
  ];
  const dir = join(ROOT, 'verification', 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `browser-proof-${RUN_ID}.md`);
  writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`\nreport written to ${file}`);
}

main().catch((err) => {
  console.error(`\n[browser-proof] FAILED: ${err.message}`);
  console.error(err.stack);
  writeReport();
  process.exit(1);
});
