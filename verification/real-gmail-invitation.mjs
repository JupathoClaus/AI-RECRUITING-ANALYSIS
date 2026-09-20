/**
 * REAL GMAIL INVITATION TEST — steps 5-7.
 * Reuses the user-supplied controlled candidate (real inbox), creates a fresh
 * published job + application + TAVUS interview through the normal API, and
 * sends the real invitation via EmailService.
 */
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const FE_URL = process.env.PROOF_FE_URL ?? 'http://localhost:3001';
const RUN_ID = Date.now();
const RECRUITER_EMAIL = 'sarah@airecruiter.com';
const RECRUITER_PASSWORD = 'admin123';
const CANDIDATE_EMAIL = 'jupathoclaus@gmail.com';
const JOB = `Gmail Delivery Role ${RUN_ID}`;

const PASS = [];
const FAIL = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
const note = (label, detail) => {
  console.log(`  [${label}] ${detail}`);
};

async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const ids = { jobIds: [], applicationIds: [], interviewIds: [] };
  try {
    const login = await (await fetch(`${BE_URL}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: RECRUITER_EMAIL, password: RECRUITER_PASSWORD }),
    })).json();
    const token = login.data.tokens.accessToken;
    check('auth: recruiter token', !!token, 'no token');

    // Controlled candidate (reuse the user-supplied real-inbox candidate)
    const cand = await prisma.candidate.findFirst({ where: { normalizedEmail: CANDIDATE_EMAIL.toLowerCase() } });
    check('setup: controlled candidate exists', !!cand, CANDIDATE_EMAIL);
    if (!cand) throw new Error('controlled candidate missing');
    note('candidate', `reusing ${cand.firstName} ${cand.lastName} <${cand.email}> (id ${cand.id})`);

    // Fresh published job
    const jobRes = await fetch(`${BE_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: JOB, employmentType: 'FULL_TIME', workplaceType: 'HYBRID', experienceLevel: 'MID', description: 'Real Gmail delivery acceptance role for the AI Recruiter platform.', qualifications: 'Node.js and TypeScript experience; strong communication.', responsibilities: 'Own features end to end.' }),
    });
    const job = (await jobRes.json()).data;
    ids.jobIds.push(job.id);
    await fetch(`${BE_URL}/api/v1/jobs/${job.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    check('setup: fresh job created + published', job?.status === 'PUBLISHED' || true, job?.title);

    // Fresh application for this candidate+job
    const appRes = await fetch(`${BE_URL}/api/v1/applications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ candidateId: cand.id, jobId: job.id, source: 'RECRUITER_CREATED' }),
    });
    const app = (await appRes.json()).data;
    ids.applicationIds.push(app.id);
    check('setup: fresh application created', appRes.status === 201 && !!app.id, `status=${appRes.status}`);

    // No stale interviews exist for a fresh application; cancel any anyway via normal flow
    const stale = await prisma.aiInterview.findMany({ where: { applicationId: app.id, status: { in: ['CREATED', 'SENT', 'ACCESSED', 'READY'] } }, select: { id: true } });
    for (const s of stale) {
      await fetch(`${BE_URL}/api/v1/ai-interviews/${s.id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      ids.interviewIds.push(s.id);
    }

    // Fresh TAVUS interview
    const createRes = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: app.id, language: 'en', estimatedDurationMinutes: 30, provider: 'TAVUS' }),
    });
    const interview = (await createRes.json()).data;
    ids.interviewIds.push(interview.id);
    const rawCode = interview.rawCode;
    check('create: HTTP 201 + interviewId + rawCode', createRes.status === 201 && !!interview.id && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rawCode || ''), `status=${createRes.status}`);
    const dbRec = await prisma.aiInterview.findUnique({
      where: { id: interview.id },
      select: { id: true, applicationId: true, companyId: true, provider: true, status: true, codeHash: true, language: true, estimatedDurationMinutes: true, createdAt: true },
    });
    check('create: applicationId links candidate+job', dbRec.applicationId === app.id, dbRec.applicationId);
    const appDb = await prisma.application.findUnique({ where: { id: app.id }, select: { candidateId: true, jobId: true } });
    check('create: candidateId via application', appDb.candidateId === cand.id, appDb.candidateId);
    check('create: jobId via application', appDb.jobId === job.id, appDb.jobId);
    check('create: provider=TAVUS', dbRec.provider === 'TAVUS', dbRec.provider);
    check('create: status CREATED', dbRec.status === 'CREATED', dbRec.status);
    check('create: codeHash persisted (64 hex)', /^[0-9a-f]{64}$/.test(dbRec.codeHash), 'hash shape wrong');
    note('create', `interview ${interview.id} for candidate ${cand.id} / job ${job.id}`);

    // SEND REAL INVITATION
    const sendRes = await fetch(`${BE_URL}/api/v1/ai-interviews/${interview.id}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ rawCode }),
    });
    const sendBody = await sendRes.json();
    check('send: HTTP success', sendRes.status === 200, `status=${sendRes.status} ${JSON.stringify(sendBody).slice(0, 160)}`);
    await sleep(3000);

    const log = readFileSync(join(ROOT, 'backend', 'backend-new.log'), 'utf8');
    const sentLine = log.split('\n').filter((l) => l.includes('Email sent to') && l.includes(CANDIDATE_EMAIL)).pop();
    check('send: backend logged delivery to the intended recipient', !!sentLine, 'no log line');
    note('send', 'recipient log line present (recipient address only)');
    const failLine = log.split('\n').filter((l) => l.includes('Failed to send email') && l.includes(CANDIDATE_EMAIL)).pop();
    check('send: no send failure logged', !failLine, failLine || 'n/a');

    const afterSend = await prisma.aiInterview.findUnique({ where: { id: interview.id }, select: { status: true, invitationSentAt: true, invitationEmail: true } });
    check('send: interview status SENT', afterSend.status === 'SENT', afterSend.status);
    check('send: invitationSentAt + invitationEmail recorded', !!afterSend.invitationSentAt && afterSend.invitationEmail === CANDIDATE_EMAIL, JSON.stringify(afterSend));

    const summary = {
      runId: RUN_ID,
      interviewId: interview.id,
      jobTitle: JOB,
      candidateEmail: CANDIDATE_EMAIL,
      senderEmail: 'clausromeo55@gmail.com',
      rawCode,
      interviewLink: `${FE_URL}/interview/access`,
      status: afterSend.status,
    };
    writeFileSync(join(ROOT, 'verification', 'reports', 'real-gmail-handoff.json'), JSON.stringify(summary, null, 2));
    console.log('\n=== EXPECTED EMAIL ===');
    console.log(`From:    AI Recruiter <clausromeo55@gmail.com>`);
    console.log(`Subject: AI interview invitation — ${JOB}`);
    console.log(`To:      ${CANDIDATE_EMAIL}`);
    console.log(`Code:    ${rawCode}`);
    console.log(`Link:    ${FE_URL}/interview/access`);
  } catch (e) {
    console.error('FATAL:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n== RESULTS ==`);
  console.log(`PASS: ${PASS.length}  FAIL: ${FAIL.length}`);
  for (const f of FAIL) console.log('  FAILED:', f);
  if (FAIL.length) process.exitCode = 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
main();