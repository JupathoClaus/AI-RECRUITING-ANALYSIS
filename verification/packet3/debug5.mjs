import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  let apiCalls = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/')) {
      apiCalls.push({ url: resp.url().split('?')[0], status: resp.status(), time: Date.now() });
    }
  });

  // Login
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('1. Login page loaded');
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(5000);
  console.log('2. Dashboard loaded (waited 5s)');

  // Now navigate directly to pipeline
  await page.goto('http://localhost:3001/pipeline', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('3. Pipeline page loaded (waited 3s)');

  // Dump API calls
  console.log('\nAPI calls during session:');
  const jobCalls = apiCalls.filter(c => c.url.includes('/jobs') && !c.url.includes('/pipeline'));
  console.log(`Jobs API calls: ${jobCalls.length}`);
  for (const c of jobCalls) {
    console.log(`  ${c.status} ${c.url}`);
  }
  
  const pipelineCalls = apiCalls.filter(c => c.url.includes('/jobs/') && c.url.includes('/pipeline'));
  console.log(`Pipeline API calls: ${pipelineCalls.length}`);
  for (const c of pipelineCalls) {
    console.log(`  ${c.status} ${c.url}`);
  }

  const candidateCalls = apiCalls.filter(c => c.url.includes('/candidates'));
  console.log(`Candidate API calls: ${candidateCalls.length}`);
  for (const c of candidateCalls) {
    console.log(`  ${c.status} ${c.url}`);
  }

  // Try clicking the filter - inspect DOM for job list
  const filterBtn = page.locator('[role="combobox"]');
  if (await filterBtn.count() > 0) {
    await filterBtn.click();
    await page.waitForTimeout(2000);
    const items = await page.locator('[role="option"]').all();
    console.log(`\nFilter options: ${items.length}`);
    for (const item of items) {
      console.log(`  "${await item.textContent()}" (value: ${await item.getAttribute('value')})`);
    }
  } else {
    console.log('Filter button not found');
  }

  await page.screenshot({ path: 'verification/packet3/debug5-pipeline.png', fullPage: false });
  console.log('\nScreenshot saved');

  await browser.close();
})();
