/**
 * Reports smoke test + CSV export verification (Issue #4).
 * - All report endpoints return 200 with correct shapes for a company that
 *   has a candidate + application.
 * - Candidate-evaluation CSV export downloads with correct headers/rows.
 */
import { createRequire } from 'node:module';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const RUN_ID = Date.now();
const EMAIL = `rpt${RUN_ID}@e2e.com`;
const PASSWORD = `RptPass!${RUN_ID}`;

const PASS = [];
const FAIL = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}

async function main() {
  console.log('== reports-smoke.mjs ==');
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { userId: null, companyId: null, membershipIds: [], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
  try {
    const reg = await fetch(`${BE_URL}/api/v1/auth/register-company`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyName: `Rpt Co ${RUN_ID}`, email: EMAIL, firstName: 'Zed', lastName: 'Yon', password: PASSWORD, passwordConfirmation: PASSWORD, acceptTerms: true }),
    });
    const user = await prisma.user.findUnique({ where: { normalizedEmail: EMAIL.toLowerCase() } });
    const mem = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
    ids.userId = user.id; ids.companyId = mem.companyId; ids.membershipIds.push(mem.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
    await prisma.companySettings.upsert({ where: { companyId: mem.companyId }, update: { requireJobApproval: false }, create: { companyId: mem.companyId, requireJobApproval: false } });
    const login = await fetch(`${BE_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
    const token = (await login.json()).data.tokens.accessToken;

    const jr = await fetch(`${BE_URL}/api/v1/jobs`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: `Rpt Role ${RUN_ID}`, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description: 'Reports smoke role.' }),
    });
    const job = (await jr.json()).data;
    ids.jobIds.push(job.id);
    const pub = await fetch(`${BE_URL}/api/v1/jobs/${job.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    if (pub.status !== 200 && pub.status !== 201) throw new Error(`publish failed ${pub.status}`);

    const cr = await fetch(`${BE_URL}/api/v1/candidates`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ firstName: 'Rpt', lastName: 'Cand', email: `rptc${RUN_ID}@e2e.com`, source: 'RECRUITER_CREATED' }),
    });
    if (cr.status !== 201) throw new Error(`candidate create failed ${cr.status}: ${(await cr.text()).slice(0, 200)}`);
    const candBody = await cr.json();
    const cand = candBody.data ?? candBody;
    if (!cand || !cand.id) throw new Error(`candidate create response unexpected: ${JSON.stringify(candBody).slice(0, 300)}`);
    ids.candidateIds.push(cand.id);
    const ar = await fetch(`${BE_URL}/api/v1/applications`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ candidateId: cand.id, jobId: job.id, source: 'RECRUITER_CREATED' }),
    });
    if (ar.status !== 201) throw new Error(`application create failed ${ar.status}: ${(await ar.text()).slice(0, 200)}`);
    const appBody = await ar.json();
    const app = appBody.data ?? appBody;
    ids.applicationIds.push(app.id);

    const get = async (path) => {
      const r = await fetch(`${BE_URL}/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } });
      let body = null;
      try { body = await r.json(); } catch { /* empty */ }
      return { status: r.status, body };
    };

    // 1) candidate evaluation
    const ce = await get('/reports/candidate-evaluation');
    check('candidate-evaluation 200 + 1 row', ce.status === 200 && (ce.body.data || []).length === 1, `status=${ce.status} rows=${ce.body?.data?.length}`);

    // 2) interview summary (no interviews -> 200, empty)
    const ism = await get('/reports/interview-summary');
    check('interview-summary 200', ism.status === 200, `status=${ism.status}`);

    // 3) pipeline report
    const pl = await get('/reports/pipeline');
    check('pipeline report 200 + totalApplications=1', pl.status === 200 && (pl.body?.data?.totalApplications ?? pl.body?.totalApplications) === 1, `status=${pl.status} total=${pl.body?.data?.totalApplications ?? pl.body?.totalApplications}`);

    // 4) time-to-hire (no hires -> 200)
    const tth = await get('/reports/time-to-hire');
    check('time-to-hire 200', tth.status === 200, `status=${tth.status}`);

    // 5) source effectiveness
    const se = await get('/reports/source-effectiveness');
    check('source-effectiveness 200', se.status === 200 && Array.isArray(se.body?.data ?? se.body), `status=${se.status}`);

    // 6) job summary
    const js = await get('/reports/job-summary');
    check('job-summary 200 + applicationCount=1', js.status === 200 && (js.body.data || []).some((r) => r.applicationCount === 1), `status=${js.status}`);

    // 7) activity
    const ac = await get('/reports/activity');
    check('activity 200', ac.status === 200, `status=${ac.status}`);

    // 8) CSV export for candidate-evaluation
    const exp = await fetch(`${BE_URL}/api/v1/reports/candidate-evaluation/export`, { headers: { authorization: `Bearer ${token}` } });
    const csvText = await exp.text();
    const headerOk = csvText.includes('Candidate Name') && csvText.includes('Application ID') && csvText.includes('Job Title');
    const rowOk = csvText.includes('Rpt Cand') && csvText.includes(`Rpt Role ${RUN_ID}`);
    const lines = csvText.trim().split('\n');
    check('csv export 200 + correct headers', exp.status === 200 && headerOk, `status=${exp.status}`);
    check('csv export contains the application row', rowOk, 'row missing');
    check('csv row count = 2 (header + 1 row)', lines.length === 2, `lines=${lines.length}`);

    // 9) tenant isolation: another company sees nothing
    const regB = await fetch(`${BE_URL}/api/v1/auth/register-company`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyName: `RptB Co ${RUN_ID}`, email: `rptb${RUN_ID}@e2e.com`, firstName: 'Zed', lastName: 'Yon', password: `RptBPass!${RUN_ID}`, passwordConfirmation: `RptBPass!${RUN_ID}`, acceptTerms: true }),
    });
    const bUser = await prisma.user.findUnique({ where: { normalizedEmail: `rptb${RUN_ID}@e2e.com`.toLowerCase() } });
    const bMem = await prisma.companyMembership.findFirst({ where: { userId: bUser.id } });
    let idsB = { userId: bUser.id, companyId: bMem.companyId, membershipIds: [bMem.id], candidateIds: [], jobIds: [], applicationIds: [], extractionIds: [], storedFileIds: [] };
    await prisma.user.update({ where: { id: bUser.id }, data: { status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.verificationToken.deleteMany({ where: { userId: bUser.id } });
    const loginB = await fetch(`${BE_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `rptb${RUN_ID}@e2e.com`, password: `RptBPass!${RUN_ID}` }) });
    const tokenB = (await loginB.json()).data.tokens.accessToken;
    const ceB = await get('/reports/candidate-evaluation');
    const ceBWithB = await fetch(`${BE_URL}/api/v1/reports/candidate-evaluation`, { headers: { authorization: `Bearer ${tokenB}` } });
    const ceBBody = await ceBWithB.json();
    check('report company scope enforced (company B sees 0 rows)', ceBWithB.status === 200 && (ceBBody.data || []).length === 0, `rows=${ceBBody.data?.length}`);

    console.log(`\n== SUMMARY ==`);
    console.log(`PASS: ${PASS.length}`);
    console.log(`FAIL: ${FAIL.length}`);
    if (FAIL.length) FAIL.forEach((f) => console.log('  - ' + f));
    if (typeof idsB !== 'undefined') await cleanupExact(prisma, idsB, () => {});
  } finally {
    await cleanupExact(prisma, ids, () => {});
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });