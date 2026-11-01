import type { SitePageRecord, SiteSession, SiteSessionStatus } from '@vittix/shared';
import { diffSitemap } from '../sitemap.js';

export const SITE_AUDIT_EXPORT_FORMAT = 'vittix-site-audit';
export const SITE_AUDIT_EXPORT_FORMAT_VERSION = 1;

export interface SiteAuditJsonOptions {
  includePageTextExcerpt?: boolean;
  includeKeyword?: boolean;
  targetKeywords?: Readonly<Record<string, string>>;
  profileId?: string;
  ignoredRuleIds?: readonly string[];
}

/** Serialize a site audit; page text and per-URL keywords are explicit opt-ins. */
export function siteAuditToJson(
  session: SiteSession,
  pages: SitePageRecord[],
  options: SiteAuditJsonOptions = {},
): string {
  const safePages = pages.map((page) => {
    const { targetKeyword: storedKeyword, ...pageWithoutKeyword } = page as SitePageRecord & {
      targetKeyword?: string;
    };
    const snapshot = page.snapshot as {
      textSummary?: Record<string, unknown>;
      [key: string]: unknown;
    } | null;
    let safePage: SitePageRecord & { targetKeyword?: string } = { ...pageWithoutKeyword };
    if (snapshot && typeof snapshot === 'object' && snapshot.textSummary) {
      const { leadText, ...summary } = snapshot.textSummary;
      safePage = {
        ...safePage,
        snapshot: {
          ...snapshot,
          textSummary: {
            ...summary,
            ...(options.includePageTextExcerpt ? { leadText } : {}),
          },
        },
      };
    }
    if (options.includeKeyword && options.targetKeywords?.[page.url])
      safePage.targetKeyword = options.targetKeywords[page.url];
    void storedKeyword;
    return safePage;
  });
  const ignoredRules = options.ignoredRuleIds
    ? [...options.ignoredRuleIds]
    : [
        ...new Set(
          pages.flatMap((page) => {
            const result = page.result as {
              findings?: { ruleId: string; ignored?: boolean }[];
            } | null;
            return (
              result?.findings
                ?.filter((finding) => finding.ignored)
                .map((finding) => finding.ruleId) ?? []
            );
          }),
        ),
      ];
  const scoreCapReasons = [
    ...new Set(
      pages
        .map(
          (page) =>
            (page.result as { score?: { capReason?: string | null } } | null)?.score?.capReason,
        )
        .filter((reason): reason is string => Boolean(reason)),
    ),
  ];
  const sitemapDiff = diffSitemap({
    state: session.sitemap ?? {
      entries: [],
      fullyRead: false,
      truncated: false,
      invalidLastmodCount: 0,
      duplicateCount: 0,
      crossOriginCount: 0,
      warnings: [],
    },
    crawledUrls: pages
      .filter((page) => page.status !== 'pending' && page.status !== 'skipped-robots')
      .map((page) => page.url),
    pageStates: pages
      .filter((page) => page.status !== 'pending' && page.status !== 'skipped-robots')
      .map((page) => {
        const snapshot = page.snapshot as {
          meta?: { robots?: string | null; canonical?: string | null };
        } | null;
        const robots =
          `${snapshot?.meta?.robots ?? ''} ${page.responseMetadata?.xRobotsTag ?? ''}`.toLowerCase();
        return {
          url: page.url,
          noindex: /\b(?:noindex|none)\b/.test(robots),
          status: page.httpStatus,
          redirected: Boolean(
            page.responseMetadata?.redirectChain.length ||
            (page.finalUrl && page.finalUrl !== page.url),
          ),
          canonical: snapshot?.meta?.canonical ?? null,
        };
      }),
  });
  return JSON.stringify(
    {
      format: SITE_AUDIT_EXPORT_FORMAT,
      formatVersion: SITE_AUDIT_EXPORT_FORMAT_VERSION,
      generatedBy: 'Vittix SEO Toolkit',
      reportMeta: {
        profileId: options.profileId ?? 'unknown',
        ruleSetVersion: session.ruleSetVersion ?? 'unknown',
        ignoredRules,
        scoreCapReasons,
        sitemapDiff,
      },
      session,
      pages: safePages,
    },
    null,
    2,
  );
}

const SITE_CSV_COLUMNS = [
  'url',
  'finalUrl',
  'status',
  'httpStatus',
  'depth',
  'score',
  'errors',
  'warnings',
  'incomplete',
  'contentType',
  'contentLength',
  'contentEncoding',
  'durationMs',
  'redirectCount',
  'redirectObservationUnavailable',
  'xRobotsTag',
  'cacheControl',
  'hasHsts',
  'hasCsp',
  'hasXContentTypeOptions',
  'hasReferrerPolicy',
  'hasFrameProtection',
  'sitemapStatus',
  'sitemapLastmod',
  'sitemapChecked',
  'sitemapNotCrawledCount',
  'sitemapCrawledAbsentCount',
  'sitemapAbsentStatus',
  'sitemapInvalidLastmodCount',
  'sitemapDuplicateCount',
  'sitemapCrossOriginIgnored',
  'sitemapWarnings',
  'recordType',
  'sitemapUrl',
] as const;

/**
 * Per-page summary CSV for a site audit. Findings themselves are exported
 * per page from the dashboard (single-page CSV export); this file is the
 * site-level overview.
 */
export function sitePagesToCsv(session: SiteSession, pages: SitePageRecord[]): string {
  const rows: string[][] = [[...SITE_CSV_COLUMNS]];
  const sitemap = session.sitemap ?? {
    entries: [],
    fullyRead: false,
    truncated: false,
    invalidLastmodCount: 0,
    duplicateCount: 0,
    crossOriginCount: 0,
    warnings: [],
  };
  const notCrawledCount = sitemap.entries.filter(
    (entry) =>
      !pages.some(
        (page) =>
          page.url === entry.url && page.status !== 'pending' && page.status !== 'skipped-robots',
      ),
  ).length;
  for (const page of pages) {
    const result = page.result as {
      score?: { total?: number };
      findings?: { severity: string }[];
      truncated?: boolean;
    } | null;
    const findings = result?.findings ?? [];
    rows.push([
      page.url,
      page.finalUrl ?? '',
      page.status,
      page.httpStatus === null ? '' : String(page.httpStatus),
      String(page.depth),
      result?.score?.total === undefined || result?.score?.total === null
        ? ''
        : String(result.score.total),
      String(findings.filter((f) => f.severity === 'error').length),
      String(findings.filter((f) => f.severity === 'warn').length),
      result?.truncated === true ? 'yes' : 'no',
      page.responseMetadata?.contentType ?? '',
      page.responseMetadata?.contentLength == null
        ? ''
        : String(page.responseMetadata.contentLength),
      page.responseMetadata?.contentEncoding ?? '',
      page.responseMetadata?.durationMs == null
        ? ''
        : String(Math.round(page.responseMetadata.durationMs)),
      page.responseMetadata?.redirectObservationUnavailable
        ? ''
        : String(page.responseMetadata?.redirectChain.length ?? 0),
      page.responseMetadata?.redirectObservationUnavailable ? 'yes' : 'no',
      page.responseMetadata?.xRobotsTag ?? '',
      page.responseMetadata?.cacheControl ?? '',
      page.responseMetadata?.hasHsts ? 'yes' : 'no',
      page.responseMetadata?.hasCsp ? 'yes' : 'no',
      page.responseMetadata?.hasXContentTypeOptions ? 'yes' : 'no',
      page.responseMetadata?.hasReferrerPolicy ? 'yes' : 'no',
      page.responseMetadata?.hasFrameProtection ? 'yes' : 'no',
      sitemap.entries.some((entry) => entry.url === page.url)
        ? 'listed'
        : sitemap.fullyRead && !sitemap.truncated
          ? 'absent'
          : 'unchecked',
      sitemap.entries.find((entry) => entry.url === page.url)?.lastmod ?? '',
      sitemap.fullyRead && !sitemap.truncated ? 'yes' : 'no',
      String(notCrawledCount),
      sitemap.fullyRead && !sitemap.truncated
        ? String(
            pages.filter(
              (page) =>
                page.status === 'ok' && !sitemap.entries.some((entry) => entry.url === page.url),
            ).length,
          )
        : '',
      sitemap.fullyRead && !sitemap.truncated ? 'checked' : 'unchecked',
      String(sitemap.invalidLastmodCount ?? 0),
      String(sitemap.duplicateCount ?? 0),
      String(sitemap.crossOriginCount ?? 0),
      sitemap.warnings.join('; '),
      'page',
      '',
    ]);
  }
  for (const entry of sitemap.entries) {
    const fetched = pages.some(
      (page) =>
        page.url === entry.url && page.status !== 'pending' && page.status !== 'skipped-robots',
    );
    if (fetched) continue;
    const row = Array<string>(SITE_CSV_COLUMNS.length).fill('');
    row[0] = entry.url;
    row[2] = 'not crawled';
    row[22] = 'not crawled';
    row[23] = entry.lastmod ?? '';
    row[24] = sitemap.fullyRead && !sitemap.truncated ? 'yes' : 'no';
    row[25] = String(notCrawledCount);
    row[27] = sitemap.fullyRead && !sitemap.truncated ? 'checked' : 'unchecked';
    row[28] = String(sitemap.invalidLastmodCount ?? 0);
    row[29] = String(sitemap.duplicateCount ?? 0);
    row[30] = String(sitemap.crossOriginCount ?? 0);
    row[31] = sitemap.warnings.join('; ');
    row[32] = 'sitemap-entry';
    row[33] = entry.url;
    rows.push(row);
  }
  void session; // session metadata is in the JSON export
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180 escaping + spreadsheet formula-injection guard. */
function csvEscape(value: string): string {
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface SiteComparison {
  comparable: boolean;
  reason: string;
  before: {
    sessionId?: number;
    finishedAt: string | null;
    auditedPages: number;
    totalErrors: number;
    totalWarnings: number;
    status: SiteSessionStatus;
  };
  after: {
    sessionId?: number;
    finishedAt: string | null;
    auditedPages: number;
    totalErrors: number;
    totalWarnings: number;
    status: SiteSessionStatus;
  };
  deltas: { auditedPages: number; totalErrors: number; totalWarnings: number };
}

/** The rule-set version in effect for a session (from its audited pages). */
export function sessionRuleSetVersion(pages: readonly SitePageRecord[]): string | null {
  for (const page of pages) {
    const result = page.result as { ruleSetVersion?: string } | null;
    if (result?.ruleSetVersion !== undefined) return result.ruleSetVersion;
  }
  return null;
}

/**
 * Compare two completed sessions of the same origin. Comparison is only
 * offered when BOTH sessions ran on the same rule-set version — otherwise
 * the deltas would mix two scoring models (see docs/SEO_RULES.md).
 */
export function compareSiteSessions(
  previous: { session: SiteSession; pages: readonly SitePageRecord[] },
  current: { session: SiteSession; pages: readonly SitePageRecord[] },
): SiteComparison {
  const beforeVersion = sessionRuleSetVersion(previous.pages);
  const afterVersion = sessionRuleSetVersion(current.pages);

  const summarize = (session: SiteSession, pages: readonly SitePageRecord[]) => {
    let auditedPages = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    for (const page of pages) {
      const result = page.result as { score?: unknown; findings?: { severity: string }[] } | null;
      if (result === null || result.score === undefined) continue;
      auditedPages += 1;
      totalErrors += (result.findings ?? []).filter((f) => f.severity === 'error').length;
      totalWarnings += (result.findings ?? []).filter((f) => f.severity === 'warn').length;
    }
    return {
      sessionId: session.id,
      finishedAt: session.finishedAt,
      auditedPages,
      totalErrors,
      totalWarnings,
      status: session.status,
    };
  };

  const before = summarize(previous.session, previous.pages);
  const after = summarize(current.session, current.pages);

  const comparable = beforeVersion !== null && beforeVersion === afterVersion;
  return {
    comparable,
    reason: comparable
      ? `Both audits ran on rule set v${beforeVersion ?? '?'}.`
      : `Rule-set versions differ (${beforeVersion ?? 'unknown'} vs ${afterVersion ?? 'unknown'}) — score and count deltas are not comparable.`,
    before,
    after,
    deltas: {
      auditedPages: after.auditedPages - before.auditedPages,
      totalErrors: after.totalErrors - before.totalErrors,
      totalWarnings: after.totalWarnings - before.totalWarnings,
    },
  };
}
