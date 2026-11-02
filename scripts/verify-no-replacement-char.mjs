import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.stderr || 'Could not list tracked files with git.');
  process.exit(1);
}

const replacementCharacter = String.fromCharCode(0xfffd);
const checkedExtensions = new Set(['.md', '.ts', '.tsx']);
const offenders = result.stdout
  .split('\0')
  .filter((path) => path && checkedExtensions.has(extname(path).toLowerCase()))
  .filter((path) => readFileSync(path, 'utf8').includes(replacementCharacter));

if (offenders.length > 0) {
  console.error(
    `Found U+FFFD in tracked files:\n${offenders.map((path) => `- ${path}`).join('\n')}`,
  );
  process.exit(1);
}

console.log('No U+FFFD characters in tracked Markdown/TypeScript files.');
