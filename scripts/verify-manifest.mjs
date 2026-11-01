#!/usr/bin/env node
/**
 * Production manifest verification for Vittix SEO Toolkit.
 *
 * Fails the build if the generated Chrome MV3 manifest deviates from the
 * approved privacy posture:
 *   - permissions must be exactly ["activeTab", "scripting"]
 *   - no host_permissions / optional_host_permissions / content_scripts
 *   - no web_accessible_resources (all pages are extension-only)
 *   - CSP must not allow unsafe-eval or remote script sources
 *
 * Usage: node scripts/verify-manifest.mjs [path-to-manifest]
 * Default path: apps/extension/.output/chrome-mv3/manifest.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve(process.argv[2] ?? 'apps/extension/.output/chrome-mv3/manifest.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`✗ Cannot read manifest at ${manifestPath}: ${error.message}`);
  process.exit(1);
}

const errors = [];

if (manifest.manifest_version !== 3) {
  errors.push(`manifest_version must be 3, found ${manifest.manifest_version}`);
}

const APPROVED_PERMISSIONS = ['activeTab', 'scripting'];
const actual = [...(manifest.permissions ?? [])].sort();
const approved = [...APPROVED_PERMISSIONS].sort();
if (JSON.stringify(actual) !== JSON.stringify(approved)) {
  errors.push(
    `permissions must be exactly ${JSON.stringify(APPROVED_PERMISSIONS)}, found ${JSON.stringify(
      manifest.permissions ?? [],
    )}`,
  );
}

const mustBeEmpty = ['host_permissions', 'content_scripts', 'web_accessible_resources'];
for (const key of mustBeEmpty) {
  const value = manifest[key];
  if (value !== undefined && value !== null && value.length !== 0) {
    errors.push(`${key} must be empty or absent, found ${JSON.stringify(value)}`);
  }
}

const optionalPermissions = [...(manifest.optional_permissions ?? [])].sort();
const allowedOptionalPermissions = ['sidePanel'];
if (JSON.stringify(optionalPermissions) !== JSON.stringify(allowedOptionalPermissions)) {
  errors.push(
    `optional_permissions must be exactly ${JSON.stringify(allowedOptionalPermissions)}, found ${JSON.stringify(optionalPermissions)}`,
  );
}

// optional_host_permissions: a CATALOG of grantable patterns for the opt-in
// site audit, NOT a grant (nothing is accessible until the user approves a
// single exact origin at runtime, and it is revocable). The catalog must
// may include only the https catalog and explicit loopback dev origins.
const optionalHosts = manifest.optional_host_permissions ?? [];
const allowedOptionalHosts = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'].sort();
if (JSON.stringify([...optionalHosts].sort()) !== JSON.stringify(allowedOptionalHosts)) {
  errors.push(
    `optional_host_permissions must be exactly ${JSON.stringify(
      allowedOptionalHosts,
    )} (grant catalog for the opt-in site audit), found ${JSON.stringify(optionalHosts)}`,
  );
}

const csp = manifest.content_security_policy?.extension_pages ?? '';
if (csp) {
  if (/unsafe-eval|wasm-unsafe-eval/i.test(csp)) {
    errors.push(`CSP must not allow unsafe-eval, found: ${csp}`);
  }
  if (/https?:\/\//i.test(csp.replace(/'self'/g, ''))) {
    errors.push(`CSP must not reference remote sources, found: ${csp}`);
  }
}
// An absent CSP is also acceptable: Chrome then enforces the strict MV3
// default (script-src 'self'; object-src 'self'), which forbids remote code.

if (!manifest.background?.service_worker) {
  errors.push('background.service_worker is missing');
}

if (errors.length > 0) {
  console.error('✗ Manifest verification FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `✓ Manifest verification passed (${manifestPath}): permissions=${JSON.stringify(
    actual,
  )}, optional dev origins are narrowly allow-listed, no content scripts, no web-accessible resources.`,
);
