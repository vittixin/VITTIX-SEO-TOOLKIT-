import { describe, expect, it } from 'vitest';
import { analyzeSnapshot } from '../analyze.js';
import { buildSnapshot } from '../testing/fixtures.js';
import {
  buildAuditMarkdown,
  buildAuditReportHtml,
  escapeReportHtml,
  escapeReportMarkdown,
} from './report.js';
import {
  buildSiteAuditMarkdown,
  buildSiteAuditReportHtml,
  type SiteReportInput,
} from './site-report.js';
import { siteAuditToJson, sitePagesToCsv } from './site.js';

const hostile =
  '<script>alert(1)</script> "><img onerror=alert(2)> javascript:alert(3) ` RTL \u202e';
const audit = (() => {
  const snapshot = buildSnapshot({
    title: hostile,
    url: `javascript:alert(4) ${hostile}`,
    meta: { description: hostile },
    images: [{ src: hostile, alt: hostile }],
    textSummary: {
      sentenceCount: 1,
      paragraphCount: 1,
      keywords: [{ term: hostile, count: 1 }],
      sampleHash: '0'.repeat(16),
      syllableCount: 1,
      leadText: hostile,
    },
  });
  const result = analyzeSnapshot(snapshot, { targetKeyword: hostile });
  result.findings[0] = {
    ...result.findings[0]!,
    evidence: hostile,
    detail: hostile,
    remediation: hostile,
  };
  result.score.capReason = hostile;
  return {
    id: 1,
    url: snapshot.url,
    title: snapshot.title,
    analyzedAt: '2026-10-31T12:00:00.000Z',
    ruleSetVersion: result.ruleSetVersion,
    profileId: 'standard' as const,
    snapshot,
    result,
  };
})();

const site: SiteReportInput = {
  session: {
    origin: 'https://example.test',
    status: 'cancelled',
    startedAt: '2026-10-31T12:00:00Z',
    ruleSetVersion: '0.5.0',
    stopReason: hostile,
  },
  summary: {
    auditedPages: 1,
    failedPages: 1,
    skippedPages: 0,
    pendingPages: 0,
    totalErrors: 2,
    totalWarnings: 1,
    duplicateTitles: [{ title: hostile, urls: [hostile] }],
    duplicateDescriptions: [],
    missingTitle: [hostile],
    missingDescription: [],
    noindexPages: [],
    brokenLinkCandidates: [{ url: hostile, httpStatus: 404, linkedFrom: [hostile] }],
    orphanPages: null,
    scoreDistribution: { poor: 0, needsWork: 1, good: 0, excellent: 0 },
    errorDistribution: { clean: 0, some: 1, many: 0 },
    incomplete: true,
    pages: [
      { url: hostile, status: 'ok', score: 60, errorCount: 2, warnCount: 1, truncated: false },
    ],
  },
  profileId: 'standard',
  ignoredRuleIds: ['ignored-rule'],
  pages: [
    {
      url: hostile,
      result: { score: { capReason: hostile } },
      snapshot: { textSummary: { leadText: hostile } },
      targetKeyword: hostile,
    },
  ],
};

describe('single-audit reports', () => {
  it('produces a deterministic, self-contained semantic HTML report', () => {
    const first = buildAuditReportHtml(audit, { includePreviews: true, includeContentStats: true });
    const second = buildAuditReportHtml(audit, {
      includePreviews: true,
      includeContentStats: true,
    });
    expect(first).toBe(second);
    expect(first).toContain('<html lang="en">');
    expect(first).toContain('scope="col"');
    expect(first).toContain('@media print');
    expect(first).toContain('prefers-color-scheme:dark');
    expect(first).toContain('Score cap:');
    expect(first).toContain('Ignored rules');
    expect(first).toContain('rule set');
    expect(first).not.toContain('<script');
    expect(first).not.toContain('src="javascript:');
    expect(first).toContain('&lt;script&gt;');
    expect(first).not.toContain('Page text excerpt (opt-in)');
    expect(first).not.toContain('Target keyword</dd>');
  });

  it('only includes excerpt and target keyword on explicit opt-in', () => {
    const html = buildAuditReportHtml(audit, {
      includeContentStats: true,
      includePageTextExcerpt: true,
      includeKeyword: true,
      targetKeyword: hostile,
    });
    expect(html).toContain('Page text excerpt (opt-in)');
    expect(html).toContain('Target keyword</dt>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes hostile page text in HTML and Markdown and has no executable page markup', () => {
    const html = buildAuditReportHtml(audit, { includePreviews: true, includeContentStats: true });
    const markdown = buildAuditMarkdown(audit, { includeContentStats: true });
    expect(escapeReportHtml('&<>"\'` ')).toBe('&amp;&lt;&gt;&quot;&#39;&#96; ');
    expect(html).not.toContain('<img onerror');
    expect(html).not.toContain('<script');
    expect(html).toContain('javascript:alert(4)'); // URL is plain text, never a link.
    expect(markdown).not.toContain('<script>');
    expect(markdown).not.toContain('](javascript:');
    expect(markdown).toContain('\\<script\\>');
    expect(markdown).toContain('Evidence: `');
    expect(markdown).toContain('Scores are preliminary');
    expect(escapeReportMarkdown('a|b `c` [d](e)')).toBe('a\\|b \\`c\\` \\[d\\]\\(e\\)');
  });

  it('escapes branding values and only emits safe raster logo URIs', () => {
    const html = buildAuditReportHtml(audit, {
      branding: {
        agencyName: hostile,
        accentColor: 'url(javascript:alert(1))',
        logoDataUri: 'data:image/svg+xml,<svg onload=alert(1) />',
      },
    });
    expect(html).toContain(`&lt;script&gt;alert(1)&lt;/script&gt;`);
    expect(html).not.toContain('--accent:url');
    expect(html).not.toContain('image/svg+xml');
  });
});

describe('site-audit reports', () => {
  it('includes completeness/evidence semantics and safely escapes page-derived content', () => {
    const html = buildSiteAuditReportHtml(site);
    const markdown = buildSiteAuditMarkdown(site);
    expect(html).toContain('Incomplete site audit');
    expect(html).toContain('Stop reason');
    expect(html).toContain('Unchecked: there is not enough inspected link evidence');
    expect(html).toContain('Verified candidates');
    expect(html).toContain('Ignored rules');
    expect(html).toContain('Score cap reasons');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('href="javascript:');
    expect(markdown).toContain('Unchecked: insufficient inspected link evidence.');
    expect(markdown).toContain('Verified means');
    expect(markdown).toContain('Scores are preliminary');
    expect(markdown).not.toContain('<script>');
  });

  it('is deterministic for identical input', () => {
    expect(buildSiteAuditReportHtml(site)).toBe(buildSiteAuditReportHtml(site));
    expect(buildSiteAuditMarkdown(site)).toBe(buildSiteAuditMarkdown(site));
  });

  it('labels generic fetch failures as uncertain instead of claiming an off-origin redirect', () => {
    const uncertain: SiteReportInput = {
      ...site,
      summary: {
        ...site.summary,
        pages: [
          {
            ...site.summary.pages[0]!,
            url: 'https://example.test/no-cors',
            status: 'failed',
            redirected: false,
            redirectOffOrigin: false,
            fetchFailedPossibleRedirect: true,
          },
        ],
      },
    };
    const html = buildSiteAuditReportHtml(uncertain);
    const markdown = buildSiteAuditMarkdown(uncertain);
    expect(html).toContain('Unknown; fetch failed (possible redirect)');
    expect(markdown).toContain('Unknown; fetch failed');
    expect(markdown).toContain('possible redirect');
    expect(html).not.toContain('Off-origin observed');
    expect(markdown).not.toContain('Off-origin observed');
  });

  it('marks the redirect destination as unknown in site CSV after a generic fetch failure', () => {
    const csv = sitePagesToCsv(
      {
        origin: 'https://example.test',
        status: 'failed',
        startedAt: '2026-10-31T12:00:00Z',
        maxPages: 10,
      } as never,
      [
        {
          url: 'https://example.test/no-cors',
          status: 'failed',
          responseMetadata: {
            redirectChain: [],
            redirectObservationUnavailable: false,
            redirected: false,
            redirectOffOrigin: false,
            fetchFailedPossibleRedirect: true,
          },
        } as never,
      ],
    );
    const [header, row] = csv
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(','));
    expect(row?.[header?.indexOf('redirected') ?? -1]).toBe('unknown');
    expect(row?.[header?.indexOf('redirectOffOrigin') ?? -1]).toBe('unknown');
    expect(row?.[header?.indexOf('fetchFailedPossibleRedirect') ?? -1]).toBe('yes');
  });

  it('caps site page tables at 200 rows and points to CSV for the full list', () => {
    const many: SiteReportInput = {
      ...site,
      summary: {
        ...site.summary,
        pages: Array.from({ length: 205 }, (_, index) => ({
          url: `https://example.test/page-${index}`,
          status: 'ok',
          score: 90,
          errorCount: 0,
          warnCount: 0,
          truncated: false,
        })),
      },
    };
    const html = buildSiteAuditReportHtml(many);
    const markdown = buildSiteAuditMarkdown(many);
    expect(html).toContain('Showing 200 rows. See CSV for the full list.');
    expect(markdown).toContain('See CSV for the full page list.');
    expect(html).toContain('page-199');
    expect(html).not.toContain('page-200');
    expect(markdown).toContain('page\\-199');
    expect(markdown).not.toContain('page\\-200');
  });

  it('keeps site excerpts and target keywords private unless explicitly included', () => {
    const html = buildSiteAuditReportHtml(site);
    const markdown = buildSiteAuditMarkdown(site);
    expect(html).not.toContain('Page text excerpt (opt-in)');
    expect(html).not.toContain('Target keyword</dt>');
    expect(markdown).not.toContain('Page text excerpt (opt-in)');
    expect(markdown).not.toContain('Target keyword:');
    const includedHtml = buildSiteAuditReportHtml(site, {
      includePageTextExcerpt: true,
      includeKeyword: true,
    });
    expect(includedHtml).toContain('<strong>Page excerpt:</strong>');
    expect(includedHtml).toContain('Target keyword</th>');
    expect(includedHtml).toContain('&lt;script&gt;');
  });

  it('escapes duplicate-cluster and link-graph page values in site reports', () => {
    const hostileUrl = 'https://example.test/\"><img onerror=alert(1)>';
    const hostile = {
      ...site,
      summary: {
        ...site.summary,
        duplicateClusters: [
          {
            kind: 'near-title',
            urls: [hostileUrl],
            disposition: 'unconsolidated',
            similarity: 0.95,
          },
        ],
        linkGraph: {
          orphanStatus: 'unchecked',
          nodes: [
            {
              url: hostileUrl,
              depth: 0,
              inbound: 1,
              outbound: 1,
              anchorDiversity: 1,
              orphanCandidate: null,
            },
          ],
          edges: [
            {
              from: hostileUrl,
              to: hostileUrl,
              anchorText: '<script>alert(1)</script>',
              nofollow: false,
            },
          ],
          depthHistogram: { '0': 1 },
        },
      },
    } as SiteReportInput;
    const html = buildSiteAuditReportHtml(hostile);
    const markdown = buildSiteAuditMarkdown(hostile);
    expect(html).toContain('&lt;img onerror=alert(1)&gt;');
    expect(html).not.toContain('<img onerror');
    expect(markdown).toContain('https://example\\.test/');
    expect(markdown).not.toContain('<script>alert(1)</script>');
  });

  it('omits site JSON excerpts and keywords by default', () => {
    const session = {
      origin: 'https://example.test',
      status: 'completed',
      startedAt: '2026-10-31T12:00:00Z',
      ruleSetVersion: '0.5.0',
    } as unknown as Parameters<typeof siteAuditToJson>[0];
    const page = {
      url: 'https://example.test/',
      status: 'ok',
      snapshot: { textSummary: { leadText: hostile } },
      targetKeyword: 'stored private keyword',
    } as unknown as Parameters<typeof siteAuditToJson>[1][number];
    const defaults = siteAuditToJson(session, [page]);
    expect(defaults).not.toContain('leadText');
    expect(defaults).not.toContain(hostile);
    expect(defaults).not.toContain('private keyword');
    expect(defaults).not.toContain('stored private keyword');
    const optedIn = siteAuditToJson(session, [page], {
      includePageTextExcerpt: true,
      includeKeyword: true,
      targetKeywords: { [page.url]: 'private keyword' },
    });
    expect(optedIn).toContain('leadText');
    expect(optedIn).toContain('private keyword');
  });
});
