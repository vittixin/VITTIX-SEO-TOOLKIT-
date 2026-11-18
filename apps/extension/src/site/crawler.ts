import { browser } from 'wxt/browser';
import { SITE_LIMITS, type SiteResponseMetadata, type SiteSession } from '@vittix/shared';
import {
  analyzeSnapshot,
  analyzeResponseMetadata,
  normalizedTextHash,
  simhash64,
} from '@vittix/seo-core';
import { checkCrawlableOrigin, isSameOriginUrl, permissionPatternForOrigin } from './guards';
import { normalizeSiteUrl } from './normalize';
import { EMPTY_ROBOTS_POLICY, parseRobotsTxt, type RobotsPolicy } from './robots';
import { PacedRunner } from './rate';
import { EXTRACTOR_LIMITS } from '../extraction/limits';
import { parsePageSnapshot, extractVisibleTextForSimilarity } from './extract-html';
import {
  addSitePages,
  countPagesByStatus,
  getSiteSession,
  listPendingPages,
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
  /**
   * Injectable origin-permission probe; defaults to
   * browser.permissions.contains on the session origin. Runs before every
   * fetch — a revoked permission cancels the audit (fail closed).
   */
  hasPermission?: (origin: string) => Promise<boolean>;
}

/**
 * Site-audit crawler (MVP).
 *
 * Safety properties (docs/SITE_AUDIT.md):
 *  - fetches ONLY URLs on the approved origin (re-checked per URL)
 *  - GET only, credentials omitted, no form submission
 *  - robots.txt (User-agent: *) honored; 5xx or cross-origin-redirect
 *    robots fetches block the audit (fail closed)
 *  - the origin permission is re-verified before every fetch; revocation
 *    cancels the audit immediately
 *  - paced: bounded concurrency + minimum start interval (+ Crawl-delay)
 *  - hard page cap; fetched redirect destinations are checked before parsing
 *  - cancellation checked before every fetch and persisted in IndexedDB
 *
 * The loop lives in the calling page (dashboard): closing the tab pauses
 * the audit; state survives in IndexedDB for resume/discarding. Closing the
 * dashboard NEVER continues the crawl in the background.
 */
export async function runSiteAudit(sessionId: number, options: CrawlerOptions = {}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const onProgress = options.onProgress ?? (() => {});
  const hasPermission =
    options.hasPermission ??
    (async (origin: string) => {
      try {
        return await browser.permissions.contains({
          origins: [permissionPatternForOrigin(origin)],
        });
      } catch {
        return false;
      }
    });

  const session = await getSiteSession(sessionId);
  if (session === null || session.status !== 'running') return;

  // --- origin permission gate (fail closed on revocation) ---------------------
  if (!(await hasPermission(session.origin))) {
    await failSession(
      sessionId,
      `Permission for ${session.origin} is not granted — the audit was stopped before any request.`,
    );
    onProgress();
    return;
  }

  // --- robots.txt gate ------------------------------------------------------
  const robots = await loadRobots(session, fetchImpl, hasPermission);
  if (robots.blocked) {
    // Bookkeeping first (best-effort), then the durable stop state.
    try {
      await updateSiteSession(sessionId, { robotsStatus: 'blocked' });
    } catch (error) {
      console.warn('[vittix] could not persist robots status', error);
    }
    await failSession(
      sessionId,
      robots.blockReason ?? 'robots.txt could not be fetched safely — the audit was blocked.',
    );
    onProgress();
    return;
  }
  // Robots status is bookkeeping: the in-memory policy already governs this
  // run, so a failed write must not abort the crawl (RECOVERABLE).
  try {
    await updateSiteSession(sessionId, { robotsStatus: robots.status });
  } catch (error) {
    console.warn('[vittix] could not persist robots status', error);
  }
  onProgress();

  const robotsDelay = robots.policy.crawlDelayMs ?? 0;
  const ROBOTS_DELAY_CAP_MS = 30_000;
  const effectiveDelay = Math.max(session.delayMs, Math.min(robotsDelay, ROBOTS_DELAY_CAP_MS));
  const runner = new PacedRunner(session.concurrency, effectiveDelay, options.delay);
  if (robotsDelay > ROBOTS_DELAY_CAP_MS) {
    try {
      await updateSiteSession(sessionId, {
        stopReason: `robots.txt requested Crawl-delay ${robotsDelay}ms; capped at ${ROBOTS_DELAY_CAP_MS}ms to avoid excessive waits.`,
      });
    } catch (error) {
      console.warn('[vittix] could not persist robots crawl-delay warning', error);
    }
  }

  if (session.stopRequested) {
    await updateSiteSession(sessionId, {
      status: 'cancelled',
      finishedAt: new Date().toISOString(),
    });
    onProgress();
    return;
  }
  const sitemapState =
    session.sitemap === undefined
      ? {
          entries: [],
          fullyRead: false,
          truncated: false,
          invalidLastmodCount: 0,
          duplicateCount: 0,
          crossOriginCount: 0,
          warnings: [],
        }
      : await discoverSitemaps(
          session,
          robots.policy,
          runner,
          fetchImpl,
          hasPermission,
          onProgress,
        );
  if (await shouldStop(sessionId)) {
    const latest = await getSiteSession(sessionId);
    if (latest?.stopRequested) {
      await updateSiteSession(sessionId, {
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
      });
      onProgress();
    }
    return;
  }
  try {
    await updateSiteSession(sessionId, { sitemap: sitemapState });
  } catch (error) {
    console.warn('[vittix] could not persist sitemap state', error);
  }
  onProgress();

  // --- crawl state (BFS) ------------------------------------------------------
  const existing = await listSitePages(sessionId);
  // `seen` stores normalized dedupe keys (not authored fetch URLs) so resumed
  // sessions and discovery treat equivalent forms (e.g. /path vs /path/) alike.
  const seen = new Set(
    existing
      .map((page) => normalizeSiteUrl(page.url))
      .filter((url): url is string => url !== null),
  );
  const queue: { url: string; depth: number }[] = existing
    .filter((page) => page.status === 'pending')
    .map((page) => ({ url: page.url, depth: page.depth }));

  if (queue.length === 0 && existing.length === 0) {
    const startKey = normalizeSiteUrl(session.origin);
    const startUrl = toAuthoredUrl(session.origin);
    if (startKey !== null && startUrl !== null && isSameOriginUrl(startUrl, session.origin)) {
      try {
        await addSitePages([{ sessionId, url: startUrl, status: 'pending', depth: 0 }]);
      } catch (error) {
        // Without durable state there is no audit — fail closed instead of
        // crawling unrecorded.
        await failSession(
          sessionId,
          `Could not persist crawl state (${error instanceof Error ? error.message : String(error)}). Discovered URLs would be silently lost, so the audit was stopped.`,
        );
        onProgress();
        return;
      }
      queue.push({ url: startUrl, depth: 0 });
      // `seen` stores normalized dedupe keys (not fetch URLs) so discovery can
      // suppress equivalent authored forms like /path and /path/ consistently.
      seen.add(startKey);
    }
  }
  if (session.seedFromSitemap) {
    const candidates: { url: string; key: string }[] = [];
    for (const entry of sitemapState.entries) {
      // `seen` contains every known URL (seeded/queued/recorded), so it is the
      // correct page-count bound.
      if (seen.size >= session.maxPages) break;
      const key = normalizeSiteUrl(entry.url);
      const authored = toAuthoredUrl(entry.url);
      if (key === null || authored === null || !isSameOriginUrl(authored, session.origin)) continue;
      if (!robots.policy.allows(new URL(authored).pathname + new URL(authored).search)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ url: authored, key });
    }
    if (candidates.length) {
      const records = candidates.map((candidate) => ({
        sessionId,
        url: candidate.url,
        status: 'pending' as const,
        depth: 1,
      }));
      await addSitePages(records);
      queue.push(...records.map(({ url, depth }) => ({ url, depth })));
    }
  }

  // --- main loop ---------------------------------------------------------------
  const workerContext: ProcessContext = {
    fetchImpl,
    runner,
    seen,
    queue,
    onProgress,
    hasPermission,
    sessionId,
  };
  // Track in-flight page processing so workers stay alive while peers are
  // still working: with fan-out discovery a worker that finds the queue empty
  // must wait, otherwise it exits early and concurrency collapses. Count a URL
  // as active as soon as it is claimed (before async pre-fetch checks) so other
  // workers cannot observe "queue empty, active 0" in that window and exit.
  const workerState = { active: 0 };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < session.concurrency; i += 1) {
    workers.push(
      (async () => {
        for (;;) {
          const current = await takeNext(sessionId, queue);
          if (current === null) {
            if (await shouldStop(sessionId)) return;
            // Only finished when no URL is waiting AND no other worker can
            // still discover/enqueue more work.
            if (queue.length === 0 && workerState.active === 0) return;
            await new Promise((resolve) => setTimeout(resolve, 5));
            continue;
          }
          workerState.active += 1;
          try {
            if (await shouldStop(sessionId)) return;
            // Re-verify the origin permission before EVERY fetch (fail closed
            // on revocation mid-audit).
            if (!(await hasPermission(session.origin))) {
              await failSession(
                sessionId,
                `Permission for ${session.origin} was revoked during the audit — crawling stopped immediately.`,
              );
              onProgress();
              runner.stop();
              return;
            }
            await processUrl(sessionId, session, current, robots.policy, workerContext);
          } finally {
            workerState.active -= 1;
          }
        }
      })(),
    );
  }
  await Promise.all(workers);

  // --- finalize (unless the user cancelled/failed meanwhile) --------------------
  // CRITICAL-but-best-effort: a failed finalize write leaves the session
  // 'running' — the dashboard still offers Resume/Discard, and the hook's
  // error path surfaces it. runSiteAudit itself must never reject.
  try {
    const finalSession = await getSiteSession(sessionId);
    if (finalSession?.status === 'running') {
      if (finalSession.stopRequested) {
        await updateSiteSession(sessionId, {
          status: 'cancelled',
          finishedAt: new Date().toISOString(),
        });
      } else {
        const pages = await listSitePages(sessionId);
        const pendingLeft = pages.filter((page) => page.status === 'pending').length;
        // A session that drained its queue with pages still pending (page
        // cap or drained failures) is NOT 'completed' — mark it explicitly
        // so the UI shows the incomplete state instead of implying success.
        await updateSiteSession(sessionId, {
          status: pendingLeft > 0 ? 'failed' : 'completed',
          ...(pendingLeft > 0
            ? {
                stopReason:
                  'The crawl queue ended with pages still pending (page cap reached or discovery stopped) — the audit is incomplete.',
              }
            : {}),
          finishedAt: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.warn('[vittix] could not persist final session state', error);
  }
  onProgress();
}

// --- helpers -------------------------------------------------------------------

type Enqueued = { url: string; depth: number } | null;

/**
 * Pop the next shallowest pending URL that is still 'pending' on disk.
 *
 * The hard page cap is enforced where RECORDS are created (seed + discovery
 * enqueue) — already-recorded pending pages must always be processable,
 * otherwise a tiny maxPages would deadlock the seeded start URL.
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
    const pending = await listPendingPages(sessionId);
    const match = pending.find((page) => page.url === candidate.url);
    if (match !== undefined) return { url: candidate.url, depth: candidate.depth };
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
  hasPermission: (origin: string) => Promise<boolean>,
): Promise<{
  policy: RobotsPolicy;
  status: 'allowed' | 'unreachable';
  blocked: boolean;
  blockReason?: string;
}> {
  try {
    const robotsUrl = `${session.origin}/robots.txt`;
    if (!(await hasPermission(session.origin)))
      return {
        policy: EMPTY_ROBOTS_POLICY,
        status: 'allowed',
        blocked: true,
        blockReason: 'Origin permission was revoked before robots.txt fetch.',
      };
    const response = await fetchImpl(robotsUrl, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
    });
    if (response.type === 'opaqueredirect' || response.status === 0)
      return {
        policy: EMPTY_ROBOTS_POLICY,
        status: 'allowed',
        blocked: true,
        blockReason:
          'The site redirects /robots.txt, but the browser hides the destination. Open the final robots.txt in a tab, then start the audit on the origin it redirects to.',
      };
    if (response.status >= 300 && response.status < 400) {
      let destination: string | null = null;
      const location = response.headers.get('location');
      if (location) {
        try {
          destination = new URL(location, robotsUrl).href.slice(0, 500);
        } catch {
          destination = null;
        }
      }
      return {
        policy: EMPTY_ROBOTS_POLICY,
        status: 'allowed',
        blocked: true,
        blockReason: destination
          ? `The site redirects /robots.txt with HTTP ${response.status} to ${destination}. Open that final robots.txt in a tab, then start the audit on the origin it redirects to.`
          : `The site redirects /robots.txt with HTTP ${response.status}, but did not expose a destination. Open the final robots.txt in a tab, then start the audit on the origin it redirects to.`,
      };
    }
    // Fail closed: a robots.txt redirect that leaves the origin (or any
    // non-http(s) final URL) is treated as a blocked audit, not as "no
    // rules" — the fetched content is not trusted.
    const finalUrl = response.url || robotsUrl;
    try {
      if (new URL(finalUrl).origin !== new URL(session.origin).origin) {
        return {
          policy: EMPTY_ROBOTS_POLICY,
          status: 'allowed',
          blocked: true,
          blockReason: `The site redirects /robots.txt to ${finalUrl.slice(0, 500)}. Open that final robots.txt in a tab, then start the audit on the origin it redirects to.`,
        };
      }
    } catch {
      return {
        policy: EMPTY_ROBOTS_POLICY,
        status: 'allowed',
        blocked: true,
        blockReason: 'robots.txt redirect target was not a valid URL — audit blocked.',
      };
    }
    if (response.status >= 500) {
      return { policy: EMPTY_ROBOTS_POLICY, status: 'allowed', blocked: true };
    }
    if (!response.ok) {
      // 4xx → no robots rules; RFC 9309 allows crawling.
      return { policy: EMPTY_ROBOTS_POLICY, status: 'unreachable', blocked: false };
    }
    const { html: text } = await readBodyCapped(response, 500_000);
    const policy = parseRobotsTxt(text);
    // Caller-side enforcement: only same-origin Sitemap URLs are exposed.
    const sitemaps = policy.sitemaps.filter((url) => isSameOriginUrl(url, session.origin));
    return { policy: { ...policy, sitemaps }, status: 'allowed', blocked: false };
  } catch {
    return { policy: EMPTY_ROBOTS_POLICY, status: 'allowed', blocked: true };
  }
}

/** Parse XML only in this extension page. Fetched bytes are never evaluated. */
async function discoverSitemaps(
  session: SiteSession,
  robots: RobotsPolicy,
  runner: PacedRunner,
  fetchImpl: typeof fetch,
  hasPermission: (origin: string) => Promise<boolean>,
  onProgress: () => void,
): Promise<import('@vittix/shared').SitemapState> {
  const entries: import('@vittix/shared').SitemapEntry[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  const urlsSeen = new Set<string>();
  let totalBytes = 0;
  let duplicateCount = 0;
  let crossOriginCount = 0;
  let invalidLastmodCount = 0;
  let truncated = false;
  let fullyRead = true;
  const roots = robots.sitemaps.length ? robots.sitemaps : [`${session.origin}/sitemap.xml`];

  const readBounded = async (
    response: Response,
    gzip: boolean,
  ): Promise<{ text: string; truncated: boolean; size: number }> => {
    if (!response.body) return { text: '', truncated: false, size: 0 };
    const stream = gzip
      ? response.body.pipeThrough(new DecompressionStream('gzip'))
      : response.body;
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let wasTruncated = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const perFileLeft = SITE_LIMITS.maxSitemapBytes - size;
        const totalLeft = SITE_LIMITS.maxSitemapTotalBytes - totalBytes - size;
        const allowed = Math.max(0, Math.min(perFileLeft, totalLeft));
        if (value.byteLength > allowed) {
          if (allowed) chunks.push(value.slice(0, allowed));
          size += allowed;
          wasTruncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
        size += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { text: new TextDecoder().decode(bytes), truncated: wasTruncated, size };
  };

  const visit = async (rawUrl: string, depth: number): Promise<void> => {
    if (
      depth > 2 ||
      entries.length >= SITE_LIMITS.maxSitemapUrls ||
      totalBytes >= SITE_LIMITS.maxSitemapTotalBytes
    ) {
      truncated = true;
      fullyRead = false;
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl, session.origin);
    } catch {
      fullyRead = false;
      warnings.push('Invalid sitemap URL ignored.');
      return;
    }
    if (parsed.origin !== new URL(session.origin).origin) {
      crossOriginCount += 1;
      fullyRead = false;
      return;
    }
    const normalized = parsed.href;
    if (visited.has(normalized)) return;
    visited.add(normalized);
    if (!robots.allows(parsed.pathname + parsed.search)) {
      warnings.push('A sitemap URL was disallowed by robots.txt and was not fetched.');
      fullyRead = false;
      return;
    }
    if (await shouldStop(session.id ?? -1)) {
      fullyRead = false;
      return;
    }
    await runner.pace();
    if (!(await hasPermission(session.origin))) {
      warnings.push('Origin permission was revoked during sitemap discovery.');
      fullyRead = false;
      await failSession(
        session.id ?? -1,
        'Origin permission was revoked during sitemap discovery; fetching stopped immediately.',
      );
      runner.stop();
      return;
    }
    if (await shouldStop(session.id ?? -1)) {
      fullyRead = false;
      return;
    }
    let response: Response;
    try {
      response = await fetchImpl(normalized, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
      });
    } catch {
      fullyRead = false;
      warnings.push('A sitemap fetch failed.');
      return;
    }
    if (
      response.type === 'opaqueredirect' ||
      response.status === 0 ||
      (response.status >= 300 && response.status < 400)
    ) {
      fullyRead = false;
      warnings.push(
        'A sitemap redirect was not followed because its destination could not be safely verified.',
      );
      return;
    }
    if (!response.ok) {
      fullyRead = false;
      warnings.push(`A sitemap returned HTTP ${response.status}.`);
      return;
    }
    // Fetch transparently decodes Content-Encoding. A .gz sitemap file is a
    // separate gzip artifact and is decoded here under the streaming cap.
    const gzip =
      normalized.toLowerCase().endsWith('.gz') &&
      !/\bgzip\b/i.test(response.headers.get('content-encoding') ?? '');
    let body;
    try {
      body = await readBounded(response, gzip);
    } catch {
      fullyRead = false;
      warnings.push('A sitemap could not be decompressed safely.');
      return;
    }
    totalBytes += body.size;
    if (body.truncated) {
      truncated = true;
      fullyRead = false;
      warnings.push('Sitemap size limit reached; remaining content is unchecked.');
    }
    let doc: Document;
    try {
      doc = new DOMParser().parseFromString(body.text, 'application/xml');
    } catch {
      fullyRead = false;
      warnings.push('Malformed sitemap XML.');
      return;
    }
    if (doc.querySelector('parsererror')) {
      fullyRead = false;
      warnings.push('Malformed sitemap XML.');
      return;
    }
    const root = doc.documentElement.localName.toLowerCase();
    if (root === 'sitemapindex') {
      if (depth >= 2) {
        if (doc.querySelector('sitemap loc')) {
          truncated = true;
          fullyRead = false;
          warnings.push('Sitemap index recursion limit reached.');
        }
        return;
      }
      for (const node of Array.from(doc.querySelectorAll('sitemap > loc'))) {
        const loc = node.textContent?.trim();
        if (loc) await visit(loc, depth + 1);
      }
      return;
    }
    if (root !== 'urlset') {
      fullyRead = false;
      warnings.push('Unrecognized sitemap XML root.');
      return;
    }
    for (const node of Array.from(doc.querySelectorAll('url'))) {
      const loc = node.querySelector(':scope > loc')?.textContent?.trim();
      if (!loc) continue;
      let url: URL;
      try {
        url = new URL(loc, session.origin);
      } catch {
        fullyRead = false;
        continue;
      }
      if (url.origin !== new URL(session.origin).origin) {
        crossOriginCount += 1;
        continue;
      }
      const canonical = url.href;
      if (urlsSeen.has(canonical)) {
        duplicateCount += 1;
        continue;
      }
      urlsSeen.add(canonical);
      if (entries.length >= SITE_LIMITS.maxSitemapUrls) {
        truncated = true;
        fullyRead = false;
        warnings.push('Sitemap URL limit reached (50,000).');
        break;
      }
      const lastmod = node.querySelector(':scope > lastmod')?.textContent?.trim() || null;
      if (lastmod && Number.isNaN(Date.parse(lastmod))) invalidLastmodCount += 1;
      const alternates = Array.from(node.querySelectorAll('link[rel="alternate"]'))
        .map((link) => link.getAttribute('href') ?? '')
        .filter(Boolean)
        .slice(0, 20);
      entries.push({
        url: canonical.slice(0, 2048),
        lastmod: lastmod?.slice(0, 128) ?? null,
        alternates,
      });
    }
  };

  for (const root of roots) {
    if (await shouldStop(session.id ?? -1)) {
      fullyRead = false;
      break;
    }
    await visit(root, 0);
  }
  if (totalBytes >= SITE_LIMITS.maxSitemapTotalBytes) {
    truncated = true;
    fullyRead = false;
    warnings.push('Total sitemap size limit reached (50 MB).');
  }
  onProgress();
  return {
    entries,
    fullyRead,
    truncated,
    invalidLastmodCount,
    duplicateCount,
    crossOriginCount,
    warnings: [...new Set(warnings)].slice(0, 20),
  };
}

interface ProcessContext {
  fetchImpl: typeof fetch;
  runner: PacedRunner;
  seen: Set<string>;
  queue: { url: string; depth: number }[];
  onProgress: () => void;
  hasPermission: (origin: string) => Promise<boolean>;
  sessionId: number;
}

interface SafeResponse {
  response: Response | null;
  metadata: SiteResponseMetadata;
  finalUrl: string;
  failure: string | null;
}

/**
 * The browser follows page redirects. It exposes only the final URL and a
 * boolean; individual hops cannot be checked or paced. Cross-origin final
 * responses are discarded without parsing, but the browser has already sent
 * the request. See docs/SITE_AUDIT.md for the resulting threat-model limit.
 */
async function fetchSameOriginResponse(
  initialUrl: string,
  session: SiteSession,
  robots: RobotsPolicy,
  context: ProcessContext,
  firstRequestAlreadyPaced: boolean,
): Promise<SafeResponse> {
  const startedAt = performance.now();
  const parsed = new URL(initialUrl);
  if (!isSameOriginUrl(initialUrl, session.origin))
    return {
      response: null,
      metadata: makeMetadata(null, [], startedAt, true),
      finalUrl: initialUrl,
      failure: 'Requested URL is outside the approved origin.',
    };
  if (!robots.allows(parsed.pathname + parsed.search))
    return {
      response: null,
      metadata: makeMetadata(null, [], startedAt, true),
      finalUrl: initialUrl,
      failure: 'Requested URL is disallowed by robots.txt.',
    };
  if (!firstRequestAlreadyPaced) await context.runner.pace();
  if (!(await context.hasPermission(session.origin)))
    return {
      response: null,
      metadata: makeMetadata(null, [], startedAt, true),
      finalUrl: initialUrl,
      failure: 'Origin permission was revoked before a response fetch.',
    };
  if (await shouldStop(context.sessionId))
    return {
      response: null,
      metadata: makeMetadata(null, [], startedAt, true),
      finalUrl: initialUrl,
      failure: 'Crawl cancelled before response fetch.',
    };
  let response: Response;
  try {
    response = await context.fetchImpl(initialUrl, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
    });
  } catch (error) {
    return {
      response: null,
      metadata: { ...makeMetadata(null, [], startedAt, true), fetchFailedPossibleRedirect: true },
      finalUrl: initialUrl,
      failure: `Fetch failed; a redirect or network/CORS failure is possible, but the redirect target is not observable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const redirected = response.redirected === true;
  const finalUrl = redirected && response.url ? response.url.slice(0, 2048) : initialUrl;
  let offOrigin = false;
  try {
    offOrigin = new URL(finalUrl).origin !== new URL(session.origin).origin;
  } catch {
    offOrigin = true;
  }
  const metadata = {
    ...makeMetadata(response, [], startedAt, redirected),
    redirected,
    redirectOffOrigin: offOrigin,
    redirectFinalUrl: redirected ? finalUrl : null,
    fetchFailedPossibleRedirect: false,
  };
  return {
    response,
    metadata,
    finalUrl,
    failure: null,
  };
}

function makeMetadata(
  response: Response | null,
  redirectChain: SiteResponseMetadata['redirectChain'],
  startedAt: number,
  redirectObservationUnavailable: boolean,
): SiteResponseMetadata {
  const header = (name: string, cap = 2048) => response?.headers.get(name)?.slice(0, cap) ?? null;
  const contentLengthRaw = header('content-length', 32);
  const contentLengthNumber = contentLengthRaw === null ? null : Number(contentLengthRaw);
  const contentLength =
    Number.isSafeInteger(contentLengthNumber) && contentLengthNumber! >= 0
      ? contentLengthNumber
      : null;
  const csp = header('content-security-policy') ?? '';
  return {
    finalStatus: response?.status ?? null,
    redirectChain,
    redirectObservationUnavailable,
    redirected: false,
    redirectOffOrigin: false,
    redirectFinalUrl: null,
    fetchFailedPossibleRedirect: false,
    contentType: header('content-type'),
    contentLength,
    contentEncoding: header('content-encoding', 256),
    xRobotsTag: header('x-robots-tag'),
    cacheControl: header('cache-control'),
    hasHsts: response?.headers.has('strict-transport-security') ?? false,
    hasCsp: response?.headers.has('content-security-policy') ?? false,
    hasXContentTypeOptions: response?.headers.has('x-content-type-options') ?? false,
    hasReferrerPolicy: response?.headers.has('referrer-policy') ?? false,
    hasFrameProtection: Boolean(
      response?.headers.has('x-frame-options') || /(?:^|;)\s*frame-ancestors\b/i.test(csp),
    ),
    durationMs: Math.max(0, performance.now() - startedAt),
    bodyTruncated: false,
  };
}

/**
 * Fail the whole session with a durable reason (permission revoked, etc.).
 * Pending pages stay pending so the audit can resume after the cause is
 * resolved (e.g. re-granting the permission).
 */
async function failSession(sessionId: number, reason: string): Promise<void> {
  try {
    await updateSiteSession(sessionId, {
      status: 'failed',
      stopReason: reason,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[vittix] failed to persist session failure', error);
  }
}

async function processUrl(
  sessionId: number,
  session: SiteSession,
  target: { url: string; depth: number },
  robots: RobotsPolicy,
  context: ProcessContext,
): Promise<void> {
  const { runner, onProgress } = context;

  const pending = await listPendingPages(sessionId);
  const record = pending.find((page) => page.url === target.url);
  if (record === undefined || record.id === undefined) return;
  const pageId: number = record.id;

  await runner.run(async () => {
    try {
      const path = new URL(target.url).pathname + (new URL(target.url).search || '');
      if (!robots.allows(path)) {
        await updateSitePage(pageId, { status: 'skipped-robots' });
        await syncCounters(sessionId);
        onProgress();
        return;
      }

      const safe = await fetchSameOriginResponse(target.url, session, robots, context, true);
      if (safe.failure !== null) {
        await updateSitePage(pageId, {
          status: 'failed',
          finalUrl: safe.finalUrl,
          error: safe.failure,
          responseMetadata: safe.metadata,
          responseFindings: analyzeResponseMetadata(null, safe.metadata),
        });
        await syncCounters(sessionId);
        onProgress();
        return;
      }
      const response = safe.response!;
      const finalUrl = safe.finalUrl;
      const responseFindings = analyzeResponseMetadata(null, safe.metadata);
      let finalOrigin: string;
      try {
        finalOrigin = new URL(finalUrl).origin;
      } catch {
        finalOrigin = '';
      }
      const approvedOrigin = new URL(session.origin).origin;
      const finalOriginPermitted = finalOrigin !== '' && (await context.hasPermission(finalOrigin));
      if (finalOrigin !== approvedOrigin) {
        void response.body?.cancel().catch(() => undefined);
        await updateSitePage(pageId, {
          status: 'skipped-external-redirect',
          finalUrl,
          httpStatus: safe.metadata.finalStatus,
          error:
            'Redirect target not permitted. The browser already sent a credential-free GET request before this check; the response body was discarded.',
          responseMetadata: safe.metadata,
          responseFindings,
        });
        await syncCounters(sessionId);
        onProgress();
        return;
      }
      if (!finalOriginPermitted) {
        void response.body?.cancel().catch(() => undefined);
        await failSession(
          sessionId,
          'Origin permission was revoked during the audit; response processing stopped immediately.',
        );
        runner.stop();
        return;
      }
      const finalPath = new URL(finalUrl).pathname + (new URL(finalUrl).search || '');
      if (!robots.allows(finalPath)) {
        void response.body?.cancel().catch(() => undefined);
        await updateSitePage(pageId, {
          status: 'skipped-robots',
          finalUrl,
          httpStatus: safe.metadata.finalStatus,
          error: 'Final URL is disallowed by robots.txt; response body discarded.',
          responseMetadata: safe.metadata,
          responseFindings,
        });
        await syncCounters(sessionId);
        onProgress();
        return;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        const authFailure = response.status === 401 || response.status === 403;
        await updateSitePage(pageId, {
          status: authFailure ? 'failed-auth' : 'failed',
          finalUrl,
          httpStatus: response.status,
          error: `HTTP ${response.status}`,
          responseMetadata: safe.metadata,
          responseFindings,
        });
        await syncCounters(sessionId);
        onProgress();
        return;
      }

      if (!contentType.toLowerCase().includes('text/html')) {
        await updateSitePage(pageId, {
          status: 'skipped-non-html',
          finalUrl,
          httpStatus: response.status,
          responseMetadata: safe.metadata,
          responseFindings,
        });
        await syncCounters(sessionId);
        onProgress();
        return;
      }

      const { html, truncated: bodyTruncated, charset } = await readBodyCapped(response);
      const metadata = { ...safe.metadata, bodyTruncated };
      const snapshot = parsePageSnapshot(html, finalUrl, EXTRACTOR_LIMITS, { charset });
      const visibleText = extractVisibleTextForSimilarity(html, 50_000);
      const similarityTokens = visibleText.match(/[\p{L}\p{N}]+/gu) ?? [];
      const result = analyzeSnapshot(snapshot, {
        responseMetadata: metadata,
        developmentOrigin: /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(finalUrl),
        profileId: session.profileId as
          'standard' | 'content-site' | 'e-commerce' | 'developer-staging',
        ignoredRuleIds: session.ignoredRuleIds,
        unignoredRuleIds: session.unignoredRuleIds,
        severityOverrides: session.severityOverrides,
      });
      if (bodyTruncated) result.truncated = true;

      await updateSitePage(pageId, {
        status: 'ok',
        finalUrl,
        httpStatus: response.status,
        analyzedAt: new Date().toISOString(),
        snapshot,
        result,
        responseMetadata: metadata,
        normalizedTextHash: normalizedTextHash(visibleText),
        simhash64: simhash64(visibleText),
        similarityWordCount: similarityTokens.length,
      });
      await syncCounters(sessionId);
      onProgress();

      // --- discovery ---------------------------------------------------------
      const nextDepth = target.depth + 1;
      if (nextDepth <= session.maxDepth) {
        await enqueueDiscovered(sessionId, session, snapshot, finalUrl, nextDepth, context);
      }
    } catch (error) {
      // Storage failures during the failure path are swallowed (warned) so a
      // broken IndexedDB never crashes the whole audit loop.
      try {
        await updateSitePage(pageId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
        await syncCounters(sessionId);
      } catch (storageError) {
        console.warn('[vittix] could not persist page failure', storageError);
      }
      onProgress();
    }
  });
}

function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*"?([^";,\s]+)"?/i.exec(contentType);
  return match?.[1] ?? null;
}

function sniffMetaCharset(bytes: Uint8Array): string | null {
  const prefix = new TextDecoder('windows-1252').decode(bytes.slice(0, 1024));
  const metaCharset = /<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9._:-]+)/i.exec(prefix);
  if (metaCharset) return metaCharset[1] ?? null;
  const httpEquiv =
    /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._:-]+)/i.exec(
      prefix,
    );
  if (httpEquiv) return httpEquiv[1] ?? null;
  const httpEquivRev =
    /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._:-]+)[^"']*["'][^>]+http-equiv\s*=\s*["']?content-type["']?/i.exec(
      prefix,
    );
  return httpEquivRev ? (httpEquivRev[1] ?? null) : null;
}

function decodeHtmlBytes(
  bytes: Uint8Array,
  contentType: string | null,
): { html: string; charset: string } {
  const label = charsetFromContentType(contentType) ?? sniffMetaCharset(bytes) ?? 'utf-8';
  try {
    return { html: new TextDecoder(label).decode(bytes), charset: label };
  } catch {
    return { html: new TextDecoder('utf-8').decode(bytes), charset: 'utf-8' };
  }
}

async function readBodyCapped(
  response: Response,
  maxBytes: number = SITE_LIMITS.maxResponseBytes,
): Promise<{ html: string; truncated: boolean; charset: string }> {
  let bytes: Uint8Array;
  let truncated = false;
  if (!response.body) {
    // Test doubles and genuinely body-less responses may not expose a stream.
    // Production Fetch responses with content use the streaming branch below.
    if (typeof response.blob !== 'function') {
      return { html: '', truncated: false, charset: 'utf-8' };
    }
    const blob = await response.blob();
    truncated = blob.size > maxBytes;
    bytes = new Uint8Array(await blob.slice(0, maxBytes).arrayBuffer());
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = maxBytes - size;
        if (value.byteLength > remaining) {
          if (remaining > 0) chunks.push(value.slice(0, remaining));
          size += Math.max(0, remaining);
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
        size += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  const decoded = decodeHtmlBytes(bytes, response.headers?.get('content-type') ?? null);
  return { html: decoded.html, truncated, charset: decoded.charset };
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
    // `seen` holds the normalized dedupe key for every known URL (seeded,
    // queued, or recorded), so it is the correct page-count bound.
    if (context.seen.size >= session.maxPages) break;
    let resolved: URL;
    try {
      resolved = new URL(link.href, baseUrl);
    } catch {
      continue;
    }
    if (!checkCrawlableOrigin(resolved.href).allowed) continue;
    const normalizedKey = normalizeSiteUrl(resolved.href);
    const authoredUrl = toAuthoredUrl(resolved.href);
    if (
      normalizedKey === null ||
      authoredUrl === null ||
      !isSameOriginUrl(authoredUrl, session.origin)
    ) {
      continue;
    }
    if (context.seen.has(normalizedKey)) continue;
    context.seen.add(normalizedKey);
    // Store/fetch the URL as authored (resolved, fragment removed). Dedupe
    // uses `normalizedKey`, so /path and /path/ are treated as the same page
    // and whichever form is discovered first is the one fetched/recorded.
    candidates.push({ url: authoredUrl, depth });
  }
  if (candidates.length > 0) {
    try {
      await addSitePages(
        candidates.map((candidate) => ({
          sessionId,
          url: candidate.url,
          status: 'pending' as const,
          depth: candidate.depth,
        })),
      );
    } catch (error) {
      // INVARIANT: failed discovery writes must not permanently lose URLs.
      // The source page is already marked 'ok' and will never be re-crawled
      // in this session, so silently dropping these candidates would lose
      // them forever. Retry once; if persistence is still broken, fail the
      // session with a durable reason so the operator knows the audit is
      // incomplete and can resume/re-run after fixing storage.
      console.warn('[vittix] could not persist discovered URLs — retrying once', error);
      try {
        await addSitePages(
          candidates.map((candidate) => ({
            sessionId,
            url: candidate.url,
            status: 'pending' as const,
            depth: candidate.depth,
          })),
        );
      } catch (retryError) {
        await failSession(
          sessionId,
          `Could not persist discovered URLs (${retryError instanceof Error ? retryError.message : String(retryError)}) — the audit stopped so no pages are silently lost.`,
        );
        context.onProgress();
        context.runner.stop();
        return;
      }
    }
    context.queue.push(...candidates);
    context.onProgress();
  }
}

interface NewPageCandidate {
  url: string;
  depth: number;
}

/** Authored fetch URL: resolved and fragment-free, but otherwise preserved. */
function toAuthoredUrl(input: string): string | null {
  try {
    const parsed = new URL(input);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * INVARIANT: counter values must agree with persisted page records.
 *
 * Instead of independently incrementing counters (which drift the moment a
 * counter write fails while a page write succeeds), counters are DERIVED
 * from the page records and persisted in one write. If this write fails it
 * fails loudly — the displayed progress may lag, but it can never become
 * permanently inconsistent with the durable truth.
 */
async function syncCounters(sessionId: number): Promise<void> {
  try {
    const counts = await countPagesByStatus(sessionId);
    const session = await getSiteSession(sessionId);
    if (session === null) return;
    await updateSiteSession(sessionId, counts);
  } catch (error) {
    console.warn('[vittix] could not persist progress counters', error);
  }
}
