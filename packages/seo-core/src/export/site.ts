import type { SitePageRecord, SiteSession, SiteSessionStatus } from '@vittix/shared';
import { diffSitemap } from '../sitemap.js';
import { detectDuplicateClusters } from '../duplicates.js';
import { buildInternalLinkGraph } from '../link-graph.js';
import { analyzeInternalRedirectLinks } from '../analyzers/site-graph.js';

export const SITE_AUDIT_EXPORT_FORMAT = 'vittix-site-audit';
export const SITE_AUDIT_EXPORT_FORMAT_VERSION = 1;

export interface SiteAuditJsonOptions {
  includePageTextExcerpt?: boolean;
  includeKeyword?: boolean;
  targetKeywords?: Readonly<Record<string, string>>;
  profileId?: string;
  ignoredRuleIds?: readonly string[];
  comparison?: SiteComparison;
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
  const similarityPages = pages
    .filter((page) => page.status === 'ok')
    .map((page) => {
      const snapshot = page.snapshot as {
        title?: string;
        meta?: { description?: string | null; canonical?: string | null; robots?: string | null };
        links?: { href: string; text: string; rel?: string | null }[];
      } | null;
      const noindex = `${snapshot?.meta?.robots ?? ''} ${page.responseMetadata?.xRobotsTag ?? ''}`;
      return {
        url: page.finalUrl ?? page.url,
        title: snapshot?.title,
        description: snapshot?.meta?.description,
        canonical: snapshot?.meta?.canonical,
        noindex: /\b(?:noindex|none)\b/i.test(noindex),
        normalizedTextHash: page.normalizedTextHash,
        simhash64: page.simhash64,
        wordCount: page.similarityWordCount,
      };
    });
  const duplicateClusters = detectDuplicateClusters(similarityPages);
  const linkGraph = buildInternalLinkGraph(
    pages
      .filter((page) => page.status === 'ok')
      .map((page) => ({
        url: page.url,
        finalUrl: page.finalUrl,
        depth: page.depth,
        links: (
          (
            page.snapshot as {
              links?: { href: string; text: string; rel?: string | null }[];
            } | null
          )?.links ?? []
        ).map((link) => ({ url: link.href, text: link.text, rel: link.rel })),
      })),
    session.origin,
    session.status === 'completed' &&
      pages.length < session.maxPages &&
      Boolean(session.sitemap?.fullyRead),
  );
  const redirectedUrls = new Set(
    pages.filter((p) => p.finalUrl && p.finalUrl !== p.url).map((p) => p.url),
  );
  const siteFindings = analyzeInternalRedirectLinks(
    pages
      .filter((p) => p.status === 'ok')
      .map((page) => ({
        url: page.url,
        links: ((page.snapshot as { links?: { href: string }[] } | null)?.links ?? []).map(
          (link) => {
            try {
              return { url: new URL(link.href, page.finalUrl ?? page.url).href };
            } catch {
              return { url: link.href };
            }
          },
        ),
      })),
    redirectedUrls,
  );
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
        ...(options.comparison ? { comparison: options.comparison } : {}),
        duplicateClusters,
        linkGraph,
        siteFindings,
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
  'redirected',
  'redirectOffOrigin',
  'fetchFailedPossibleRedirect',
  'redirectFinalUrl',
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
  'graphFrom',
  'graphTo',
  'graphAnchor',
  'graphNofollow',
  'graphDepth',
  'graphInbound',
  'graphOutbound',
  'graphAnchorDiversity',
  'duplicateKind',
  'duplicateDisposition',
  'duplicateSimilarity',
  'duplicateClusterUrls',
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
      page.responseMetadata?.fetchFailedPossibleRedirect
        ? 'unknown'
        : page.responseMetadata?.redirected
          ? 'yes'
          : 'no',
      page.responseMetadata?.fetchFailedPossibleRedirect
        ? 'unknown'
        : page.responseMetadata?.redirectOffOrigin
          ? 'yes'
          : 'no',
      page.responseMetadata?.fetchFailedPossibleRedirect ? 'yes' : 'no',
      page.responseMetadata?.redirectFinalUrl ?? '',
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
  const graphPages = pages.filter((p) => p.status === 'ok');
  const graph = buildInternalLinkGraph(
    graphPages.map((page) => ({
      url: page.url,
      finalUrl: page.finalUrl,
      depth: page.depth,
      links: (
        (page.snapshot as { links?: { href: string; text: string; rel?: string | null }[] } | null)
          ?.links ?? []
      ).map((link) => ({ url: link.href, text: link.text, rel: link.rel })),
    })),
    session.origin,
    session.status === 'completed' &&
      pages.length < session.maxPages &&
      Boolean(session.sitemap?.fullyRead),
  );
  for (const node of graph.nodes) {
    const row = Array<string>(SITE_CSV_COLUMNS.length).fill('');
    row[0] = node.url;
    row[2] =
      graph.orphanStatus === 'checked'
        ? node.orphanCandidate
          ? 'orphan candidate'
          : 'page'
        : 'page (orphan unchecked)';
    row[32] = 'graph-node';
    row[38] = node.depth === null ? '' : String(node.depth);
    row[39] = String(node.inbound);
    row[40] = String(node.outbound);
    row[41] = String(node.anchorDiversity);
    rows.push(row);
  }
  const duplicateClusters = detectDuplicateClusters(
    graphPages.map((page) => {
      const snapshot = page.snapshot as {
        title?: string;
        meta?: { description?: string | null; canonical?: string | null; robots?: string | null };
      } | null;
      const robots = `${snapshot?.meta?.robots ?? ''} ${page.responseMetadata?.xRobotsTag ?? ''}`;
      return {
        url: page.finalUrl ?? page.url,
        title: snapshot?.title,
        description: snapshot?.meta?.description,
        canonical: snapshot?.meta?.canonical,
        noindex: /\b(?:noindex|none)\b/i.test(robots),
        normalizedTextHash: page.normalizedTextHash,
        simhash64: page.simhash64,
        wordCount: page.similarityWordCount,
      };
    }),
  );
  for (const cluster of duplicateClusters) {
    const row = Array<string>(SITE_CSV_COLUMNS.length).fill('');
    row[2] = 'Similarity heuristic; not a search-engine verdict';
    row[32] = 'duplicate-cluster';
    row[42] = cluster.kind;
    row[43] = cluster.disposition;
    row[44] = String(cluster.similarity);
    row[45] = cluster.urls.join(' | ');
    rows.push(row);
  }
  for (const edge of graph.edges.slice(0, 5000)) {
    const row = Array<string>(SITE_CSV_COLUMNS.length).fill('');
    row[2] = 'edge';
    row[32] = 'graph-edge';
    row[34] = edge.from;
    row[35] = edge.to;
    row[36] = edge.anchorText;
    row[37] = edge.nofollow ? 'yes' : 'no';
    rows.push(row);
  }
  if (graph.edges.length > 5000) {
    const row = Array<string>(SITE_CSV_COLUMNS.length).fill('');
    row[2] = `Graph edge list truncated: ${graph.edges.length - 5000} edges omitted`;
    row[32] = 'graph-truncation';
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
  partial: boolean;
  regressions: {
    severity: 'error' | 'warn' | 'info';
    kind: string;
    url?: string;
    detail: string;
  }[];
  resolvedIssues: { url: string; ruleId: string }[];
  addedPages: string[];
  removedPages: string[];
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
  const beforeProfile = previous.session.profileId ?? 'standard';
  const afterProfile = current.session.profileId ?? 'standard';
  const versionAndProfileMatch = comparable && beforeProfile === afterProfile;
  const complete =
    previous.session.status === 'completed' &&
    current.session.status === 'completed' &&
    !previous.pages.some((p) => p.status === 'pending') &&
    !current.pages.some((p) => p.status === 'pending') &&
    previous.pages.length < previous.session.maxPages &&
    current.pages.length < current.session.maxPages &&
    ![...previous.pages, ...current.pages].some(
      (p) => (p.result as { truncated?: boolean } | null)?.truncated,
    );
  const beforeByUrl = new Map(previous.pages.map((p) => [p.finalUrl ?? p.url, p]));
  const afterByUrl = new Map(current.pages.map((p) => [p.finalUrl ?? p.url, p]));
  const regressions: SiteComparison['regressions'] = [];
  const resolvedIssues: SiteComparison['resolvedIssues'] = [];
  const addedPages: string[] = [];
  const removedPages: string[] = [];
  if (versionAndProfileMatch) {
    for (const [url, now] of afterByUrl) {
      const old = beforeByUrl.get(url);
      if (!old) {
        if (complete) addedPages.push(url);
        continue;
      }
      if (now.status.startsWith('failed') && !old.status.startsWith('failed'))
        regressions.push({
          severity: 'error',
          kind: 'newly-failing-page',
          url,
          detail: 'Page status changed to an error.',
        });
      const oldSnap = old.snapshot as { meta?: { robots?: string | null } } | null;
      const nowSnap = now.snapshot as { meta?: { robots?: string | null } } | null;
      const wasNoindex = /\b(?:noindex|none)\b/i.test(
        `${oldSnap?.meta?.robots ?? ''} ${old.responseMetadata?.xRobotsTag ?? ''}`,
      );
      const isNoindex = /\b(?:noindex|none)\b/i.test(
        `${nowSnap?.meta?.robots ?? ''} ${now.responseMetadata?.xRobotsTag ?? ''}`,
      );
      if (isNoindex && !wasNoindex)
        regressions.push({
          severity: 'warn',
          kind: 'newly-noindexed',
          url,
          detail: 'Page gained a noindex directive.',
        });
      const oldScore = (old.result as { score?: { total?: number } } | null)?.score?.total,
        newScore = (now.result as { score?: { total?: number } } | null)?.score?.total;
      if (oldScore !== undefined && newScore !== undefined && oldScore - newScore >= 10)
        regressions.push({
          severity: 'warn',
          kind: 'score-drop',
          url,
          detail: `Score dropped by ${oldScore - newScore} points.`,
        });
      const oldFindings = new Set(
        (
          (old.result as { findings?: { ruleId: string; severity: string }[] } | null)?.findings ??
          []
        )
          .filter((f) => f.severity !== 'pass')
          .map((f) => f.ruleId),
      );
      const newFindings = (
        (now.result as { findings?: { ruleId: string; severity: string }[] } | null)?.findings ?? []
      ).filter((f) => f.severity !== 'pass');
      for (const f of newFindings) oldFindings.delete(f.ruleId);
      for (const ruleId of oldFindings) resolvedIssues.push({ url, ruleId });
    }
    const duplicateGroups = (list: readonly SitePageRecord[]) =>
      new Set(
        detectDuplicateClusters(
          list
            .filter((p) => p.status === 'ok')
            .map((p) => {
              const snap = p.snapshot as {
                title?: string;
                meta?: {
                  robots?: string | null;
                  description?: string | null;
                  canonical?: string | null;
                };
              } | null;
              return {
                url: p.finalUrl ?? p.url,
                title: snap?.title,
                description: snap?.meta?.description,
                canonical: snap?.meta?.canonical,
                noindex: /\b(?:noindex|none)\b/i.test(
                  `${snap?.meta?.robots ?? ''} ${p.responseMetadata?.xRobotsTag ?? ''}`,
                ),
                normalizedTextHash: p.normalizedTextHash,
                simhash64: p.simhash64,
                wordCount: p.similarityWordCount,
              };
            }),
        ).map((cluster) => `${cluster.kind}:${cluster.urls.slice().sort().join('|')}`),
      );
    const oldClusters = duplicateGroups(previous.pages);
    for (const group of duplicateGroups(current.pages))
      if (!oldClusters.has(group))
        regressions.push({
          severity: 'warn',
          kind: 'new-duplicate-cluster',
          detail: `New similarity cluster: ${group}`,
        });
    if (complete)
      for (const url of beforeByUrl.keys()) if (!afterByUrl.has(url)) removedPages.push(url);
  }
  regressions.sort(
    (a, b) =>
      ({ error: 0, warn: 1, info: 2 })[a.severity] - { error: 0, warn: 1, info: 2 }[b.severity] ||
      a.kind.localeCompare(b.kind) ||
      String(a.url).localeCompare(String(b.url)),
  );
  return {
    comparable: versionAndProfileMatch,
    reason: versionAndProfileMatch
      ? `Both audits ran on rule set v${beforeVersion ?? '?'} and profile ${beforeProfile}.`
      : `Audit settings differ (rule sets ${beforeVersion ?? 'unknown'} vs ${afterVersion ?? 'unknown'}; profiles ${beforeProfile} vs ${afterProfile}) — score and count deltas are not comparable.`,
    partial: !complete,
    regressions: complete ? regressions : regressions,
    resolvedIssues,
    addedPages,
    removedPages,
    before,
    after,
    deltas: {
      auditedPages: after.auditedPages - before.auditedPages,
      totalErrors: after.totalErrors - before.totalErrors,
      totalWarnings: after.totalWarnings - before.totalWarnings,
    },
  };
}
