#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = resolve(root, 'apps/extension/.output/bundle-analysis.json');
if (!existsSync(reportPath)) {
  console.error('Bundle analysis is missing. Run `pnpm bundle:report` to build and report it.');
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
console.log('Production bundle by entrypoint (JS + imported CSS)');
for (const entry of report.entrypoints) {
  console.log(
    `  ${entry.name.padEnd(12)} ${(entry.totalBytes / 1024).toFixed(2).padStart(8)} kB  (JS ${(entry.jsBytes / 1024).toFixed(2)} kB${entry.cssFiles.length ? ` + CSS ${(entry.cssBytes / 1024).toFixed(2)} kB` : ''})  ${entry.file}`,
  );
}
console.log('\nTop 10 largest rendered modules (summed across production chunks)');
for (const [index, module] of report.largestModules.entries()) {
  console.log(
    `  ${String(index + 1).padStart(2)}. ${(module.bytes / 1024).toFixed(2).padStart(8)} kB  ${module.module}`,
  );
}
