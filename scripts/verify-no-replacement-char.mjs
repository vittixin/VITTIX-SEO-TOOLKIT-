import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const replacementCharacter = String.fromCharCode(0xfffd);
const checkedExtensions = new Set(['.md', '.ts', '.tsx']);
const skippedDirectories = new Set([
  'node_modules',
  '.git',
  '.output',
  '.wxt',
  'dist',
  'playwright-report',
  'test-results',
  'coverage',
]);

function walk(root, directory = root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) walk(root, path, files);
    } else if (entry.isFile() && checkedExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }
  return files;
}

function verify(root, forceFallback = false) {
  const result = forceFallback
    ? { status: 1 }
    : spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  let files;
  let mode;

  if (!forceFallback && !result.error && result.status === 0) {
    mode = 'git ls-files';
    files = result.stdout
      .split('\0')
      .filter((path) => path && checkedExtensions.has(extname(path).toLowerCase()))
      .map((path) => resolve(root, path));
  } else {
    mode = 'filesystem walk';
    files = walk(root);
  }

  console.log(`Checking Markdown/TypeScript files using ${mode}.`);
  const offenders = files.filter((path) => readFileSync(path, 'utf8').includes(replacementCharacter));
  if (offenders.length > 0) {
    console.error(`Found U+FFFD in files:\n${offenders.map((path) => `- ${path}`).join('\n')}`);
    return 1;
  }
  console.log('No U+FFFD characters in Markdown/TypeScript files.');
  return 0;
}

function selfCheck() {
  const root = mkdtempSync(join(tmpdir(), 'verify-no-replacement-char-'));
  try {
    const badRoot = join(root, 'bad');
    const goodRoot = join(root, 'good');
    const bad = join(badRoot, 'bad.md');
    const good = join(goodRoot, 'nested', 'good.tsx');
    mkdirSync(dirname(good), { recursive: true });
    mkdirSync(badRoot, { recursive: true });
    writeFileSync(bad, `contains ${replacementCharacter}`);
    writeFileSync(good, 'clean');
    const run = (path) => spawnSync(process.execPath, [scriptPath, '--root', path], { encoding: 'utf8' });
    const badResult = run(badRoot);
    const goodResult = run(goodRoot);
    if (badResult.status !== 1 || goodResult.status !== 0) {
      console.error('Fallback self-check failed.');
      console.error(`Expected exit codes 1 and 0; got ${badResult.status} and ${goodResult.status}.`);
      return 1;
    }
    console.log('Fallback self-check passed (exit codes 1 and 0).');
    return 0;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--self-check') {
  process.exitCode = selfCheck();
} else {
  const rootArgument = process.argv[2] === '--root' ? process.argv[3] : process.cwd();
  const forceFallback = process.argv[2] === '--root';
  process.exitCode = verify(resolve(rootArgument), forceFallback);
}
