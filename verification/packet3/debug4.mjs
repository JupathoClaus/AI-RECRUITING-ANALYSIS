import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/jobs?limit=100')) {
      console.log('JOBS API call detected');
    }
  });

  // Login and go to dashboard (which calls fetchCandidates)
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(5000);
  console.log('--- ON DASHBOARD ---');

  // Now navigate to jobs page to confirm job exists
  await page.goto('http://localhost:3001/jobs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const jobsBody = await page.textContent('body');
  console.log('JOBS PAGE: contains "Product Manager": ' + jobsBody.includes('Product Manager'));
  console.log('JOBS PAGE: contains "Draft": ' + jobsBody.includes('Draft'));

  // Now go to pipeline
  await page.goto('http://localhost:3001/pipeline', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check the React component state
  // The pipeline component renders the filter from useStore().jobs
  // Let's examine the DOM for the select options
  console.log('\n--- PIPELINE PAGE DOM ---');
  
  // Click the filter to open dropdown
  const filterBtn = page.locator('[role="combobox"]');
  console.log('Filter exists: ' + (await filterBtn.count() > 0));
  
  if (await filterBtn.count() > 0) {
    await filterBtn.click();
    await page.waitForTimeout(2000);
    
    // Get all list items/options
    const items = await page.locator('[role="option"]').all();
    console.log('Options found: ' + items.length);
    for (const item of items) {
      console.log('  Option text: "' + (await item.textContent()) + '"');
      console.log('  Option value: ' + (await item.getAttribute('value')));
    }
    
    // Close by clicking elsewhere
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
  }

  // Let's try using the dashboard link to navigate instead of direct URL
  console.log('\n--- TRY NAVIGATION VIA SIDEBAR ---');
  // Click pipeline in sidebar
  const pipeLink = page.locator('a').filter({ hasText: 'Pipeline' });
  console.log('Pipeline link found: ' + (await pipeLink.count() > 0));
  
  if (await pipeLink.count() > 0) {
    await pipeLink.click();
    await page.waitForTimeout(5000);
    
    // Now check the filter
    const filter2 = page.locator('[role="combobox"]');
    if (await filter2.count() > 0) {
      await filter2.click();
      await page.waitForTimeout(2000);
      
      const items2 = await page.locator('[role="option"]').all();
      console.log('After sidebar nav - options: ' + items2.length);
      for (const item of items2) {
        console.log('  "' + (await item.textContent()) + '"');
      }
    }
  }

  // Check if the jobs might be rendered differently
  // The pipeline page uses a Select component with jobs from the store
  // Maybe the store structure has changed
  console.log('\n--- CHECK FOR JOB LIST ON PAGE ---');
  const allSelectText = await page.locator('body').textContent();
  const hasJobInText = allSelectText.includes('Product Manager');
  console.log('Product Manager visible on page: ' + hasJobInText);
  
  if (hasJobInText) {
    // Find where Product Manager appears
    const pmElements = await page.locator('text=Product Manager').all();
    console.log('Product Manager element count: ' + pmElements.length);
    for (const el of pmElements) {
      const tag = await el.evaluate(e => e.tagName + ' ' + e.className);
      console.log('  Tag: ' + tag.substring(0, 100));
    }
  }

  await browser.close();
})();
