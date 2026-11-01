import {
  SITE_LIMITS,
  SitePageRecordSchema,
  SiteSessionSchema,
  type AnalysisResult,
  type PageSnapshot,
  type SitePageInput,
  type SitePageRecord,
  type SitePageStatus,
  type SiteSession,
  type SiteSessionInput,
} from '@vittix/shared';
import { db } from './db';
import { diffSitemap } from '@vittix/seo-core';
import {
  detectDuplicateClusters,
  buildInternalLinkGraph,
  analyzeInternalRedirectLinks,
} from '@vittix/seo-core';

/**
 * Durable site-audit state (crawl state lives in IndexedDB — never in a
 * service worker). Session + page records survive tab closes so an audit
 * can be resumed or discarded from the dashboard.
 *
 * Writes use the schema input shape (defaults may be omitted); reads are
 * validated through the Zod schemas so persisted rows always expose the
 * full output shape, and malformed rows are skipped with a warning.
 */

export async function createSiteSession(session: SiteSessionInput): Promise<number> {
  const id = (await db.siteAudits.add(session)) as number;
  await pruneSiteSessions();
  return id;
}

export async function getSiteSession(id: number): Promise<SiteSession | null> {
  const row = await db.siteAudits.get(id);
  if (row === undefined) return null;
  const parsed = SiteSessionSchema.safeParse(row);
  if (!parsed.success) {
    console.warn('[vittix] skipping malformed site session', id);
    return null;
  }
  return parsed.data;
}

export async function getLatestSiteSession(): Promise<SiteSession | null> {
  const [latest] = await db.siteAudits.orderBy('startedAt').reverse().limit(1).toArray();
  if (latest === undefined) return null;
  const parsed = SiteSessionSchema.safeParse(latest);
  return parsed.success ? parsed.data : null;
}

/**
 * The most recent completed session for the same origin, excluding the
 * given session — used for the site-audit comparison view.
 */
export async function getPreviousSiteSession(
  origin: string,
  excludeId: number,
): Promise<SiteSession | null> {
  const sessions = await listSiteSessions();
  for (const session of sessions) {
    if (session.id === undefined || session.id === excludeId) continue;
    if (session.origin !== origin) continue;
    if (session.status !== 'completed') continue;
    return session;
  }
  return null;
}

export async function listSiteSessions(
  limit = SITE_LIMITS.maxStoredSessions,
): Promise<SiteSession[]> {
  const rows = await db.siteAudits.orderBy('startedAt').reverse().limit(limit).toArray();
  return rows
    .map((row) => SiteSessionSchema.safeParse(row))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export async function updateSiteSession(
  id: number,
  changes: Partial<SiteSessionInput>,
): Promise<void> {
  await db.siteAudits.update(id, changes);
}

export async function addSitePages(records: SitePageInput[]): Promise<void> {
  await db.sitePages.bulkAdd(records);
}

export async function listSitePages(sessionId: number): Promise<SitePageRecord[]> {
  const rows = await db.sitePages.where('sessionId').equals(sessionId).toArray();
  return rows
    .map((row) => SitePageRecordSchema.safeParse(row))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export async function updateSitePage(id: number, changes: Partial<SitePageInput>): Promise<void> {
  await db.sitePages.update(id, changes);
}

export async function deleteSiteSession(id: number): Promise<void> {
  await db.transaction('rw', db.siteAudits, db.sitePages, async () => {
    await db.sitePages.where('sessionId').equals(id).delete();
    await db.siteAudits.delete(id);
  });
}

export async function clearAllSiteData(): Promise<void> {
  await db.transaction('rw', db.siteAudits, db.sitePages, async () => {
    await db.sitePages.clear();
    await db.siteAudits.clear();
  });
}

/** Keep the most recent sessions; drop older ones with their pages. */
async function pruneSiteSessions(): Promise<void> {
  const sessions = await db.siteAudits.orderBy('startedAt').reverse().toArray();
  const excess = sessions.slice(SITE_LIMITS.maxStoredSessions);
  for (const session of excess) {
    if (session.id !== undefined) await deleteSiteSession(session.id);
  }
}

// --- site-level summary (Task 5) --------------------------------------------

export interface SitePageSummary {
  id?: number;
  url: string;
  finalUrl: string | null;
  status: SitePageStatus;
  httpStatus: number | null;
  depth: number;
  score: number | null;
  errorCount: number;
  warnCount: number;
  truncated: boolean;
  contentType: string | null;
  responseTimeMs: number | null;
  redirectCount: number | null;
  redirected: boolean;
  redirectOffOrigin: boolean;
  xRobotsTag: string | null;
}

export interface SiteSummary {
  auditedPages: number;
  failedPages: number;
  skippedPages: number;
  pendingPages: number;
  totalErrors: number;
  totalWarnings: number;
  duplicateTitles: { title: string; urls: string[] }[];
  duplicateDescriptions: { description: string; urls: string[] }[];
  missingTitle: string[];
  missingDescription: string[];
  missingCanonical: string[];
  noindexPages: string[];
  /**
   * Pages that failed this crawl with an HTTP error status, plus the audited
   * pages linking to them. VERIFIED crawl results only — a link to a URL
   * that was never fetched is NOT a candidate.
   */
  brokenLinkCandidates: { url: string; httpStatus: number | null; linkedFrom: string[] }[];
  /**
   * Audited pages no other audited page links to internally. Only computed
   * when discovery evidence is sufficient (≥3 audited pages); otherwise null
   * (unchecked, not "none").
   */
  orphanPages: string[] | null;
  /** Per-page preliminary score buckets: 0–49, 50–74, 75–89, 90–100. */
  scoreDistribution: { poor: number; needsWork: number; good: number; excellent: number };
  /** Per-page error counts: pages with 0 / 1–2 / 3+ errors. */
  errorDistribution: { clean: number; some: number; many: number };
  internalLinks: number;
  externalLinks: number;
  incomplete: boolean;
  pages: SitePageSummary[];
  sitemap: ReturnType<typeof diffSitemap>;
  duplicateClusters: ReturnType<typeof detectDuplicateClusters>;
  linkGraph: ReturnType<typeof buildInternalLinkGraph>;
  siteFindings: ReturnType<typeof analyzeInternalRedirectLinks>;
}

/**
 * Site-level report derived ONLY from pages actually inspected (status 'ok').
 * Failed/skipped URLs are listed but contribute no findings.
 */
export function buildSiteSummary(session: SiteSession, pages: SitePageRecord[]): SiteSummary {
  const okPages = pages.filter((page) => page.status === 'ok' && page.snapshot && page.result);
  const similarityPages = okPages.map((page) => {
    const snapshot = page.snapshot as PageSnapshot;
    const robots =
      `${snapshot.meta.robots ?? ''} ${page.responseMetadata?.xRobotsTag ?? ''}`.toLowerCase();
    return {
      url: page.finalUrl ?? page.url,
      title: snapshot.title,
      description: snapshot.meta.description,
      canonical: snapshot.meta.canonical,
      noindex: /\b(?:noindex|none)\b/.test(robots),
      normalizedTextHash: page.normalizedTextHash,
      simhash64: page.simhash64,
      wordCount: page.similarityWordCount,
    };
  });
  const duplicateClusters = detectDuplicateClusters(similarityPages);
  const linkGraph = buildInternalLinkGraph(
    okPages.map((page) => ({
      url: page.url,
      finalUrl: page.finalUrl,
      depth: page.depth,
      links: (page.snapshot as PageSnapshot).links.map((link) => ({
        url: resolveDiscoveredLink(link.href, page.finalUrl ?? page.url),
        text: link.text,
        rel: link.rel,
      })),
    })),
    normalizeDiscoveredLink(session.origin) ?? session.origin,
    session.status === 'completed' &&
      pages.length < session.maxPages &&
      !pages.some((page) => page.status === 'pending') &&
      Boolean(session.sitemap?.fullyRead),
  );
  const redirectedUrls = new Set(
    okPages.filter((page) => page.finalUrl && page.finalUrl !== page.url).map((page) => page.url),
  );
  const siteFindings = analyzeInternalRedirectLinks(
    okPages.map((page) => ({
      url: page.url,
      links: (page.snapshot as PageSnapshot).links.map((link) => ({
        url: resolveDiscoveredLink(link.href, page.finalUrl ?? page.url),
      })),
    })),
    redirectedUrls,
  );
  const titleMap = new Map<string, string[]>();
  const descriptionMap = new Map<string, string[]>();
  const missingTitle: string[] = [];
  const missingDescription: string[] = [];
  const missingCanonical: string[] = [];
  const noindexPages: string[] = [];
  const scoreDistribution = { poor: 0, needsWork: 0, good: 0, excellent: 0 };
  const errorDistribution = { clean: 0, some: 0, many: 0 };
  /** normalized internal URL → audited pages linking to it */
  const internalLinkSources = new Map<string, Set<string>>();
  let totalErrors = 0;
  let totalWarnings = 0;
  let internalLinks = 0;
  let externalLinks = 0;
  let incomplete = false;

  let origin: string | null = null;
  try {
    origin = new URL(session.origin).origin;
  } catch {
    origin = null;
  }

  for (const page of okPages) {
    const snapshot = page.snapshot as PageSnapshot;
    const result = page.result as AnalysisResult;
    if (result.truncated) incomplete = true;
    if (snapshot.omitted && Object.values(snapshot.omitted).some((count) => count > 0)) {
      incomplete = true;
    }
    const pageErrors = result.findings.filter((finding) => finding.severity === 'error').length;
    totalErrors += pageErrors;
    totalWarnings += result.findings.filter((finding) => finding.severity === 'warn').length;
    if (pageErrors === 0) errorDistribution.clean += 1;
    else if (pageErrors <= 2) errorDistribution.some += 1;
    else errorDistribution.many += 1;

    const score = result.score.total;
    if (score >= 90) scoreDistribution.excellent += 1;
    else if (score >= 75) scoreDistribution.good += 1;
    else if (score >= 50) scoreDistribution.needsWork += 1;
    else scoreDistribution.poor += 1;

    const title = snapshot.title.trim();
    if (title === '') missingTitle.push(page.url);
    else {
      const urls = titleMap.get(title.toLowerCase()) ?? [];
      urls.push(page.url);
      titleMap.set(title.toLowerCase(), urls);
    }

    const description = (snapshot.meta.description ?? '').trim();
    if (description === '') missingDescription.push(page.url);
    else {
      const urls = descriptionMap.get(description.toLowerCase()) ?? [];
      urls.push(page.url);
      descriptionMap.set(description.toLowerCase(), urls);
    }

    if ((snapshot.meta.canonical ?? '').trim() === '') missingCanonical.push(page.url);

    const robots = (snapshot.meta.robots ?? '').toLowerCase();
    if (/\bnoindex\b/.test(robots) || /\bnone\b/.test(robots)) noindexPages.push(page.url);

    for (const link of snapshot.links) {
      try {
        const resolved = new URL(link.href, page.url);
        if (origin !== null && resolved.origin === origin) {
          internalLinks += 1;
          const normalizedTarget = normalizeDiscoveredLink(resolved.href);
          if (normalizedTarget !== null) {
            const sources = internalLinkSources.get(normalizedTarget) ?? new Set<string>();
            sources.add(page.url);
            internalLinkSources.set(normalizedTarget, sources);
          }
        } else {
          externalLinks += 1;
        }
      } catch {
        // unresolvable — not counted
      }
    }
  }

  // Broken-link candidates: this crawl FAILED to fetch a URL with an HTTP
  // error, and an audited page links to it. Verified evidence only.
  const linkedFromFor = (url: string): string[] => {
    const normalized = normalizeDiscoveredLink(url);
    return normalized !== null
      ? [...(internalLinkSources.get(normalized) ?? [])].filter((source) => source !== url)
      : [];
  };
  const brokenLinkCandidates = pages
    .filter((page) => page.status === 'failed' && page.httpStatus !== null)
    .map((page) => ({
      url: page.url,
      httpStatus: page.httpStatus,
      linkedFrom: linkedFromFor(page.url),
    }))
    .filter((candidate) => candidate.linkedFrom.length > 0);

  // Orphan pages: audited pages nobody internally links to. Only meaningful
  // with enough discovery evidence — otherwise null (UNCHECKED).
  const auditedUrls = new Set(okPages.map((page) => page.url));
  const orphanPages =
    okPages.length >= 3
      ? [...auditedUrls].filter((url) => {
          const sources = linkedFromFor(url);
          return sources.filter((source) => auditedUrls.has(source)).length === 0;
        })
      : null;

  const duplicatesFrom = (map: Map<string, string[]>): { value: string; urls: string[] }[] =>
    [...map.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([value, urls]) => ({ value, urls }));

  return {
    auditedPages: okPages.length,
    failedPages: pages.filter((page) => page.status.startsWith('failed')).length,
    skippedPages: pages.filter((page) => page.status.startsWith('skipped')).length,
    pendingPages: pages.filter((page) => page.status === 'pending').length,
    totalErrors,
    totalWarnings,
    duplicateTitles: duplicatesFrom(titleMap).map((entry) => ({
      title: entry.value,
      urls: entry.urls,
    })),
    duplicateDescriptions: duplicatesFrom(descriptionMap).map((entry) => ({
      description: entry.value,
      urls: entry.urls,
    })),
    missingTitle,
    missingDescription,
    missingCanonical,
    noindexPages,
    brokenLinkCandidates,
    orphanPages,
    scoreDistribution,
    errorDistribution,
    internalLinks,
    externalLinks,
    incomplete,
    pages: pages.map((page) => {
      const result = page.result as AnalysisResult | null;
      const findings = result?.findings ?? page.responseFindings ?? [];
      return {
        id: page.id,
        url: page.url,
        finalUrl: page.finalUrl,
        status: page.status,
        httpStatus: page.httpStatus,
        depth: page.depth,
        score: result?.score.total ?? null,
        errorCount: findings.filter((finding) => finding.severity === 'error').length,
        warnCount: findings.filter((finding) => finding.severity === 'warn').length,
        truncated: result?.truncated ?? false,
        contentType: page.responseMetadata?.contentType ?? null,
        responseTimeMs: page.responseMetadata?.durationMs ?? null,
        redirectCount: page.responseMetadata?.redirectObservationUnavailable
          ? null
          : (page.responseMetadata?.redirectChain.length ?? 0),
        redirected: page.responseMetadata?.redirected ?? false,
        redirectOffOrigin: page.responseMetadata?.redirectOffOrigin ?? false,
        xRobotsTag: page.responseMetadata?.xRobotsTag ?? null,
      };
    }),
    sitemap: diffSitemap({
      state: session.sitemap,
      crawledUrls: pages
        .filter((page) => page.status !== 'pending' && page.status !== 'skipped-robots')
        .map((page) => page.url),
      pageStates: pages
        .filter((page) => page.status !== 'pending' && page.status !== 'skipped-robots')
        .map((page) => {
          const snapshot = page.snapshot as PageSnapshot | null;
          const robots =
            `${snapshot?.meta.robots ?? ''} ${page.responseMetadata?.xRobotsTag ?? ''}`.toLowerCase();
          return {
            url: page.url,
            noindex: /\b(?:noindex|none)\b/.test(robots),
            status: page.httpStatus,
            redirected: Boolean(
              page.responseMetadata?.redirectChain.length ||
              (page.finalUrl && page.finalUrl !== page.url),
            ),
            canonical: snapshot?.meta.canonical ?? null,
          };
        }),
    }),
    duplicateClusters,
    linkGraph,
    siteFindings,
  };
}

/** Normalize an internal link target for link-graph matching. */
function normalizeDiscoveredLink(href: string): string | null {
  try {
    const parsed = new URL(href);
    parsed.hash = '';
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.href;
  } catch {
    return null;
  }
}

function resolveDiscoveredLink(href: string, base: string): string {
  try {
    return normalizeDiscoveredLink(new URL(href, base).href) ?? href;
  } catch {
    return href;
  }
}
