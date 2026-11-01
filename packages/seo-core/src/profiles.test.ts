import { describe, expect, it } from 'vitest';
import { analyzeSnapshot } from './analyze.js';
import { buildSnapshot } from './testing/fixtures.js';
import { SCORING_PROFILES } from './profiles.js';

describe('scoring profiles', () => {
  it('uses deterministic profile weights that sum to 100', () => {
    for (const profile of Object.values(SCORING_PROFILES)) {
      expect(
        Object.values(profile.weights).reduce((sum, value) => sum + value, 0),
        profile.id,
      ).toBe(100);
    }
  });

  it('keeps the blocking cap except for the documented staging profile', () => {
    const snapshot = buildSnapshot({
      title: '',
      robotsValues: ['noindex'],
      headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    });
    expect(analyzeSnapshot(snapshot).score.total).toBeLessThanOrEqual(49);
    expect(
      analyzeSnapshot(snapshot, { profileId: 'developer-staging' }).score.capReason,
    ).toBeNull();
  });

  it('keeps ignored findings visible while excluding them from scoring', () => {
    const snapshot = buildSnapshot({ meta: { ogTitle: null, ogImage: null } });
    const normal = analyzeSnapshot(snapshot);
    const ignored = analyzeSnapshot(snapshot, {
      ignoredRuleIds: ['og-title-present', 'og-image-present'],
    });
    expect(
      ignored.findings.filter((finding) => finding.ignored).map((finding) => finding.ruleId),
    ).toEqual(['og-image-present', 'og-title-present']);
    expect(ignored.score.total).toBeGreaterThan(normal.score.total);
  });

  it('allows a built-in staging ignore to be explicitly un-ignored', () => {
    const snapshot = buildSnapshot({ meta: { ogImage: null } });
    const analysis = analyzeSnapshot(snapshot, {
      profileId: 'developer-staging',
      unignoredRuleIds: ['og-image-present'],
    });
    expect(
      analysis.findings.find((finding) => finding.ruleId === 'og-image-present')?.ignored,
    ).toBe(false);
  });
});
