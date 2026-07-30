/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync } = require('fs');
const { resolve, relative, sep } = require('path');
const { tmpdir } = require('os');

const backendRoot = resolve(__dirname, '..');
const baselineFile = resolve(__dirname, 'lint-baseline.json');

function listTypeScript(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
      continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTypeScript(full));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))
      files.push(full);
  }
  return files;
}

function sourceFiles() {
  return [resolve(backendRoot, 'src'), resolve(backendRoot, 'test')].flatMap(listTypeScript);
}

function normalizeFile(file) {
  return relative(backendRoot, file).split(sep).join('/');
}

function summarize(results) {
  const counts = {};
  for (const result of results) {
    const file = normalizeFile(result.filePath);
    for (const message of result.messages) {
      if (!message.ruleId || message.severity === 0) continue;
      const severity = message.severity === 2 ? 'error' : 'warning';
      const key = `${file}|${message.ruleId}|${severity}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function validateBaseline(value) {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.violations !== 'object' ||
    Array.isArray(value.violations)
  ) {
    throw new Error('Malformed lint baseline: expected { version: 1, violations: object }');
  }
  for (const [key, count] of Object.entries(value.violations)) {
    if (!key.includes('|') || !Number.isInteger(count) || count < 0) {
      throw new Error(`Malformed lint baseline entry: ${key}`);
    }
  }
  return value;
}

async function lint(files) {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: backendRoot, useEslintrc: true, cache: false, fix: false });
  const ignored = [];
  for (const file of files) if (await eslint.isPathIgnored(file)) ignored.push(normalizeFile(file));
  if (ignored.length) throw new Error(`Intended lint targets are ignored: ${ignored.join(', ')}`);
  return eslint.lintFiles(files);
}

async function selfTest() {
  const temp = mkdtempSync(resolve(tmpdir(), 'talentai-lint-baseline-'));
  try {
    const valid = validateBaseline({ version: 1, violations: { 'src/a.ts|rule|error': 1 } });
    if (valid.violations['src/a.ts|rule|error'] !== 1) throw new Error('valid baseline rejected');
    let malformedRejected = false;
    try {
      validateBaseline({ version: 2, violations: [] });
    } catch {
      malformedRejected = true;
    }
    if (!malformedRejected) throw new Error('malformed baseline accepted');
    const summary = summarize([
      {
        filePath: resolve(backendRoot, 'src/a.ts'),
        messages: [
          { ruleId: 'rule', severity: 2 },
          { ruleId: 'rule', severity: 2 },
        ],
      },
    ]);
    if (summary['src/a.ts|rule|error'] !== 2)
      throw new Error('violation counts are not deterministic');
    writeFileSync(resolve(temp, 'ok'), 'ok');
    console.log('PASS: lint baseline self-tests');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();

  const files = sourceFiles();
  if (!files.length) throw new Error('No backend TypeScript targets discovered');
  const current = summarize(await lint(files));

  if (args.includes('--update')) {
    writeFileSync(
      baselineFile,
      `${JSON.stringify({ version: 1, violations: current }, null, 2)}\n`,
    );
    console.log(
      `Updated ${normalizeFile(baselineFile)} with ${Object.keys(current).length} fingerprints`,
    );
    return;
  }

  if (!existsSync(baselineFile))
    throw new Error(`Missing committed lint baseline: ${baselineFile}`);
  const baseline = validateBaseline(JSON.parse(readFileSync(baselineFile, 'utf8')));
  const growth = [];
  for (const [key, count] of Object.entries(current)) {
    const allowed = baseline.violations[key] ?? 0;
    if (count > allowed) growth.push(`${key}: ${allowed} -> ${count}`);
  }
  if (growth.length) throw new Error(`Lint baseline grew:\n${growth.join('\n')}`);
  console.log(`PASS: lint baseline (${Object.keys(current).length} current fingerprints)`);
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
