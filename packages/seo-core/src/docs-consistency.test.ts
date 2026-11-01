import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULE_IDS } from './rules.js';

/**
 * Documentation consistency guard: every RULE_IDS entry must be documented
 * in docs/SEO_RULES.md and referenced by an analyzer, and the rule count in
 * docs/PRODUCT_SPEC.md must match RULE_IDS.length. Fails when docs drift.
 */
const SEO_CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(SEO_CORE_ROOT, '..', '..');

describe('PRE-STEP: documentation consistency', () => {
  const rulesDoc = readFileSync(resolve(REPO_ROOT, 'docs', 'SEO_RULES.md'), 'utf8');
  const productSpec = readFileSync(resolve(REPO_ROOT, 'docs', 'PRODUCT_SPEC.md'), 'utf8');
  const analyzerSources = [
    'analyzers/metadata.ts',
    'analyzers/headings.ts',
    'analyzers/images.ts',
    'analyzers/links.ts',
    'analyzers/content.ts',
    'analyzers/keywords.ts',
    'analyzers/hreflang.ts',
    'analyzers/technical.ts',
    'analyzers/structured-data.ts',
  ].map((relative) => readFileSync(resolve(SEO_CORE_ROOT, 'src', relative), 'utf8'));

  it('documents every RULE_IDS entry in docs/SEO_RULES.md', () => {
    const missing = RULE_IDS.filter((id) => !rulesDoc.includes(`\`${id}\``));
    expect(missing, `rules missing from SEO_RULES.md: ${missing.join(', ')}`).toEqual([]);
  });

  it('references every RULE_IDS entry from an analyzer implementation', () => {
    const missing = RULE_IDS.filter(
      (id) => !analyzerSources.some((source) => source.includes(`'${id}'`)),
    );
    expect(missing, `rules not emitted by any analyzer: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps the rule count in docs/PRODUCT_SPEC.md in sync with RULE_IDS.length', () => {
    expect(productSpec).toContain(`${RULE_IDS.length} rules`);
  });

  it('keeps documented verification counts aligned with the last real run', () => {
    expect(productSpec).toContain('313 unit tests');
    expect(productSpec).toContain('11 Playwright E2E tests');
  });

  it('does not contain removed/renamed rule ids', () => {
    // Guard against doc drift after renames (e.g. description-length is now
    // meta-description-length).
    expect(rulesDoc).not.toContain('`description-length`');
  });
});
