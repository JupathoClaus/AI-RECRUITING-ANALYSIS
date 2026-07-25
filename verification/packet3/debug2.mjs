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

  // First check jobs page
  console.log('\n--- JOBS PAGE ---');
  await page.goto('http://localhost:3001/jobs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  const jobBodies = await page.locator('body').textContent();
  console.log('Jobs preview: ' + jobBodies.substring(0, 1000));
  
  // Look for specific job
  const hasSenior = jobBodies.includes('Senior');
  console.log('Contains Senior Software Engineer: ' + hasSenior);

  // Now go to pipeline
  console.log('\n--- PIPELINE PAGE ---');
  await page.goto('http://localhost:3001/pipeline', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Click the filter dropdown (All Positions)
  const filterBtn = page.locator('button[role="combobox"]');
  console.log('Filter button count: ' + await filterBtn.count());
  
  await filterBtn.click();
  await page.waitForTimeout(1500);

  // Check for options
  const options = page.locator('[role="option"]');
  const optCount = await options.count();
  console.log('Options count: ' + optCount);
  for (let i = 0; i < optCount; i++) {
    console.log('  Option ' + i + ': "' + (await options.nth(i).textContent()) + '"');
  }

  if (optCount > 0) {
    // Select first option that isn't "All Positions"
    for (let i = 0; i < optCount; i++) {
      const text = await options.nth(i).textContent();
      if (text && !text.includes('All Positions')) {
        console.log('Selecting: ' + text);
        await options.nth(i).click();
        await page.waitForTimeout(4000);
        break;
      }
    }

    // Check what shows up
    const afterBody = await page.locator('body').textContent();
    console.log('\nAfter selection - page text:');
    console.log(afterBody.substring(0, 2000));
    
    // Check for stages
    const h3s = await page.locator('h3').all();
    console.log('\nH3s:');
    for (const h of h3s) {
      console.log('  "' + (await h.textContent()) + '"');
    }

    // Check for columns/boards
    const stageEls = await page.locator('[class*="w-["], [class*="flex-shrink-0"]').all();
    console.log('\nPotential stage elements: ' + stageEls.length);

    // Look for stage names
    const strongEls = await page.locator('strong, h3, [class*="font-semibold"]').all();
    console.log('\nStrong/semibold text:');
    for (const s of strongEls) {
      const t = (await s.textContent()).trim();
      if (t.length > 0 && t.length < 30) console.log('  "' + t + '"');
    }
  }

  await browser.close();
})();
