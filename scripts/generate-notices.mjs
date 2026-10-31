#!/usr/bin/env node
/**
 * Generates THIRD_PARTY_NOTICES.md for the distributable extension.
 *
 * Sources every entry from the INSTALLED package metadata (name, version,
 * license, copyright line) so the notices can never drift from what is
 * actually bundled. The file is written into apps/extension/public/ so WXT
 * copies it into every build, and the packaging script verifies its
 * presence.
 *
 * Bundled packages (verified against the production build's chunks):
 *   react, react-dom (+scheduler), dexie, zod, lucide-react.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'apps/extension/public/THIRD_PARTY_NOTICES.md');

/** name → pnpm directory prefix fragment (verified present in node_modules). */
const BUNDLED = ['react', 'react-dom', 'scheduler', 'dexie', 'zod', 'lucide-react'];

function findPackageDir(name) {
  const pnpm = resolve(ROOT, 'node_modules/.pnpm');
  const prefix = `${name}@`;
  const entry = readdirSync(pnpm).find(
    (dir) => (dir.startsWith(prefix) && !dir.includes('_') === false) || dir.startsWith(prefix),
  );
  if (!entry) return null;
  const full = resolve(pnpm, entry, 'node_modules', name);
  return existsSync(full) ? full : null;
}

function extractCopyright(licenseText) {
  const lines = licenseText.split(/\r?\n/);
  const idx = lines.findIndex((line) => /copyright/i.test(line));
  if (idx === -1) return null;
  return lines
    .slice(idx, idx + 2)
    .join('\n')
    .trim();
}

const entries = [];
for (const name of BUNDLED) {
  const dir = findPackageDir(name);
  if (dir === null) {
    console.error(`✗ Bundled package not found in node_modules: ${name}`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE']
    .map((file) => join(dir, file))
    .find((file) => existsSync(file));
  const licenseText = licenseFile ? readFileSync(licenseFile, 'utf8') : null;
  entries.push({
    name,
    version: pkg.version,
    license: pkg.license,
    homepage: pkg.homepage ?? pkg.repository?.url ?? '',
    copyright: licenseText ? extractCopyright(licenseText) : '(see package)',
    licenseText,
  });
}

const md = [
  '# Third-Party Notices',
  '',
  'This file bundles third-party software. The notices below are generated',
  'from the installed package metadata (`pnpm run notices`) and correspond to',
  'the exact versions distributed in this extension package.',
  '',
  ...entries.map((entry) => {
    const parts = [
      `## ${entry.name} ${entry.version}`,
      '',
      `- License: **${entry.license}**`,
      entry.homepage ? `- Source: ${entry.homepage}` : null,
      entry.copyright ? `- ${entry.copyright.replace(/\n/g, '\n  ')}` : null,
      '',
    ].filter((line) => line !== null);
    if (entry.license === 'Apache-2.0') {
      parts.push(
        'Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.',
        '',
        '<details><summary>Apache License 2.0 (full text)</summary>',
        '',
        '```',
        entry.licenseText ?? '',
        '```',
        '',
        '</details>',
        '',
      );
    } else if (entry.licenseText !== null) {
      parts.push('```', entry.licenseText.trim(), '```', '');
    }
    return parts.join('\n');
  }),
].join('\n');

writeFileSync(OUT, md);
console.log(
  `✓ Wrote ${OUT} (${entries.length} packages: ${entries.map((entry) => `${entry.name}@${entry.version} [${entry.license}]`).join(', ')})`,
);
