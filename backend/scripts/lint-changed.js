/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { execFileSync } = require('child_process');
const { existsSync } = require('fs');
const { resolve, relative, sep } = require('path');

const repoRoot = resolve(__dirname, '../..');
const backendRoot = resolve(repoRoot, 'backend');

function git(args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

function resolveBase(args) {
  const index = args.indexOf('--base');
  const requested = index >= 0 ? args[index + 1] : process.env.LINT_BASE_SHA;
  if (index >= 0 && !requested) throw new Error('--base requires a revision');
  const candidate = requested || 'origin/backend-stabilization';
  git(['rev-parse', '--verify', `${candidate}^{commit}`]);
  return git(['merge-base', candidate, 'HEAD']);
}

function lines(value) {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}

function discover(base) {
  const pathspec = ['--', 'backend/src', 'backend/test'];
  const files = new Set([
    ...lines(git(['diff', '--name-only', `${base}..HEAD`, ...pathspec])),
    ...lines(git(['diff', '--name-only', ...pathspec])),
    ...lines(git(['diff', '--cached', '--name-only', ...pathspec])),
    ...lines(git(['ls-files', '--others', '--exclude-standard', ...pathspec])),
  ]);
  return [...files]
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .sort()
    .map((file) => resolve(repoRoot, file));
}

function display(file) {
  return relative(backendRoot, file).split(sep).join('/');
}

async function run(files) {
  if (!files.length) return;
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: backendRoot, useEslintrc: true, cache: false, fix: false });
  for (const file of files) {
    if (!existsSync(file))
      throw new Error(`Discovered lint target does not exist: ${display(file)}`);
    if (await eslint.isPathIgnored(file))
      throw new Error(`Discovered lint target is ignored: ${display(file)}`);
  }
  const results = await eslint.lintFiles(files);
  const errors = results.flatMap((result) =>
    result.messages
      .filter((message) => message.severity === 2)
      .map(
        (message) =>
          `${display(result.filePath)}:${message.line}:${message.column} ${message.ruleId}: ${message.message}`,
      ),
  );
  if (errors.length) throw new Error(`Changed-file lint errors:\n${errors.join('\n')}`);
}

async function selfTest() {
  if (lines('a\nb').length !== 2) throw new Error('line parsing failed');
  let missingBaseRejected = false;
  try {
    git(['rev-parse', '--verify', 'definitely-not-a-release-base^{commit}']);
  } catch {
    missingBaseRejected = true;
  }
  if (!missingBaseRejected) throw new Error('missing release base was accepted');
  console.log('PASS: changed-file lint self-tests');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const base = resolveBase(args);
  const files = discover(base);
  console.log(`Lint base: ${base}`);
  console.log(`Lint targets (${files.length}):`);
  files.forEach((file) => console.log(`  ${display(file)}`));
  await run(files);
  console.log('PASS: changed-file lint');
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
