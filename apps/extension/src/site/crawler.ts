import { browser } from 'wxt/browser';
import { SITE_LIMITS, type SiteResponseMetadata, type SiteSession } from '@vittix/shared';
import { analyzeSnapshot } from '@vittix/seo-core';
import { analyzeResponseMetadata } from '@vittix/seo-core';
import { checkCrawlableOrigin, isSameOriginUrl } from './guards';
import { normalizeSiteUrl } from './normalize';
import { EMPTY_ROBOTS_POLICY, parseRobotsTxt, type RobotsPolicy } from './robots';
import { PacedRunner } from './rate';
import { EXTRACTOR_LIMITS } from '../extraction/limits';
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
 *  - hard page cap; same-origin redirects only are parsed
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
        return await browser.permissions.contains({ origins: [`${origin}/*`] });
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
      try {
        await addSitePages([{ sessionId, url: start, status: 'pending', depth: 0 }]);
      } catch (error) {
        // Without durable state there is no audit — fail closed instead of
        // crawling unrecorded.
        await failSession(
          sessionId,
          `Could not persist crawl state (${error instanceof Error ? error.message : String(error)}). The audit was stopped to avoid unrecorded crawling.`,
        );
        onProgress();
        return;
      }
      queue.push({ url: start, depth: 0 });
      seen.add(start);
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
  const workers: Promise<void>[] = [];
  for (let i = 0; i < session.concurrency; i += 1) {
    workers.push(
      (async () => {
        for (;;) {
          const current = await takeNext(sessionId, queue);
          if (current === null) return; // queue drained
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
    const pages = await listSitePages(sessionId);
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
          'robots.txt redirect metadata is opaque in this browser; the redirect was not followed.',
      };
    if (response.status >= 300 && response.status < 400)
      return {
        policy: EMPTY_ROBOTS_POLICY,
        status: 'allowed',
        blocked: true,
        blockReason:
          'robots.txt returned a redirect; redirects are not followed when destination safety cannot be verified.',
      };
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
          blockReason: `robots.txt redirected off-origin (to ${finalUrl.slice(0, 120)}) — the audit was blocked for safety.`,
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
    const text = (await response.text()).slice(0, 500_000);
    const policy = parseRobotsTxt(text);
    // Caller-side enforcement: only same-origin Sitemap URLs are exposed
    // (sitemap discovery is a future feature; the filter guarantees that
    // whenever it lands, no off-origin URL can enter the crawl queue).
    const sitemaps = policy.sitemaps.filter((url) => isSameOriginUrl(url, session.origin));
    return { policy: { ...policy, sitemaps }, status: 'allowed', blocked: false };
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
  hasPermission: (origin: string) => Promise<boolean>;
  sessionId: number;
}

interface SafeResponse {
  response: Response | null;
  metadata: SiteResponseMetadata;
  finalUrl: string;
  externalRedirect: boolean;
  failure: string | null;
}

const MAX_REDIRECT_HOPS = 10;

/** Fetches manually so a redirect is never followed implicitly. Opaque
 * redirects are recorded and stopped; this Chrome extension context exposes
 * `opaqueredirect` rather than the hop status/Location. */
async function fetchSameOriginResponse(
  initialUrl: string,
  session: SiteSession,
  robots: RobotsPolicy,
  context: ProcessContext,
  firstRequestAlreadyPaced: boolean,
): Promise<SafeResponse> {
  const startedAt = performance.now();
  const redirectChain: SiteResponseMetadata['redirectChain'] = [];
  let currentUrl = initialUrl;
  for (let requestIndex = 0; requestIndex <= MAX_REDIRECT_HOPS; requestIndex += 1) {
    if (!isSameOriginUrl(currentUrl, session.origin))
      return {
        response: null,
        metadata: makeMetadata(null, redirectChain, startedAt, true),
        finalUrl: currentUrl,
        externalRedirect: true,
        failure: null,
      };
    const parsed = new URL(currentUrl);
    if (!robots.allows(parsed.pathname + parsed.search))
      return {
        response: null,
        metadata: makeMetadata(null, redirectChain, startedAt, true),
        finalUrl: currentUrl,
        externalRedirect: false,
        failure: 'Redirect target is disallowed by robots.txt.',
      };
    if (requestIndex > 0 || !firstRequestAlreadyPaced) await context.runner.pace();
    if (!(await context.hasPermission(session.origin)))
      return {
        response: null,
        metadata: makeMetadata(null, redirectChain, startedAt, true),
        finalUrl: currentUrl,
        externalRedirect: false,
        failure: 'Origin permission was revoked before a response fetch.',
      };
    if (await shouldStop(context.sessionId))
      return {
        response: null,
        metadata: makeMetadata(null, redirectChain, startedAt, true),
        finalUrl: currentUrl,
        externalRedirect: false,
        failure: 'Crawl cancelled before response fetch.',
      };
    let response: Response;
    try {
      response = await context.fetchImpl(currentUrl, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
      });
    } catch (error) {
      return {
        response: null,
        metadata: makeMetadata(null, redirectChain, startedAt, false),
        finalUrl: currentUrl,
        externalRedirect: false,
        failure: `Response fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (response.type === 'opaqueredirect' || response.status === 0) {
      redirectChain.push({
        url: currentUrl.slice(0, 2048),
        status: null,
        location: null,
        opaque: true,
      });
      return {
        response: null,
        metadata: makeMetadata(null, redirectChain, startedAt, true),
        finalUrl: currentUrl,
        externalRedirect: false,
        failure:
          'Redirect response metadata is opaque in this browser; the redirect was not followed for safety.',
      };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      let destination: URL | null = null;
      try {
        if (location !== null) destination = new URL(location, currentUrl);
      } catch {
        destination = null;
      }
      redirectChain.push({
        url: currentUrl.slice(0, 2048),
        status: response.status,
        location: location?.slice(0, 2048) ?? null,
        opaque: false,
      });
      if (destination === null)
        return {
          response,
          metadata: makeMetadata(response, redirectChain, startedAt, false),
          finalUrl: currentUrl,
          externalRedirect: false,
          failure: 'Redirect response had no valid Location; it was not followed.',
        };
      if (destination.origin !== new URL(session.origin).origin)
        return {
          response,
          metadata: makeMetadata(response, redirectChain, startedAt, false),
          finalUrl: destination.href.slice(0, 2048),
          externalRedirect: true,
          failure: null,
        };
      if (requestIndex === MAX_REDIRECT_HOPS)
        return {
          response,
          metadata: makeMetadata(response, redirectChain, startedAt, false),
          finalUrl: currentUrl,
          externalRedirect: false,
          failure: 'Redirect hop limit exceeded.',
        };
      currentUrl = destination.href;
      continue;
    }
    return {
      response,
      metadata: makeMetadata(response, redirectChain, startedAt, false),
      finalUrl: currentUrl,
      externalRedirect: false,
      failure: null,
    };
  }
  return {
    response: null,
    metadata: makeMetadata(null, redirectChain, startedAt, false),
    finalUrl: currentUrl,
    externalRedirect: false,
    failure: 'Redirect hop limit exceeded.',
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

  const pages = await listSitePages(sessionId);
  const record = pages.find((page) => page.url === target.url && page.status === 'pending');
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
        });
        await syncCounters(sessionId);
        onProgress();
        return;
      }
      if (safe.externalRedirect) {
        await updateSitePage(pageId, {
          status: 'skipped-external-redirect',
          finalUrl: safe.finalUrl,
          httpStatus: safe.metadata.finalStatus,
          responseMetadata: safe.metadata,
        });
        await syncCounters(sessionId);
        onProgress();
        return;
      }

      const response = safe.response!;
      const finalUrl = safe.finalUrl;
      const responseFindings = analyzeResponseMetadata(null, safe.metadata);

      const contentType = response.headers.get('content-type') ?? '';
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

      const { html, truncated: bodyTruncated } = await readBodyCapped(response);
      const metadata = { ...safe.metadata, bodyTruncated };
      const snapshot = parsePageSnapshot(html, finalUrl, EXTRACTOR_LIMITS);
      const result = analyzeSnapshot(snapshot, { responseMetadata: metadata });
      if (bodyTruncated) result.truncated = true;

      await updateSitePage(pageId, {
        status: 'ok',
        finalUrl,
        httpStatus: response.status,
        analyzedAt: new Date().toISOString(),
        snapshot,
        result,
        responseMetadata: metadata,
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

async function readBodyCapped(response: Response): Promise<{ html: string; truncated: boolean }> {
  if (!response.body) {
    // Test doubles and genuinely body-less responses may not expose a stream.
    // Production Fetch responses with content use the streaming branch below.
    if (typeof response.blob !== 'function') return { html: '', truncated: false };
    const blob = await response.blob();
    const truncated = blob.size > SITE_LIMITS.maxResponseBytes;
    return { html: await blob.slice(0, SITE_LIMITS.maxResponseBytes).text(), truncated };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = SITE_LIMITS.maxResponseBytes - size;
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
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { html: new TextDecoder().decode(bytes), truncated };
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

/**
 * INVARIANT: counter values must agree with persisted page records.
 *
 * Instead of independently incrementing counters (which drift the moment a
 * counter write fails while a page write succeeds), counters are DERIVED
 * from the page records and persisted in one write. If this write fails it
 * is only advisory — the dashboard summary recomputes the same numbers from
 * the records, so the UI never disagrees with durable state.
 *
 * Called after every terminal page-status write.
 */
async function syncCounters(sessionId: number): Promise<void> {
  try {
    const pages = await listSitePages(sessionId);
    const session = await getSiteSession(sessionId);
    if (session === null) return;
    await updateSiteSession(sessionId, {
      pagesDone: pages.filter((page) => page.status === 'ok').length,
      pagesFailed: pages.filter((page) => page.status.startsWith('failed')).length,
      pagesSkipped: pages.filter((page) => page.status.startsWith('skipped')).length,
    });
  } catch (error) {
    console.warn('[vittix] could not persist progress counters', error);
  }
}
