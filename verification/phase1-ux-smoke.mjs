import { chromium } from 'playwright';

const FE = 'http://localhost:3001';
const BE = 'http://localhost:3000';

const results = [];
const pass = (name) => { results.push({ ok: true, name }); console.log(`  PASS  ${name}`); };
const fail = (name, detail) => { results.push({ ok: false, name, detail }); console.log(`  FAIL  ${name} — ${detail}`); };

const lr = await fetch(`${BE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sarah@airecruiter.com', password: 'admin123' }),
});
const ld = await lr.json();
const tok = ld.data?.tokens?.accessToken;
if (!tok) { console.log('BLOCKED: auth failed'); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ t, r }) => {
  localStorage.setItem('ai-recruiter-access-token', t);
  localStorage.setItem('ai-recruiter-refresh-token', r);
}, { t: tok, r: ld.data?.tokens?.refreshToken ?? '' });

const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('net::ERR')) consoleErrors.push(m.text()); });

const goto = (u) => page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });

try {
  // ── Hiring hub ─────────────────────────────────────────────────────────
  await goto(`${FE}/hiring`);
  await page.getByText('Hiring at a glance').waitFor({ timeout: 20000 });
  (await page.getByRole('link', { name: /^Jobs/ }).count()) > 0 ? pass('hiring hub renders Jobs card') : fail('hiring hub', 'Jobs card missing');
  (await page.getByRole('link', { name: /^Candidates/ }).count()) > 0 ? pass('hiring hub renders Candidates card') : fail('hiring hub', 'Candidates card missing');
  await page.getByText('New Job').first().waitFor({ timeout: 10000 });
  pass('hiring hub "New Job" action present');

  // ── Help page ──────────────────────────────────────────────────────────
  await goto(`${FE}/help`);
  await page.getByText('Help & Support').first().waitFor({ timeout: 20000 });
  pass('help page loads');

  // ── Compare empty state ────────────────────────────────────────────────
  await goto(`${FE}/candidates/compare`);
  await page.getByText('Nothing to compare yet').waitFor({ timeout: 20000 });
  pass('compare page shows honest empty state');
  await page.getByRole('link', { name: 'Go to candidates' }).click();
  await page.waitForURL('**/candidates', { timeout: 15000 });
  pass('compare empty state links back to candidates');

  // ── Sidebar grouping ───────────────────────────────────────────────────
  await goto(`${FE}/dashboard`);
  await page.locator('aside#sidebar-nav').first().waitFor({ timeout: 20000 });
  const expandHiring = page.locator('aside#sidebar-nav button[aria-label="Expand Hiring"]').first();
  (await expandHiring.count()) > 0 ? pass('sidebar shows "Expand Hiring" toggle') : fail('sidebar', 'Expand Hiring toggle missing');
  await expandHiring.click();
  await page.getByRole('link', { name: 'Jobs' }).first().waitFor({ timeout: 8000 });
  await page.getByRole('link', { name: 'Applications' }).first().waitFor({ timeout: 8000 });
  pass('expanded Hiring reveals Jobs + Applications');

  await page.locator('aside#sidebar-nav button[aria-label="Collapse Hiring"]').first().click();
  await page.waitForTimeout(300);
  (await page.getByRole('link', { name: 'Jobs' }).count()) === 0 ? pass('collapse hides children') : fail('sidebar collapse', 'Jobs still visible');

  // ── No "Notifications" nav item; bell lives in the header ──────────────
  const navHrefs = await Promise.all((await page.locator('aside#sidebar-nav a[href]').all()).map((l) => l.getAttribute('href')));
  navHrefs.includes('/notifications') ? fail('sidebar', '/notifications still a nav item') : pass('sidebar no longer lists Notifications');

  const bell = page.getByRole('button', { name: 'Notifications' }).first();
  (await bell.count()) > 0 ? pass('header notification bell present') : fail('header', 'notifications bell missing');

  // ── Notification drawer open / escape / mark-all-read availability ─────
  await bell.click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await dialog.waitFor({ timeout: 8000 });
  pass('notification drawer opens as a dialog');
  const markAll = page.getByRole('button', { name: 'Mark all read' }).first();
  (await markAll.count()) > 0 ? pass('drawer shows "Mark all read"') : fail('drawer', 'mark-all-read missing');

  const beforeExpanded = await bell.getAttribute('aria-expanded');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const afterExpanded = await bell.getAttribute('aria-expanded');
  afterExpanded === 'false' ? pass('Escape closes the drawer (aria-expanded=false)') : fail('drawer escape', `aria-expanded still ${afterExpanded}, before=${beforeExpanded}`);

  // ── Sidebar on /jobs: active-child auto-expand ─────────────────────────
  await goto(`${FE}/jobs`);
  await page.locator('aside#sidebar-nav').first().waitFor({ timeout: 20000 });
  const jobsLink = page.locator('aside#sidebar-nav a[href="/jobs"]').first();
  await jobsLink.waitFor({ timeout: 8000 });
  const aria = await jobsLink.getAttribute('aria-current');
  aria === 'page' ? pass('/jobs marked active in sidebar (auto-opened group)') : fail('sidebar active', `aria-current=${aria}`);

  // ── Console errors ─────────────────────────────────────────────────────
  const appErrors = consoleErrors.filter((e) => !e.includes('favicon'));
  appErrors.length === 0 ? pass('no page-level console errors') : fail('console errors', appErrors.slice(0, 3).join(' | '));
} catch (e) {
  fail('unexpected exception', e.message.split('\n')[0]);
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(56)}`);
console.log(`PHASE 1 SMOKE: ${passed}/${results.length} PASS  ${failed.length === 0 ? '✓ ALL PASS' : `(${failed.length} FAIL)`}`);
if (failed.length) failed.forEach((f) => console.log(`  ✗ ${f.name}: ${f.detail}`));
process.exit(failed.length > 0 ? 1 : 0);