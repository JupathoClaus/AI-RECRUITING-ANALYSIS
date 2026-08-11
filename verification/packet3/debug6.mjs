import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  let apiCalls = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/')) {
      const url = resp.url().split('?')[0];
      apiCalls.push({ url, status: resp.status(), time: Date.now() });
      if (resp.url().includes('/jobs')) {
        try {
          const json = await resp.json();
          if (json.data && Array.isArray(json.data)) {
            console.log(`  API ${resp.status()}: ${url} -> ${json.data.length} jobs returned`);
          } else {
            console.log(`  API ${resp.status()}: ${url} -> ${JSON.stringify(json).substring(0, 100)}`);
          }
        } catch(e) {
          console.log(`  API ${resp.status()}: ${url} -> parse error`);
        }
      }
    }
  });

  // Step 1: Login
  console.log('=== STEP 1: Login ===');
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log('Dashboard loaded ✓');

  // Step 2: Navigate to Pipeline via sidebar (SPA navigation)
  console.log('\n=== STEP 2: Navigate to Pipeline via sidebar ===');
  const sidebarLink = page.locator('a[href="/pipeline"], nav a').filter({ hasText: /Pipeline/i });
  console.log('Sidebar link count: ' + (await sidebarLink.count()));
  
  if (await sidebarLink.count() > 0) {
    await sidebarLink.first().click();
  } else {
    // Fallback: use page.goto (full reload - tests resilience)
    console.log('Sidebar link not found, using goto fallback');
    await page.goto('http://localhost:3001/pipeline', { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(5000);
  
  const currentUrl = page.url();
  console.log('Current URL: ' + currentUrl);

  // Step 3: Check job filter
  console.log('\n=== STEP 3: Check job filter ===');
  const filterBtn = page.locator('[role="combobox"]');
  if (await filterBtn.count() > 0) {
    await filterBtn.click();
    await page.waitForTimeout(2000);
    const items = await page.locator('[role="option"]').all();
    console.log(`Filter options: ${items.length}`);
    for (const item of items) {
      console.log(`  "${await item.textContent()}"`);
    }
    if (items.length > 1) {
      console.log('✓ Job filter shows jobs!');
      // Select the first job
      const jobId = await items[1].getAttribute('value');
      console.log(`Selecting job: ${jobId}`);
      await items[1].click();
      await page.waitForTimeout(3000);
      
      // Check if pipeline stages loaded
      const stageElements = page.locator('[role="option"]');
      // Actually after selecting, check for stage columns
      const stageHeaders = page.locator('h3').filter({ hasText: /Sourced|Applied|Screening|Interview|Offer|Hired/i });
      console.log(`Default stage headers: ${await stageHeaders.count()}`);
      
      // Check for Add Stage button
      const addStageBtn = page.locator('button').filter({ hasText: 'Add Stage' });
      console.log(`Add Stage button: ${await addStageBtn.count() > 0 ? '✓' : '✗'}`);
    }
  } else {
    console.log('Filter button not found');
  }

  // Step 4: Check candidates
  console.log('\n=== STEP 4: Candidate status ===');
  const storeJobs = await page.evaluate(() => {
    return 'N/A - zustand not exposed';
  });
  
  const bodyText = await page.locator('body').textContent();
  const hasCandidates = bodyText.includes('No candidates in pipeline') || bodyText.includes('No candidates');
  console.log('No candidates placeholder: ' + hasCandidates);
  
  const candidatesSection = page.locator('text=candidates').first();
  if (await candidatesSection.count() > 0) {
    console.log('Candidates count: ' + (await candidatesSection.textContent()));
  }

  // Step 5: Screenshot
  await page.screenshot({ path: 'verification/packet3/debug6-pipeline.png', fullPage: false });
  
  // Summary
  console.log('\n=== SUMMARY ===');
  const jobApiCalls = apiCalls.filter(c => c.url.includes('/jobs') && !c.url.includes('/pipeline'));
  console.log(`Jobs API calls: ${jobApiCalls.length}`);
  const candidateApiCalls = apiCalls.filter(c => c.url.includes('/candidates'));
  console.log(`Candidates API calls: ${candidateApiCalls.length}`);

  await browser.close();
})();
