import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/jobs')) {
      console.log('JOBS API: ' + resp.status() + ' ' + resp.url());
      try {
        const json = await resp.json();
        if (json.data && Array.isArray(json.data)) {
          console.log('  Job count: ' + json.data.length);
          for (const j of json.data) {
            console.log('  - ' + j.title + ' (' + j.id + ') ' + j.status);
          }
        } else if (json.data && json.data.data) {
          console.log('  Nested data count: ' + json.data.data.length);
        }
      } catch (e) {
        console.log('  Could not parse: ' + e.message);
      }
    }
  });

  // Login
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log('--- LOGIN OK ---');

  // Navigate to pipeline
  await page.goto('http://localhost:3001/pipeline', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Evaluate store state
  const storeJobs = await page.evaluate(() => {
    // Try to access zustand store through the window
    // Zustand stores are typically available through the module system
    const storeModule = window.__NEXT_DATA__;
    return 'Zustand store not directly accessible from window';
  });
  console.log('Store access: ' + storeJobs);

  // Click filter and check options
  const filterBtn = page.locator('button[role="combobox"]');
  await filterBtn.click();
  await page.waitForTimeout(2000);

  const options = await page.locator('[role="option"]').all();
  console.log('Options count: ' + options.length);
  for (const opt of options) {
    console.log('  "' + (await opt.textContent()) + '"');
  }

  await browser.close();
})();
