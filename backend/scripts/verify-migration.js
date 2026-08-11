/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { execSync } = require('child_process');
const { resolve } = require('path');

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const repoRoot = resolve(__dirname, '..');

function run(cmd, label) {
  console.log(`\n[verify-migration] ${label}...`);
  try {
    const out = execSync(cmd, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    console.log(out.toString().trim());
    console.log(`[PASS] ${label}`);
    return true;
  } catch (err) {
    console.error(err.stderr ? err.stderr.toString().trim() : err.message);
    console.log(`[FAIL] ${label}`);
    return false;
  }
}

async function main() {
  console.log('=== Fresh Migration Proof ===\n');

  console.log('Environment:');
  console.log(
    `  DATABASE_URL: ${process.env.DATABASE_URL ? '(set)' : '(NOT SET — using default)'}`,
  );
  console.log(`  Node: ${process.version}`);

  const allPassed = [
    ['npx prisma validate', 'Prisma schema validation'],
    ['npx prisma migrate deploy', 'Migration deploy'],
    ['npx prisma validate', 'Post-migration schema validation'],
  ].every(([cmd, label]) => run(cmd, label));

  console.log('');
  if (allPassed) {
    console.log('Migration proof PASSED — fresh migrations can be applied.');
    process.exit(EXIT_PASS);
  } else {
    console.log('Migration proof FAILED — see errors above.');
    process.exit(EXIT_FAIL);
  }
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(EXIT_FAIL);
});
