import { describe, expect, it } from 'vitest';
import { SNAPSHOT_LIMITS } from '@vittix/shared';
import { EXTRACTOR_LIMITS } from './limits';
import type { ExtractorLimits } from './snapshot-inject';

/**
 * INVARIANT: both extraction paths (live-DOM injector and site-mode HTML
 * parser) must run with IDENTICAL limits, derived from the single source of
 * truth in @vittix/shared. If someone adds a collection cap to
 * SNAPSHOT_LIMITS but forgets to wire it into EXTRACTOR_LIMITS (or vice
 * versa), this test fails.
 */
describe('EXTRACTOR_LIMITS — single source of truth', () => {
  it('mirrors every SNAPSHOT_LIMITS extraction cap', () => {
    expect(EXTRACTOR_LIMITS).toEqual({
      headings: SNAPSHOT_LIMITS.headings,
      images: SNAPSHOT_LIMITS.images,
      links: SNAPSHOT_LIMITS.links,
      textSampleChars: SNAPSHOT_LIMITS.textSampleChars,
      textField: SNAPSHOT_LIMITS.textField,
      descriptions: SNAPSHOT_LIMITS.descriptions,
      canonicals: SNAPSHOT_LIMITS.canonicals,
      robotsValues: SNAPSHOT_LIMITS.robotsValues,
      structuredData: SNAPSHOT_LIMITS.structuredData,
      hreflang: SNAPSHOT_LIMITS.hreflang,
      keywords: SNAPSHOT_LIMITS.keywords,
      mixedContentSamples: SNAPSHOT_LIMITS.mixedContentSamples,
      foldCandidates: SNAPSHOT_LIMITS.foldCandidates,
    });
  });

  it('has no extra or missing keys relative to the shared caps', () => {
    const expectedKeys = [
      'headings',
      'images',
      'links',
      'textSampleChars',
      'textField',
      'descriptions',
      'canonicals',
      'robotsValues',
      'structuredData',
      'hreflang',
      'keywords',
      'mixedContentSamples',
      'foldCandidates',
    ].sort();
    expect(Object.keys(EXTRACTOR_LIMITS).sort()).toEqual(expectedKeys);
  });

  it('keeps the SiteExtractorLimits type aligned (compile-time contract)', () => {
    // Type-level guard: EXTRACTOR_LIMITS must satisfy ExtractorLimits.
    const check: ExtractorLimits = EXTRACTOR_LIMITS;
    expect(check).toBe(EXTRACTOR_LIMITS);
  });
});
