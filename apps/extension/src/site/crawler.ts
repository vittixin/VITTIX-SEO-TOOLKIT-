import { SITE_LIMITS, type SiteSession } from '@vittix/shared';
import { analyzeSnapshot } from '@vittix/seo-core';
import { checkCrawlableOrigin, isSameOriginUrl } from './guards';
import { normalizeSiteUrl } from './normalize';
import { EMPTY_ROBOTS_POLICY, parseRobotsTxt, type RobotsPolicy } from './robots';
import { PacedRunner } from './rate';
import { parsePageSnapshot } from './extract-html';
import {
  addSitePages,
  getSiteSession,
  listSitePages,
  updateSitePage,
  updateSiteSession,
} from '@/src/storage/site';

export interface CrawlerOptions {
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Invoked after every persisted state change. */
  onProgress?: () => void;
  /** Runner pacing override (tests use 0). */
  delay?: (ms: number) => Promise<void>;
}

const EXTRACTOR_LIMITS = { headings: 300, images: 500, links: 500, textField: 300 };

/**
 * Site-audit crawler (MVP).
 *
 * Safety properties (docs/SITE_AUDIT.md):
 *  - fetches ONLY URLs on the approved origin (re-checked per URL)
 *  - GET only, credentials omitted, no form submission
 *  - robots.txt (User-agent: *) honored; 5xx robots blocks the audit
 *  - paced: bounded concurrency + minimum start interval (+ Crawl-delay)
 *  - hard page cap; same-origin redirects only are parsed
 *  - cancellation checked before every fetch and persisted in IndexedDB
 *
 * The loop lives in the calling page (dashboard): closing the tab pauses
 * the audit; state survives in IndexedDB for resume/discarding.
 */
export async function runSiteAudit(sessionId: number, options: CrawlerOptions = {}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const onProgress = options.onProgress ?? (() => {});

  const session = await getSiteSession(sessionId);
  if (session === null || session.status !== 'running') return;

  // --- robots.txt gate ------------------------------------------------------
  const robots = await loadRobots(session, fetchImpl);
  if (robots.blocked) {
    await updateSiteSession(sessionId, {
      robotsStatus: 'blocked',
      status: 'failed',
      finishedAt: new Date().toISOString(),
    });
    onProgress();
    return;
  }
  await updateSiteSession(sessionId, { robotsStatus: robots.status });
  onProgress();

  const effectiveDelay = Math.max(session.delayMs, robots.policy.crawlDelayMs ?? 0);
  const runner = new PacedRunner(session.concurrency, effectiveDelay, options.delay);

  // --- crawl state (BFS) ------------------------------------------------------
  const existing = await listSitePages(sessionId);
  const seen = new Set(existing.map((page) => page.url));
  const queue: { url: string; depth: number }[] = existing
    .filter((page) => page.status === 'pending')
    .map((page) => ({ url: page.url, depth: page.depth }));

  if (queue.length === 0 && existing.length === 0) {
    const start = normalizeSiteUrl(session.origin);
    if (start !== null && isSameOriginUrl(start, session.origin)) {
      queue.push({ url: start, depth: 0 });
      seen.add(start);
      await addSitePages([{ sessionId, url: start, status: 'pending', depth: 0 }]);
    }
  }

  // --- main loop ---------------------------------------------------------------
  const workers: Promise<void>[] = [];
  for (let i = 0; i < session.concurrency; i += 1) {
    workers.push(
      (async () => {
        for (;;) {
          const current = await takeNext(sessionId, queue);
          if (current === null) return; // queue drained
          if (await shouldStop(sessionId)) return;
          await processUrl(sessionId, session, current, robots.policy, {
            fetchImpl,
            runner,
            seen,
            queue,
            onProgress,
          });
        }
      })(),
    );
  }
  await Promise.all(workers);

  // --- finalize (unless the user cancelled/failed meanwhile) --------------------
  const finalSession = await getSiteSession(sessionId);
  if (finalSession?.status === 'running') {
    await updateSiteSession(sessionId, {
      status: finalSession.stopRequested ? 'cancelled' : 'completed',
      finishedAt: new Date().toISOString(),
    });
  }
  onProgress();
}

// --- helpers -------------------------------------------------------------------

type Enqueued = { url: string; depth: number } | null;

/**
 * Pop the next shallowest pending URL that is still 'pending' on disk,
 * enforcing the hard page cap on total page records for the session.
 */
async function takeNext(
  sessionId: number,
  queue: { url: string; depth: number }[],
): Promise<Enqueued> {
  for (;;) {
    const candidate = queue.shift();
    if (candidate === undefined) return null;
    // NOTE: the candidate stays in `seen` — it is known whether processed or
    // merely queued, so backlinks can never re-enqueue an already-seen URL.
    const session = await getSiteSession(sessionId);
    if (session === null || session.stopRequested || session.status !== 'running') return null;
    const pages = await listSitePages(sessionId);
    if (pages.length >= session.maxPages) return null;
    const match = pages.find((page) => page.url === candidate.url && page.status === 'pending');
    if (match !== null) return { url: candidate.url, depth: candidate.depth };
    // Already processed (e.g. resume replay) — skip.
  }
}

async function shouldStop(sessionId: number): Promise<boolean> {
  const session = await getSiteSession(sessionId);
  return session === null || session.stopRequested || session.status !== 'running';
}

async function loadRobots(
  session: SiteSession,
  fetchImpl: typeof fetch,
): Promise<{ policy: RobotsPolicy; status: 'allowed' | 'unreachable'; blocked: boolean }> {
  try {
    const robotsUrl = `${session.origin}/robots.txt`;
    const response = await fetchImpl(robotsUrl, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
    });
    if (response.status >= 500) {
      return { policy: EMPTY_ROBOTS_POLICY, status: 'allowed', blocked: true };
    }
    if (!response.ok) {
      // 4xx → no robots rules; RFC 9309 allows crawling.
      return { policy: EMPTY_ROBOTS_POLICY, status: 'unreachable', blocked: false };
    }
    const text = (await response.text()).slice(0, 500_000);
    return { policy: parseRobotsTxt(text), status: 'allowed', blocked: false };
  } catch {
    return { policy: EMPTY_ROBOTS_POLICY, status: 'allowed', blocked: true };
  }
}

interface ProcessContext {
  fetchImpl: typeof fetch;
  runner: PacedRunner;
  seen: Set<string>;
  queue: { url: string; depth: number }[];
  onProgress: () => void;
}

async function processUrl(
  sessionId: number,
  session: SiteSession,
  target: { url: string; depth: number },
  robots: RobotsPolicy,
  context: ProcessContext,
): Promise<void> {
  const { fetchImpl, runner, onProgress } = context;

  const pages = await listSitePages(sessionId);
  const record = pages.find((page) => page.url === target.url && page.status === 'pending');
  if (record === undefined || record.id === undefined) return;
  const pageId: number = record.id;

  await runner.run(async () => {
    try {
      const path = new URL(target.url).pathname + (new URL(target.url).search || '');
      if (!robots.allows(path)) {
        await updateSitePage(pageId, { status: 'skipped-robots' });
        await bumpCounters(sessionId, 'skipped');
        onProgress();
        return;
      }

      const response = await fetchImpl(target.url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'follow',
      });

      const finalUrl = response.url || target.url;
      if (!isSameOriginUrl(finalUrl, session.origin)) {
        await updateSitePage(pageId, {
          status: 'skipped-external-redirect',
          finalUrl,
          httpStatus: response.status,
        });
        await bumpCounters(sessionId, 'skipped');
        onProgress();
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('text/html')) {
        await updateSitePage(pageId, {
          status: 'skipped-non-html',
          finalUrl,
          httpStatus: response.status,
        });
        await bumpCounters(sessionId, 'skipped');
        onProgress();
        return;
      }

      if (!response.ok) {
        const authFailure = response.status === 401 || response.status === 403;
        await updateSitePage(pageId, {
          status: authFailure ? 'failed-auth' : 'failed',
          finalUrl,
          httpStatus: response.status,
          error: `HTTP ${response.status}`,
        });
        await bumpCounters(sessionId, 'failed');
        onProgress();
        return;
      }

      const html = await readBodyCapped(response);
      const snapshot = parsePageSnapshot(html, finalUrl, EXTRACTOR_LIMITS);
      const result = analyzeSnapshot(snapshot);

      await updateSitePage(pageId, {
        status: 'ok',
        finalUrl,
        httpStatus: response.status,
        analyzedAt: new Date().toISOString(),
        snapshot,
        result,
      });
      await bumpCounters(sessionId, 'done');
      onProgress();

      // --- discovery ---------------------------------------------------------
      const nextDepth = target.depth + 1;
      if (nextDepth <= session.maxDepth) {
        await enqueueDiscovered(sessionId, session, snapshot, finalUrl, nextDepth, context);
      }
    } catch (error) {
      await updateSitePage(pageId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      await bumpCounters(sessionId, 'failed');
      onProgress();
    }
  });
}

async function readBodyCapped(response: Response): Promise<string> {
  const blob = await response.blob();
  if (blob.size <= SITE_LIMITS.maxResponseBytes) return blob.text();
  return blob.slice(0, SITE_LIMITS.maxResponseBytes).text();
}

async function enqueueDiscovered(
  sessionId: number,
  session: SiteSession,
  snapshot: Awaited<ReturnType<typeof parsePageSnapshot>>,
  baseUrl: string,
  depth: number,
  context: ProcessContext,
): Promise<void> {
  const candidates: NewPageCandidate[] = [];
  for (const link of snapshot.links) {
    if (context.seen.size + context.queue.length >= session.maxPages) break;
    let resolved: URL;
    try {
      resolved = new URL(link.href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'https:') continue;
    if (!checkCrawlableOrigin(resolved.href).allowed) continue;
    const normalized = normalizeSiteUrl(resolved.href);
    if (normalized === null || !isSameOriginUrl(normalized, session.origin)) continue;
    if (context.seen.has(normalized)) continue;
    context.seen.add(normalized);
    candidates.push({ url: normalized, depth });
  }
  if (candidates.length > 0) {
    await addSitePages(
      candidates.map((candidate) => ({
        sessionId,
        url: candidate.url,
        status: 'pending' as const,
        depth: candidate.depth,
      })),
    );
    context.queue.push(...candidates);
    context.onProgress();
  }
}

interface NewPageCandidate {
  url: string;
  depth: number;
}

async function bumpCounters(sessionId: number, kind: 'done' | 'failed' | 'skipped'): Promise<void> {
  const session = await getSiteSession(sessionId);
  if (session === null) return;
  const changes: Partial<SiteSession> =
    kind === 'done'
      ? { pagesDone: session.pagesDone + 1 }
      : kind === 'failed'
        ? { pagesFailed: session.pagesFailed + 1 }
        : { pagesSkipped: session.pagesSkipped + 1 };
  await updateSiteSession(sessionId, changes);
}
