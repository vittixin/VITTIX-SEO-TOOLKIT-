import { describe, expect, it } from 'vitest';
import { analyzeResponseMetadata } from './response.js';
import { analyzeSnapshot } from '../analyze.js';
import { buildSnapshot } from '../testing/fixtures.js';
import type { SiteResponseMetadata } from '@vittix/shared';

const metadata = (overrides: Partial<SiteResponseMetadata> = {}): SiteResponseMetadata => ({
  finalStatus: 200,
  redirectChain: [],
  redirectObservationUnavailable: false,
  contentType: 'text/html; charset=utf-8',
  contentLength: 100,
  contentEncoding: null,
  xRobotsTag: null,
  cacheControl: null,
  hasHsts: true,
  hasCsp: true,
  hasXContentTypeOptions: true,
  hasReferrerPolicy: true,
  hasFrameProtection: true,
  durationMs: 150,
  bodyTruncated: false,
  ...overrides,
});

const find = (findings: ReturnType<typeof analyzeResponseMetadata>, id: string) =>
  findings.find((item) => item.ruleId === id);

describe('site-only response metadata rules', () => {
  it('does not add response rules to single-page analysis', () => {
    const ids = analyzeSnapshot(buildSnapshot()).findings.map((finding) => finding.ruleId);
    for (const id of [
      'redirect-chain-long',
      'redirect-temporary',
      'x-robots-noindex-header',
      'non-html-content-type',
      'slow-response',
      'missing-security-headers',
    ])
      expect(ids).not.toContain(id);
  });

  it('warns only when more than two redirects are observable and reports temporary redirects as info', () => {
    const hops = [301, 302, 307].map((status, index) => ({
      url: `https://example.test/${index}`,
      status,
      location: `/${index + 1}`,
      opaque: false,
    }));
    const findings = analyzeResponseMetadata(null, metadata({ redirectChain: hops }));
    expect(find(findings, 'redirect-chain-long')?.severity).toBe('warn');
    expect(find(findings, 'redirect-temporary')?.severity).toBe('info');
  });

  it('omits redirect results when extension fetch exposes an opaque redirect', () => {
    const findings = analyzeResponseMetadata(
      null,
      metadata({
        redirectObservationUnavailable: true,
        redirectChain: [
          { url: 'https://example.test/a', status: null, location: null, opaque: true },
        ],
      }),
    );
    expect(findings.some((item) => item.ruleId.startsWith('redirect-'))).toBe(false);
  });

  it('emits one blocking noindex issue when the header is the only source', () => {
    const findings = analyzeResponseMetadata(null, metadata({ xRobotsTag: 'noindex, follow' }));
    expect(find(findings, 'x-robots-noindex-header')?.severity).toBe('error');
  });

  it('keeps an X-Robots-Tag noindex as a blocking score-cap reason', () => {
    const result = analyzeSnapshot(buildSnapshot(), {
      responseMetadata: metadata({ xRobotsTag: 'noindex' }),
    });
    expect(result.score.total).toBeLessThanOrEqual(49);
    expect(result.score.capReason).toContain('x-robots-noindex-header');
  });

  it('does not double-penalize a noindex also present in meta robots', () => {
    const findings = analyzeResponseMetadata(
      buildSnapshot({ meta: { robots: 'noindex' } }),
      metadata({ xRobotsTag: 'noindex' }),
    );
    expect(find(findings, 'x-robots-noindex-header')).toBeUndefined();
  });

  it('marks non-HTML as info and measures browser/network response time at documented thresholds', () => {
    const findings = analyzeResponseMetadata(
      null,
      metadata({ contentType: 'application/pdf', durationMs: 5_000 }),
    );
    expect(find(findings, 'non-html-content-type')?.severity).toBe('info');
    expect(find(findings, 'slow-response')?.severity).toBe('warn');
    expect(find(findings, 'slow-response')?.detail).toContain('not a lab performance test');
    expect(
      find(analyzeResponseMetadata(null, metadata({ durationMs: 2_000 })), 'slow-response')
        ?.severity,
    ).toBe('info');
  });

  it('reports missing security headers as info, never score-affecting', () => {
    const finding = find(
      analyzeResponseMetadata(
        null,
        metadata({ hasHsts: false, hasCsp: false, hasXContentTypeOptions: false }),
      ),
      'missing-security-headers',
    );
    expect(finding?.severity).toBe('info');
    expect(finding?.detail).toContain('Strict-Transport-Security');
  });
});
