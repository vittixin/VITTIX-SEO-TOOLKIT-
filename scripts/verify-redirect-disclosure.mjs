import { readFileSync } from 'node:fs';

const sourcePath = 'packages/shared/src/site.ts';
const source = readFileSync(sourcePath, 'utf8');
const disclosure = source.match(/export const SITE_REDIRECT_DISCLOSURE =\s*'([^']+)';/)?.[1];
if (!disclosure) throw new Error(`Could not read SITE_REDIRECT_DISCLOSURE from ${sourcePath}`);

const requiredDocs = [
  'README.md',
  'docs/PRIVACY.md',
  'docs/SITE_AUDIT.md',
  'docs/SECURITY.md',
  'docs/STORE_LISTING.md',
  'docs/PRIVACY_POLICY.md',
  'docs/ARCHITECTURE.md',
  'docs/ROADMAP.md',
  'docs/RELEASE_CHECKLIST.md',
];
const missing = requiredDocs.filter((path) => !readFileSync(path, 'utf8').includes(disclosure));
for (const path of [
  'apps/extension/src/features/views/SiteAuditView.tsx',
  'apps/extension/entrypoints/options/App.tsx',
]) {
  if (!readFileSync(path, 'utf8').includes('SITE_REDIRECT_DISCLOSURE')) missing.push(path);
}
if (missing.length > 0) {
  console.error(`Redirect disclosure is missing or stale in: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ Redirect disclosure matches the source in ${requiredDocs.length} documents and both extension UI locations.`,
  );
}
