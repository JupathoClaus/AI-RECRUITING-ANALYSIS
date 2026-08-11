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

  // Get stages
  const stages = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/pipeline', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data?.stages || []).sort((a, b) => a.sortOrder - b.sortOrder).map(s => ({ id: s.id, name: s.name }));
  }, JOB_ID);
  console.log('Stages:');
  for (const s of stages) console.log('  ' + s.name + ' (' + s.id + ')');

  // Get all apps with full detail
  const appsDetail = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/applications?limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data || []).filter(a => a.job?.id === jobId).map(a => ({
      id: a.id,
      name: (a.candidate?.firstName || '') + ' ' + (a.candidate?.lastName || ''),
      status: a.status,
      currentStageId: a.currentStage?.id,
      currentStageName: a.currentStage?.name,
      version: a.version,
    }));
  }, JOB_ID);
  console.log('\nApplications:');
  for (const a of appsDetail) console.log('  ' + a.name + ' status=' + a.status + ' stage=' + (a.currentStageName || 'none') + ' ver=' + a.version);

  // Move Alice to Screening (stage 1), Bob to Interview (stage 2)
  const moves = [
    { name: 'Alice', targetIdx: 1 },
    { name: 'Bob', targetIdx: 2 },
  ];

  for (const m of moves) {
    const app = appsDetail.find(a => a.name.startsWith(m.name));
    if (!app) { console.log('\n' + m.name + ' not found'); continue; }

    const stage = stages[m.targetIdx];
    console.log('\nMoving ' + app.name + ' to ' + stage.name + '...');
    console.log('  appId=' + app.id + ' version=' + app.version + ' toStageId=' + stage.id);

    const result = await page.evaluate(async (params) => {
      const token = localStorage.getItem('ai-recruiter-access-token');
      const res = await fetch('http://localhost:3000/api/v1/applications/' + params.appId + '/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ toStageId: params.toStageId, expectedVersion: params.version }),
      });
      const text = await res.text();
      return { status: res.status, body: text.substring(0, 300) };
    }, { appId: app.id, toStageId: stage.id, version: app.version });
    console.log('  Result: ' + result.status + ' ' + result.body);
  }

  // Final check
  console.log('\nAfter moves:');
  const finalApps = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/applications?limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data || []).filter(a => a.job?.id === jobId).map(a => ({
      name: (a.candidate?.firstName || '') + ' ' + (a.candidate?.lastName || ''),
      status: a.status,
      currentStageName: a.currentStage?.name,
    }));
  }, JOB_ID);
  for (const a of finalApps) console.log('  ' + a.name + ' status=' + a.status + ' stage=' + (a.currentStageName || 'none'));

  await browser.close();
})();
