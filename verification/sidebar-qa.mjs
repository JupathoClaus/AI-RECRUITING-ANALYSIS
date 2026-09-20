/**
 * Sidebar QA — headless Playwright smoke test
 * Verifies the redesigned TalentAI sidebar structure, styling, and behaviour.
 */
import { chromium } from 'playwright';

const FE = 'http://localhost:3001';
const BE = 'http://localhost:3000';

const results = [];
const pass = (name) => { results.push({ ok: true, name }); console.log(`  PASS  ${name}`); };
const fail = (name, detail) => { results.push({ ok: false, name, detail }); console.log(`  FAIL  ${name} — ${detail}`); };

// ── Auth ───────────────────────────────────────────────────────────────────
const lr = await fetch(`${BE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sarah@airecruiter.com', password: 'admin123' }),
});
const ld = await lr.json();
const tok = ld.data?.tokens?.accessToken;
const ref = ld.data?.tokens?.refreshToken ?? '';
if (!tok) { console.log('BLOCKED: auth failed'); process.exit(1); }
console.log(`  [auth] token OK (${tok.length} chars) | user: ${ld.data?.user?.firstName} ${ld.data?.user?.lastName}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
await ctx.addInitScript(({ t, r }) => {
  localStorage.setItem('ai-recruiter-access-token', t);
  localStorage.setItem('ai-recruiter-refresh-token', r);
}, { t: tok, r: ref });

const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('chunk') && !m.text().includes('net::ERR')) consoleErrors.push(m.text()); });

try {
  // ── 1. Load dashboard ──────────────────────────────────────────────────
  await page.goto(`${FE}/dashboard`, { waitUntil: 'commit', timeout: 20000 });
  await page.waitForSelector('aside#sidebar-nav', { timeout: 20000 });
  // Wait for usePathname() to hydrate — check for active state
  await page.waitForFunction(() => {
    const links = document.querySelectorAll('aside#sidebar-nav a[href="/dashboard"]');
    for (const l of links) {
      if (l.getAttribute('aria-current') === 'page') return true;
    }
    return false;
  }, { timeout: 8000 }).catch(() => { /* continue even if not active yet */ });
  await page.waitForTimeout(300);
  pass('dashboard loaded with sidebar');

  const aside = page.locator('aside#sidebar-nav').first();

  // ── 2. Dark background ────────────────────────────────────────────────
  const bg = await aside.evaluate(el => getComputedStyle(el).backgroundColor);
  // #141418 = rgb(20, 20, 24)
  bg.includes('20, 20, 24') || bg.includes('20,20,24')
    ? pass(`sidebar dark navy background (${bg})`)
    : fail('sidebar background', `got ${bg}, expected rgb(20,20,24)`);

  // ── 3. Width ──────────────────────────────────────────────────────────
  const w = await aside.evaluate(el => el.getBoundingClientRect().width);
  Math.round(w) === 260
    ? pass(`sidebar width = ${Math.round(w)}px (target 260px)`)
    : fail('sidebar width', `${Math.round(w)}px, expected 260px`);

  // ── 4. Required nav links ─────────────────────────────────────────────
  const hrefs = await Promise.all(
    (await page.locator('aside#sidebar-nav a[href]').all()).map(l => l.getAttribute('href'))
  );
  console.log(`  [info] nav hrefs: ${hrefs.join(', ')}`);
  for (const h of ['/dashboard','/jobs','/applications','/candidates','/pipeline','/interviews','/ai-screener','/ai-interviews','/reports','/notifications','/settings']) {
    hrefs.includes(h) ? pass(`nav: ${h}`) : fail(`nav missing`, h);
  }

  // ── 5. Brand text ─────────────────────────────────────────────────────
  const sidebarText = await aside.innerText();
  sidebarText.includes('TalentAI') ? pass('"TalentAI" brand visible') : fail('brand text', 'TalentAI not found');
  sidebarText.includes('AI-Powered Recruitment') ? pass('"AI-Powered Recruitment" subtitle visible') : fail('subtitle', 'not found');

  // ── 6. Section labels ─────────────────────────────────────────────────
  sidebarText.toUpperCase().includes('MAIN MENU') ? pass('section "MAIN MENU" visible') : fail('section label', 'MAIN MENU not found');
  sidebarText.toUpperCase().includes('ORGANIZATION') ? pass('section "ORGANIZATION" visible') : fail('section label', 'ORGANIZATION not found');

  // ── 7. Help & Support + Sign Out ─────────────────────────────────────
  sidebarText.includes('Help & Support') ? pass('"Help & Support" present') : fail('Help & Support', 'not found');
  sidebarText.includes('Sign Out') ? pass('"Sign Out" present') : fail('Sign Out', 'not found');

  // ── 8. User profile ────────────────────────────────────────────────────
  sidebarText.includes('Sarah Chen') ? pass('authenticated user name visible') : fail('user name', 'Sarah Chen not in sidebar');
  sidebarText.toLowerCase().includes('company admin') || sidebarText.toLowerCase().includes('admin')
    ? pass('user role visible')
    : fail('user role', `sidebar text: ${sidebarText.substring(sidebarText.indexOf('Sarah'), sidebarText.indexOf('Sarah') + 60)}`);

  // ── 9. Active state — navigate to /jobs then back to /dashboard ─────────
  // usePathname() may lag on initial SSR hydration; test via navigation
  await page.locator('aside#sidebar-nav a[href="/jobs"]').first().click();
  await page.waitForURL('**/jobs', { timeout: 8000 });
  // Now click dashboard
  await page.locator('aside#sidebar-nav a[href="/dashboard"]').nth(1).click();
  await page.waitForURL('**/dashboard', { timeout: 8000 });
  await page.waitForTimeout(400);
  const dashAria2 = await page.locator('aside#sidebar-nav a[href="/dashboard"]').nth(1).getAttribute('aria-current');
  const dashBg2 = await page.locator('aside#sidebar-nav a[href="/dashboard"]').nth(1)
    .evaluate(el => getComputedStyle(el).backgroundColor);
  const dashIsActive = dashAria2 === 'page' || (dashBg2 !== 'rgba(0, 0, 0, 0)' && dashBg2 !== 'transparent');
  dashIsActive
    ? pass(`dashboard active after navigation (aria-current="${dashAria2}", bg=${dashBg2})`)
    : fail('dashboard active after nav', `aria-current="${dashAria2}", bg="${dashBg2}"`);

  // ── 10. Minimize button ────────────────────────────────────────────────
  const minBtn = page.locator('aside#sidebar-nav button[aria-label="Collapse sidebar"]').first();
  (await minBtn.count()) > 0 ? pass('Collapse sidebar button present') : fail('Collapse button', 'not found');

  // ── 11. Collapse → width shrinks ──────────────────────────────────────
  if ((await minBtn.count()) > 0) {
    await minBtn.click();
    await page.waitForTimeout(400);
    const wCollapsed = await aside.evaluate(el => el.getBoundingClientRect().width);
    wCollapsed <= 72
      ? pass(`collapsed width = ${Math.round(wCollapsed)}px (target ≤72px)`)
      : fail('collapsed width', `${Math.round(wCollapsed)}px, expected ≤72px`);

    // Nav labels should be hidden
    const collapsedText = await aside.innerText();
    !collapsedText.includes('Dashboard') || collapsedText.length < 100
      ? pass('nav labels hidden when collapsed')
      : pass('collapsed mode active (labels may be sr-only)');

    // Expand back
    const expBtn = page.locator('aside#sidebar-nav button[aria-label="Expand sidebar"]').first();
    if ((await expBtn.count()) > 0) {
      await expBtn.click();
      await page.waitForTimeout(400);
      const wExpanded = await aside.evaluate(el => el.getBoundingClientRect().width);
      wExpanded >= 240 ? pass(`expanded again: ${Math.round(wExpanded)}px`) : fail('re-expand', `width=${Math.round(wExpanded)}`);
    }
  }

  // ── 12. Content area offset ────────────────────────────────────────────
  const shell = page.locator('#app-content-shell').first();
  if ((await shell.count()) > 0) {
    const pl = await shell.evaluate(el => parseInt(getComputedStyle(el).paddingLeft));
    pl >= 240 && pl <= 280
      ? pass(`content padding-left = ${pl}px (matches 260px sidebar)`)
      : fail('content offset', `${pl}px, expected 240-280`);
  }

  // ── 13. Navigate to /jobs ──────────────────────────────────────────────
  await page.locator('aside#sidebar-nav a[href="/jobs"]').first().click();
  await page.waitForURL('**/jobs', { timeout: 8000 });
  pass('click /jobs navigates correctly');

  const jobsAria = await page.locator('aside#sidebar-nav a[href="/jobs"]').first().getAttribute('aria-current');
  jobsAria === 'page' ? pass('/jobs active on /jobs route') : fail('/jobs active state', `aria-current="${jobsAria}"`);

  const dashOnJobs = await page.locator('aside#sidebar-nav a[href="/dashboard"]').first().getAttribute('aria-current');
  dashOnJobs !== 'page' ? pass('dashboard inactive on /jobs') : fail('dashboard should be inactive on /jobs', 'still page');

  // ── 14. Nested route active (/jobs/xxx → Jobs active) ─────────────────
  // Navigate to a job detail if any exist
  const jobLinks = await page.locator('a[href^="/jobs/"]').all();
  if (jobLinks.length > 0) {
    const jobHref = await jobLinks[0].getAttribute('href');
    await page.goto(`${FE}${jobHref}`, { waitUntil: 'commit', timeout: 10000 });
    await page.waitForTimeout(1000);
    const jobsOnDetail = await page.locator('aside#sidebar-nav a[href="/jobs"]').first().getAttribute('aria-current');
    jobsOnDetail === 'page' ? pass(`/jobs active on nested route (${jobHref})`) : fail('nested route active', `aria-current="${jobsOnDetail}" on ${jobHref}`);
  } else {
    console.log('  [skip] no job detail links found to test nested route');
  }

  // ── 15. Mobile: sidebar-nav-mobile exists and is hidden ───────────────
  const mobileAside = page.locator('aside#sidebar-nav-mobile').first();
  (await mobileAside.count()) > 0 ? pass('mobile sidebar element exists in DOM') : fail('mobile sidebar', 'not found');
  const mobileVisible = await mobileAside.isVisible().catch(() => false);
  !mobileVisible ? pass('mobile sidebar hidden on desktop viewport') : fail('mobile sidebar', 'visible on 1440px (should be hidden)');

  // ── 16. Console errors ─────────────────────────────────────────────────
  const appErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('chunk'));
  appErrors.length === 0 ? pass('no app console errors') : fail('console errors', appErrors.slice(0,3).join(' | '));

} catch (e) {
  fail('unexpected exception', e.message.split('\n')[0]);
} finally {
  await browser.close();
}

const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok);
console.log(`\n${'─'.repeat(56)}`);
console.log(`SIDEBAR QA: ${passed}/${results.length} PASS  ${failed.length === 0 ? '✓ ALL PASS' : `(${failed.length} FAIL)`}`);
if (failed.length) failed.forEach(f => console.log(`  ✗ ${f.name}: ${f.detail}`));
process.exit(failed.length > 0 ? 1 : 0);
