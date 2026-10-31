#!/usr/bin/env node
/**
 * Packages the production Chrome MV3 build into a store-ready ZIP.
 *
 * Verifies before packaging:
 *  - the manifest matches the approved permission posture (via
 *    scripts/verify-manifest.mjs logic — re-checked here inline)
 *  - no source maps, test artifacts or dotfiles are included
 *
 * Output: apps/extension/.output/vittix-seo-toolkit-<version>.zip
 * (PowerShell Compress-Archive is used because the system `zip` binary is
 * not available on Windows; on CI/Linux prefer `zip -r`.)
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = resolve(ROOT, 'apps/extension/.output/chrome-mv3');
const OUT_DIR = resolve(ROOT, 'apps/extension/.output');

if (!existsSync(BUILD_DIR)) {
  console.error(`✗ Build output not found at ${BUILD_DIR} — run "pnpm build:chrome" first.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(BUILD_DIR, 'manifest.json'), 'utf8'));
const APPROVED = ['activeTab', 'scripting'].sort();
const actual = [...(manifest.permissions ?? [])].sort();
if (JSON.stringify(actual) !== JSON.stringify(APPROVED)) {
  console.error(`✗ Manifest permissions are ${JSON.stringify(actual)} — refusing to package.`);
  process.exit(1);
}

const FORBIDDEN = [/\.map$/, /\.ts$/, /node_modules/, /^\./, /test-results/, /playwright-report/];
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else {
      const relative = full.slice(BUILD_DIR.length + 1).replace(/\\/g, '/');
      if (FORBIDDEN.some((pattern) => pattern.test(relative))) {
        console.error(`✗ Forbidden file in build output: ${relative}`);
        process.exit(1);
      }
      files.push(relative);
    }
  }
}
walk(BUILD_DIR);

const version = manifest.version;
const zipPath = resolve(OUT_DIR, `vittix-seo-toolkit-${version}-chrome.zip`);
if (existsSync(zipPath)) {
  console.log(`removing previous ${basename(zipPath)}`);
  execSync(`powershell -NoProfile -Command "Remove-Item -Force '${zipPath.replace(/'/g, "''")}'"`, {
    stdio: 'inherit',
  });
}

execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD_DIR.replace(
    /'/g,
    "''",
  )}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`,
  { stdio: 'inherit' },
);

const size = statSync(zipPath).size;
console.log(`✓ Packaged ${files.length} files → ${zipPath} (${(size / 1024).toFixed(1)} kB)`);
console.log('  Contents:', files.sort().join(', '));
