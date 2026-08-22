/**
 * ISSUE #6 — Phase A: browser reproduction of the "No candidates available"
 * state in the Create AI Interview modal, plus console/network audit.
 *
 * Logs in with the seeded dev account (sarah@airecruiter.com), opens
 * /ai-interviews, opens the modal, captures the before screenshot and
 * records every API call the page makes.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'ai-interview-shots');
mkdirSync(SHOTS, { recursive: true });

const EMAIL = 'sarah@airecruiter.com';
const PASSWORD = 'admin123';

const browserErrors = [];
const network = [];
const results = [];
const note = (label, detail) => {
  results.push({ label, detail });
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

async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  console.log('== ai-interview-repro.mjs ==');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`) });
    page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => browserErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('response', (r) => {
      if (/\/api\/v1\//.test(r.url())) {
        network.push({ status: r.status(), method: r.request().method(), url: r.url() });
      }
      if (r.status() >= 400 && !/favicon|manifest/.test(r.url())) {
        browserErrors.push(`http ${r.status()}: ${r.method()} ${r.url()}`);
      }
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
    note('login', 'logged in as sarah@airecruiter.com');

    // ── open AI Interviews page ──
    await page.goto(`${FE_URL}/ai-interviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const body = await page.locator('body').innerText();
    note('page', body.includes('No AI interviews yet') ? 'empty state shown' : 'unexpected page content');

    // ── open the Create AI Interview modal ──
    await page.getByRole('button', { name: /Create AI Interview/i }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);

    const dialog = page.getByRole('dialog');
    const dialogText = await dialog.innerText();
    note('modal', dialogText.replace(/\n+/g, ' | ').slice(0, 400));

    const placeholder = await dialog.getByText('No candidates available').count();
    const disabledItems = await dialog.locator('[role="option"]:disabled').count();
    note('selector', `"No candidates available" text count=${placeholder}, disabled option items=${disabledItems}`);

    const createBtn = dialog.getByRole('button', { name: /^Create Interview$/i });
    const isDisabled = await createBtn.isDisabled();
    note('button', `Create Interview disabled=${isDisabled}`);

    await page.screenshot({ path: join(SHOTS, 'before-no-candidates.png'), fullPage: true });
    note('shot', 'before-no-candidates.png saved');

    // ── network audit for the page's candidate-loading calls ──
    const apiCalls = network.filter((n) => /candidates|applications|ai-interviews|jobs/.test(n.url));
    for (const n of apiCalls) console.log('   NET', n.status, n.method, n.url.replace('http://localhost:3001/api/v1', '').replace('http://localhost:3000/api/v1', ''));
    const failed = apiCalls.filter((n) => n.status >= 400);
    note('network', `candidate/app/job/interview API calls=${apiCalls.length}, failures=${failed.length}`);

    // ── confirm DB state behind the UI ──
    const company = await prisma.company.findFirst({ where: { name: 'AI Recruiter Co' } });
    const candCount = await prisma.companyCandidate.count({ where: { companyId: company.id } });
    const appCount = await prisma.application.count({ where: { companyId: company.id, deletedAt: null } });
    const jobCount = await prisma.job.count({ where: { companyId: company.id } });
    const activeJobCount = await prisma.job.count({ where: { companyId: company.id, status: { in: ['PUBLISHED', 'APPROVED', 'SCHEDULED', 'PAUSED'] } } });
    note('db', `company=${company.id} candidates=${candCount} applications=${appCount} jobs=${jobCount} activeJobs=${activeJobCount}`);

    if (browserErrors.length) {
      console.log('\nBROWSER ERRORS:');
      for (const e of browserErrors) console.log('  -', e);
    } else {
      console.log('\nBROWSER ERRORS: none');
    }
  } finally {
    if (browser) await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });