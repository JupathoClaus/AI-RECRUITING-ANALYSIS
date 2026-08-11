// Focused executable verification for physical resume-file cleanup.
//
// Runs cleanupExact against a throwaway upload root (VERIFY_UPLOAD_DIR) with
// a stubbed Prisma client, proving:
//   1. only the EXACT files behind the captured storedFile IDs are deleted;
//   2. unrelated files in the same company directory and other companies are
//      never touched;
//   3. path-traversal storage keys are refused (nothing outside the root);
//   4. cleanup is idempotent — missing files and already-absent DB rows are
//      not errors and do not abort the remaining steps;
//   5. the deleted physical paths are reported.
//
// Usage: node verification/cleanup-files.test.mjs

import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert';
import { cleanupExact, resolvePhysicalFile, resolveUploadRoot } from './cleanup.mjs';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  [ok] ${name}`);
}

function makePrisma(storageKeyRows, options = {}) {
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === 'storedFile') {
          return {
            findMany: async () => storageKeyRows,
            deleteMany: async () => ({ count: options.storedFileCount ?? 1 }),
          };
        }
        return { deleteMany: async () => ({ count: 0 }) };
      },
    },
  );
}

async function run() {
  console.log('== cleanup-files.test.mjs ==');

  const root = mkdtempSync(join(tmpdir(), 'talentai-cleanup-'));
  process.env.VERIFY_UPLOAD_DIR = root;
  const companyDir = join(root, 'company-proof-1');
  const otherCompanyDir = join(root, 'company-other');
  mkdirSync(companyDir, { recursive: true });
  mkdirSync(otherCompanyDir, { recursive: true });

  const exactFile = join(companyDir, '11111111-1111-1111-1111-111111111111.pdf');
  const unrelatedSameDir = join(companyDir, '22222222-2222-2222-2222-222222222222.docx');
  const unrelatedOtherCompany = join(otherCompanyDir, '33333333-3333-3333-3333-333333333333.pdf');
  writeFileSync(exactFile, '%PDF-fake');
  writeFileSync(unrelatedSameDir, 'PK-fake');
  writeFileSync(unrelatedOtherCompany, '%PDF-fake');

  // 1. Unit checks on path resolution.
  check('resolvePhysicalFile resolves keys inside the root', () => {
    const resolved = resolvePhysicalFile(root, 'company-proof-1/11111111-1111-1111-1111-111111111111.pdf');
    assert.strictEqual(resolved, exactFile);
  });
  check('resolvePhysicalFile refuses the root itself', () => {
    assert.throws(() => resolvePhysicalFile(root, ''));
    assert.throws(() => resolvePhysicalFile(root, '.'));
  });
  check('resolvePhysicalFile refuses traversal keys', () => {
    assert.throws(() => resolvePhysicalFile(root, '../escape.pdf'));
    assert.throws(() => resolvePhysicalFile(root, 'company-proof-1/../../escape.pdf'));
  });

  const logLines = [];
  const log = (line) => logLines.push(line);

  // 2. Exact-file deletion: only the captured file is removed.
  const ids = {
    storedFileIds: ['file-1'],
    applicationIds: [],
    candidateIds: [],
    jobIds: [],
    extractionIds: [],
    membershipIds: [],
    userId: null,
    companyId: null,
  };
  const prisma = makePrisma([
    { storageKey: 'company-proof-1/11111111-1111-1111-1111-111111111111.pdf' },
  ]);
  const result = await cleanupExact(prisma, ids, log);
  check('cleanup reports ok when the exact file was deleted', () => {
    assert.strictEqual(result.ok, true);
  });
  check('the exact physical file is gone', () => {
    assert.strictEqual(existsSync(exactFile), false);
  });
  check('unrelated file in the same company directory survives', () => {
    assert.strictEqual(existsSync(unrelatedSameDir), true);
  });
  check('unrelated file in another company directory survives', () => {
    assert.strictEqual(existsSync(unrelatedOtherCompany), true);
  });
  check('the deleted physical path is reported', () => {
    assert.ok(
      logLines.some((l) => l.includes('physical file deleted') && l.includes(exactFile)),
      `expected deletion report, got: ${logLines.join(' | ')}`,
    );
  });

  // 3. Idempotent: rows and files already absent -> no failure, ok stays true.
  const prismaEmpty = makePrisma([], { storedFileCount: 0 });
  const secondResult = await cleanupExact(prismaEmpty, ids, log);
  check('cleanup is idempotent when the proof resource is already absent', () => {
    assert.strictEqual(secondResult.ok, true);
  });

  // 4. Traversal refusal: a malicious storage key must fail cleanly and must
  //    not delete anything outside the upload root.
  const outsideFile = join(root, '..', 'talentai-cleanup-outside.txt');
  writeFileSync(outsideFile, 'do-not-delete');
  const prismaEvil = makePrisma([{ storageKey: '../talentai-cleanup-outside.txt' }]);
  const evilResult = await cleanupExact(prismaEvil, ids, log);
  check('cleanup fails (ok=false) for a traversal storage key', () => {
    assert.strictEqual(evilResult.ok, false);
  });
  check('the traversal target outside the root survives', () => {
    assert.strictEqual(existsSync(outsideFile), true);
  });

  // 5. resolveUploadRoot honors the VERIFY_UPLOAD_DIR override.
  check('resolveUploadRoot uses the override when set', () => {
    assert.strictEqual(resolveUploadRoot(), root);
  });
  delete process.env.VERIFY_UPLOAD_DIR;
  check('resolveUploadRoot falls back to backend/.env or the default', () => {
    const fallback = resolveUploadRoot();
    assert.ok(fallback.endsWith('uploads'));
  });

  rmSync(root, { recursive: true, force: true });
  rmSync(outsideFile, { force: true });

  console.log(`\n[cleanup-files] all ${passed} checks PASSED`);
}

run().catch((err) => {
  console.error(`\n[cleanup-files] FAILED: ${err.stack || err.message}`);
  process.exitCode = 1;
});
