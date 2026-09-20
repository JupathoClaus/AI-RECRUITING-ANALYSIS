/**
 * CANDIDATES "Clear" / "Remove" FIX — BROWSER ACCEPTANCE (post-fix)
 *
 * Verifies the safe, unambiguous Clear/Remove UX on the Candidates page:
 *   A. "Clear Selection" (bulk bar) — unambiguous label, clears checkboxes,
 *      does NOT delete candidates.
 *   B. "Clear Filters" — always-visible reset in the filters row when any
 *      filter is active (non-empty results), resets all filters.
 *   C. Remove = per-row "Delete Candidate" with confirmation; Cancel keeps it.
 *   D. Confirm delete removes the candidate (soft-delete in DB).
 * Uses throwaway candidates created via the real API and cleaned up after.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const FE = 'http://localhost:3001';
const BE = 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'candidates-clear-accept');
mkdirSync(SHOTS, { recursive: true });

const PASS = [], FAIL = [];
const check = (n, c, d) => { c ? PASS.push(n) : FAIL.push(`${n} :: ${d}`); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + d}`); };
const note = (l, d) => console.log(`  [${l}] ${d}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loginApi(email, password) {
  const r = await fetch(`${BE}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  return j?.data?.tokens?.accessToken;
}
async function api(path, options = {}, token) {
  const res = await fetch(`${BE}/api/v1${path}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body.data ?? body, raw: body };
}

async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const RUN = Date.now();
  const EMAIL = 'sarah@airecruiter.com';
  const PASSWORD = 'admin123';
  console.log('== CANDIDATES "CLEAR/REMOVE" FIX — BROWSER ACCEPTANCE ==\n');

  const token = await loginApi(EMAIL, PASSWORD);
  check('auth: recruiter token', !!token, 'no token');
  if (!token) { process.exitCode = 1; return; }

  // ── Create 2 throwaway candidates (real API, candidate w/o application) ──
  const created = [];
  for (let i = 1; i <= 2; i++) {
    const r = await api('/candidates', {
      method: 'POST',
      body: JSON.stringify({ firstName: `ClearTmp${RUN}${i}`, lastName: 'Z', email: `cleartmp${RUN}${i}@e2e.com`, source: 'RECRUITER_CREATED', totalExperienceYears: 2 }),
    }, token);
    const cand = r.body;
    created.push({ candidateId: cand?.id, email: `cleartmp${RUN}${i}@e2e.com`, firstName: `ClearTmp${RUN}${i}` });
    if (!cand?.id) throw new Error(`create candidate ${i} failed: ${r.status} ${JSON.stringify(r.raw)}`);
  }
  note('setup', `created throwaway candidates: ${created.map((c) => c.firstName).join(', ')}`);

  const browserErrors = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => browserErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') browserErrors.push(`console: ${m.text()}`); });

  // Login via UI
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  for (let a = 0; a < 3; a++) {
    const email = page.locator('input[type="email"]');
    await email.waitFor({ state: 'visible', timeout: 15000 });
    await email.fill(EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    try { await page.waitForURL(/\/dashboard/, { timeout: 20000 }); break; }
    catch { note('login', 'retry'); await page.waitForTimeout(1500); }
  }

  await page.goto(`${FE}/candidates`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const tmp1 = created[0].firstName;
  const tmp2 = created[1].firstName;

  // ── A. "Clear Selection" ──────────────────────────────────────────────
  const row1 = page.locator('tr').filter({ hasText: tmp1 }).first();
  await row1.waitFor({ timeout: 30000 });
  await row1.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(500);
  const barText = await page.locator('text=/selected/i').first().innerText().catch(() => '');
  check('A: bulk bar appears with selected count', /selected/i.test(barText), barText);
  const clearSelBtn = page.getByRole('button', { name: 'Clear Selection' });
  const hasBareClear = await page.getByRole('button', { name: /^Clear$/i }).count();
  check('A: button labeled explicitly "Clear Selection" (not ambiguous "Clear")', (await clearSelBtn.isVisible().catch(() => false)) && hasBareClear === 0, `bareClear=${hasBareClear}`);
  await clearSelBtn.click();
  await page.waitForTimeout(500);
  // Non-destructive: candidate still present, bulk bar gone
  const tmp1Still = await page.locator('tr').filter({ hasText: tmp1 }).count();
  const barGone = await page.locator('text=/selected/i').count();
  check('A: "Clear Selection" un-checks and keeps the candidate', tmp1Still === 1 && barGone === 0, `tmp1=${tmp1Still} bar=${barGone}`);
  await page.screenshot({ path: join(SHOTS, 'A-clear-selection.png') });

  // ── B. "Clear Filters" (always visible in filters row) ────────────────
  const totalRows = await page.locator('table tbody tr').count();
  await page.fill('input[type="search"]', tmp1);
  await page.waitForTimeout(600);
  const filteredRows = await page.locator('table tbody tr').count();
  check('B: search narrows results to the throwaway', filteredRows === 1, `filtered=${filteredRows}`);
  const clearFiltersBtn = page.getByRole('button', { name: 'Clear Filters' });
  check('B: "Clear Filters" button appears in filters row (list non-empty)', await clearFiltersBtn.isVisible().catch(() => false), 'not visible');
  check('B: "Clear Filters" is NOT destructive (no delete dialog opens)', (await page.getByRole('dialog').count()) === 0, 'dialog opened');
  await page.screenshot({ path: join(SHOTS, 'B-clear-filters.png') });
  await clearFiltersBtn.click();
  await page.waitForTimeout(600);
  const searchVal = await page.inputValue('input[type="search"]').catch(() => 'x');
  const restoredRows = await page.locator('table tbody tr').count();
  check('B: "Clear Filters" resets search and restores full list', searchVal === '' && restoredRows === totalRows, `search="${searchVal}" restored=${restoredRows}`);
  const cfGone = await clearFiltersBtn.isVisible().catch(() => false);
  check('B: "Clear Filters" hides once no filters are active', !cfGone, 'still visible');

  // ── C. Remove = Delete Candidate; Cancel keeps it ─────────────────────
  const row2 = page.locator('tr').filter({ hasText: tmp2 }).first();
  await row2.waitFor({ timeout: 30000 });
  await row2.locator('button[aria-haspopup="menu"]').first().click();
  await page.getByRole('menuitem', { name: 'Delete Candidate' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByText('Delete Candidate?', { exact: true }).waitFor({ timeout: 10000 });
  const dlgText = await dlg.innerText();
  check('C: delete is a confirmed non-silent dialog', /Delete Candidate\?/i.test(dlgText), 'no confirmation');
  check('C: dialog copy explains removal (active list/dashboard/reports)', /active candidate list/i.test(dlgText), 'copy missing');
  await page.screenshot({ path: join(SHOTS, 'C-delete-confirmation.png') });
  await dlg.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForTimeout(600);
  const tmp2AfterCancel = await page.locator('tr').filter({ hasText: tmp2 }).count();
  const tmp2Db = await db.candidate.findFirst({ where: { normalizedEmail: created[1].email.toLowerCase() } });
  check('C: cancel keeps the candidate in list + NOT deleted in DB', tmp2AfterCancel === 1 && tmp2Db?.status !== 'DELETED', `rows=${tmp2AfterCancel} status=${tmp2Db?.status}`);

  // ── D. Confirm delete REMOVES the candidate (soft-delete) ─────────────
  const row1b = page.locator('tr').filter({ hasText: tmp1 }).first();
  await row1b.locator('button[aria-haspopup="menu"]').first().click();
  await page.getByRole('menuitem', { name: 'Delete Candidate' }).click();
  const dlg2 = page.getByRole('dialog');
  await dlg2.getByText('Delete Candidate?', { exact: true }).waitFor({ timeout: 10000 });
  await dlg2.getByRole('button', { name: 'Delete Candidate', exact: true }).click();
  await page.waitForTimeout(2000);
  const tmp1AfterDelete = await page.locator('tr').filter({ hasText: tmp1 }).count();
  const tmp1Db = await db.candidate.findFirst({ where: { normalizedEmail: created[0].email.toLowerCase() } });
  check('D: confirmed delete removes candidate from list', tmp1AfterDelete === 0, `rows=${tmp1AfterDelete}`);
  check('D: candidate soft-deleted in DB (status DELETED + deletedAt)', tmp1Db?.status === 'DELETED' && tmp1Db?.deletedAt != null, `status=${tmp1Db?.status}`);
  const audit = await db.candidateAuditEvent.findFirst({ where: { candidateId: created[0].candidateId, eventType: 'CANDIDATE_DELETED' } });
  check('D: CANDIDATE_DELETED audit event recorded', !!audit, 'no audit row');
  await page.screenshot({ path: join(SHOTS, 'D-after-delete.png') });

  note('browser errors', browserErrors.length ? browserErrors.join(' | ') : 'none');
  check('browser: no page/console errors', browserErrors.length === 0, browserErrors[0]);

  await browser.close();

  // ── Cleanup: hard-remove leftover throwaway rows (exact IDs) ─────────
  for (const c of created) {
    const cand = await db.candidate.findFirst({ where: { normalizedEmail: c.email.toLowerCase() } });
    if (cand) {
      await db.candidateAuditEvent.deleteMany({ where: { candidateId: cand.id } });
      const ccs = await db.companyCandidate.findMany({ where: { candidateId: cand.id } });
      for (const cc of ccs) {
        await db.application.deleteMany({ where: { companyCandidateId: cc.id } });
        await db.companyCandidate.deleteMany({ where: { id: cc.id } });
      }
      await db.candidate.delete({ where: { id: cand.id } }).catch(() => {});
    }
  }
  const leftovers = await db.candidate.count({ where: { normalizedEmail: { in: created.map((c) => c.email.toLowerCase()) } } });
  check('cleanup: no throwaway candidates left', leftovers === 0, `left=${leftovers}`);
  await db.$disconnect();

  console.log(`\nPASS=${PASS.length} FAIL=${FAIL.length}`);
  if (FAIL.length) { console.log('\n-- FAILURES --'); FAIL.forEach((f) => console.log('  ' + f)); process.exitCode = 1; }
}
main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
