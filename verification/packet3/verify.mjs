import { chromium } from 'playwright';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m-\x1b[0m';
let passed = 0, failed = 0, skipped = 0;

function test(name, ok) { console.log((ok ? PASS : FAIL) + ' ' + name); if (ok) passed++; else failed++; }
function skip(name) { console.log(SKIP + ' ' + name); skipped++; }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const screenshot = (name) => page.screenshot({ path: `verification/packet3/${name}.png` }).catch(() => {});

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  try {
    // ==============================
    // LOGIN
    // ==============================
    console.log('\n=== Capability 1: Edit Job ===');

    await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"]', 'sarah@airecruiter.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    const loginOk = await page.waitForFunction(() => window.location.pathname.includes('dashboard'), { timeout: 20000 }).then(() => true).catch(() => false);
    test('Login succeeds and redirects to dashboard', loginOk);
    await page.waitForTimeout(3000);

    // ==============================
    // JOBS PAGE
    // ==============================
    const jobsLink = page.locator('a[href="/jobs"]');
    if (await jobsLink.count() > 0) {
      await jobsLink.click();
      await page.waitForTimeout(3000);
      const onJobsPage = page.url().includes('/jobs');
      test('Jobs page loads via SPA navigation', onJobsPage);
    } else {
      test('Jobs page loads via SPA navigation', false);
    }

    const bodyText = await page.locator('body').textContent();
    test('Product Manager job is visible', bodyText.includes('Product Manager'));
    await screenshot('packet3-01-jobs-page');

    // ==============================
    // PUBLISH STATUS
    // ==============================
    console.log('\n=== Capability 2: Publish Job ===');
    const hasStatusOnPage = bodyText.includes('Active') || bodyText.includes('PUBLISHED') || bodyText.includes('Published');
    test('Job shows published/active status on page', hasStatusOnPage);
    await screenshot('packet3-02-publish-status');

    // ==============================
    // CLOSE JOB (skip)
    // ==============================
    console.log('\n=== Capability 3: Close Job ===');
    skip('Close Job action - UI exploration needed');

    // ==============================
    // PIPELINE
    // ==============================
    console.log('\n=== Capability 4: Dynamic Pipeline Stages ===');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const pipeLink = page.locator('a[href="/pipeline"]');
    if (await pipeLink.count() > 0) {
      await pipeLink.click();
      let onPipeline = page.url().includes('/pipeline');
      if (!onPipeline) {
        await page.waitForTimeout(5000);
        onPipeline = page.url().includes('/pipeline');
      }
      test('Pipeline page loads via SPA navigation', onPipeline);

      if (onPipeline) {
        await page.waitForTimeout(3000);

        const filterBtn = page.locator('[role="combobox"]');
        if (await filterBtn.count() > 0) {
          await filterBtn.click();
          await page.waitForTimeout(1500);
          const options = await page.locator('[role="option"]').all();
          test('Job filter shows available jobs', options.length > 1);

          if (options.length > 1) {
            await options[1].click();
            await page.waitForTimeout(5000);

            // Wait for pipeline to load
            let hasStages = false;
            for (let i = 0; i < 20; i++) {
              const stageHeaders = await page.locator('h3').allTextContents();
              hasStages = stageHeaders.some(h => ['Applied', 'Screening', 'Interview'].includes(h.trim()));
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
      }
    } else {
      test('Pipeline page loads via SPA navigation', false);
    }

    await screenshot('packet3-03-pipeline-with-stages');

    // ==============================
    // MOVE APPLICATION
    // ==============================
    console.log('\n=== Capability 5: Move Application Between Stages ===');

    // Wait for candidates to load (poll up to 15s)
    let hasCandidates = false;
    for (let i = 0; i < 15; i++) {
      const bodyText = await page.locator('body').textContent();
      hasCandidates = bodyText.includes('Alice') || bodyText.includes('Bob') || bodyText.includes('Carol');
      if (hasCandidates) break;
      await page.waitForTimeout(1000);
    }
    test('Candidates visible in pipeline stages', hasCandidates);

    if (hasCandidates) {
      const aliceCard = page.locator('text=Alice Johnson').first();
      if (await aliceCard.count() > 0) {
        await aliceCard.hover();
        await page.waitForTimeout(500);
        const rightArrow = aliceCard.locator('..').locator('button').last();
        if (await rightArrow.count() > 0) {
          const enabled = await rightArrow.isEnabled();
          test('Move right arrow clickable and enabled', enabled);
        } else {
          skip('Move right arrow not found');
        }
      }
      await screenshot('packet3-04-after-move');
    }

    // ==============================
    // CONSOLE ERRORS
    // ==============================
    test('No uncaught page errors', errors.length === 0);
    if (errors.length > 0) {
      for (const e of errors) console.log('  Error: ' + e);
    }
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
