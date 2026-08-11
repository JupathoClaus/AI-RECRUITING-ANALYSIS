import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const snap = (name) => page.screenshot({ path: `verification/packet3/${name}.png` });

  // 1. Login
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await snap('01-login-page');
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  await page.waitForTimeout(3000);
  await snap('02-dashboard');

  // 2. Jobs page
  await page.locator('a[href="/jobs"]').click();
  await page.waitForTimeout(3000);
  await snap('03-jobs-page');

  // 3. Pipeline page - filter closed
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('a[href="/pipeline"]').click();
  await page.waitForTimeout(5000);
  await snap('04-pipeline-empty');

  // 4. Pipeline with job selected
  const filterBtn = page.locator('[role="combobox"]');
  await filterBtn.click();
  await page.waitForTimeout(1500);
  const options = await page.locator('[role="option"]').all();
  if (options.length > 1) {
    await options[1].click();
    await page.waitForTimeout(5000);
    // Wait for stages and candidates
    for (let i = 0; i < 15; i++) {
      const txt = await page.locator('body').textContent();
      if (txt.includes('Applied') && txt.includes('Alice')) break;
      await page.waitForTimeout(1000);
    }
    await snap('05-pipeline-with-candidates');
  }

  await browser.close();
  console.log('Screenshots captured');
})();
