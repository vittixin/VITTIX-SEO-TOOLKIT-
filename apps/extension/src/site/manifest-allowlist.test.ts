import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(process.cwd(), 'scripts/verify-manifest.mjs');

function verify(optionalHosts: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'vittix-manifest-'));
  try {
    const file = join(dir, 'manifest.json');
    writeFileSync(
      file,
      JSON.stringify({
        manifest_version: 3,
        permissions: ['activeTab', 'scripting'],
        optional_host_permissions: optionalHosts,
        background: { service_worker: 'background.js' },
      }),
    );
    return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('production manifest origin allow-list', () => {
  it('accepts exactly the HTTPS catalog and two localhost development hosts', () => {
    expect(verify(['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']).status).toBe(0);
  });

  it('rejects wildcard HTTP and other broad host patterns', () => {
    for (const pattern of ['http://*/*', 'http://192.168.1.1/*', 'https://example.com/*']) {
      expect(
        verify(['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*', pattern]).status,
      ).not.toBe(0);
    }
  });
});
import { describe, expect, it } from 'vitest';
