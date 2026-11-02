import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CI dependency audit', () => {
  it('audits production dependencies', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toMatch(/run:\s*pnpm audit --prod\b/);
  });
});
