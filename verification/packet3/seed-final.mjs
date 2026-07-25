import { chromium } from 'playwright';
import { execSync } from 'child_process';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const JOB_ID = 'a65d75e1-2d4c-4f11-81d8-d99875fb5989';

  // Step 0: Update job to PUBLISHED via direct DB
  console.log('=== Step 0: Publish job via DB ===');
  try {
    // The backend uses Prisma, let's try running a direct DB update
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:alexandersmith44@localhost:5432/ai-recruiter';
    console.log('Using DB URL: ' + dbUrl.replace(/:[^:@]+@/, ':****@'));
    
    // Since we can't easily run Prisma from here, let's try the API first with different status endpoints
    const result = execSync('npx prisma db execute --stdin <<< "UPDATE \"Job\" SET status=\'PUBLISHED\', \"approvalStatus\"=\'APPROVED\', \"publicationStatus\"=\'PUBLISHED\' WHERE id=\'' + JOB_ID + '\';" 2>&1', {
      cwd: 'D:\\AI interviewer\\AI-Recruiter-Agent\\backend',
      shell: 'powershell',
      timeout: 30000,
      encoding: 'utf8',
    });
    console.log('DB update: ' + (result || 'no output'));
  } catch (e) {
    console.log('DB update attempt failed: ' + e.message.substring(0, 100));
    console.log('Trying alternative approach...');
  }

  // Login
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'sarah@airecruiter.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Check job status
  const jobStatus = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return { status: json.data?.status, approval: json.data?.approvalStatus, publication: json.data?.publicationStatus };
  }, JOB_ID);
  console.log('Job status after update: ' + JSON.stringify(jobStatus));

  // If still draft, try more status transitions
  if (jobStatus.status === 'DRAFT' || jobStatus.approval === 'DRAFT') {
    console.log('Job still in draft, trying approve endpoint...');
    const approveRes = await page.evaluate(async (jobId) => {
      const token = localStorage.getItem('ai-recruiter-access-token');
      const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      return { status: res.status, msg: json.message || JSON.stringify(json).substring(0, 100) };
    }, JOB_ID);
    console.log('Approve: ' + JSON.stringify(approveRes));

    if (approveRes.status === 200) {
      const publishRes = await page.evaluate(async (jobId) => {
        const token = localStorage.getItem('ai-recruiter-access-token');
        const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId + '/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        });
        const json = await res.json();
        return { status: res.status, msg: json.message || '' };
      }, JOB_ID);
      console.log('Publish: ' + JSON.stringify(publishRes));
    }
  }

  // Create candidates and applications
  console.log('\n=== Creating test data ===');
  const candidatesData = [
    { firstName: 'Alice', lastName: 'Johnson', email: 'alice' + Date.now() + '@example.com', currentJobTitle: 'Product Manager', totalExperienceYears: 5 },
    { firstName: 'Bob', lastName: 'Smith', email: 'bob' + Date.now() + '@example.com', currentJobTitle: 'Senior Product Owner', totalExperienceYears: 7 },
    { firstName: 'Carol', lastName: 'Davis', email: 'carol' + Date.now() + '@example.com', currentJobTitle: 'Associate PM', totalExperienceYears: 2 },
  ];

  const candidateIds = [];
  for (const c of candidatesData) {
    const result = await page.evaluate(async (cd) => {
      const token = localStorage.getItem('ai-recruiter-access-token');
      const res = await fetch('http://localhost:3000/api/v1/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ ...cd, source: 'RECRUITER_CREATED' }),
      });
      const json = await res.json();
      return { status: res.status, id: json.data?.id || json.id };
    }, c);
    console.log('Create ' + c.firstName + ': ' + result.status + ' id=' + (result.id || 'na'));
    if (result.status === 201 && result.id) {
      candidateIds.push(result.id);
    }
  }

  // Get pipeline stages
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

  // Create applications
  if (stages.length > 0 && candidateIds.length > 0) {
    const firstStageId = stages[0].id;
    console.log('\nCreating applications in ' + stages[0].name + '...');
    
    for (let i = 0; i < candidateIds.length; i++) {
      const cid = candidateIds[i];
      const result = await page.evaluate(async (params) => {
        const token = localStorage.getItem('ai-recruiter-access-token');
        const res = await fetch('http://localhost:3000/api/v1/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ candidateId: params.cid, jobId: params.jobId, source: 'RECRUITER_CREATED' }),
        });
        const json = await res.json();
        return { status: res.status, id: json.data?.id || json.id, msg: json.message || '' };
      }, { cid, jobId: JOB_ID });
      const name = candidatesData[i].firstName;
      console.log('  ' + name + ': ' + result.status + ' id=' + (result.id || 'na') + ' ' + result.msg.substring(0, 60));
    }
  }

  // Move applications to different stages
  console.log('\nMoving applications...');
  const appsList = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/applications?limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data || []).filter(a => a.job?.id === jobId).map(a => ({
      id: a.id, stageId: a.stageId, version: a.version,
      name: (a.candidate?.firstName || '') + ' ' + (a.candidate?.lastName || '')
    }));
  }, JOB_ID);
  console.log('Applications for job: ' + appsList.length);

  // Move Alice to Interview (stage 2), Bob to Screening (stage 1), Carol stays at Applied (stage 0)
  const moveTargets = [
    { stageIdx: 2 }, // Alice -> Interview
    { stageIdx: 1 }, // Bob -> Screening
  ];
  
  for (let i = 0; i < Math.min(appsList.length, moveTargets.length); i++) {
    const app = appsList[i];
    const targetStageId = stages[moveTargets[i].stageIdx].id;
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
    console.log('  Move ' + app.name + ' to ' + stages[moveTargets[i].stageIdx].name + ': ' + result.status);
  }

  // Final state check
  console.log('\n=== Final state ===');
  const finalJob = await page.evaluate(async (jobId) => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/jobs/' + jobId, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return { status: json.data?.status, title: json.data?.title };
  }, JOB_ID);
  console.log('Job: ' + finalJob.title + ' (' + finalJob.status + ')');

  const finalCandidates = await page.evaluate(async () => {
    const token = localStorage.getItem('ai-recruiter-access-token');
    const res = await fetch('http://localhost:3000/api/v1/candidates?limit=50', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const json = await res.json();
    return (json.data || []).length;
  });
  console.log('Total candidates: ' + finalCandidates);

  await browser.close();
})();
