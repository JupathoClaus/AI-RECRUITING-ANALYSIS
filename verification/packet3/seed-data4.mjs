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

  // Get existing candidates
  const existingCandidates = await page.evaluate(async () => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/candidates?limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data || []).map(c => ({ id: c.id, name: c.firstName + ' ' + c.lastName }));
  });
  console.log('Existing candidates:');
  for (const c of existingCandidates) console.log('  ' + c.name + ' (' + c.id + ')');

  // Update job status directly via PATCH
  // Try to approve then publish via the backend API
  const updateStatus = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    // First approve
    const r1 = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    });
    const j1 = await r1.json();
    // Then publish
    const r2 = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    });
    const j2 = await r2.json();
    return { approve: { status: r1.status, msg: j1.message || JSON.stringify(j1).substring(0, 100) }, publish: { status: r2.status, msg: j2.message || JSON.stringify(j2).substring(0, 100) } };
  }, JOB_ID);
  console.log('\nApprove result: ' + JSON.stringify(updateStatus.approve));
  console.log('Publish result: ' + JSON.stringify(updateStatus.publish));

  // Create applications for each candidate
  const stages = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/pipeline', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data?.stages || []).map(s => ({ id: s.id, name: s.name }));
  }, JOB_ID);
  console.log('Stages: ' + stages.length);
  
  if (stages.length > 0 && existingCandidates.length > 0) {
    const firstStageId = stages[0].id;
    console.log('\nCreating applications...');
    for (const c of existingCandidates) {
      const result = await page.evaluate(async (params) => {
        const token = localStorage.getItem('ai-recruiter-access-token');
        const res = await fetch('http://localhost:3000/api/v1/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ candidateId: params.cid, jobId: params.jobId, source: 'RECRUITER_CREATED' }),
        });
        const json = await res.json();
        return { status: res.status, id: json.data?.id || json.id, msg: json.message || '' };
      }, { cid: c.id, jobId: JOB_ID });
      console.log('  ' + c.name + ': ' + result.status + ' id=' + (result.id || 'na') + ' ' + result.msg.substring(0, 80));
    }
  }

  // Move some applications to later stages
  console.log('\nMoving applications between stages...');
  const appsList = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/applications?limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data || []).filter(a => a.job?.id === jobId).map(a => ({ id: a.id, candidateName: a.candidate?.firstName + ' ' + a.candidate?.lastName, stageId: a.stageId, version: a.version }));
  }, JOB_ID);
  console.log('Apps for this job: ' + appsList.length);
  for (const a of appsList) console.log('  ' + a.candidateName + ' (' + a.id + ') stage=' + a.stageId + ' version=' + a.version);

  // Move to next stages
  if (stages.length >= 3) {
    for (let i = 0; i < appsList.length && i < stages.length - 1; i++) {
      const app = appsList[i];
      const targetStageId = stages[i + 1].id;
      const result = await page.evaluate(async (params) => {
        const token = localStorage.getItem('ai-recruiter-access-token');
        const res = await fetch('http://localhost:3000/api/v1/applications/' + params.appId + '/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ toStageId: params.targetStageId, expectedVersion: params.version }),
        });
        const json = await res.json();
        return { status: res.status, msg: json.message || '' };
      }, { appId: app.id, targetStageId, version: app.version });
      console.log('  Move ' + app.candidateName + ' to ' + stages[i + 1].name + ': ' + result.status + ' ' + result.msg);
    }
  }

  console.log('\nDone!');
  await browser.close();
})();
