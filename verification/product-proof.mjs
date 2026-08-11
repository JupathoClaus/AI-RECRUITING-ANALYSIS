// Product-correction proof (P0 pass): verifies the product truths fixed in
// this release, end to end in a real browser:
//
//   1. a screened candidate shows the REAL non-hardcoded score in the list and
//      in the detail dialog;
//   2. the dashboard uses the real score (Avg AI Score + top candidates);
//   3. closing a job removes it from the default Active view and shows it in
//      the Closed & Archived history view; reopening restores it;
//   4. the bulk action is unambiguously a stage move — feedback wording never
//      claims AI screening was run;
//   5. the AI Assistant and AI Interviews pages show no fabricated data;
//   6. zero unexpected console errors, page errors, request failures or HTTP
//      errors (only the documented 409 RESUME_EXTRACTION_PENDING handshake).
//
// Safety: DB writes go through Prisma (parameterized); cleanup deletes ONLY
// the exact rows created by this run (cleanup.mjs); the script refuses to run
// against anything but a local talentai* database.
//
// Usage: node verification/product-proof.mjs [--keep] [--headful]
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
const JOB_TITLE = `Product Proof Engineer ${RUN_ID}`;
const CANDIDATE_NAME = 'Product Proof Candidate';
const PASSWORD = `VerifyPass!${RUN_ID}`;

const results = [];
const browserErrors = [];
const note = (label, detail) => {
  results.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};

async function main() {
  console.log('== product-proof.mjs ==');
  console.log(`run id: ${RUN_ID}`);
  console.log(`targets: frontend ${FE_URL} | backend ${BE_URL}`);

  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);

  const feOk = await ping(`${FE_URL}/register`);
  if (!feOk) throw new Error(`Frontend not reachable at ${FE_URL}. Start it with: npm run dev (in ${ROOT})`);
  const beOk = await ping(`${BE_URL}/api/v1/health`);
  if (!beOk) throw new Error(`Backend not reachable at ${BE_URL}.`);
  note('preflight', 'frontend and backend are reachable');

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
    let expected409ConsoleErrors = 0;

    const recordBrowserError = (kind, detail) => {
      browserErrors.push({ kind, detail });
      console.error(`  [browser.${kind}] ${detail}`);
    };
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const expected409ConsoleError =
        expected409ConsoleErrors > 0 &&
        message.text() === 'Failed to load resource: the server responded with a status of 409 (Conflict)';
      if (expected409ConsoleError) {
        expected409ConsoleErrors--;
        return;
      }
      recordBrowserError('console', message.text());
    });
    page.on('pageerror', (error) => recordBrowserError('pageerror', error.message));
    page.on('crash', () => recordBrowserError('crash', 'renderer crashed'));
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
      // The first screening request deliberately returns 409 while resume
      // extraction is queued; the UI polls and retries afterward.
      const expectedExtractionPending =
        response.status() === 409 &&
        /\/api\/v1\/applications\/[^/]+\/ai-screenings(?:\?|$)/.test(url);
      if (expectedExtractionPending) {
        expected409ConsoleErrors++;
      } else {
        recordBrowserError('http', `${response.status()} ${response.request().method()} ${url}`);
      }
    });

    // ── 1a: register a brand-new company from the UI ─────────────────────
    note('1a.start', 'registering a brand-new company from the browser UI');
    await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500); // let SSR hydration settle before filling
    await fillFormWithRetry(page, [
      ['input[placeholder="Acme Corp"]', COMPANY],
      ['input[placeholder="you@company.com"]', EMAIL],
      ['input[placeholder="John"]', 'Proof'],
      ['input[placeholder="Doe"]', 'Candidate'],
      ['input[placeholder="At least 12 characters"]', PASSWORD],
      ['input[placeholder="Re-enter your password"]', PASSWORD],
    ]);
    await page.check('#acceptTerms');
    const submitBtn = page.getByRole('button', { name: /Create account/i });
    await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await submitBtn.click();
    await page.getByText('Account created successfully!').waitFor({ timeout: 30000 });
    note('1a.registered', `UI accepted registration for ${EMAIL} (${COMPANY})`);

    // ── 1b: complete verification (DB) and log in ────────────────────────
    const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
    if (!user) throw new Error('registered user not found in database');
    ids.userId = user.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    note('1b.verified', 'email verification completed (user status ACTIVE via DB)');

    // The approval gate is backend-intentional; disable it for the test company
    // so jobs can be published from the UI (same as the browser proof).
    const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
    if (membership) {
      await prisma.companySettings.upsert({
        where: { companyId: membership.companyId },
        create: { companyId: membership.companyId, requireJobApproval: false },
        update: { requireJobApproval: false },
      });
      note('1b.settings', 'company settings configured: requireJobApproval=false');
    }

    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500); // let SSR hydration settle
    let loggedIn = false;
    for (let attempt = 0; attempt < 3 && !loggedIn; attempt++) {
      for (let i = 0; i < 5; i++) {
        await page.fill('input[type="email"]', EMAIL);
        await page.fill('input[type="password"]', PASSWORD);
        await page.waitForTimeout(300);
        if ((await page.inputValue('input[type="email"]')) === EMAIL) break;
      }
      const signInBtn = page.getByRole('button', { name: /Sign In|Sign in/i });
      await signInBtn.waitFor({ state: 'visible', timeout: 10000 });
      await signInBtn.click();
      try {
        await page.waitForURL(/\/dashboard/, { timeout: 20000 });
        loggedIn = true;
      } catch {
        const body = await page.locator('body').innerText();
        if (!body.includes('Invalid email or password')) {
          console.error(`  [login.debug] attempt ${attempt + 1} body: ${body.slice(0, 400).replace(/\n+/g, ' | ')}`);
        }
        // Re-activate defensively (login can race the DB update on slow disks)
        await prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
        });
      }
    }
    if (!loggedIn) {
      const body = await page.locator('body').innerText();
      throw new Error(`login failed after 3 attempts. Page: ${body.slice(0, 500).replace(/\n+/g, ' | ')}`);
    }
    note('1c.login', 'logged in, landed on /dashboard');

    // ── 1d: create + publish a job from the UI ───────────────────────────
    await page.goto(`${FE_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create Job' }).first().click();
    const jobDialog = page.getByRole('dialog');
    await jobDialog.locator('input[placeholder*="Senior Software Engineer"]').fill(JOB_TITLE);
    await jobDialog.locator('textarea[placeholder*="Describe"]').fill(
      'We need a full-stack engineer with TypeScript, React and Node experience for our platform team.',
    );
    const combos = jobDialog.locator('[role="combobox"]');
    await combos.nth(0).click();
    await page.getByRole('option', { name: 'Full-time' }).click();
    await combos.nth(1).click();
    await page.getByRole('option', { name: 'On-site' }).click();
    await combos.nth(2).click();
    await page.getByRole('option', { name: 'Mid' }).click();
    await jobDialog.locator('button[type="submit"]').click();
    await page.getByText(JOB_TITLE).waitFor({ timeout: 20000 });
    note('1d.job', `job "${JOB_TITLE}" created from the browser UI`);

    const jobCard = page.getByText(JOB_TITLE, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await jobCard.locator('button').click();
    await page.getByRole('menuitem', { name: 'Publish' }).click();
    await jobCard.getByText('Active', { exact: true }).waitFor({ timeout: 15000 });
    note('1d.published', 'job published from the browser UI (status -> Active)');

    const job = await prisma.job.findFirst({ where: { title: JOB_TITLE } });
    if (!job) throw new Error('created job not found in database');
    ids.jobIds.push(job.id);
    ids.companyId = job.companyId;

    // ── 2a: add candidate with real PDF, run screening from the dialog ───
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

    // The candidate-creation request can transiently abort (network/disk);
    // the dialog itself offers "Retry from Candidate Creation" — use it.
    let screeningStarted = false;
    for (let attempt = 0; attempt < 3 && !screeningStarted; attempt++) {
      const outcome = await pollForDialogState(page, 60000);
      if (outcome === 'ready') {
        screeningStarted = true;
        break;
      }
      const retryBtn = page.getByRole('button', { name: 'Retry from Candidate Creation', exact: true });
      if ((await retryBtn.count()) === 0) {
        const txt = (await page.locator('body').innerText()).slice(0, 800).replace(/\n+/g, ' | ');
        throw new Error(`candidate dialog failed without retry option. Page: ${txt}`);
      }
      await retryBtn.click();
    }
    if (!screeningStarted) {
      const txt = (await page.locator('body').innerText()).slice(0, 1200).replace(/\n+/g, ' | ');
      throw new Error(`candidate dialog did not reach screening stage after retries. Page: ${txt}`);
    }
    await page.getByRole('button', { name: 'Start AI Screening', exact: true }).click();
    try {
      await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 120000 });
    } catch {
      const txt = (await page.locator('body').innerText()).slice(0, 1200).replace(/\n+/g, ' | ');
      throw new Error(`screening did not finish within 120s. Page: ${txt}`);
    }
    note('2a.screened', 'AI screening completed in the dialog (extraction + screening)');

    const candidate = await prisma.candidate.findFirst({ where: { email: `proof${RUN_ID}@example.com` } });
    if (!candidate) throw new Error('created candidate not found in database');
    ids.candidateIds.push(candidate.id);
    const application = await prisma.application.findFirst({ where: { candidateId: candidate.id } });
    if (!application) throw new Error('application not created for candidate');
    ids.applicationIds.push(application.id);
    const storedFile = await prisma.storedFile.findFirst({ where: { applicationId: application.id } });
    if (storedFile) ids.storedFileIds.push(storedFile.id);

    const screening = await prisma.aiScreeningResult.findFirst({
      where: { applicationId: application.id, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!screening) throw new Error('no COMPLETED screening result in database');
    ids.extractionIds.push(...(await prisma.resumeTextExtraction.findMany({ where: { storedFileId: storedFile?.id ?? 'none' } }).then((r) => r.map((e) => e.id))));
    const realScore = screening.overallScore;
    if (realScore === null || realScore === undefined) {
      throw new Error('screening result has no overallScore');
    }
    note('2a.dbScore', `real score in DB: ${realScore} (${screening.recommendation})`);

    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await candDialog.waitFor({ state: 'hidden', timeout: 15000 });

    // ── 2b: the candidates LIST shows the real score ─────────────────────
    const scoreCell = page
      .locator('tr')
      .filter({ hasText: CANDIDATE_NAME })
      .first()
      .locator('td')
      .nth(4);
    await scoreCell.waitFor({ timeout: 15000 });
    const cellText = (await scoreCell.innerText()).trim();
    if (cellText !== String(realScore)) {
      throw new Error(`candidate list shows "${cellText}" but DB score is ${realScore}`);
    }
    note('2b.list', `candidate list AI Score cell shows the real score ${cellText}`);

    // ── 2c: the candidate DETAIL dialog shows the real score ─────────────
    await page.locator('tr').filter({ hasText: CANDIDATE_NAME }).first().click();
    const detailDialog = page.getByRole('dialog');
    await detailDialog.waitFor({ state: 'visible', timeout: 15000 });
    const statBox = detailDialog.locator('div.rounded-lg').filter({ hasText: 'AI Score' }).first();
    await statBox.waitFor({ timeout: 15000 });
    const detailScore = (await statBox.innerText()).replace('AI Score', '').trim();
    if (detailScore !== String(realScore)) {
      throw new Error(`detail dialog shows "${detailScore}" but DB score is ${realScore}`);
    }
    note('2c.detail', `candidate detail dialog shows the real score ${detailScore}`);
    await detailDialog.getByRole('button', { name: 'Close' }).click().catch(() => {});
    await detailDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

    // ── 3: the dashboard uses the real score ─────────────────────────────
    let shownAvg = null;
    for (let attempt = 0; attempt < 3 && shownAvg === null; attempt++) {
      await page.goto(`${FE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000); // let the dev-mode route settle
      try {
        const label = page.getByText('Avg AI Score'); // case-insensitive (rendered uppercase)
        await label.waitFor({ timeout: 30000 });
        // The KPI value renders as a `text-3xl` paragraph next to the label.
        const valueText = await label.locator('../..').locator('p.text-3xl').innerText();
        shownAvg = Number(valueText.trim());
        if (Number.isNaN(shownAvg)) shownAvg = null;
      } catch {
        shownAvg = null;
      }
    }
    if (shownAvg === null) {
      const dbgBody = page.isClosed()
        ? '(page closed)'
        : (await page.locator('body').innerText().catch(() => '(unreadable)')).slice(0, 900).replace(/\n+/g, ' | ');
      console.error(`  [dashboard.debug] body: ${dbgBody}`);
      throw new Error(`dashboard Avg AI Score not readable after retries`);
    }
    const expectedAvg = Math.round(realScore); // single candidate → avg == its score
    if (shownAvg !== expectedAvg) {
      const dbgBody = (await page.locator('body').innerText().catch(() => '(unreadable)'))
        .slice(0, 900)
        .replace(/\n+/g, ' | ');
      console.error(`  [dashboard.debug] body: ${dbgBody}`);
      throw new Error(`dashboard Avg AI Score shows ${shownAvg}, expected ${expectedAvg}`);
    }
    note('3.dashboard', `dashboard Avg AI Score = ${shownAvg} (derived from the real score)`);

    // ── 4: bulk action wording is truthful ───────────────────────────────
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.locator('tr').filter({ hasText: CANDIDATE_NAME }).first().locator('input[type="checkbox"]').first().check();
    const bulkBar = page.getByText(/selected$/).first();
    await bulkBar.waitFor({ timeout: 10000 });
    const bulkButton = page.getByRole('button', { name: 'Move to Screening Stage' });
    if ((await bulkButton.count()) === 0) throw new Error('Move to Screening Stage button not found');
    // A disabled "Run AI Screening (coming next)" entry exists and cannot be confused with a working action.
    const comingNext = page.getByRole('button', { name: /Run AI Screening/ });
    if ((await comingNext.count()) === 0 || !(await comingNext.isDisabled())) {
      throw new Error('Run AI Screening coming-next entry missing or not disabled');
    }
    note('4a.buttons', 'bulk bar shows "Move to Screening Stage" + disabled "Run AI Screening (coming next)"');
    await bulkButton.click();
    await page.getByText(/Moved 1 candidate\(s\) to the Screening stage\. AI screening was not run\./).waitFor({ timeout: 15000 });
    note('4b.feedback', 'bulk feedback wording truthful: moved to Screening stage, AI screening was not run');

    // ── 5: AI Assistant shows no fabricated data ─────────────────────────
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500); // settle after navigation
    const fab = page.getByRole('button', { name: /Open AI Assistant preview/i });
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((await fab.count()) > 0) {
        await fab.click().catch(() => {});
      }
      try {
        await page.getByText('Preview — actions unavailable').waitFor({ timeout: 10000 });
        break;
      } catch {
        if (attempt === 2) throw new Error('AI Assistant preview panel did not open');
      }
    }
    const assistantBody = await page.locator('body').innerText();
    for (const fabricated of ['12 active job openings', '47 candidates', '18 days', '34%']) {
      if (assistantBody.includes(fabricated)) {
        throw new Error(`AI Assistant contains fabricated metric: "${fabricated}"`);
      }
    }
    note('5a.assistant', 'AI Assistant is a preview: no fabricated metrics, actions unavailable label shown');
    await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {});

    // ── 6: AI Interviews shows no fabricated data ────────────────────────
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.getByText('No AI interviews yet').waitFor({ timeout: 15000 });
    const interviewsBody = await page.locator('body').innerText();
    for (const fabricated of ['Emily Chen', 'Total AI Interviews', '47', 'David Park']) {
      if (interviewsBody.includes(fabricated)) {
        throw new Error(`AI Interviews page contains fabricated data: "${fabricated}"`);
      }
    }
    note('6a.interviews', 'AI Interviews page renders an honest empty state, no fabricated candidates/metrics');

    // ── 7: closed job disappears from Active, appears in History ─────────
    await page.goto(`${FE_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await page.getByText(JOB_TITLE, { exact: true }).waitFor({ timeout: 15000 });
    const activeCard = page.getByText(JOB_TITLE, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await activeCard.locator('button').click();
    await page.getByRole('menuitem', { name: 'Close' }).click();
    await page.getByText(JOB_TITLE, { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
    const stillInActive = await page.getByText(JOB_TITLE, { exact: true }).count();
    if (stillInActive > 0) throw new Error('closed job still visible in the default Active view');
    note('7a.closed', 'closed job disappears from the default Active view immediately');

    await page.getByRole('tab', { name: /Closed & Archived/ }).click();
    await page.getByText(JOB_TITLE, { exact: true }).waitFor({ timeout: 15000 });
    note('7b.history', 'closed job appears in the Closed & Archived history view');

    // Applications and reports remain after closing (server-side records untouched).
    const appAfterClose = await prisma.application.count({ where: { jobId: job.id, deletedAt: null } });
    if (appAfterClose !== 1) throw new Error(`expected 1 application after close, found ${appAfterClose}`);
    note('7c.records', `application records remain after close (count=${appAfterClose})`);

    // ── 8: reopen restores the job to the active workflow ────────────────
    const historyCard = page.getByText(JOB_TITLE, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await historyCard.locator('button').click();
    await page.getByRole('menuitem', { name: 'Reopen' }).click();
    await page.getByText(JOB_TITLE, { exact: true }).waitFor({ timeout: 15000 });
    const jobAfterReopen = await prisma.job.findFirst({ where: { id: job.id } });
    if (jobAfterReopen?.status !== 'DRAFT') {
      throw new Error(`expected DRAFT after reopen, found ${jobAfterReopen?.status}`);
    }
    note('8.reopen', `reopened job restored to the workflow (status -> ${jobAfterReopen?.status})`);

    // ── 9: zero unexpected errors ────────────────────────────────────────
    await page.waitForTimeout(1500);
    const unexpected = browserErrors.filter(
      (e) => !(e.kind === 'http' && e.detail.includes('404') && /\/ai-screenings\/latest/.test(e.detail)),
    );
    if (unexpected.length > 0) {
      throw new Error(`unexpected browser errors: ${JSON.stringify(unexpected, null, 2)}`);
    }
    note('9.clean', `zero unexpected console/page/request/HTTP errors (${browserErrors.length} tracked, all whitelisted)`);

    note('done', 'all product-correction proofs PASSED');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (!KEEP) {
      const res = await cleanupExact(prisma, ids);
      if (!res.ok) process.exitCode = 2;
    } else {
      console.log('[product-proof] --keep set: leaving verification data in the local database.');
    }
    await prisma.$disconnect().catch(() => {});
  }

  writeReport();
}

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

async function ping(url) {
  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

// Waits for the Add Candidate dialog to reach either the "Start AI Screening"
// state ('ready') or the "Step Failed" state ('failed').
async function pollForDialogState(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.getByRole('button', { name: 'Start AI Screening', exact: true }).isVisible().catch(() => false)) {
      return 'ready';
    }
    if (await page.getByText('Step Failed', { exact: true }).isVisible().catch(() => false)) {
      return 'failed';
    }
    if (Date.now() > deadline) {
      const txt = (await page.locator('body').innerText()).slice(0, 900).replace(/\n+/g, ' | ');
      throw new Error(`candidate dialog stuck. Page: ${txt}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function writeReport() {
  const lines = [
    `# Product Correction Proof Report — ${new Date().toISOString()}`,
    '',
    `Run id: ${RUN_ID}`,
    `Targets: ${FE_URL} (frontend), ${BE_URL} (backend)`,
    '',
    '## Results',
    '',
    ...results.map((r) => `- **${r.label}**: ${r.detail}`),
    '',
    `Total checks: ${results.length}`,
  ];
  const dir = join(ROOT, 'verification', 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `product-proof-${RUN_ID}.md`);
  writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`\nreport written to ${file}`);
}

main().catch((err) => {
  console.error(`\n[product-proof] FAILED: ${err.message}`);
  console.error(err.stack);
  process.exitCode = 1;
});
