import { describe, expect, it } from 'vitest';
import {
  CATEGORY_WEIGHTS,
  SCORE_AFFECTING_SEVERITIES,
  computeScore,
  scoreLabel,
} from './scoring.js';
import { CATEGORIES, SEVERITIES, type Finding } from '@vittix/shared';

function synthetic(
  category: Finding['category'],
  severity: Finding['severity'],
  count = 1,
  ruleIdPrefix = 'synthetic',
): Finding[] {
  return Array.from({ length: count }, (_, i) => ({
    ruleId: `${ruleIdPrefix}-${i}`,
    category,
    severity,
    title: 't',
    detail: 'd',
  }));
}

describe('computeScore', () => {
  it('scores a clean result 100', () => {
    const score = computeScore([
      ...synthetic('metadata', 'pass', 3),
      ...synthetic('headings', 'pass', 2),
      ...synthetic('images', 'pass'),
    ]);
    expect(score.total).toBe(100);
    expect(score.label).toBe('Excellent');
    expect(score.preliminary).toBe(true);
  });

  it('applies the documented penalty math (one metadata error → 93)', () => {
    const score = computeScore(synthetic('metadata', 'error'));
    // metadata category: 100 - 25 = 75 → (75*30 + 100*70)/100 = 92.5 → 93
    expect(score.total).toBe(93);
  });

  it('floors a category at 0 (errors can never push below)', () => {
    const score = computeScore(synthetic('images', 'error', 5));
    const images = score.categories.find((c) => c.category === 'images');
    expect(images?.score).toBe(0);
  });

  it('NEVER penalizes info findings (informational ≠ score-affecting)', () => {
    const score = computeScore(synthetic('social', 'info', 4));
    expect(score.total).toBe(100);
    const social = score.categories.find((c) => c.category === 'social');
    expect(social?.score).toBe(100);
  });

  it('never penalizes pass findings', () => {
    const score = computeScore(synthetic('metadata', 'pass', 6));
    expect(score.total).toBe(100);
  });

  it('deduplicates repeated ruleIds so one issue is penalized once', () => {
    // Same ruleId three times in one category: penalty must apply only once.
    const duplicated: Finding[] = [
      { ruleId: 'same-rule', category: 'headings', severity: 'error', title: 't', detail: 'd' },
      { ruleId: 'same-rule', category: 'headings', severity: 'error', title: 't', detail: 'd' },
      { ruleId: 'same-rule', category: 'headings', severity: 'error', title: 't', detail: 'd' },
    ];
    const score = computeScore(duplicated);
    const headings = score.categories.find((c) => c.category === 'headings');
    expect(headings?.score).toBe(75); // one −25, not −75
  });

  it('penalizes the same ruleId in DIFFERENT categories independently', () => {
    const cross: Finding[] = [
      { ruleId: 'dual', category: 'metadata', severity: 'warn', title: 't', detail: 'd' },
      { ruleId: 'dual', category: 'links', severity: 'warn', title: 't', detail: 'd' },
    ];
    const score = computeScore(cross);
    expect(score.categories.find((c) => c.category === 'metadata')?.score).toBe(90);
    expect(score.categories.find((c) => c.category === 'links')?.score).toBe(90);
  });

  it('always returns all six categories with weights summing to 100', () => {
    const score = computeScore([]);
    expect(score.categories).toHaveLength(CATEGORIES.length);
    const weightSum = CATEGORIES.reduce((sum, c) => sum + CATEGORY_WEIGHTS[c], 0);
    expect(weightSum).toBe(100);
  });

  it('is deterministic — repeated calls return identical results', () => {
    const findings = [
      ...synthetic('metadata', 'warn', 2),
      ...synthetic('links', 'error'),
      ...synthetic('images', 'info', 3),
      ...synthetic('technical', 'warn', 2),
    ];
    const a = computeScore(findings);
    const b = computeScore([...findings].reverse());
    expect(a).toEqual(b);
  });

  it('REGRESSION: known score stays stable for a representative mixed audit', () => {
    // If this test fails after an intentional formula change, update the
    // expected value AND docs/SEO_RULES.md in the same commit.
    const findings: Finding[] = [
      { ruleId: 'title-length', category: 'metadata', severity: 'warn', title: 't', detail: 'd' },
      {
        ruleId: 'meta-description-length',
        category: 'metadata',
        severity: 'warn',
        title: 't',
        detail: 'd',
      },
      { ruleId: 'h1-present', category: 'headings', severity: 'error', title: 't', detail: 'd' },
      {
        ruleId: 'image-alt-present',
        category: 'images',
        severity: 'error',
        title: 't',
        detail: 'd',
      },
      { ruleId: 'link-anchor-text', category: 'links', severity: 'error', title: 't', detail: 'd' },
      { ruleId: 'og-image-present', category: 'social', severity: 'info', title: 't', detail: 'd' },
      { ruleId: 'page-https', category: 'technical', severity: 'warn', title: 't', detail: 'd' },
    ];
    const score = computeScore(findings);
    // metadata 100-20=80 · headings 100-25=75 · images 75 · links 75
    // social 100 (info) · technical 90
    // (80*30 + 75*20 + 75*20 + 75*15 + 100*10 + 90*5)/100 = 80.25 → 80
    expect(score.total).toBe(80);
    expect(score.label).toBe('Good');
  });

  it('REGRESSION: an empty finding list always yields a perfect score', () => {
    expect(computeScore([])).toEqual({
      total: 100,
      label: 'Excellent',
      preliminary: true,
      categories: expect.any(Array),
    });
  });

  it('keeps the total within 0–100 for pathological inputs', () => {
    const pathological: Finding[] = SEVERITIES.flatMap((severity) =>
      CATEGORIES.map((category, i) => ({
        ruleId: `p-${category}-${severity}`,
        category,
        severity,
        title: 't',
        detail: 'd',
        ...(i > 0 ? {} : {}),
      })),
    );
    const score = computeScore(pathological);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('only lists error/warn as score-affecting', () => {
    expect(SCORE_AFFECTING_SEVERITIES).toEqual(['error', 'warn']);
  });
});

describe('scoreLabel', () => {
  it('maps totals to labels at the documented thresholds', () => {
    expect(scoreLabel(100)).toBe('Excellent');
    expect(scoreLabel(90)).toBe('Excellent');
    expect(scoreLabel(89)).toBe('Good');
    expect(scoreLabel(75)).toBe('Good');
    expect(scoreLabel(74)).toBe('Needs work');
    expect(scoreLabel(50)).toBe('Needs work');
    expect(scoreLabel(49)).toBe('Poor');
    expect(scoreLabel(0)).toBe('Poor');
  });
});
