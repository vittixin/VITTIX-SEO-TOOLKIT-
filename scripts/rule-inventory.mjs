#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'packages/seo-core/src/rules.ts');
const catalogSource = readFileSync(catalogPath, 'utf8');
const catalogBody = catalogSource.slice(
  catalogSource.indexOf('export const RULE_IDS = ['),
  catalogSource.indexOf('] as const;', catalogSource.indexOf('export const RULE_IDS = [')),
);
const groups = new Map();
let currentGroup = '';
for (const line of catalogBody.split(/\r?\n/)) {
  const category = /^\s*\/\/\s+(.+?)\s*$/.exec(line)?.[1];
  if (category) currentGroup = category === 'structured data' ? 'technical' : category;
  const ruleId = /^\s*'([^']+)',\s*$/.exec(line)?.[1];
  if (ruleId) groups.set(currentGroup, [...(groups.get(currentGroup) ?? []), ruleId]);
}
const ids = [...groups.values()].flat();

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const analyzerFiles = walk(join(root, 'packages/seo-core/src/analyzers')).filter((path) =>
  path.endsWith('.ts'),
);
const testFiles = walk(join(root, 'packages/seo-core/src')).filter((path) =>
  path.endsWith('.test.ts'),
);
const analyzerSources = analyzerFiles.map((path) => readFileSync(path, 'utf8'));
const testSources = testFiles.map((path) => readFileSync(path, 'utf8'));
const rulesDoc = readFileSync(join(root, 'docs/SEO_RULES.md'), 'utf8');
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const missingAnalyzer = ids.filter(
  (id) => !analyzerSources.some((source) => source.includes(`'${id}'`)),
);
const missingDocs = ids.filter((id) => !rulesDoc.includes('`' + id + '`'));
const missingTests = ids.filter(
  (id) => !testSources.some((source) => source.includes(`'${id}'`) || source.includes(`\`${id}\``)),
);

console.log(`RULE_IDS.length = ${ids.length}`);
for (const [category, rules] of groups) {
  console.log(`\n${category} (${rules.length})`);
  for (const ruleId of rules) console.log(`  ${ruleId}`);
}
console.log('\nSanity checks');
console.log(`  duplicate ids: ${duplicates.length ? duplicates.join(', ') : 'none'}`);
console.log(
  `  ids without analyzer emission: ${missingAnalyzer.length ? missingAnalyzer.join(', ') : 'none'}`,
);
console.log(`  ids without docs entry: ${missingDocs.length ? missingDocs.join(', ') : 'none'}`);
console.log(
  `  ids without a test reference: ${missingTests.length ? missingTests.join(', ') : 'none'}`,
);

if (duplicates.length || missingAnalyzer.length || missingDocs.length || missingTests.length)
  process.exitCode = 1;
