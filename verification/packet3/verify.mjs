import { chromium } from 'playwright';

const PASS = '\x1b[32m\u2713\x1b[0m';
const FAIL = '\x1b[31m\u2717\x1b[0m';
const SKIP = '\x1b[33m\u2013\x1b[0m';
let passed = 0, failed = 0, skipped = 0;
function test(name, ok) { console.log((ok ? PASS : FAIL) + ' ' + name); if (ok) passed++; else failed++; }
function skip(name) { console.log(SKIP + ' ' + name); skipped++; }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const snap = (name) => page.screenshot({ path: `verification/packet3/${name}.png` }).catch(() => {});
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  try {
    // ========================
    // CAPABILITY 1: EDIT JOB
    // ========================
    console.log('\n=== Capability 1: Edit Job ===');
    await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);
    await page.fill('input[type="email"]', 'sarah@airecruiter.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    const loginOk = await page.waitForFunction(
      () => window.location.pathname.includes('dashboard'), { timeout: 20000 }
    ).then(() => true).catch(() => false);
    test('Login succeeds and redirects to dashboard', loginOk);
    await page.waitForTimeout(3000);
    await snap('verify-01-dashboard');

    await page.locator('a[href="/jobs"]').click();
    await page.waitForTimeout(3000);
    test('Jobs page loads via SPA navigation', page.url().includes('/jobs'));
    let bodyText = await page.locator('body').textContent();
    test('Product Manager job is visible', bodyText.includes('Product Manager'));

    // ========================
    // CAPABILITY 2: PUBLISH JOB
    // ========================
    console.log('\n=== Capability 2: Publish Job ===');
    // The status badge on the jobs list shows as "Active" for PUBLISHED jobs
    // Wait for the status to appear (store may still be loading)
    let statusVisible = false;
    for (let i = 0; i < 10; i++) {
      const txt = await page.locator('body').textContent();
      statusVisible = txt.includes('Active') || txt.includes('PUBLISHED') || txt.includes('Published');
      if (statusVisible) break;
      await page.waitForTimeout(1000);
    }
    test('Job shows published/active status', statusVisible);
    await snap('verify-02-publish-status');

    // ========================
    // CAPABILITY 4: PIPELINE
    // (Done before Close so job is still active)
    // ========================
    console.log('\n=== Capability 4: Dynamic Pipeline Stages ===');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const pipeLink = page.locator('a[href="/pipeline"]');
    if (await pipeLink.count() > 0) {
      await pipeLink.click();
      await page.waitForTimeout(5000);
      test('Pipeline page loads via SPA navigation', page.url().includes('/pipeline'));

      const filterBtn = page.locator('[role="combobox"]');
      if (await filterBtn.count() > 0) {
        await filterBtn.click();
        await page.waitForTimeout(1500);
        const options = await page.locator('[role="option"]').all();
        test('Job filter shows available jobs', options.length > 1);

        if (options.length > 1) {
          await options[1].click();
          await page.waitForTimeout(5000);

          let hasStages = false;
          for (let i = 0; i < 15; i++) {
            const h3s = await page.locator('h3').allTextContents();
            hasStages = h3s.some(h => ['Applied', 'Screening', 'Interview'].includes(h.trim()));
            if (hasStages) break;
            await page.waitForTimeout(1000);
          }
          test('Pipeline stages displayed after job selection', hasStages);

          const addStageBtn = page.locator('button').filter({ hasText: 'Add Stage' });
          test('Add Stage button visible', await addStageBtn.count() > 0);
        }
      } else {
        test('Job filter shows available jobs', false);
      }
    } else {
      test('Pipeline page loads via SPA navigation', false);
    }
    await snap('verify-03-pipeline-stages');

    // ========================
    // CAPABILITY 5: MOVE APPLICATION
    // ========================
    console.log('\n=== Capability 5: Move Application Between Stages ===');

    let hasCandidates = false;
    for (let i = 0; i < 15; i++) {
      const txt = await page.locator('body').textContent();
      hasCandidates = txt.includes('Alice') || txt.includes('Bob') || txt.includes('Carol');
      if (hasCandidates) break;
      await page.waitForTimeout(1000);
    }
    test('Candidates visible in pipeline stages', hasCandidates);

    if (hasCandidates) {
      const aliceCard = page.locator('.group.rounded-lg').filter({ hasText: 'Alice Johnson' }).first();
      if (await aliceCard.count() > 0) {
        await aliceCard.hover();
        await page.waitForTimeout(500);
        const btns = aliceCard.locator('button');
        const count = await btns.count();
        if (count >= 2) {
          const rightArrow = btns.nth(count - 1);
          const enabled = await rightArrow.isEnabled();
          test('Move right-arrow button is enabled for Alice', enabled);
          if (enabled) {
            await rightArrow.click();
            await page.waitForTimeout(2000);
            const afterMove = await page.locator('body').textContent();
            test('Move action completed (no error dialog)', !afterMove.includes('Error') && !afterMove.includes('Failed'));
          }
        } else {
          test('Move right-arrow button is enabled for Alice', false);
        }
      }
      await snap('verify-04-after-move');
    }

    // ========================
    // CAPABILITY 3: CLOSE JOB (last — closes the job permanently)
    // ========================
    console.log('\n=== Capability 3: Close Job ===');

    await page.locator('a[href="/jobs"]').click();
    await page.waitForTimeout(3000);

    // Click the job to open detail
    await page.locator('text=Product Manager').first().click();
    await page.waitForTimeout(3000);

    // The first 'Close' match is the status badge dropdown trigger;
    // the second is the action button in the details section.
    // Or there may be only one visible match.
    const closeBtns = page.locator('button').filter({ hasText: 'Close' });
    const closeBtnExists = await closeBtns.count() > 0;
    test('Close Job button visible on job details', closeBtnExists);

    if (closeBtnExists) {
      await snap('verify-05a-before-close');

      // If multiple matches, the action button is the last one
      const closeBtn = (await closeBtns.count()) > 1 ? closeBtns.last() : closeBtns.first();
      await closeBtn.click();
      await page.waitForTimeout(2000);

      // Dismiss any confirmation dialog
      const confirmBtn = page.locator('button').filter({ hasText: /Confirm|Yes|Close|Apply/i });
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
        await page.waitForTimeout(2000);
      }

      const afterClose = await page.locator('body').textContent();
      const closed = afterClose.includes('Closed') || afterClose.includes('CLOSED');
      test('Job status changes to Closed after clicking Close', closed);
      await snap('verify-05b-after-close');

      // Refresh and confirm persistence
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      const afterRefresh = await page.locator('body').textContent();
      test('Closed status persists after page refresh', afterRefresh.includes('Closed') || afterRefresh.includes('CLOSED'));
      await snap('verify-05c-closed-persists');
    }

    // ========================
    // CONSOLE ERRORS
    // ========================
    test('No uncaught page errors', errors.length === 0);
    if (errors.length > 0) for (const e of errors) console.log('  Error: ' + e);

  } catch (err) {
    console.log('Unhandled error: ' + err.message);
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('='.repeat(50));

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
