import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const JOB_ID = 'a65d75e1-2d4c-4f11-81d8-d99875fb5989';

  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Get one app in detail
  const appDetail = await page.evaluate(async () => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/applications?limit=5', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    const apps = json.data || [];
    return apps.map(a => ({
      id: a.id,
      candidate: a.candidate ? (a.candidate.firstName + ' ' + a.candidate.lastName) : 'none',
      jobId: a.job?.id,
      stageId: a.stageId,
      stageName: a.stage?.name,
      version: a.version,
      status: a.status,
      displayStatus: a.displayStatus,
    }));
  }, JOB_ID);
  console.log('Applications:');
  for (const a of appDetail) {
    console.log(JSON.stringify(a, null, 2));
  }

  // Get pipeline stages with IDs
  const stagesResult = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/pipeline', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return json.data;
  }, JOB_ID);
  console.log('\nPipeline data:');
  console.log(JSON.stringify(stagesResult, null, 2));

  await browser.close();
})();
