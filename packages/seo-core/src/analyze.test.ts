import { describe, expect, it } from 'vitest';
import { analyzeSnapshot, isTruncated } from './analyze.js';
import { buildSnapshot } from './testing/fixtures.js';
import { RULE_IDS, RULE_SET_VERSION } from './rules.js';
import { FINDING_SEVERITY_ORDER } from '@vittix/shared';

describe('analyzeSnapshot', () => {
  it('is deterministic — identical snapshots produce identical results', () => {
    const snapshot = buildSnapshot({
      meta: { description: null, viewport: null },
      descriptions: [],
      headings: [
        { tag: 'h1', text: 'Main' },
        { tag: 'h3', text: 'Skips h2' },
      ],
      headingCounts: { h1: 1, h2: 0, h3: 1, h4: 0, h5: 0, h6: 0 },
    });
    expect(analyzeSnapshot(snapshot)).toEqual(analyzeSnapshot(snapshot));
  });

  it('stamps the rule set version and marks the score preliminary', () => {
    const result = analyzeSnapshot(buildSnapshot());
    expect(result.ruleSetVersion).toBe(RULE_SET_VERSION);
    expect(result.score.preliminary).toBe(true);
  });

  it('softens HTTPS and mixed-content findings to informational on explicit dev origins', () => {
    const snapshot = buildSnapshot({
      url: 'http://127.0.0.1:5173/',
      mixedContentSamples: ['http://localhost:8080/image.png'],
    });
    const result = analyzeSnapshot(snapshot);
    for (const id of ['page-https', 'mixed-content']) {
      const finding = result.findings.find((item) => item.ruleId === id);
      expect(finding?.severity).toBe('info');
      expect(finding?.detail).toContain('development origin');
    }
    expect(
      analyzeSnapshot(buildSnapshot({ url: 'http://example.com/' })).findings.find(
        (item) => item.ruleId === 'page-https',
      )?.severity,
    ).not.toBe('info');
  });

  it('only emits catalogued rules, and covers the always-on ones on a healthy page', () => {
    const result = analyzeSnapshot(buildSnapshot());
    const emitted = new Set(result.findings.map((f) => f.ruleId));
    for (const ruleId of emitted) {
      expect(RULE_IDS).toContain(ruleId);
    }
    // Rules that always emit (pass variant on a healthy page):
    for (const alwaysOn of [
      'title-present',
      'title-length',
      'meta-description-present',
      'meta-description-length',
      'canonical-present',
      'canonical-valid',
      'viewport-present',
      'lang-present',
      'page-https',
      'robots-directives',
      'h1-present',
      'h1-unique',
      'heading-order',
      'image-alt-present',
      'image-alt-empty',
      'image-alt-quality',
      'link-anchor-text',
      'link-named-nonvisually',
      'link-profile',
      'structured-data-present',
      'structured-data-valid',
    ] as const) {
      expect(emitted.has(alwaysOn), `rule ${alwaysOn} missing from a healthy-page result`).toBe(
        true,
      );
    }
    // Violation-only rules must NOT fire on a healthy page:
    for (const violationOnly of ['title-duplicate', 'meta-description-multiple'] as const) {
      expect(emitted.has(violationOnly)).toBe(false);
    }
  });

  it('gives every non-pass finding a remediation hint', () => {
    const result = analyzeSnapshot(
      buildSnapshot({
        title: '',
        meta: {
          description: null,
          canonical: null,
          viewport: null,
          lang: null,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          twitterCard: null,
          robots: 'noindex',
        },
        descriptions: [],
        canonicals: [],
        headings: [],
        headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
        images: [{ src: 'https://example.com/x.png', alt: null }],
        links: [{ href: '/empty', text: '', rel: null, target: null, accessibleName: '' }],
        structuredData: [{ raw: '{ bad json' }],
      }),
    );
    const actionable = result.findings.filter(
      (f) => f.severity === 'error' || f.severity === 'warn',
    );
    expect(actionable.length).toBeGreaterThan(0);
    for (const finding of actionable) {
      expect(finding.remediation, `rule ${finding.ruleId} lacks remediation`).toBeTruthy();
    }
  });

  it('returns findings sorted by severity, most severe first', () => {
    const result = analyzeSnapshot(
      buildSnapshot({
        title: 'x',
        meta: { description: null },
        descriptions: [],
        headings: [],
        headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      }),
    );
    const orders = result.findings.map((f) => FINDING_SEVERITY_ORDER[f.severity]);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
    expect(orders[0]).toBe(0); // at least one error first
  });

  it('produces a bounded score for a badly broken page', () => {
    const result = analyzeSnapshot(
      buildSnapshot({
        title: '',
        meta: {
          description: null,
          canonical: null,
          viewport: null,
          lang: null,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          twitterCard: null,
          robots: 'noindex',
        },
        descriptions: [],
        canonicals: [],
        url: 'http://insecure.example.com/',
        headings: [],
        headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
        images: [{ src: 'https://example.com/x.png', alt: null }],
        imageCount: 1,
        links: [{ href: '/empty', text: '', rel: null, target: null, accessibleName: '' }],
        linkCount: 1,
        structuredData: [{ raw: '{ broken' }],
      }),
    );
    expect(result.score.total).toBeGreaterThanOrEqual(0);
    expect(result.score.total).toBeLessThanOrEqual(100);
    expect(result.findings.some((f) => f.severity === 'error')).toBe(true);
  });
});

describe('isTruncated', () => {
  it('is false for a page within all caps', () => {
    expect(isTruncated(buildSnapshot())).toBe(false);
  });

  it('detects truncated headings via counts', () => {
    // 5 h2s exist on the page, but only 1 was retained.
    const snapshot = buildSnapshot({
      headings: [{ tag: 'h1', text: 'Main' }],
      headingCounts: { h1: 1, h2: 5, h3: 0, h4: 0, h5: 0, h6: 0 },
    });
    expect(isTruncated(snapshot)).toBe(true);
  });

  it('detects truncated images', () => {
    expect(
      isTruncated(
        buildSnapshot({
          images: [{ src: 'https://example.com/a.png', alt: 'x' }],
          imageCount: 9,
        }),
      ),
    ).toBe(true);
  });

  it('detects truncated links', () => {
    expect(
      isTruncated(
        buildSnapshot({
          links: [{ href: '/a', text: 'A', rel: null, target: null, accessibleName: 'A' }],
          linkCount: 30,
        }),
      ),
    ).toBe(true);
  });

  it('detects truncated structured-data blocks', () => {
    expect(
      isTruncated(buildSnapshot({ structuredData: [{ raw: '{}' }], structuredDataCount: 3 })),
    ).toBe(true);
  });
});
