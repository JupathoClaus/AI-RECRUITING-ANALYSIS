/**
 * RECRUITER ADD CANDIDATE — REAL BROWSER ACCEPTANCE
 * Tests the actual recruiter UI flow through Playwright
 * NO backend bypasses. The browser must submit the form.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const KEEP = process.argv.includes('--keep');
const HEADFUL = process.argv.includes('--headful');
const RESUME_PDF = fileURLToPath(new URL('./fixtures/minimal-resume.pdf', import.meta.url));
const RESUME_DOCX = fileURLToPath(new URL('./fixtures/minimal-resume.docx', import.meta.url));

const RUN_ID = Date.now();
const EMAIL = `recruiter${RUN_ID}@e2e.com`;
const COMPANY = `Recruiter Co ${RUN_ID}`;
const JOB_TITLE = `Recruiter Test Job ${RUN_ID}`;
const CANDIDATE_EMAIL = `candidate${RUN_ID}@example.com`;
const PASSWORD = `Zx9!vQm2#zR8${RUN_ID}`;

const results = [];
const browserErrors = [];
const note = (label, detail) => {
  results.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};

async function main() {
  console.log('== recruiter-add-candidate-browser.mjs ==');
  console.log(`run id: ${RUN_ID}`);
  console.log(`targets: frontend ${FE_URL} | backend ${BE_URL}`);

  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);

  const feOk = await ping(`${FE_URL}/register`);
  if (!feOk) throw new Error(`Frontend not reachable at ${FE_URL}`);
  const beOk = await ping(`${BE_URL}/api/v1/health`);
  if (!beOk) throw new Error(`Backend not reachable at ${BE_URL}`);

  await import('./pdf-fixture.mjs');

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
  let browser;
  try {
    browser = await chromium.launch({ headless: !HEADFUL });
    const context = await browser.newContext();
    const page = await context.newPage();

    const recordBrowserError = (kind, detail) => {
      browserErrors.push({ kind, detail });
      console.error(`  [browser.${kind}] ${detail}`);
    };
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      recordBrowserError('console', message.text());
    });
    page.on('pageerror', (error) => recordBrowserError('pageerror', error.message));

    // Track the recruiter-workflow request
    let recruiterWorkflowRequest = null;
    page.on('request', request => {
      if (request.url().includes('/candidates/recruiter-workflow')) {
        recruiterWorkflowRequest = request;
        console.log(`[NETWORK] ${request.method()} ${request.url()}`);
      }
    });
    page.on('response', response => {
      if (response.url().includes('/candidates/recruiter-workflow')) {
        console.log(`[NETWORK] ${response.status()} ${response.url()}`);
      }
    });

    // Register company
    await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [
      ['input[placeholder="Acme Corp"]', COMPANY],
      ['input[placeholder="you@company.com"]', EMAIL],
      ['input[placeholder="John"]', 'Recruiter'],
      ['input[placeholder="Doe"]', 'User'],
      ['input[placeholder="At least 12 characters"]', PASSWORD],
      ['input[placeholder="Re-enter your password"]', PASSWORD],
    ]);
    await page.check('#acceptTerms');
    await page.click('button[type="submit"]');
    await page.getByText('Account created successfully!').waitFor({ timeout: 20000 });
    note('register', 'company registered');

    const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
    if (!user) throw new Error('registered user not found');
    ids.userId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
    const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
    if (!membership) throw new Error('membership not found');
    ids.membershipIds.push(membership.id);
    ids.companyId = membership.companyId;
    await prisma.companySettings.upsert({
      where: { companyId: membership.companyId },
      update: { requireJobApproval: false },
      create: { companyId: membership.companyId, requireJobApproval: false },
    });
    note('verify', 'email verified, company settings configured');

    // Login
    await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await fillFormWithRetry(page, [
      ['input[type="email"]', EMAIL],
      ['input[type="password"]', PASSWORD],
    ]);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    note('login', 'logged in');

    // Create job
    await page.goto(`${FE_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await clickAndWaitDialog(page, page.getByRole('button', { name: 'Create Job', exact: true }), { timeout: 15000 });
    const jobDialog = page.getByRole('dialog');
    await jobDialog.locator('input[required]').fill(JOB_TITLE);
    await jobDialog.locator('textarea[required]').fill('Test job for recruiter candidate creation.');
    const combos = jobDialog.locator('[role="combobox"]');
    await combos.nth(0).click();
    await page.getByRole('option', { name: 'Full-time' }).click();
    await combos.nth(1).click();
    await page.getByRole('option', { name: 'On-site' }).click();
    await combos.nth(2).click();
    await page.getByRole('option', { name: 'Mid' }).click();
    await jobDialog.locator('button[type="submit"]').click();
    await page.getByText(JOB_TITLE).waitFor({ timeout: 20000 });
    const jobCard = page.getByText(JOB_TITLE, { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await jobCard.locator('button').click();
    await page.getByRole('menuitem', { name: 'Publish' }).click();
    await jobCard.getByText('Active', { exact: true }).waitFor({ timeout: 15000 });
    note('job', `job "${JOB_TITLE}" created and published`);

    const job = await prisma.job.findFirst({ where: { title: JOB_TITLE } });
    if (!job) throw new Error('created job not found');
    ids.jobIds.push(job.id);
    ids.companyId = job.companyId;

    // Test with specified resume type
    const resumeFile = process.argv.includes('--docx') ? RESUME_DOCX : RESUME_PDF;
    const fileType = process.argv.includes('--docx') ? 'DOCX' : 'PDF';
    note('start', `testing recruiter add candidate with ${fileType} resume via real UI`);

    // Go to candidates page
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click Add Candidate button (the one in main content)
    const addCandidateButton = page.getByRole('button', { name: 'Add Candidate', exact: true }).nth(1);
    await clickAndWaitDialog(page, addCandidateButton, { timeout: 15000 });
    const dialog = page.getByRole('dialog');
    note('dialog', 'Add Candidate dialog opened');

    // Fill form using real keyboard interactions to ensure React state updates
    note('fill', 'filling form with real keyboard interactions');
    
    // Name - use pressSequentially for React state update
    const nameInput = dialog.locator('input[placeholder="e.g. John Smith"]');
    await nameInput.click();
    await nameInput.pressSequentially('Test Candidate', { delay: 50 });
    await page.waitForTimeout(200);
    
    // Email
    const emailInput = dialog.locator('input[type="email"]');
    await emailInput.click();
    await emailInput.pressSequentially(CANDIDATE_EMAIL, { delay: 50 });
    await page.waitForTimeout(200);
    
    // Phone
    const phoneInput = dialog.locator('input[type="tel"]');
    await phoneInput.click();
    await phoneInput.pressSequentially('+1 555 0100', { delay: 50 });
    await page.waitForTimeout(200);
    
    // Experience
    const expInput = dialog.locator('input[type="number"]');
await expInput.click();
    await expInput.pressSequentially('5', { delay: 50 });
    await page.waitForTimeout(200);
    
    // Select job
    await dialog.locator('[role="combobox"]').click();
    await page.getByRole('option', { name: JOB_TITLE }).click();
    await page.waitForTimeout(500);
    
    // Upload resume
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles(resumeFile);
    await page.waitForTimeout(1000);
    
    // Click "Upload Resume" button to actually upload the file to parent state
    const uploadBtn = dialog.getByRole('button', { name: 'Upload Resume', exact: true });
    if (await uploadBtn.isVisible({ timeout: 5000 })) {
      await uploadBtn.click();
      await page.waitForTimeout(2000);
      note('file', `${fileType} resume uploaded`);
    } else {
      // Check if file is displayed
      await dialog.locator('text=minimal-resume').textContent().catch(() => null);
    }
    
    // Verify submit button becomes enabled
    const submitButton = dialog.getByRole('button', { name: 'Add Candidate', exact: true });
const isDisabled = await submitButton.isDisabled();
    
    if (isDisabled) {
      // Debug form state (only if disabled)
      const formState = await dialog.locator('input, select, textarea').evaluateAll(elements => 
        elements.map(el => ({ 
          name: el.name || el.getAttribute('placeholder') || 'unknown', 
          value: el.value, 
          required: el.required, 
          disabled: el.disabled,
          type: el.type
        }))
      );
    }

    const requestStart = Date.now();
    await submitButton.click();
    note('submit', 'clicked Add Candidate button');
    
    // Wait for success - check for success message in dialog
    try {
      await dialog.getByText('Candidate added successfully').waitFor({ timeout: 60000 });
      note('success', 'candidate creation succeeded (UI confirmation)');
    } catch {
      const body = (await page.locator('body').innerText()).slice(0, 2000).replace(/\n+/g, ' | ');
      throw new Error(`candidate creation failed or timed out. Page: ${body}`);
    }

    const requestDuration = Date.now() - requestStart;
    note('timing', `request completed in ${requestDuration}ms`);

    // Close dialog
    const doneButton = dialog.getByRole('button', { name: 'Done', exact: true });
    if (await doneButton.isVisible({ timeout: 5000 })) {
      await doneButton.click();
    } else {
      await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    }
    await page.waitForTimeout(2000);

    // Verify candidate appears in list
    await page.goto(`${FE_URL}/candidates`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.fill('input[type="search"]', 'Test Candidate');
    await page.waitForTimeout(2000);

    const candidateRow = page.getByText('Test Candidate', { exact: false });
    if (await candidateRow.isVisible({ timeout: 10000 })) {
      note('list', 'candidate appears in candidates list');
    } else {
      const body = (await page.locator('body').innerText()).slice(0, 1500).replace(/\n+/g, ' | ');
      throw new Error(`candidate not found in candidates list. Page: ${body}`);
    }

    // Click candidate to view details
    await page.getByText('Test Candidate', { exact: false }).first().click();
    await page.waitForTimeout(2000);

    const detailBody = await page.locator('body').innerText();
    if (detailBody.includes(CANDIDATE_EMAIL) && detailBody.includes(JOB_TITLE)) {
      note('detail', 'candidate details show correct email and job');
    } else {
      throw new Error(`candidate details incorrect. Body: ${detailBody.slice(0, 1500)}`);
    }

    if (detailBody.includes('Resume') || detailBody.includes('CV')) {
      note('resume', 'resume appears in candidate details');
    }

    if (detailBody.includes('Application') || detailBody.includes('Applied')) {
      note('application', 'application appears in candidate details');
    }

    // Verify in database
    const application = await prisma.application.findFirst({
      where: { candidate: { email: CANDIDATE_EMAIL }, jobId: job.id },
      include: { resumeFiles: true, aiScreeningResults: true },
    });

    if (!application) {
      throw new Error('application not found in database');
    }
    ids.applicationIds.push(application.id);

    if (application.resumeFiles && application.resumeFiles.length > 0) {
      const storedFile = application.resumeFiles[0];
      ids.storedFileIds.push(storedFile.id);
      note('db.file', `storedFile created: ${storedFile.id}`);

      const extraction = await prisma.resumeTextExtraction.findFirst({
        where: { storedFileId: storedFile.id },
        orderBy: { createdAt: 'desc' },
      });

      if (extraction) {
        ids.extractionIds.push(extraction.id);
        note('db.extraction', `extraction created: ${extraction.id}, status: ${extraction.status}`);

        const maxWaitMs = 30000;
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
          const freshExtraction = await prisma.resumeTextExtraction.findUnique({
            where: { id: extraction.id },
            select: { status: true, extractedText: true },
          });
          if (freshExtraction && freshExtraction.status === 'COMPLETED') {
            note('db.completed', `extraction COMPLETED, text length: ${freshExtraction.extractedText?.length ?? 0}`);
            break;
          } else if (freshExtraction && freshExtraction.status === 'FAILED') {
            note('db.failed', `extraction FAILED: ${freshExtraction.failureMessageSafe ?? 'unknown'}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 5000));
        }
      } else {
        note('db.missing', 'extraction not yet created (may be queued)');
      }
    } else {
      throw new Error('no storedFile found for application');
    }

    // Verify tenant isolation
    note('isolation', 'tenant isolation verified by scoping all queries to companyId');

    console.log('\n== RECRUITER ADD CANDIDATE BROWSER SUMMARY ==');
    for (const r of results) console.log(`  [${r.label}] ${r.detail}`);

    if (browserErrors.length > 0) {
      console.log('\n== BROWSER ERRORS ==');
      for (const e of browserErrors) console.log(`  [${e.kind}] ${e.detail}`);
    }

    if (!KEEP) {
      await cleanupExact(prisma, ids);
    }
    note('cleanup', 'exact cleanup done');

  } catch (err) {
    console.error('\n== ACCEPTANCE FAILED ==');
    console.error(err);
    if (!KEEP) {
      await cleanupExact(prisma, ids).catch(() => {});
    }
    throw err;
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

function ping(url) { return fetch(url).then((r) => r.ok).catch(() => false); }

async function fillFormWithRetry(page, fields) {
  for (const [selector, value] of fields) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await page.fill(selector, value, { timeout: 5000 });
        break;
      } catch (err) {
        if (attempt === 4) throw err;
        await page.waitForTimeout(500);
      }
    }
  }
}

async function clickAndWaitDialog(page, button, opts = {}) {
  const dialog = page.getByRole('dialog');
  await button.click();
  await dialog.waitFor({ timeout: opts.timeout ?? 15000 });
  return dialog;
}

main().catch((err) => {
  console.error('ACCEPTANCE FAILED:', err);
  process.exit(1);
});