/**
 * TENANT ISOLATION PROOF
 *
 * Verifies, against the running production backend, that job analytics are
 * strictly tenant-scoped. A second company that has never touched the first
 * company's job must receive 404 JOB_NOT_FOUND when it asks for that job's
 * analytics — never another company's data.
 *
 * Scenario:
 *   1. Two companies register (A and B), both activated.
 *   2. A creates a job; A can read its analytics (control, 200).
 *   3. B reads A's job analytics -> must be 404 JOB_NOT_FOUND (cross-tenant).
 *   4. B's own analytics overview -> 200 (B's data is fully scoped to B).
 *
 * Every check must hold or the script exits non-zero. Cleanup deletes exactly
 * the two verification companies in dependency order.
 */

import { createRequire } from 'node:module';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
import { resolveDatabaseUrl, assertLocalVerificationDb } from './db-guard.mjs';
import { cleanupExact } from './cleanup.mjs';

const BE_URL = process.env.PROOF_BE_URL ?? 'http://localhost:3000';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolveDatabaseUrl();
}
assertLocalVerificationDb(process.env.DATABASE_URL);
const prisma = new PrismaClient();

const RUN_ID = Date.now();
const SUFFIX = `xt${RUN_ID}`;
const PASSWORD = `Vrf$Gr8!${RUN_ID}`;
const TENANTS = [
  { email: `tenant-a-${SUFFIX}@e2e.com`, company: `Tenant A Co ${RUN_ID}`, first: 'Anne', last: 'Alpha' },
  { email: `tenant-b-${SUFFIX}@e2e.com`, company: `Tenant B Co ${RUN_ID}`, first: 'Bo', last: 'Beta' },
];

const results = [];
const note = (label, detail) => {
  results.push({ label, detail });
  console.log(`  [${label}] ${detail}`);
};
const fail = (label, detail) => {
  const e = new Error(`[${label}] ${detail}`);
  results.push({ label, error: e.message });
  throw e;
};

async function api(path, opts, label) {
  const res = await fetch(`${BE_URL}/api/v1${path}`, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function registerTenant(t) {
  const res = await api('/auth/register-company', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      companyName: t.company,
      email: t.email,
      firstName: t.first,
      lastName: t.last,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
      acceptTerms: true,
    }),
  });
  if (res.status !== 201) fail('register', `${t.company} register failed ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);

  const user = await prisma.user.findUnique({ where: { normalizedEmail: t.email.toLowerCase() } });
  if (!user) fail('register', `${t.company} user row missing`);
  const membership = await prisma.companyMembership.findFirst({ where: { userId: user.id } });
  if (!membership) fail('register', `${t.company} membership row missing`);

  await prisma.user.update({
    where: { id: user.id },
    data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
  });
  await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
  await prisma.companySettings.upsert({
    where: { companyId: membership.companyId },
    update: { requireJobApproval: false },
    create: { companyId: membership.companyId, requireJobApproval: false },
  });

  const login = await api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: t.email, password: PASSWORD }),
  });
  if (login.status !== 200) fail('login', `${t.company} login failed ${login.status}`);

  t.userId = user.id;
  t.companyId = membership.companyId;
  t.membershipId = membership.id;
  t.token = login.body.data.tokens.accessToken;
  note('register', `${t.company} registered + activated`);
}

async function main() {
  for (const t of TENANTS) await registerTenant(t);
  const A = TENANTS[0];
  const B = TENANTS[1];

  const jobRes = await api('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${A.token}` },
    body: JSON.stringify({
      title: `Tenant Isolation Role ${RUN_ID}`,
      employmentType: 'FULL_TIME',
      workplaceType: 'HYBRID',
      experienceLevel: 'MID',
      description: 'A role used by the tenant-isolation verification run.',
    }),
  });
  if (jobRes.status !== 201) fail('job-create', `A create job failed ${jobRes.status} ${JSON.stringify(jobRes.body).slice(0, 200)}`);
  const jobId = jobRes.body.data.id;
  note('job-create', `A created job ${jobId}`);

  const own = await api(`/jobs/${jobId}/analytics`, {
    headers: { authorization: `Bearer ${A.token}` },
  });
  if (own.status !== 200) fail('control', `A reading own job analytics returned ${own.status} (expected 200)`);
  note('control', `A reads own job analytics -> 200 OK`);

  const cross = await api(`/jobs/${jobId}/analytics`, {
    headers: { authorization: `Bearer ${B.token}` },
  });
  if (cross.status !== 404 || (cross.body?.message ?? cross.body?.data?.message) !== 'JOB_NOT_FOUND') {
    fail(
      'cross-tenant',
      `B reading A's job analytics returned ${cross.status} ${JSON.stringify(cross.body).slice(0, 200)} — expected 404 JOB_NOT_FOUND`,
    );
  }
  note('cross-tenant', `B reads A's job analytics -> 404 JOB_NOT_FOUND (data hidden)`);

  const bOverview = await api('/analytics/overview', {
    headers: { authorization: `Bearer ${B.token}` },
  });
  if (bOverview.status !== 200) fail('own-scope', `B analytics overview returned ${bOverview.status} — expected 200`);
  const bTotal = bOverview.body?.data?.totalApplications;
  if (bTotal !== 0) {
    fail('own-scope', `B analytics overview totalApplications=${JSON.stringify(bTotal)} — fresh tenant must be 0`);
  }
  note('own-scope', `B analytics overview -> 200 with totalApplications=0 (fresh tenant scope)`);

  console.log('== tenant-isolation SUMMARY ==');
  for (const r of results) console.log(`  PASS  ${r.label}: ${r.detail}`);

  const { ok: cleanupOk } = await cleanupExact(prisma, {
    applicationIds: [],
    extractionIds: [],
    storedFileIds: [],
    candidateIds: [],
    jobIds: [jobId],
    membershipIds: [A.membershipId],
    companyId: A.companyId,
    userId: A.userId,
  }).catch(() => ({ ok: false }));
  if (!cleanupOk) fail('cleanup', 'company A cleanup reported failures');

  const { ok: cleanupBOk } = await cleanupExact(prisma, {
    applicationIds: [],
    extractionIds: [],
    storedFileIds: [],
    candidateIds: [],
    jobIds: [],
    membershipIds: [B.membershipId],
    companyId: B.companyId,
    userId: B.userId,
  }).catch(() => ({ ok: false }));
  if (!cleanupBOk) fail('cleanup', 'company B cleanup reported failures');
  note('cleanup', 'all exact-ID cleanup steps completed successfully.');
  await prisma.$disconnect();
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(err.message);
    prisma.$disconnect().finally(() => process.exit(1));
  });