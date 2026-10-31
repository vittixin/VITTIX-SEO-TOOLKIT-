/* eslint-disable @typescript-eslint/ban-ts-comment -- intentional: mock-heavy behavioral test */
// @ts-nocheck -- vi.mock factory typing against the real module signatures
// fights the in-memory doubles here; runtime behavior is what this file
// verifies (and typecheck of the crawler itself happens in crawler.ts).
import { describe, expect, it, vi } from 'vitest';
import type { PageSnapshot, SiteSession, SiteSessionInput } from '@vittix/shared';
import { SITE_LIMITS } from '@vittix/shared';

/**
 * Crawler behavior tests with an in-memory storage mock and an injectable
 * fetch. Covers the security-critical paths: robots blocking/disallow,
 * cross-origin redirects, non-HTML, auth failures, duplicate suppression,
 * page caps and cancellation.
 */

vi.mock('@/src/storage/site', (): unknown => {
  const sessions = new Map<number, SiteSession>();
  const pages = new Map<number, Record<string, unknown>>();
  let pageId = 1;
  let failPageWrites = false;
  // Fault injection: the next N writes of each kind abort (transaction/
  // quota simulation).
  let failNextPageWrites = 0;
  let failNextSessionWrites = 0;
  return {
    createSiteSession: async (session: Record<string, unknown>) => {
      const id = sessions.size + 1;
      sessions.set(id, { id, ...session } as SiteSession);
      return id;
    },
    getSiteSession: async (id: number) => sessions.get(id) ?? null,
    getLatestSiteSession: async () => [...sessions.values()].at(-1) ?? null,
    listSiteSessions: async () => [...sessions.values()],
    listSitePages: async (sessionId: number) =>
      [...pages.values()].filter((page) => page.sessionId === sessionId),
    addSitePages: async (records: Record<string, unknown>[]) => {
      if (failPageWrites) throw new Error('QuotaExceededError');
      for (const record of records) {
        const id = pageId++;
        pages.set(id, { id, ...record });
      }
    },
    updateSitePage: async (id: number, changes: Record<string, unknown>) => {
      if (failPageWrites) throw new Error('QuotaExceededError');
      if (failNextPageWrites > 0) {
        failNextPageWrites -= 1;
        throw new Error('Transaction aborted');
      }
      pages.set(id, { ...pages.get(id), ...changes });
    },
    updateSiteSession: async (id: number, changes: Record<string, unknown>) => {
      if (failNextSessionWrites > 0) {
        failNextSessionWrites -= 1;
        throw new Error('Transaction aborted');
      }
      sessions.set(id, { ...sessions.get(id), ...changes });
    },
    deleteSiteSession: async () => {},
    clearAllSiteData: async () => {},
    // test accessors
    __pages: pages,
    __sessions: sessions,
    __setFailPageWrites: (value: boolean) => {
      failPageWrites = value;
    },
    __failNextPageWrites: (count: number) => {
      failNextPageWrites = count;
    },
    __failNextSessionWrites: (count: number) => {
      failNextSessionWrites = count;
    },
  };
});

vi.mock('@/src/site/extract-html', () => ({
  parsePageSnapshot: (html: string, url: string): PageSnapshot => ({
    schemaVersion: 3,
    url,
    title: `Page: ${url}`,
    titleCount: 1,
    meta: {
      description: 'A page description long enough to be healthy for the analyzer checks.',
      canonical: null,
      robots: null,
      viewport: 'width=device-width, initial-scale=1',
      charset: 'UTF-8',
      lang: 'en',
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
    },
    descriptions: ['A page description long enough to be healthy for the analyzer checks.'],
    canonicals: [],
    headings: [{ tag: 'h1', text: 'Heading' }],
    headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    imageCount: 0,
    links: [...html.matchAll(/<a href="([^"]+)"/g)].map((match) => ({
      href: match[1] ?? '',
      text: 'link',
      rel: null,
      target: null,
      accessibleName: 'link',
    })),
    linkCount: 0,
    structuredData: [],
    structuredDataCount: 0,
    robotsValues: [],
    hreflang: [],
    hreflangCount: 0,
    omitted: {
      headings: 0,
      images: 0,
      links: 0,
      descriptions: 0,
      canonicals: 0,
      structuredData: 0,
      hreflang: 0,
    },
    hidden: { headings: 0, images: 0, links: 0 },
    svg: { total: 0, unnamed: 0 },
    textStats: { wordCount: 10 },
    extractedAt: '2026-10-31T00:00:00.000Z',
  }),
}));

import { runSiteAudit } from './crawler';
import { createSiteSession, updateSiteSession, listSitePages } from '@/src/storage/site';

// The storage mock keeps module-level state; every test seeds a fresh
// session so interference is avoided by construction (unique origins would
// also work). No shared beforeEach required.

const ORIGIN = 'https://site.test';

function htmlResponse(body: string, finalUrl?: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl ?? 'irrelevant-placeholder',
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    blob: async () => new Blob([body]),
    text: async () => body,
  } as unknown as Response;
}

function okRobots(): Response {
  return new Response('User-agent: *\n', { status: 200 }) as unknown as Response;
}

function jsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'https://site.test/robots.txt',
    headers: new Headers(),
    text: async () => '',
  } as unknown as Response;
}

async function seedSession(overrides: Partial<SiteSessionInput> = {}): Promise<number> {
  return createSiteSession({
    origin: ORIGIN,
    status: 'running',
    startedAt: '2026-10-31T00:00:00.000Z',
    maxPages: 10,
    maxDepth: 2,
    concurrency: 2,
    delayMs: 100,
    ...overrides,
  });
}

// NOTE: the mock module state persists across tests; each test seeds a fresh
// session with a unique origin to avoid interference.

describe('runSiteAudit', () => {
  it('crawls same-origin pages, skips cross-origin links and duplicates', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) {
        return Promise.resolve(new Response('', { status: 404 }) as unknown as Response);
      }
      if (url === `${ORIGIN}/`) {
        return Promise.resolve(
          htmlResponse(
            `<a href="https://site.test/a">a</a><a href="https://site.test/a">a again</a><a href="https://other.test/x">ext</a>`,
            url,
          ),
        );
      }
      return Promise.resolve(htmlResponse('<a href="https://site.test/">back</a>', url));
    });

    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    const urls = pages.map((page) => page.url).sort();
    expect(urls).toEqual([`${ORIGIN}/`, `${ORIGIN}/a`]); // no other.test, no dup
    const fetched = fetchImpl.mock.calls.filter(
      ([input]) => !String(input).endsWith('/robots.txt'),
    );
    expect(fetched).toHaveLength(2);
  });

  it('blocks the whole audit when robots.txt returns a server error', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      if (String(input).endsWith('/robots.txt')) return Promise.resolve(jsonResponse(500));
      return Promise.resolve(htmlResponse('<p>never parsed</p>'));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    expect(pages.filter((page) => page.status === 'ok')).toHaveLength(0);
    const { getSiteSession } = await import('@/src/storage/site');
    const session = await getSiteSession(sessionId);
    expect(session?.status).toBe('failed');
    expect(session?.robotsStatus).toBe('blocked');
  });

  it('skips Disallowed paths without fetching them', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) {
        return Promise.resolve(
          new Response('User-agent: *\nDisallow: /private\n', {
            status: 200,
          }) as unknown as Response,
        );
      }
      return Promise.resolve(
        htmlResponse(
          '<a href="https://site.test/private/x">p</a><a href="https://site.test/open">o</a>',
          url,
        ),
      );
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    const privatePage = pages.find((page) => page.url === `${ORIGIN}/private/x`);
    expect(privatePage?.status).toBe('skipped-robots');
    const fetchedPaths = fetchImpl.mock.calls
      .map(([input]) => String(input))
      .filter((url) => !url.endsWith('/robots.txt'));
    expect(fetchedPaths.some((url) => url.includes('/private'))).toBe(false);
  });

  it('records cross-origin redirects without parsing them', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(jsonResponse(404));
      if (url === `${ORIGIN}/redirect`) {
        return Promise.resolve(htmlResponse('<p>other origin</p>', 'https://elsewhere.test/final'));
      }
      return Promise.resolve(htmlResponse('<a href="https://site.test/redirect">r</a>', url));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    const redirected = pages.find((page) => page.url === `${ORIGIN}/redirect`);
    expect(redirected?.status).toBe('skipped-external-redirect');
    expect(redirected?.finalUrl).toBe('https://elsewhere.test/final');
  });

  it('records non-HTML responses as skipped', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(jsonResponse(404));
      if (url === `${ORIGIN}/file.pdf`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          url,
          headers: new Headers({ 'content-type': 'application/pdf' }),
          blob: async () => new Blob(['%PDF']),
        } as unknown as Response);
      }
      return Promise.resolve(htmlResponse('<a href="https://site.test/file.pdf">pdf</a>', url));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    expect(pages.find((page) => page.url === `${ORIGIN}/file.pdf`)?.status).toBe(
      'skipped-non-html',
    );
  });

  it('records 403 as failed-auth and keeps crawling', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(jsonResponse(404));
      if (url === `${ORIGIN}/locked`) {
        return Promise.resolve(htmlResponse('<p>forbidden</p>', url, 403));
      }
      return Promise.resolve(htmlResponse('<a href="https://site.test/locked">l</a>', url));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    expect(pages.find((page) => page.url === `${ORIGIN}/locked`)?.status).toBe('failed-auth');
  });

  it('enforces the hard page cap', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(jsonResponse(404));
      const links = [1, 2, 3, 4, 5, 6]
        .map((n) => `<a href="https://site.test/p${n}">p${n}</a>`)
        .join('');
      return Promise.resolve(htmlResponse(links, url));
    });
    const sessionId = await seedSession({ maxPages: 3 });
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    expect(pages.length).toBeLessThanOrEqual(3);
    const { getSiteSession } = await import('@/src/storage/site');
    const session = await getSiteSession(sessionId);
    // The cap limits DISCOVERY (records created), not processing: every
    // recorded page was processed, so the audit completes within scope.
    // (A session that ends with UNPROCESSED pending pages is the failure
    // case — covered by the finalize safety net.)
    expect(session?.status).toBe('completed');
  });

  it('stops without fetching when the session was cancelled beforehand', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      if (String(input).endsWith('/robots.txt')) return Promise.resolve(jsonResponse(404));
      return Promise.resolve(htmlResponse('<p>x</p>'));
    });
    const sessionId = await seedSession();
    await updateSiteSession(sessionId, { stopRequested: true });
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    expect(
      fetchImpl.mock.calls.filter(([input]) => !String(input).endsWith('/robots.txt')),
    ).toHaveLength(0);
    const { getSiteSession } = await import('@/src/storage/site');
    const session = await getSiteSession(sessionId);
    expect(session?.status).toBe('cancelled');
  });

  it('marks pages failed on network errors and completes the session', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(jsonResponse(404));
      return Promise.reject(new Error('ECONNREFUSED'));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    expect(pages[0]?.status).toBe('failed');
    expect(pages[0]?.error).toContain('ECONNREFUSED');
    const { getSiteSession } = await import('@/src/storage/site');
    expect((await getSiteSession(sessionId))?.status).toBe('completed');
  });

  it('respects SITE_LIMITS.maxPagesCap', () => {
    expect(SITE_LIMITS.maxPagesCap).toBe(50);
  });
});

// --- Phase 4 hardening --------------------------------------------------------

import { getSiteSession, __setFailPageWrites } from '@/src/storage/site';

describe('Phase 4 — permission enforcement (fail closed)', () => {
  it('fails the session before any request when the origin permission is missing', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(htmlResponse('<p>x</p>')));
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    const session = await getSiteSession(sessionId);
    expect(session?.status).toBe('failed');
    expect(session?.stopReason).toContain('not granted');
    // Pending pages remain pending (recoverable after re-grant).
    expect((await listSitePages(sessionId)).every((page) => page.status === 'pending')).toBe(true);
  });

  it('cancels immediately mid-audit when the permission is revoked', async () => {
    let revoked = false;
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      if (url === `${ORIGIN}/`) {
        revoked = true;
        return Promise.resolve(htmlResponse('<a href="https://site.test/next">next</a>', url));
      }
      return Promise.resolve(htmlResponse('<p>should not be reached</p>', url));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => !revoked,
    });

    const session = await getSiteSession(sessionId);
    expect(session?.status).toBe('failed');
    expect(session?.stopReason).toContain('revoked during the audit');
    const fetchedUrls = fetchImpl.mock.calls.map(([input]) => String(input));
    expect(fetchedUrls.some((url) => url === `${ORIGIN}/next`)).toBe(false);
  });

  it('probes the permission gate before robots and before every page', async () => {
    let probes = 0;
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      if (url === `${ORIGIN}/`) {
        return Promise.resolve(htmlResponse('<a href="https://site.test/a">a</a>', url));
      }
      return Promise.resolve(htmlResponse('<p>leaf</p>', url));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => {
        probes += 1;
        return true;
      },
    });
    // One gate before robots + one per processed page (root + /a).
    expect(probes).toBeGreaterThanOrEqual(3);
  });
});

describe('Phase 4 — robots redirect fail-closed', () => {
  it('blocks the audit when robots.txt redirects off-origin', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      if (String(input).endsWith('/robots.txt')) {
        return Promise.resolve(htmlResponse('<p>evil</p>', 'https://evil.test/robots.txt', 200));
      }
      return Promise.resolve(htmlResponse('<p>x</p>'));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const session = await getSiteSession(sessionId);
    expect(session?.status).toBe('failed');
    expect(session?.stopReason).toContain('off-origin');
    const pageFetches = fetchImpl.mock.calls.filter(
      ([input]) => !String(input).endsWith('/robots.txt'),
    );
    expect(pageFetches).toHaveLength(0);
  });
});

describe('Phase 4 — storage failures', () => {
  it('fails closed with a durable reason when crawl state cannot be persisted', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      return Promise.resolve(htmlResponse('<p>content</p>', url));
    });
    const sessionId = await seedSession();
    __setFailPageWrites(true);
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });
    __setFailPageWrites(false);

    const session = await getSiteSession(sessionId);
    // A broken store means unrecorded crawling — the audit refuses to run
    // and records why. Nothing was fetched.
    expect(session?.status).toBe('failed');
    expect(session?.stopReason).toContain('persist crawl state');
    const pageFetches = fetchImpl.mock.calls.filter(
      ([input]) => !String(input).endsWith('/robots.txt'),
    );
    expect(pageFetches).toHaveLength(0);
  });
});

describe('Phase 4 — idempotent resume and accurate counters', () => {
  it('does not refetch completed pages on resume and keeps counters accurate', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      if (url === `${ORIGIN}/done`) {
        return Promise.resolve(htmlResponse('<a href="https://site.test/pending">p</a>', url));
      }
      return Promise.resolve(htmlResponse('<p>fresh</p>', url));
    });
    const sessionId = await seedSession();
    // Simulate a paused audit: one page already analyzed, one still pending.
    const { addSitePages } = await import('@/src/storage/site');
    await addSitePages([
      { sessionId, url: `${ORIGIN}/done`, status: 'ok', depth: 0 },
      { sessionId, url: `${ORIGIN}/pending`, status: 'pending', depth: 1 },
    ]);
    await updateSiteSession(sessionId, { pagesDone: 1 });

    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });

    // Only the pending page was fetched this run.
    const fetchedPages = fetchImpl.mock.calls
      .map(([input]) => String(input))
      .filter((url) => !url.endsWith('/robots.txt'));
    expect(fetchedPages).toEqual([`${ORIGIN}/pending`]);

    const pages = await listSitePages(sessionId);
    expect(pages).toHaveLength(2);
    expect(pages.filter((page) => page.status === 'ok')).toHaveLength(2);

    const session = await getSiteSession(sessionId);
    // Counter continues from the pre-restart value — accurate after restart.
    expect(session?.pagesDone).toBe(2);
    expect(session?.status).toBe('completed');
  });

  it('stops issuing new fetches when cancellation lands mid-crawl', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      if (url === `${ORIGIN}/`) {
        void updateSiteSession(sessionId, { stopRequested: true });
        return Promise.resolve(htmlResponse('<a href="https://site.test/next">n</a>', url));
      }
      return Promise.resolve(htmlResponse('<p>never</p>', url));
    });
    const sessionId = await seedSession();
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const fetchedUrls = fetchImpl.mock.calls.map(([input]) => String(input));
    expect(fetchedUrls.some((url) => url === `${ORIGIN}/next`)).toBe(false);
    expect((await getSiteSession(sessionId))?.status).toBe('cancelled');
  });
});

// --- Phase 5 fault injection ---------------------------------------------------

describe('Phase 5 — fault injection', () => {
  async function flags() {
    return import('@/src/storage/site') as Promise<{
      __failNextSessionWrites: (count: number) => void;
      __failNextPageWrites: (count: number) => void;
    }>;
  }

  it('treats a robots-status write failure as RECOVERABLE (crawl continues)', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      return Promise.resolve(htmlResponse('<p>fine</p>', url));
    });
    const sessionId = await seedSession();
    // Abort ONLY the robots-status write (the first session write).
    (await flags()).__failNextSessionWrites(1);
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const session = await getSiteSession(sessionId);
    expect(session?.status).toBe('completed'); // crawl was not aborted
    expect((await listSitePages(sessionId)).filter((page) => page.status === 'ok')).toHaveLength(1);
  });

  it('survives a finalize-write failure without an unhandled rejection', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      return Promise.resolve(htmlResponse('<p>fine</p>', url));
    });
    const sessionId = await seedSession();
    // Every terminal status write aborts (finalize path).
    (await flags()).__failNextSessionWrites(99);
    await expect(
      runSiteAudit(sessionId, {
        fetchImpl,
        delay: async () => {},
        hasPermission: async () => true,
      }),
    ).resolves.toBeUndefined();
    (await flags()).__failNextSessionWrites(0);
    // Session left 'running' — recoverable via Resume/Discard in the UI.
    expect((await getSiteSession(sessionId))?.status).toBe('running');
  });

  it('marks a transient page-write abort as failed and stays idempotent on resume', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      return Promise.resolve(htmlResponse('<p>content</p>', url));
    });
    const sessionId = await seedSession({ maxPages: 1 });
    (await flags()).__failNextPageWrites(1); // first page write aborts (partial transaction)
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });

    const pages = await listSitePages(sessionId);
    expect(pages[0]?.status).toBe('failed');

    // Resume cannot reprocess a failed page (idempotency boundary).
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });
    expect(await listSitePages(sessionId)).toHaveLength(1);
    expect(
      fetchImpl.mock.calls.filter(([input]) => !String(input).endsWith('/robots.txt')),
    ).toHaveLength(1);
  });

  it('recovers accurate counters when a bookkeeping write fails first', async () => {
    const fetchImpl = vi.fn((input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return Promise.resolve(okRobots());
      return Promise.resolve(htmlResponse('<p>content</p>', url));
    });
    // Explicit pagesDone so the mock (raw storage, no Zod defaults) has the
    // field; the pre-restart baseline is 0.
    const sessionId = await seedSession({ pagesDone: 0 });
    // Abort only the FIRST session write (robotsStatus bookkeeping —
    // RECOVERABLE); the page write and the counter write succeed.
    (await flags()).__failNextSessionWrites(1);
    await runSiteAudit(sessionId, {
      fetchImpl,
      delay: async () => {},
      hasPermission: async () => true,
    });
    const session = await getSiteSession(sessionId);
    expect(session?.status).toBe('completed');
    expect(session?.pagesDone).toBe(1);
    expect((await listSitePages(sessionId))[0]?.status).toBe('ok');
  });
});
