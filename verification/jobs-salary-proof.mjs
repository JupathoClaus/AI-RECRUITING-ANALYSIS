/**
 * JOBS SALARY BROWSER PROOF
 *
 * --phase before : run against the ORIGINAL code (git stash) to reproduce the
 *                  inconsistency (Create Job has NO salary fields, Edit Job has them).
 * --phase after  : run against the FIXED code to verify the full create->display->
 *                  edit->save->reload loop, validation, optional salary, and DB rows.
 */

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'jobs-salary-shots');
mkdirSync(SHOTS, { recursive: true });

const PHASE = process.argv.includes('--phase')
  ? process.argv[process.argv.indexOf('--phase') + 1]
  : 'after';
const RUN_ID = Date.now();
const EMAIL = `salary${RUN_ID}@e2e.com`;
const COMPANY = `Salary Co ${RUN_ID}`;
const PASSWORD = `SalaryPass!${RUN_ID}`;
const JOB_A = `Salary Proof Engineer ${RUN_ID}`;
const JOB_B = `No Salary Role ${RUN_ID}`;

const results = [];
const browserErrors = [];
const note = (label, detail) => {
  results.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ping = async (url) => {
  try {
    const res = await fetch(url);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
};

async function fillFormWithRetry(page, fields) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let ok = true;
    for (const [selector, value] of fields) {
      try {
        await page.fill(selector, value);
      } catch (err) {
        ok = false;
        break;
      }
    }
    if (ok) {
      let allSet = true;
      for (const [selector, value] of fields) {
        const v = await page.inputValue(selector).catch(() => null);
        if (v !== value) {
          allSet = false;
          break;
        }
      }
      if (allSet) return;
    }
    await sleep(1200);
  }
  throw new Error(`fillFormWithRetry failed after 4 attempts: ${fields.map(([s]) => s).join(', ')}`);
}

async function clickAndWaitDialog(page, trigger, { timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await trigger.click().catch(() => {});
    if ((await page.getByRole('dialog').count()) > 0) return;
    await sleep(500);
  }
  throw new Error('dialog did not open');
}

async function ensureNoDialog(page) {
  if ((await page.getByRole('dialog').count()) === 0) return;
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {});
  const deadline = Date.now() + 5000;
  while ((await page.getByRole('dialog').count()) > 0 && Date.now() < deadline) {
    await sleep(300);
  }
}

async function openCreateDialog(page) {
  await ensureNoDialog(page);
  await clickAndWaitDialog(page, page.getByRole('button', { name: 'Create Job', exact: true }).first());
  const d = page.getByRole('dialog');
  await d.locator('input[required]').waitFor({ timeout: 10000 });
  return d;
}

async function clearSalaryFields(page, d) {
  await d.locator('#job-salary-min').fill('');
  await d.locator('#job-salary-max').fill('');
  const cur = d.getByRole('combobox', { name: 'Currency' });
  const curText = (await cur.textContent()) ?? '';
  if (!curText.includes('No currency')) {
    await cur.click();
    await page.getByRole('option', { name: 'No currency', exact: true }).click();
  }
}

async function registerAndLogin(page, prisma) {
  await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [
    ['input[placeholder="Acme Corp"]', COMPANY],
    ['input[placeholder="you@company.com"]', EMAIL],
    ['input[placeholder="John"]', 'Rex'],
    ['input[placeholder="Doe"]', 'Kane'],
    ['input[placeholder="At least 12 characters"]', PASSWORD],
    ['input[placeholder="Re-enter your password"]', PASSWORD],
  ]);
  await page.check('#acceptTerms');
  await page.click('button[type="submit"]');
  try {
    await page.getByText('Account created successfully!').waitFor({ timeout: 20000 });
  } catch {
    const txt = (await page.locator('body').innerText()).slice(0, 900).replace(/\n+/g, ' | ');
    throw new Error(`registration failed. Page: ${txt}`);
  }
  note('register', `registered ${EMAIL}`);
  const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
  const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
  if (!user || !membership) throw new Error('user/membership not found after registration');
  await prisma.user.update({
    where: { id: user.id },
    data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
  });
  await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
  await prisma.companySettings.upsert({
    where: { companyId: membership.companyId },
    update: { requireJobApproval: false },
    create: { companyId: membership.companyId, requireJobApproval: false },
  });
  await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [
    ['input[type="email"]', EMAIL],
    ['input[type="password"]', PASSWORD],
  ]);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  note('login', 'logged in');
  return { userId: user.id, companyId: membership.companyId, membershipId: membership.id };
}

async function createJobViaApi(token, title) {
  const res = await fetch(`${BE_URL}/api/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title,
      employmentType: 'FULL_TIME',
      workplaceType: 'HYBRID',
      experienceLevel: 'MID',
      description: 'A role used by the jobs salary browser verification run.',
    }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`api job create failed ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.id;
}

async function apiLoginToken() {
  const res = await fetch(`${BE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (res.status !== 200) throw new Error(`api login failed ${res.status}`);
  return body.data.tokens.accessToken;
}

async function main() {
  console.log(`== jobs-salary-proof.mjs (phase=${PHASE}) ==`);
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], jobIds: [], candidateIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) =>
      browserErrors.push(`requestfailed: ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`),
    );
    page.on('response', (r) => {
      if (r.status() >= 400 && !/\/favicon\.ico|\/manifest\.json/.test(r.url())) {
        browserErrors.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`);
      }
    });

    const { userId, companyId, membershipId } = await registerAndLogin(page, prisma);
    ids.userId = userId;
    ids.companyId = companyId;
    ids.membershipIds.push(membershipId);
    const token = await apiLoginToken();

    await page.goto(`${FE_URL}/jobs`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create Job', exact: true }).waitFor({ timeout: 20000 });

    if (PHASE === 'before') {
      // â”€â”€ REPRODUCE: create dialog has NO salary fields, edit has them â”€â”€
      const dialog = await openCreateDialog(page);
      const minCount = await dialog.locator('#job-salary-min').count();
      const labelCount = await dialog.getByText('Minimum Salary', { exact: true }).count();
      await page.screenshot({ path: join(SHOTS, 'before-create-job.png'), fullPage: true });
      note('before.create.missing', `create dialog salary-min inputs=${minCount}, "Minimum Salary" labels=${labelCount}`);
      const hasSalaryInCreate = minCount > 0 || labelCount > 0;
      await dialog.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
      await sleep(500);

      const jobId = await createJobViaApi(token, JOB_A);
      ids.jobIds.push(jobId);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(JOB_A, { exact: true }).waitFor({ timeout: 20000 });
      await page.getByText('Salary not specified', { exact: true }).first().click();
      const details = page.getByRole('dialog');
      await details.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 10000 });
      await details.getByRole('button', { name: 'Edit', exact: true }).click();
      await sleep(500);
      const editHasMin = (await details.getByText('Salary Min', { exact: true }).count()) > 0;
      const editHasMax = (await details.getByText('Salary Max', { exact: true }).count()) > 0;
      const editHasCur = (await details.getByText('Salary Currency', { exact: true }).count()) > 0;
      await page.screenshot({ path: join(SHOTS, 'before-edit-job.png'), fullPage: true });
      note('before.edit.has', `edit dialog salary fields: min=${editHasMin} max=${editHasMax} currency=${editHasCur}`);
      const inconsistent = !hasSalaryInCreate && editHasMin && editHasMax && editHasCur;
      note('before.conclusion', inconsistent ? 'INCONSISTENCY REPRODUCED: create lacks salary, edit has it' : 'unexpected state');
      results.push({ label: 'before.verdict', detail: inconsistent ? 'REPRODUCED' : 'NOT REPRODUCED' });
    } else {
      // â”€â”€ VERIFY FIXED FLOW â”€â”€
      // (a) create dialog contains salary fields
      const dialog = await openCreateDialog(page);
      const hasMin = (await dialog.locator('#job-salary-min').count()) === 1;
      const hasMax = (await dialog.locator('#job-salary-max').count()) === 1;
      const hasCur = (await dialog.getByRole('combobox', { name: 'Currency' }).count()) === 1;
      const hasMinLabel = (await dialog.getByText('Minimum Salary', { exact: true }).count()) === 1;
      const hasCurLabel = (await dialog.getByText('Currency', { exact: true }).count()) === 1;
      note('after.create.fields', `create dialog salary fields: min=${hasMin} max=${hasMax} currency=${hasCur} (labels ${hasMinLabel}/${hasCurLabel})`);
      await page.screenshot({ path: join(SHOTS, 'after-create-job-fields.png'), fullPage: true });

      // (b) create with salary range + capture the request payload
      let capturedPayload = null;
      const onRequest = (req) => {
        if (req.method() === 'POST' && req.url().endsWith('/api/v1/jobs') && req.postDataJSON()?.title === JOB_A) {
          capturedPayload = req.postDataJSON();
        }
      };
      page.on('request', onRequest);
      await dialog.locator('input[required]').fill(JOB_A);
      await dialog.locator('textarea[required]').fill('Builds and maintains the recruiting platform backend services and tooling.');
      await dialog.locator('#job-salary-min').fill('2500000');
      await dialog.locator('#job-salary-max').fill('5000000');
      await dialog.getByRole('combobox', { name: 'Currency' }).click();
      await page.getByRole('option', { name: 'UGX', exact: true }).click();
      await page.screenshot({ path: join(SHOTS, 'after-create-filled.png'), fullPage: true });
      await dialog.locator('button[type="submit"]').click();
      await page.getByText(JOB_A, { exact: true }).waitFor({ timeout: 20000 });
      page.off('request', onRequest);
      const payloadOk =
        capturedPayload?.salaryMin === 2500000 &&
        capturedPayload?.salaryMax === 5000000 &&
        capturedPayload?.salaryCurrency === 'UGX';
      note('after.create.payload', `POST /jobs payload salaryMin=${capturedPayload?.salaryMin} salaryMax=${capturedPayload?.salaryMax} salaryCurrency=${capturedPayload?.salaryCurrency} -> ${payloadOk ? 'OK' : 'MISSING'}`);

      // (c) card shows the salary range
      let cardRange = false;
      try {
        await page.getByText(/\$2,500,000\s*[–-]\s*\$5,000,000/).first().waitFor({ timeout: 10000 });
        cardRange = true;
      } catch { /* fall through */ }
      note('after.card.range', `job card shows salary range: ${cardRange}`);
      await page.screenshot({ path: join(SHOTS, 'after-card-range.png'), fullPage: true });

      // (d) details dialog shows salary, edit shows values
      await page.getByText(/\$2,500,000\s*[–-]\s*\$5,000,000/).first().click();
      const details = page.getByRole('dialog');
      await details.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 10000 });
      const detailRange = (await details.getByText(/\$2,500,000\s*[–-]\s*\$5,000,000/).count()) > 0;
      note('after.details.range', `details dialog shows salary range: ${detailRange}`);
      await page.screenshot({ path: join(SHOTS, 'after-details.png'), fullPage: true });
      await details.getByRole('button', { name: 'Edit', exact: true }).click();
      await sleep(500);
      const editMin = await details.locator('#job-salary-min').inputValue();
      const editMax = await details.locator('#job-salary-max').inputValue();
      const editCur = (await details.getByRole('combobox', { name: 'Currency' }).textContent()) ?? '';
      const populated = editMin === '2500000' && editMax === '5000000' && editCur.includes('UGX');
      note('after.edit.values', `edit fields populated: min=${editMin} max=${editMax} currency=${editCur} -> ${populated}`);
      await page.screenshot({ path: join(SHOTS, 'after-edit-populated.png'), fullPage: true });

      // (e) change a value, save, reload, verify persisted
      await details.locator('#job-salary-max').fill('6000000');
      await details.locator('button[type="submit"]').click();
      await sleep(1000);
      const detailRange2 = (await details.getByText(/\$2,500,000\s*[–-]\s*\$6,000,000/).count()) > 0;
      note('after.edit.save', `details after save shows 2,500,000 – 6,000,000: ${detailRange2}`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(JOB_A, { exact: true }).waitFor({ timeout: 20000 });
      const cardRange2 = await page.getByText(/\$2,500,000\s*[–-]\s*\$6,000,000/).first().isVisible();
      note('after.reload', `after reload card shows 2,500,000 – 6,000,000: ${cardRange2}`);
      await page.screenshot({ path: join(SHOTS, 'after-reload.png'), fullPage: true });

      // (f) validation: min > max rejected
      const dialog2 = await openCreateDialog(page);
      await dialog2.locator('input[required]').fill('Invalid Range Role');
      await dialog2.locator('textarea[required]').fill('A role that must not be created because its salary range is invalid.');
      await dialog2.locator('#job-salary-min').fill('5000000');
      await dialog2.locator('#job-salary-max').fill('2500000');
      await dialog2.locator('button[type="submit"]').click();
      const errVisible = await dialog2
        .getByText('Minimum salary cannot be greater than maximum salary.', { exact: true })
        .waitFor({ timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      note('after.validation', `min>max shows validation error: ${errVisible}`);
      await page.screenshot({ path: join(SHOTS, 'after-validation-error.png'), fullPage: true });
      const invalidJobCount = await prisma.job.count({ where: { title: 'Invalid Range Role', companyId } });
      note('after.validation.noCreate', `no job created for invalid range: ${invalidJobCount === 0}`);
      await dialog2.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
      await sleep(400);

      // (g) optional salary: create without salary
      const dialog3 = await openCreateDialog(page);
      await clearSalaryFields(page, dialog3);
      await dialog3.locator('input[required]').fill(JOB_B);
      await dialog3.locator('textarea[required]').fill('A role with no salary information at all, proving salary is optional.');
      await dialog3.locator('button[type="submit"]').click();
      await page.getByText(JOB_B, { exact: true }).waitFor({ timeout: 20000 });
      const noSalaryText = await page.getByText('Salary not specified', { exact: true }).first().isVisible();
      note('after.optional', `job without salary created and shows "Salary not specified": ${noSalaryText}`);
      await page.screenshot({ path: join(SHOTS, 'after-no-salary.png'), fullPage: true });

      // (h) edge cases
      const edgeTitles = [];
      const mkEdge = async (title, { min, max, currency }) => {
        const d = await openCreateDialog(page);
        if (currency == null) await clearSalaryFields(page, d);
        await d.locator('input[required]').fill(title);
        await d.locator('textarea[required]').fill(`Edge-case role: ${title}.`);
        if (min != null) await d.locator('#job-salary-min').fill(String(min));
        if (max != null) await d.locator('#job-salary-max').fill(String(max));
        if (currency) {
          await d.getByRole('combobox', { name: 'Currency' }).click();
          await page.getByRole('option', { name: currency, exact: true }).click();
        }
        await d.locator('button[type="submit"]').click();
        await page.getByText(title, { exact: true }).waitFor({ timeout: 20000 });
        const row = await prisma.job.findFirst({ where: { title, companyId } });
        if (row) ids.jobIds.push(row.id);
        edgeTitles.push(title);
        return row;
      };

      const minOnly = await mkEdge(`Min Only ${RUN_ID}`, { min: 1000000, max: null, currency: null });
      note('after.edge.minOnly', `min-only persisted: min=${minOnly?.salaryMin} max=${minOnly?.salaryMax} currency=${minOnly?.salaryCurrency} (display: "From $1,000,000")`);
      const minOnlyCard = await page.getByText(/From \$1,000,000/).first().isVisible();
      note('after.edge.minOnly.display', `min-only card shows "From $1,000,000": ${minOnlyCard}`);

      const maxOnly = await mkEdge(`Max Only ${RUN_ID}`, { min: null, max: 9000000, currency: null });
      note('after.edge.maxOnly', `max-only persisted: min=${maxOnly?.salaryMin} max=${maxOnly?.salaryMax} (existing display rule shows "Salary not specified" when min is absent)`);

const equal = await mkEdge(`Equal Range ${RUN_ID}`, { min: 3000000, max: 3000000, currency: 'USD' });
      note('after.edge.equal', `min==max persisted: min=${equal?.salaryMin} max=${equal?.salaryMax} currency=${equal?.salaryCurrency}`);
      let equalCard = false;
      try {
        await page.getByText(/\$3,000,000\s*[–-]\s*\$3,000,000/).first().waitFor({ timeout: 8000 });
        equalCard = true;
      } catch { /* fall through */ }
      note('after.edge.equal.display', `min==max card shows range: ${equalCard}`);

      // negative value: native min={0} constraint blocks submission
      const negTitle = `Neg Range ${RUN_ID}`;
      const dNeg = await openCreateDialog(page);
      await dNeg.locator('input[required]').fill(negTitle);
      await dNeg.locator('textarea[required]').fill(`Edge-case role: ${negTitle}.`);
      await dNeg.locator('#job-salary-min').fill('-500');
      await dNeg.locator('button[type="submit"]').click();
      await sleep(800);
      const negBlocked = (await dNeg.count()) > 0 && (await prisma.job.count({ where: { title: negTitle, companyId } })) === 0;
      note('after.edge.negative', `negative salary submission blocked (dialog open, no job created): ${negBlocked}`);
      await page.screenshot({ path: join(SHOTS, 'after-negative-blocked.png'), fullPage: true });

      // non-numeric: type=number input refuses it
      const alphaTitle = `Alpha Salary ${RUN_ID}`;
      const dAlpha = await openCreateDialog(page);
      await clearSalaryFields(page, dAlpha);
      await dAlpha.locator('input[required]').fill(alphaTitle);
      await dAlpha.locator('textarea[required]').fill(`Edge-case role: ${alphaTitle}.`);
      await dAlpha.locator('#job-salary-min').click();
      await page.keyboard.type('abc');
      const alphaValue = await dAlpha.locator('#job-salary-min').inputValue();
      await dAlpha.locator('button[type="submit"]').click();
      await page.getByText(alphaTitle, { exact: true }).waitFor({ timeout: 20000 });
      const alphaRow = await prisma.job.findFirst({ where: { title: alphaTitle, companyId } });
      const alphaOk = alphaValue === '' && alphaRow?.salaryMin == null;
      note('after.edge.alpha', `non-numeric rejected (input value="${alphaValue}", saved salaryMin=${alphaRow?.salaryMin}): ${alphaOk}`);
      ids.jobIds.push(alphaRow.id);

      // (i) DB proof
      const rowA = await prisma.job.findFirst({ where: { title: JOB_A, companyId } });
      const rowB = await prisma.job.findFirst({ where: { title: JOB_B, companyId } });
      const dbA =
        Number(rowA?.salaryMin) === 2500000 &&
        Number(rowA?.salaryMax) === 6000000 &&
        rowA?.salaryCurrency === 'UGX';
      const dbB = rowB?.salaryMin == null && rowB?.salaryMax == null && rowB?.salaryCurrency == null;
      note('after.db.a', `DB job A: min=${rowA?.salaryMin} max=${rowA?.salaryMax} currency=${rowA?.salaryCurrency} -> ${dbA}`);
      note('after.db.b', `DB job B (no salary): min=${rowB?.salaryMin} max=${rowB?.salaryMax} currency=${rowB?.salaryCurrency} -> ${dbB}`);
      if (rowA) ids.jobIds.push(rowA.id);
      if (rowB) ids.jobIds.push(rowB.id);
    }

    await sleep(500);
    const allPass =
      browserErrors.length === 0 &&
      !results.some((r) => (r.detail || '').includes('MISSING')) &&
      !results.some((r) => r.label === 'before.verdict' && r.detail === 'NOT REPRODUCED') &&
      !results.some((r) => (r.detail || '').includes('false')) &&
      !results.some((r) => (r.detail || '').includes('unexpected'));
    console.log(`\n== SUMMARY ==`);
    console.log(`  browser errors: ${browserErrors.length}`);
    for (const e of browserErrors) console.log(`    - ${e}`);
    console.log(`  verdict: ${allPass ? 'PASS' : 'FAIL'}`);
    process.exitCode = allPass ? 0 : 1;
  } finally {
    await cleanupExact(prisma, ids, (msg) => note('cleanup', msg));
    await prisma.$disconnect().catch(() => {});
    if (browser) await browser.close();
  }
}

main().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});