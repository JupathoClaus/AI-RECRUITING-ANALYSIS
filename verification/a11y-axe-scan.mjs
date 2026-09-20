/**
 * ACCESSIBILITY (WCAG 2.1 A/AA) BROWSER SCAN
 * Registers a real user, logs in, and runs axe-core (loaded from node_modules)
 * against the main recruiter pages. Reports serious/critical violations so the
 * final report can be truthful about screen-reader/keyboard accessibility.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const dbUrl = resolveDatabaseUrl(process.env);
assertLocalVerificationDb(dbUrl, 'a11y-axe-scan');
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const RUN_ID = Date.now();
const EMAIL = `a11y${RUN_ID}@e2e.com`;
const COMPANY = `A11y Co ${RUN_ID}`;
const PASSWORD = `Vrf$Gr8!${RUN_ID}`;
const JOB_TITLE = `A11y Role ${RUN_ID}`;

const axeSource = readFileSync(
  join(dirname(require.resolve('axe-core/package.json')), 'axe.min.js'),
  'utf8',
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (label, detail) => console.log(`  [${label}] ${detail}`);

async function fillFormWithRetry(page, fields) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let ok = true;
    for (const [selector, value] of fields) {
      try {
        await page.fill(selector, value);
      } catch {
        ok = false;
        break;
      }
    }
    if (ok) {
      let allSet = true;
      for (const [selector, value] of fields) {
        const v = await page.inputValue(selector).catch(() => null);
        if (v !== value) allSet = false;
      }
      if (allSet) return;
    }
    await sleep(1200);
  }
  throw new Error('fillFormWithRetry failed');
}

async function registerAndLogin(page) {
  await page.goto(`${FE_URL}/register`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [
    ['input[placeholder="Acme Corp"]', COMPANY],
    ['input[placeholder="you@company.com"]', EMAIL],
    ['input[placeholder="John"]', 'A11y'],
    ['input[placeholder="Doe"]', 'Scan'],
    ['input[placeholder="At least 12 characters"]', PASSWORD],
    ['input[placeholder="Re-enter your password"]', PASSWORD],
  ]);
  await page.check('#acceptTerms');
  await page.click('button[type="submit"]');
  await page.getByText('Account created successfully!').waitFor({ timeout: 20000 });
  const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
  const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
  if (!user || !membership) throw new Error('user/membership missing');
  ids.userId = user.id;
  ids.companyId = membership.companyId;
  await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
  await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
  await prisma.companySettings.upsert({
    where: { companyId: membership.companyId },
    update: { requireJobApproval: false },
    create: { companyId: membership.companyId, requireJobApproval: false },
  });
  await page.goto(`${FE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await fillFormWithRetry(page, [['input[type="email"]', EMAIL], ['input[type="password"]', PASSWORD]]);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  note('login', 'logged in');
}

async function createJob() {
  const res = await fetch(`${BE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  const token = body.data.tokens.accessToken;
  const jres = await fetch(`${BE_URL}/api/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: JOB_TITLE,
      employmentType: 'FULL_TIME',
      workplaceType: 'HYBRID',
      experienceLevel: 'MID',
      description: 'Used by the a11y scan.',
    }),
  });
  const jbody = await jres.json();
  return jbody.data.id;
}

const ids = { userId: null, companyId: null };

async function scanPage(page, url, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(() => axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    resultTypes: ['violations'],
  }));
  const report = results.violations
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      nodeDetails: v.nodes.slice(0, 40).map((n) => ({
        role: (n.html.match(/role="([^"]*)"/) || [])[1] || '',
        hasAriaLabel: /aria-label="[^"]+/.test(n.html),
        hasPlaceholder: /placeholder="[^"]+/.test(n.html),
        text: (n.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '').slice(0, 60),
        tag: ((n.html.match(/^<([a-zA-Z0-9]+)/) || [])[1] || '').slice(0, 60),
      })),
    }))
    .sort((a, b) => (b.nodes - a.nodes));
  console.log(`=== ${label} (${url}) : ${results.violations.length} violations ===`);
  for (const v of report) {
    console.log(`  [${v.impact}] ${v.id} x${v.nodes} :: ${v.help}`);
    for (const d of v.nodeDetails.slice(0, 8)) {
      console.log(`        <${d.tag}> role=${d.role} ariaLabel=${d.hasAriaLabel} placeholder=${d.hasPlaceholder} text="${d.text}"`);
    }
  }
  return report;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await registerAndLogin(page);
  const jobId = await createJob();
  note('job', `${JOB_TITLE} created (${jobId})`);

  const all = [];
  for (const [url, label] of [
    [`${FE_URL}/dashboard`, 'dashboard'],
    [`${FE_URL}/jobs`, 'jobs'],
    [`${FE_URL}/jobs/${jobId}`, 'job-workspace-overview'],
    [`${FE_URL}/jobs/${jobId}/analytics`, 'job-analytics'],
    [`${FE_URL}/candidates`, 'candidates'],
    [`${FE_URL}/pipeline`, 'pipeline'],
    [`${FE_URL}/ai-interviews`, 'ai-interviews'],
    [`${FE_URL}/interviews`, 'interviews'],
    [`${FE_URL}/notifications`, 'notifications'],
    [`${FE_URL}/settings`, 'settings'],
    [`${FE_URL}/company`, 'company'],
    [`${FE_URL}/reports`, 'reports'],
  ]) {
    const r = await scanPage(page, url, label);
    all.push({ label, violations: r });
  }

  await browser.close();
  const serious = all
    .flatMap((a) => a.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'))
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  console.log(`\n== axe SUMMARY ==`);
  console.log(`pages scanned: ${all.length}`);
  console.log(`unique serious/critical rule ids: ${serious.map((s) => s.id).join(', ') || '(none)'}`);
  for (const a of all) {
    const s = a.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length;
    if (s > 0) console.log(`  ${a.label}: ${s} serious/critical`);
  }
  await cleanupExact(prisma, { companyId: ids.companyId, userId: ids.userId, jobIds: [jobId] }, (m) => console.log('  ' + m));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await cleanupExact(prisma, { companyId: ids.companyId, userId: ids.userId, jobIds: [] }, () => {});
  } catch {}
  await prisma.$disconnect();
  process.exit(1);
});