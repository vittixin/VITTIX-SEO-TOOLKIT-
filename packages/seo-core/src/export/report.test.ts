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
  pages: [{ url: hostile, result: { score: { capReason: hostile } } }],
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
});
