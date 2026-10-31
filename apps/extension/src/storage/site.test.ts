import { describe, expect, it } from 'vitest';
import type { SitePageRecord, SiteSession } from '@vittix/shared';
import { RULE_SET_VERSION } from '@vittix/seo-core';
import { buildSiteSummary } from './site';

// Pure-function tests for the Phase 4 site-summary additions. The session
// and page records are synthetic — no Dexie involved.

const ORIGIN = 'https://site.test';

function makeSession(overrides: Partial<SiteSession> = {}): SiteSession {
  return {
    id: overrides.id ?? 1,
    origin: ORIGIN,
    status: 'completed',
    startedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: '2026-10-31T00:10:00.000Z',
    maxPages: 10,
    maxDepth: 2,
    concurrency: 2,
    delayMs: 100,
    robotsStatus: 'allowed',
    pagesDone: 0,
    pagesFailed: 0,
    pagesSkipped: 0,
    stopRequested: false,
    ruleSetVersion: RULE_SET_VERSION,
    stopReason: null,
    ...overrides,
  };
}

function makePage(overrides: Partial<SitePageRecord>): SitePageRecord {
  return {
    id: 1,
    sessionId: 1,
    url: `${ORIGIN}/`,
    finalUrl: null,
    status: 'pending',
    depth: 0,
    httpStatus: null,
    error: null,
    analyzedAt: null,
    snapshot: null,
    result: null,
    ...overrides,
  };
}

function makeOkPage(
  url: string,
  options: {
    title?: string;
    description?: string | null;
    canonical?: string | null;
    links?: string[];
    score?: number;
    truncated?: boolean;
  } = {},
): SitePageRecord {
  const {
    title = `Title of ${url}`,
    description = `Description of ${url} long enough.`,
    canonical = null,
    links = [],
    score = 90,
    truncated = false,
  } = options;
  return makePage({
    url,
    status: 'ok',
    finalUrl: url,
    httpStatus: 200,
    snapshot: {
      url,
      title,
      meta: { description, canonical, robots: null },
      omitted: {
        headings: 0,
        images: 0,
        links: 0,
        descriptions: 0,
        canonicals: 0,
        structuredData: 0,
        hreflang: 0,
      },
      links: links.map((href) => ({
        href,
        text: 'x',
        rel: null,
        target: null,
        accessibleName: 'x',
      })),
    },
    result: {
      ruleSetVersion: RULE_SET_VERSION,
      truncated,
      score: { total: score, label: 'auto', preliminary: true, categories: [] },
      findings: [],
    },
  });
}

describe('buildSiteSummary — Phase 4 additions', () => {
  it('collects missing titles, descriptions and canonicals', () => {
    const summary = buildSiteSummary(makeSession(), [
      makeOkPage(`${ORIGIN}/a`, { title: '  ', description: null, canonical: null }),
      makeOkPage(`${ORIGIN}/b`),
    ]);
    expect(summary.missingTitle).toEqual([`${ORIGIN}/a`]);
    expect(summary.missingDescription).toEqual([`${ORIGIN}/a`]);
    expect(summary.missingCanonical).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`]);
  });

  it('derives broken-link candidates from VERIFIED failed crawl results only', () => {
    const summary = buildSiteSummary(makeSession(), [
      makeOkPage(`${ORIGIN}/`, { links: ['/dead', '/never-crawled'] }),
      makePage({ url: `${ORIGIN}/dead`, status: 'failed', httpStatus: 404 }),
      // /never-crawled was never fetched — NOT a candidate.
    ]);
    expect(summary.brokenLinkCandidates).toHaveLength(1);
    expect(summary.brokenLinkCandidates[0]?.url).toBe(`${ORIGIN}/dead`);
    expect(summary.brokenLinkCandidates[0]?.httpStatus).toBe(404);
    expect(summary.brokenLinkCandidates[0]?.linkedFrom).toEqual([`${ORIGIN}/`]);
  });

  it('reports orphan pages only with sufficient evidence, else null', () => {
    // Two audited pages → insufficient evidence → null (unchecked, not "none").
    const small = buildSiteSummary(makeSession(), [
      makeOkPage(`${ORIGIN}/`, { links: ['/b'] }),
      makeOkPage(`${ORIGIN}/b`),
    ]);
    expect(small.orphanPages).toBeNull();

    // Three pages; /c and the root have no inbound internal links → orphans.
    const full = buildSiteSummary(makeSession(), [
      makeOkPage(`${ORIGIN}/`, { links: ['/b'] }),
      makeOkPage(`${ORIGIN}/b`),
      makeOkPage(`${ORIGIN}/c`),
    ]);
    expect(full.orphanPages).toEqual([`${ORIGIN}/`, `${ORIGIN}/c`]);
  });

  it('buckets score and error distributions', () => {
    const summary = buildSiteSummary(makeSession(), [
      makeOkPage(`${ORIGIN}/a`, { score: 95 }),
      makeOkPage(`${ORIGIN}/b`, { score: 60 }),
      makeOkPage(`${ORIGIN}/c`, { score: 30 }),
    ]);
    expect(summary.scoreDistribution).toEqual({
      poor: 1,
      needsWork: 1,
      good: 0,
      excellent: 1,
    });
    expect(summary.errorDistribution).toEqual({ clean: 3, some: 0, many: 0 });
  });

  it('marks the audit incomplete when pending pages or truncation exist', () => {
    const pending = buildSiteSummary(makeSession(), [
      makeOkPage(`${ORIGIN}/a`),
      makePage({ url: `${ORIGIN}/pending`, status: 'pending' }),
    ]);
    expect(pending.pendingPages).toBe(1);

    const truncated = buildSiteSummary(makeSession(), [
      makeOkPage(`${ORIGIN}/a`, { truncated: true }),
      makeOkPage(`${ORIGIN}/b`),
      makeOkPage(`${ORIGIN}/c`),
    ]);
    expect(truncated.incomplete).toBe(true);
  });
});
