import { describe, expect, it } from 'vitest';
import type { SitePageRecord, SiteSession } from '@vittix/shared';
import { compareSiteSessions } from './site.js';

const session = (
  id: number,
  status: 'completed' | 'failed' = 'completed',
  profileId = 'standard',
): SiteSession => ({
  id,
  origin: 'https://compare.test',
  status,
  startedAt: '2026-01-01',
  finishedAt: '2026-01-02',
  maxPages: 50,
  maxDepth: 2,
  concurrency: 2,
  delayMs: 100,
  robotsStatus: 'allowed',
  pagesDone: 1,
  pagesFailed: 0,
  pagesSkipped: 0,
  stopRequested: false,
  ruleSetVersion: '0.8.0',
  profileId,
  ignoredRuleIds: [],
  unignoredRuleIds: [],
  severityOverrides: {},
  sitemap: {
    entries: [],
    fullyRead: true,
    truncated: false,
    invalidLastmodCount: 0,
    duplicateCount: 0,
    crossOriginCount: 0,
    warnings: [],
  },
  seedFromSitemap: false,
  stopReason: null,
});
const page = (url: string, patch: Partial<SitePageRecord> = {}): SitePageRecord => ({
  id: 1,
  sessionId: 1,
  url,
  finalUrl: url,
  status: 'ok',
  depth: 0,
  httpStatus: 200,
  error: null,
  analyzedAt: '2026-01-01',
  snapshot: { meta: { robots: null } },
  result: { ruleSetVersion: '0.8.0', score: { total: 90 }, findings: [] },
  responseMetadata: null,
  responseFindings: [],
  normalizedTextHash: null,
  simhash64: null,
  similarityWordCount: 0,
  ...patch,
});
describe('stored site comparison', () => {
  it('detects score, noindex, and status regressions without refetching', () => {
    const before = page('https://compare.test/a');
    const after = page('https://compare.test/a', {
      status: 'failed',
      snapshot: { meta: { robots: 'noindex' } },
      result: { ruleSetVersion: '0.8.0', score: { total: 75 }, findings: [] },
    });
    const result = compareSiteSessions(
      { session: session(1), pages: [before] },
      { session: session(2), pages: [after] },
    );
    expect(result.comparable).toBe(true);
    expect(result.regressions.map((r) => r.kind)).toContain('newly-failing-page');
    expect(result.regressions.map((r) => r.kind)).toContain('newly-noindexed');
    expect(result.regressions.map((r) => r.kind)).toContain('score-drop');
  });
  it('refuses profile mismatches and never claims removals when coverage is partial', () => {
    const result = compareSiteSessions(
      { session: session(1), pages: [page('https://compare.test/a')] },
      { session: session(2, 'failed', 'content-site'), pages: [] },
    );
    expect(result.comparable).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.removedPages).toEqual([]);
  });
});
