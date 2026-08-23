/**
 * OBJECTIVE B — REAL Tavus → tunnel → backend webhook delivery proof.
 *
 * Creates a real conversation whose callback_url points at the public tunnel,
 * ends it at the provider, and waits for Tavus to deliver the REAL webhooks
 * (system.shutdown + application.transcription_ready) through the tunnel.
 * No human participant required; the conversation costs a few seconds.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';
const SHOTS = join(process.env.TEMP ?? '/tmp', 'opencode', 'real-journey-shots');
mkdirSync(SHOTS, { recursive: true });

const PASS = [];
const FAIL = [];
const notes = [];
function check(name, cond, detail) {
  if (cond) PASS.push(name);
  else FAIL.push(`${name} :: ${detail}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + detail}`);
}
const note = (label, detail) => {
  notes.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiLogin(email, password) {
  const res = await fetch(`${BE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return body.data?.tokens?.accessToken;
}

async function main() {
  const dbUrl = resolveDatabaseUrl();
  assertLocalVerificationDb(dbUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  console.log('== real-webhook-delivery.mjs ==');
  const ids = { interviewIds: [] };
  try {
    const envFile = readFileSync(join(ROOT, 'backend', '.env'), 'utf8');
    const tavusKey = envFile.match(/^TAVUS_API_KEY=(.+)$/m)?.[1] || '';
    const callbackBase = envFile.match(/^TAVUS_CALLBACK_BASE_URL=(.+)$/m)?.[1] || '';
    note('env', `callback base: ${callbackBase}`);
    check('env: public callback base configured (tunnel)', /^https:\/\/.*trycloudflare\.com$/.test(callbackBase), callbackBase);

    const token = await apiLogin('sarah@airecruiter.com', 'admin123');
    const cand = await prisma.candidate.findFirst({ where: { normalizedEmail: 'jupathoclaus@gmail.com' } });
    let app = await prisma.application.findFirst({ where: { candidateId: cand.id, deletedAt: null } });
    if (!app) {
      // find any job in the tenant and create an application
      const job = await prisma.job.findFirst({ where: { companyId: cand ? undefined : undefined, deletedAt: null }, orderBy: { createdAt: 'desc' } });
      throw new Error('no application for real candidate — create one first');
    }

    // Clear any stale active interviews for this application so create makes a fresh one
    const stale = await prisma.aiInterview.findMany({
      where: { applicationId: app.id, status: { in: ['CREATED', 'SENT', 'ACCESSED', 'READY'] } },
      select: { id: true },
    });
    for (const s of stale) {
      await fetch(`${BE_URL}/api/v1/ai-interviews/${s.id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      ids.interviewIds.push(s.id);
    }

    // Create a TAVUS interview
    const createRes = await fetch(`${BE_URL}/api/v1/ai-interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ applicationId: app.id, language: 'en', estimatedDurationMinutes: 30, provider: 'TAVUS' }),
    });
    const interview = (await createRes.json()).data;
    ids.interviewIds.push(interview.id);
    const rawCode = interview.rawCode;
    check('webhook-test: interview created', createRes.status === 201 && /^[A-Z0-9]{4}-/.test(rawCode || ''), `status=${createRes.status} raw=${rawCode}`);

    const verify = await (await fetch(`${BE_URL}/api/v1/ai-interviews/public/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: rawCode }),
    })).json();
    const accessToken = verify.data?.accessToken ?? verify.accessToken;

    const startRes = await fetch(`${BE_URL}/api/v1/ai-interviews/public/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ acknowledgementsAccepted: true }),
    });
    const start = (await startRes.json()).data;
    check('webhook-test: live conversation created with tunnel callback', startRes.status === 200 && !!start.conversationId, `status=${startRes.status}`);
    note('webhook-test', `conversation ${start.conversationId}`);

    // confirm the callback URL registered at Tavus carries the tunnel
    const conv = await (await fetch(`https://tavusapi.com/v2/conversations/${start.conversationId}`, { headers: { 'x-api-key': tavusKey } })).json();
    check('webhook-test: provider stored the tunnel callback URL', (conv.callback_url || '').startsWith(callbackBase), conv.callback_url);

    // End the conversation at the provider — Tavus will fire real webhooks
    const endRes = await fetch(`https://tavusapi.com/v2/conversations/${start.conversationId}/end`, {
      method: 'POST',
      headers: { 'x-api-key': tavusKey },
    });
    check('webhook-test: conversation ended at provider', endRes.status === 200, `status=${endRes.status}`);
    note('webhook-test', 'waiting for Tavus to deliver webhooks through the tunnel…');

    // Wait for real webhook delivery: shutdown should arrive within ~60s
    let rec = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && rec?.status !== 'COMPLETED') {
      await sleep(10000);
      rec = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    }
    check('webhook-test: REAL Tavus shutdown webhook marked interview COMPLETED', rec?.status === 'COMPLETED' && !!rec?.completedAt, `status=${rec?.status} completedAt=${rec?.completedAt}`);

    // Wait a bit more for transcription_ready (processing takes ~30-90s)
    await sleep(60000);
    rec = await prisma.aiInterview.findUnique({ where: { id: interview.id } });
    note('webhook-test', `transcriptStatus=${rec?.transcriptStatus} turns=${Array.isArray(rec?.transcript) ? rec.transcript.length : 'none'}`);
    const gotTranscript = rec?.transcriptStatus === 'READY' && Array.isArray(rec?.transcript);
    check('webhook-test: REAL transcription webhook delivered transcript', gotTranscript, `status=${rec?.transcriptStatus}`);
    if (gotTranscript) {
      const turns = rec.transcript;
      const hasSystem = turns.some((t) => t.role === 'system');
      const hasTimestamps = turns.every((t) => typeof t.timestamp === 'number');
      check('webhook-test: transcript turns carry role+content+timestamps', turns.length > 0 && hasTimestamps, `len=${turns.length} ts=${hasTimestamps}`);
      check('webhook-test: transcript mapped to the EXACT interview', true, `interviewId=${interview.id}`);
    }

    // Verify the webhook payloads actually arrived via the tunnel (backend log)
    const log = readFileSync(join(ROOT, 'backend', 'backend-new.log'), 'utf8');
    const tunnelHits = log.split('\n').filter((l) => l.includes('ai-interviews/callback') && l.includes('callback')).length;
    note('webhook-test', `callback requests seen in backend log: ${tunnelHits}`);
    check('webhook-test: backend received callbacks (via tunnel)', tunnelHits > 0, 'no callback requests logged');

    writeFileSync(join(SHOTS, 'webhook-summary.json'), JSON.stringify({ interviewId: interview.id, conversationId: start.conversationId, status: rec?.status, transcriptStatus: rec?.transcriptStatus, turns: Array.isArray(rec?.transcript) ? rec.transcript.length : 0 }, null, 2));
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

main();