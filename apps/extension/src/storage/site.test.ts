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
    sitemap: {
      entries: [],
      fullyRead: false,
      truncated: false,
      invalidLastmodCount: 0,
      duplicateCount: 0,
      crossOriginCount: 0,
      warnings: [],
    },
    seedFromSitemap: false,
    ruleSetVersion: RULE_SET_VERSION,
    profileId: 'standard',
    ignoredRuleIds: [],
    unignoredRuleIds: [],
    severityOverrides: {},
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
    responseMetadata: null,
    responseFindings: [],
    normalizedTextHash: null,
    simhash64: null,
    similarityWordCount: 0,
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
      schemaVersion: 3,
      url,
      title,
      headings: [],
      headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      images: [],
      imageCount: 0,
      linkCount: links.length,
      structuredData: [],
      structuredDataCount: 0,
      robotsValues: [],
      hreflang: [],
      hreflangCount: 0,
      textStats: { wordCount: 100, textSampleTruncated: false },
      extractedAt: '2026-10-31T00:00:00.000Z',
      meta: {
        description,
        canonical,
        robots: null,
        viewport: null,
        charset: null,
        lang: 'en',
        ogTitle: null,
        ogDescription: null,
        ogImage: null,
        twitterCard: null,
        twitterTitle: null,
        twitterDescription: null,
        twitterImage: null,
      },
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

describe('Phase 7 — truncation chain (extraction → result → summary → export)', () => {
  it('a text-sample-capped audit is flagged incomplete everywhere', async () => {
    const { PageSnapshotSchema } = await import('@vittix/shared');
    const { analyzeSnapshot, isTruncated, siteAuditToJson } = await import('@vittix/seo-core');
    const { AuditRecordSchema } = await import('@vittix/shared');
    // Build a snapshot whose text sample hit the cap.
    const base = makeOkPage(`${ORIGIN}/huge`) as never as Record<string, unknown>;
    const snapshot = PageSnapshotSchema.parse(base.snapshot);
    const sample = { ...snapshot, textStats: { wordCount: 12_500, textSampleTruncated: true } };
    const analyzed = analyzeSnapshot(sample);
    expect(analyzed.truncated).toBe(true); // result flag
    expect(isTruncated(sample)).toBe(true); // direct helper

    // Dashboard completeness indicator (summary derives from the record).
    const summary = buildSiteSummary(makeSession(), [
      makePage({ ...makeOkPage(`${ORIGIN}/huge`), snapshot: sample, result: analyzed }),
    ]);
    expect(summary.incomplete).toBe(true);

    // The exported JSON cannot present it as fully verified.
    const record = AuditRecordSchema.parse({
      url: sample.url,
      title: 'Huge',
      analyzedAt: '2026-10-31T00:00:00.000Z',
      ruleSetVersion: analyzed.ruleSetVersion,
      snapshot: sample,
      result: analyzed,
    });
    const exported = siteAuditToJson(makeSession(), [
      { ...record, sessionId: 1 } as unknown as SitePageRecord,
    ]);
    expect(exported).toContain('"truncated": true');
  });

  it('a complete audit is never flagged incomplete by the text-sample flag', async () => {
    const { analyzeSnapshot } = await import('@vittix/seo-core');
    const { PageSnapshotSchema } = await import('@vittix/shared');
    const base = makeOkPage(`${ORIGIN}/normal`) as never as Record<string, unknown>;
    const snapshot = PageSnapshotSchema.parse(base.snapshot);
    const analyzed = analyzeSnapshot(snapshot);
    expect(analyzed.truncated).toBe(false);
  });
});
