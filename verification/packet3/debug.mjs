import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('response', resp => {
    if (resp.url().includes('/api/v1/')) {
      console.log('API ' + resp.status() + ' ' + resp.url().substring(0, 120));
    }
  });

  // Login
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('--- LOGIN OK ---');

  // Go to pipeline
  await page.goto('http://localhost:3001/pipeline', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  const body = await page.textContent('body');
  console.log('Page text (first 2000 chars):');
  console.log(body.substring(0, 2000));

  // Check what select elements exist
  const selects = await page.locator('select, [role="combobox"], [role="listbox"], [data-slot="select-trigger"]').all();
  console.log('\nSelect/combobox elements: ' + selects.length);

  for (const sel of selects) {
    const tag = await sel.evaluate(el => el.tagName + ' ' + el.getAttribute('role') + ' ' + el.className);
    console.log('  ' + tag.substring(0, 120));
  }

  // Check for pipeline stages
  const stageHeaders = await page.locator('h3').all();
  console.log('\nH3 elements:');
  for (const h of stageHeaders) {
    console.log('  H3: "' + (await h.textContent()) + '"');
  }

  // Check what buttons exist
  const allBtns = await page.locator('button').all();
  console.log('\nButton texts:');
  for (const b of allBtns) {
    const t = (await b.textContent()).trim();
    if (t.length > 0 && t.length < 40) console.log('  "' + t + '"');
  }

  await browser.close();
})();
