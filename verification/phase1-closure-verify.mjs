// Phase 1 closure browser verification.
// Focuses on the screens not fully covered by the other proof scripts
// (applications list, candidate profile, candidate pagination/bulk,
// dashboard attention counts, AI Screener entry, responsive layout).
// Read-only: creates no data, so no cleanup is required.
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
const httpErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('net::ERR')) consoleErrors.push(m.text()); });
page.on('response', (res) => { if (res.status() >= 400) httpErrors.push(`${res.status()} ${res.url()}`); });
const goto = (u) => page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });

const screens = [
  ['dashboard', '/dashboard', 'Needs your attention'],
  ['jobs', '/jobs', 'Jobs'],
  ['applications', '/applications', 'Applications'],
  ['candidates', '/candidates', 'Candidates'],
  ['pipeline', '/pipeline', 'Pipeline'],
  ['interviews', '/interviews', 'Interviews'],
  ['ai-interviews', '/ai-interviews', 'AI Interviews'],
  ['ai-screener', '/ai-screener', 'AI Resume Screener'],
  ['notifications', '/notifications', 'Notifications'],
  ['settings', '/settings', 'Settings'],
  ['hiring', '/hiring', 'Hiring at a glance'],
  ['compare-empty', '/candidates/compare', 'Nothing to compare yet'],
  ['help', '/help', 'Help & Support'],
];

try {
  for (const [name, route, marker] of screens) {
    await goto(`${FE}${route}`);
    try {
      await page.getByText(marker, { exact: false }).first().waitFor({ timeout: 20000 });
      pass(`${name} renders ("${marker}")`);
    } catch {
      fail(name, `"${marker}" not found on ${route}`);
    }
  }

  // Dashboard attention card is present (server-backed counts, item D).
  await goto(`${FE}/dashboard`);
  try {
    await page.getByText(/to review|caught up|awaiting AI screening|interviews scheduled today/).first().waitFor({ timeout: 20000 });
    pass('dashboard attention card shows a real state');
  } catch {
    fail('dashboard attention', 'neither attention items nor caught-up state rendered');
  }

  // Candidate pagination (page 1 of N) is driven by server meta.
  await goto(`${FE}/candidates`);
  await page.locator('tbody tr').first().waitFor({ timeout: 20000 });
  const pagination = page.locator('nav[aria-label="Pagination"]');
  if ((await pagination.count()) > 0) {
    const text = (await pagination.first().innerText()).replace(/\s+/g, ' ');
    /Showing\s+1\D/.test(text) ? pass(`candidates pagination renders (${text.slice(0, 60)})`) : fail('candidates pagination', text);
  } else {
    fail('candidates pagination', 'pagination nav not rendered');
  }

  // Bulk selection surfaces the real actions.
  await page.locator('tbody tr').first().locator('input[type="checkbox"]').check();
  try {
    await page.getByText('1 selected', { exact: false }).first().waitFor({ timeout: 8000 });
    pass('candidate bulk bar appears on selection');
  } catch {
    fail('candidate bulk', 'bulk bar did not appear');
  }
  const hasMove = await page.getByRole('button', { name: /Move to Screening Stage/ }).count();
  const hasRun = await page.getByRole('button', { name: /Run AI Screening/ }).count();
  hasMove > 0 && hasRun > 0
    ? pass('bulk bar shows Move to Screening Stage + Run AI Screening')
    : fail('candidate bulk actions', `move=${hasMove} run=${hasRun}`);

  // Candidate profile navigation.
  await goto(`${FE}/candidates`);
  await page.locator('tbody tr').first().waitFor({ timeout: 20000 });
  await page.locator('tbody tr').first().click();
  try {
    await page.waitForURL(/\/candidates\/[0-9a-f-]{8,}/i, { timeout: 15000 });
    pass('candidate row opens the candidate profile');
  } catch {
    fail('candidate profile', 'did not navigate to /candidates/:id');
  }

  // Responsive: no horizontal overflow at a phone viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/dashboard', '/candidates', '/jobs']) {
    await goto(`${FE}${route}`);
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    overflow <= 4
      ? pass(`responsive ${route} has no horizontal overflow (${overflow}px)`)
      : fail(`responsive ${route}`, `horizontal overflow ${overflow}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // The seed company has no logo, so GET /company/logo legitimately 404s and
  // the UI falls back to an initials avatar. Treat only that as expected.
  const unexpectedHttp = httpErrors.filter((u) => !/\/company\/logo$/.test(u));
  const unexpectedConsole = consoleErrors.filter(
    (m) => unexpectedHttp.length > 0 || !/status of 404/.test(m),
  );
  if (unexpectedConsole.length === 0) pass('no unexpected page-level console errors');
  else fail('console errors', `${unexpectedConsole.length}: ${unexpectedConsole.slice(0, 3).join(' | ')}`);
  if (unexpectedHttp.length === 0) pass('no unexpected HTTP >= 400 responses');
  else fail('http errors', unexpectedHttp.join(' | '));
  console.log('  [http>=400]', httpErrors.length === 0 ? '(none)' : httpErrors.join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n────────────────────────────────────────────────────────');
console.log(`PHASE 1 CLOSURE VERIFY: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  console.log('FAILURES:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log('✓ ALL PASS');
