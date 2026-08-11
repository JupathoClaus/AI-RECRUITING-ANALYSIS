// Shared safety guard for verification scripts.
//
// Every verification script that touches the database MUST:
//   1. resolve the target database URL (backend/.env DATABASE_URL, or the
//      VERIFY_DB_URL env override), and
//   2. refuse to run unless the target is a LOCAL database named talentai*.
// Production and remote databases are never acceptable targets.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = fileURLToPath(new URL('../backend', import.meta.url));

export function resolveDatabaseUrl() {
  const override = process.env.VERIFY_DB_URL;
  if (override) {
    console.log('[db-guard] using VERIFY_DB_URL override');
    return override;
  }
  const envFile = readFileSync(join(BACKEND_DIR, '.env'), 'utf8');
  const url = envFile.match(/^DATABASE_URL=(.+)$/m)?.[1];
  if (!url) throw new Error('db-guard: no DATABASE_URL found in backend/.env and VERIFY_DB_URL is not set');
  return url;
}

export function assertLocalVerificationDb(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const db = u.pathname.replace(/^\//, '');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (!isLocal) {
    throw new Error(
      `db-guard: REFUSING to run against non-local database host "${host}" (${url.replace(/:[^:@/]+@/, ':***@')}). ` +
        `Verification scripts are only allowed to touch local verification databases.`,
    );
  }
  if (!/^talentai/.test(db)) {
    throw new Error(
      `db-guard: REFUSING to run against unexpected database "${db}". Expected a local "talentai*" database.`,
    );
  }
  return { host, db };
}
