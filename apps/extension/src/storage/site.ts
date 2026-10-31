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
  missingCanonical: string[];
  noindexPages: string[];
  internalLinks: number;
  externalLinks: number;
  incomplete: boolean;
  pages: SitePageSummary[];
}

/**
 * Site-level report derived ONLY from pages actually inspected (status 'ok').
 * Failed/skipped URLs are listed but contribute no findings.
 */
export function buildSiteSummary(session: SiteSession, pages: SitePageRecord[]): SiteSummary {
  const okPages = pages.filter((page) => page.status === 'ok' && page.snapshot && page.result);
  const titleMap = new Map<string, string[]>();
  const descriptionMap = new Map<string, string[]>();
  const missingCanonical: string[] = [];
  const noindexPages: string[] = [];
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
    totalErrors += result.findings.filter((finding) => finding.severity === 'error').length;
    totalWarnings += result.findings.filter((finding) => finding.severity === 'warn').length;

    const title = snapshot.title.trim();
    if (title !== '') {
      const urls = titleMap.get(title.toLowerCase()) ?? [];
      urls.push(page.url);
      titleMap.set(title.toLowerCase(), urls);
    }

    const description = (snapshot.meta.description ?? '').trim();
    if (description !== '') {
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
        if (origin !== null && resolved.origin === origin) internalLinks += 1;
        else externalLinks += 1;
      } catch {
        // unresolvable — not counted
      }
    }
  }

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
    missingCanonical,
    noindexPages,
    internalLinks,
    externalLinks,
    incomplete,
    pages: pages.map((page) => {
      const result = page.result as AnalysisResult | null;
      const findings = result?.findings ?? [];
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
      };
    }),
  };
}
