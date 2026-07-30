/* eslint-disable @typescript-eslint/no-var-requires, no-console, @typescript-eslint/no-unused-vars */
const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { resolve } = require('path');

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_ERROR = 2;

const repoRoot = resolve(__dirname, '../..');
const eslintBin = resolve(__dirname, '..', 'node_modules', '.bin', 'eslint');

function getBaseSha(argv) {
  const baseIdx = argv.indexOf('--base');
  if (baseIdx !== -1 && baseIdx + 1 < argv.length) {
    return argv[baseIdx + 1];
  }
  if (process.env.LINT_BASE_SHA) return process.env.LINT_BASE_SHA;
  try {
    const mergeBase = execSync(
      `git -C "${repoRoot}" merge-base HEAD main 2>nul || git -C "${repoRoot}" rev-parse HEAD~1`,
      { encoding: 'utf-8' },
    ).trim();
    return mergeBase || 'HEAD~1';
  } catch {
    return 'HEAD~1';
  }
}

function getChangedFiles(baseSha) {
  try {
    const output = execSync(
      `git -C "${repoRoot}" diff --name-only "${baseSha}" HEAD -- "backend/src/*.ts" "backend/test/*.ts"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    ).trim();
    return output
      .split('\n')
      .filter(Boolean)
      .map((f) => f.replace(/^backend\//, ''))
      .filter((f) => f.endsWith('.ts'));
  } catch {
    return [];
  }
}

function runESLint(files) {
  const fileList = files.map((f) => `"${resolve(repoRoot, 'backend', f)}"`).join(' ');
  try {
    execSync(`"${eslintBin}" ${fileList}`, {
      encoding: 'utf-8',
      stdio: 'inherit',
      maxBuffer: 10 * 1024 * 1024,
      shell: true,
    });
    return true;
  } catch {
    return false;
  }
}

function selfTest() {
  let failures = 0;
  const test = (name, fn) => {
    try {
      fn();
      console.log(`  PASS: ${name}`);
    } catch (err) {
      failures++;
      console.error(`  FAIL: ${name}: ${err.message}`);
    }
  };

  console.log('--- Self-tests ---');

  test('getBaseSha returns argument when --base provided', () => {
    const sha = getBaseSha(['--base', 'abc123']);
    if (sha !== 'abc123') throw new Error(`Expected abc123, got ${sha}`);
  });

  test('getBaseSha falls back to env var', () => {
    process.env.LINT_BASE_SHA = 'envsha';
    const sha = getBaseSha([]);
    delete process.env.LINT_BASE_SHA;
    if (sha !== 'envsha') throw new Error(`Expected envsha, got ${sha}`);
  });

  test('getChangedFiles returns array', () => {
    const files = getChangedFiles('HEAD');
    if (!Array.isArray(files)) throw new Error('Expected array');
  });

  test('getChangedFiles filters to .ts files only', () => {
    const dir = resolve(repoRoot, 'backend', '__lint_test_tmp__');
    const fs = require('fs');
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolve(dir, 'test.ts'), 'const a = 1;\n', 'utf-8');
      fs.writeFileSync(resolve(dir, 'test.js'), 'const a = 1;\n', 'utf-8');
      execSync(`git -C "${repoRoot}" add "${dir}/test.ts" "${dir}/test.js"`, { encoding: 'utf-8' });
      const files = getChangedFiles('HEAD');
      const hasTs = files.some((f) => f.includes('__lint_test_tmp__/test.ts'));
      const hasJs = files.some((f) => f.includes('__lint_test_tmp__/test.js'));
      if (hasJs) throw new Error('.js file should have been filtered out');
      execSync(
        `git -C "${repoRoot}" reset HEAD "${dir}/test.ts" "${dir}/test.js" && rm -rf "${dir}"`,
        { encoding: 'utf-8', stdio: 'ignore' },
      );
    } catch {
      // cleanup
      try {
        execSync(`git -C "${repoRoot}" reset HEAD -- "${dir}" 2>nul`, { stdio: 'ignore' });
      } catch {}
      try {
        require('fs').rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  });

  if (failures > 0) {
    console.error(`\n${failures} self-test(s) FAILED`);
    process.exit(EXIT_ERROR);
  }
  console.log(`\nAll self-tests passed.`);
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const baseSha = getBaseSha(argv);
  console.log(`Lint base SHA: ${baseSha}`);

  const changedFiles = getChangedFiles(baseSha);

  if (changedFiles.length === 0) {
    console.log('No changed backend TypeScript files to lint.');
    process.exit(EXIT_PASS);
  }

  console.log(`Changed backend TS files (${changedFiles.length}):`);
  for (const f of changedFiles) console.log(`  ${f}`);

  if (!existsSync(eslintBin)) {
    console.error(`ERROR: ESLint binary not found at ${eslintBin}`);
    process.exit(EXIT_ERROR);
  }

  const pass = runESLint(changedFiles);
  if (pass) {
    console.log('PASS: All changed files pass lint.');
    process.exit(EXIT_PASS);
  } else {
    console.error('FAIL: Lint violations in changed files.');
    process.exit(EXIT_FAIL);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getBaseSha, getChangedFiles, runESLint };
