import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { extensionPageUrl, loadExtension } from './helpers/extension';

/**
 * Site-audit E2E: the REAL crawl pipeline against routed fixture pages.
 *
 * The extension permission prompt is auto-accepted via Chromium's
 * --use-fake-ui-for-permission-flow test switch (used by Chrome's own
 * extension test suites). If the switch stops working in a future
 * Chromium, this test fails on the consent step — that is the honest
 * signal to fall back to manual acceptance rather than fake the flow.
 */
test('site audit: consent → crawl → summary → export', async () => {
  test.setTimeout(120_000);
  const { context, extensionId } = await loadExtension('e2e', [
    '--use-fake-ui-for-permission-flow',
  ]);
  try {
    const sitemapFetchPaths = new Set<string>();
    let offOriginSitemapFetched = false;
    const gzipBomb = gzipSync(
      Buffer.from(
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${' '.repeat(10_100_000)}</urlset>`,
      ),
    );
    await context.route('https://other.test/**', (route) => {
      offOriginSitemapFetched = true;
      return route.fulfill({ status: 200, contentType: 'application/xml', body: '<urlset />' });
    });
    // Fixture site: / links to /a, /b, a duplicate of /a, an off-origin
    // link, and /locked (403). /a links back to /. /b is robots-disallowed.
    await context.route('https://fixture.test/**', (route) => {
      const url = new URL(route.request().url());
      sitemapFetchPaths.add(url.pathname);
      if (url.pathname === '/headers') {
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          headers: {
            'content-length': '36',
            'x-robots-tag': 'noindex',
            'cache-control': 'public, max-age=60',
            'content-encoding': 'identity',
            'strict-transport-security': 'max-age=31536000',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'x-frame-options': 'DENY',
          },
          body: '<!doctype html><title>Headers</title>',
        });
      }
      if (url.pathname === '/redirect') {
        return route.fulfill({ status: 302, headers: { location: '/headers' }, body: '' });
      }
      if (url.pathname === '/robots.txt') {
        return route.fulfill({
          contentType: 'text/plain',
          body: 'User-agent: *\nDisallow: /b\n',
        });
      }
      if (url.pathname === '/sitemap.xml') {
        return route.fulfill({
          contentType: 'application/xml',
          body: '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://fixture.test/map.xml</loc></sitemap><sitemap><loc>https://fixture.test/bad.xml</loc></sitemap><sitemap><loc>https://fixture.test/redirect.xml</loc></sitemap><sitemap><loc>https://fixture.test/level1.xml</loc></sitemap><sitemap><loc>https://fixture.test/zipbomb.xml.gz</loc></sitemap></sitemapindex>',
        });
      }
      if (url.pathname === '/map.xml')
        return route.fulfill({
          contentType: 'application/xml',
          body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>https://fixture.test/a</loc><lastmod>2026-10-30</lastmod><xhtml:link rel="alternate" hreflang="en" href="https://fixture.test/a"/></url><url><loc>https://fixture.test/sitemap-only</loc><lastmod>not-a-date</lastmod></url><url><loc>https://fixture.test/b</loc></url><url><loc>https://other.test/out</loc></url><url><loc>https://fixture.test/a</loc></url></urlset>',
        });
      if (url.pathname === '/bad.xml')
        return route.fulfill({ contentType: 'application/xml', body: '<urlset><url><loc>broken' });
      if (url.pathname === '/redirect.xml')
        return route.fulfill({
          status: 302,
          headers: { location: 'https://other.test/redirect-target.xml' },
          body: '',
        });
      if (url.pathname === '/level1.xml')
        return route.fulfill({
          contentType: 'application/xml',
          body: '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://fixture.test/level2.xml</loc></sitemap></sitemapindex>',
        });
      if (url.pathname === '/level2.xml')
        return route.fulfill({
          contentType: 'application/xml',
          body: '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://fixture.test/level3.xml</loc></sitemap></sitemapindex>',
        });
      if (url.pathname === '/zipbomb.xml.gz')
        return route.fulfill({ contentType: 'application/gzip', body: gzipBomb });
      if (url.pathname === '/locked') {
        return route.fulfill({ status: 403, contentType: 'text/html', body: '<p>403</p>' });
      }
      if (url.pathname === '/a') {
        return route.fulfill({
          contentType: 'text/html',
          headers: {
            'x-robots-tag': 'noindex',
            'cache-control': 'no-cache',
            'x-content-type-options': 'nosniff',
          },
          body: '<!doctype html><html lang="en"><head><title>Page A Title</title><meta name="description" content="A description long enough to be healthy for the analyzer checks on page A." /></head><body><h1>Page A</h1><a href="https://fixture.test/">home</a></body></html>',
        });
      }
      if (url.pathname === '/b') {
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html lang="en"><head><title>Page B (robots)</title></head><body><h1>Page B</h1></body></html>',
        });
      }
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="en"><head><title>Fixture Home Title</title><meta name="description" content="A description long enough to be healthy for the analyzer checks on the home page." /></head><body><h1>Fixture home</h1><a href="https://fixture.test/a">A</a><a href="https://fixture.test/a">A duplicate</a><a href="https://fixture.test/b">B (disallowed)</a><a href="https://fixture.test/locked">locked</a><a href="https://other.test/x">off-origin</a></body></html>`,
      });
    });

    const dashboard = await context.newPage();
    await dashboard.goto(extensionPageUrl(extensionId, 'dashboard.html'));
    await dashboard.getByTestId('nav-site').click();
    await expect(dashboard.getByTestId('site-audit-view')).toBeVisible();

    // Consent flow: enter origin → grant (auto-accepted) → start.
    await dashboard.getByTestId('site-origin-input').fill('https://fixture.test');
    await dashboard.getByTestId('site-grant').click();
    await expect(dashboard.getByTestId('site-consent')).toBeVisible({ timeout: 10_000 });
    const headerProbe = await dashboard.evaluate(async () => {
      const response = await fetch('https://fixture.test/headers', {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
      });
      return {
        status: response.status,
        type: response.type,
        url: response.url,
        headers: Object.fromEntries(
          [
            'content-type',
            'content-length',
            'x-robots-tag',
            'cache-control',
            'content-encoding',
            'strict-transport-security',
            'content-security-policy',
            'x-content-type-options',
            'referrer-policy',
            'x-frame-options',
          ].map((name) => [name, response.headers.get(name)]),
        ),
      };
    });
    console.log('extension response header probe', JSON.stringify(headerProbe));
    expect(headerProbe.status).toBe(200);
    expect(headerProbe.headers['x-robots-tag']).toBe('noindex');
    expect(headerProbe.headers['cache-control']).toBe('public, max-age=60');
    expect(headerProbe.headers['content-encoding']).toBe('identity');
    expect(headerProbe.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(headerProbe.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headerProbe.headers['x-content-type-options']).toBe('nosniff');
    expect(headerProbe.headers['referrer-policy']).toBe('no-referrer');
    expect(headerProbe.headers['x-frame-options']).toBe('DENY');
    const redirectProbe = await dashboard.evaluate(async () => {
      const response = await fetch('https://fixture.test/redirect', {
        method: 'GET',
        credentials: 'omit',
        redirect: 'manual',
      });
      return {
        status: response.status,
        type: response.type,
        url: response.url,
        location: response.headers.get('location'),
      };
    });
    console.log('extension manual redirect probe', JSON.stringify(redirectProbe));
    expect(redirectProbe).toEqual({
      status: 0,
      type: 'opaqueredirect',
      url: 'https://fixture.test/redirect',
      location: null,
    });
    await dashboard.getByTestId('site-start').click();

    // The crawl completes quickly on fixtures; the summary must appear and
    // reflect the ground truth: 3 ok pages (/, /a + …), /b robots-skipped,
    // /locked failed-auth, off-origin never fetched.
    await expect(dashboard.getByTestId('site-summary')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          dashboard.evaluate(async () => {
            const request = indexedDB.open('vittix-seo');
            const database = await new Promise<IDBDatabase>((resolve, reject) => {
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
              const get = database.transaction('siteAudits').objectStore('siteAudits').getAll();
              get.onsuccess = () => resolve(get.result);
              get.onerror = () => reject(get.error);
            });
            database.close();
            return (rows.at(-1)?.sitemap as { truncated?: boolean } | undefined)?.truncated;
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    const summaryText = await dashboard.getByTestId('site-summary').innerText();
    expect(summaryText).toContain('Pages audited');
    expect(summaryText).toContain('Sitemap discovery');
    expect(summaryText).toContain('https://fixture.test/sitemap-only');
    expect(summaryText).toContain('cross-origin entries ignored: 1');
    expect(summaryText).toContain('Malformed sitemap XML.');
    expect(summaryText).toContain('recursion limit reached');
    expect(summaryText).toContain('Sitemap size limit reached');
    expect(sitemapFetchPaths.has('/level3.xml')).toBe(false);
    expect(offOriginSitemapFetched).toBe(false);
    const storedSitemap = await dashboard.evaluate(async () => {
      const request = indexedDB.open('vittix-seo');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const sessions = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const get = database.transaction('siteAudits').objectStore('siteAudits').getAll();
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      database.close();
      return (sessions.at(-1)?.sitemap ?? {}) as {
        entries?: { url: string; lastmod: string | null; alternates: string[] }[];
        invalidLastmodCount?: number;
        duplicateCount?: number;
        truncated?: boolean;
      };
    });
    expect(storedSitemap.entries?.find((entry) => entry.url.endsWith('/a'))).toMatchObject({
      lastmod: '2026-10-30',
      alternates: ['https://fixture.test/a'],
    });
    expect(storedSitemap.invalidLastmodCount).toBe(1);
    expect(storedSitemap.duplicateCount).toBe(1);
    expect(storedSitemap.truncated).toBe(true);

    // URL list: filter to /a.
    await dashboard.getByTestId('site-url-filter').fill('/a');
    await expect(dashboard.getByText('https://fixture.test/a').first()).toBeVisible();
    await expect(dashboard.getByText('noindex', { exact: true })).toBeVisible();
    await dashboard.getByLabel('Filter response metadata').selectOption('slow');
    await expect(dashboard.getByText('No pages match the filter.')).toBeVisible();
    await dashboard.getByLabel('Filter response metadata').selectOption('all');
    await dashboard.getByTestId('site-url-filter').fill('');

    // Exports produce real downloads.
    await dashboard.getByTestId('site-open-export-dialog').click();
    const jsonDownload = dashboard.waitForEvent('download');
    await dashboard.getByTestId('site-export-json').click();
    const siteJsonDownload = await jsonDownload;
    expect(siteJsonDownload.suggestedFilename()).toContain('vittix-site-audit');
    const siteJsonPath = resolve(import.meta.dirname, '../test-results/export-site-audit.json');
    await siteJsonDownload.saveAs(siteJsonPath);
    expect(readFileSync(siteJsonPath, 'utf8')).toContain('"xRobotsTag": "noindex"');
    expect(readFileSync(siteJsonPath, 'utf8')).toContain('"sitemap"');

    const csvDownload = dashboard.waitForEvent('download');
    await dashboard.getByTestId('site-export-csv').click();
    expect((await csvDownload).suggestedFilename()).toContain('vittix-site-pages');

    const htmlReportDownload = dashboard.waitForEvent('download');
    await dashboard.getByTestId('site-export-html-report').click();
    const htmlReport = await htmlReportDownload;
    expect(htmlReport.suggestedFilename()).toContain('vittix-site-report');
    const htmlPath = resolve(import.meta.dirname, '../test-results/export-site-report.html');
    await htmlReport.saveAs(htmlPath);
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toContain('X-Robots-Tag');
    expect(html).toContain('Sitemap discovery');
    const reportPage = await context.newPage();
    const requests: string[] = [];
    reportPage.on('request', (request) => requests.push(request.url()));
    reportPage.on('dialog', (dialog) => void dialog.dismiss());
    reportPage.on('console', (message) => {
      if (message.type() === 'error')
        throw new Error(`Site report console error: ${message.text()}`);
    });
    await reportPage.setContent(html);
    await expect(
      reportPage.getByRole('heading', { name: 'Top issues by page count' }),
    ).toBeVisible();
    expect(await reportPage.locator('script').count()).toBe(0);
    expect(requests).toEqual([]);
    await reportPage.emulateMedia({ media: 'print' });
    await expect(
      reportPage.getByRole('heading', { name: 'Top issues by page count' }),
    ).toBeVisible();
    await reportPage.close();
    const markdownReportDownload = dashboard.waitForEvent('download');
    await dashboard.getByTestId('site-export-markdown-report').click();
    const markdownReport = await markdownReportDownload;
    expect(markdownReport.suggestedFilename()).toContain('.md');

    // Session finished and page statuses are grounded.
    await expect(dashboard.getByTestId('site-url-filter')).toBeVisible();
    await expect(dashboard.locator('text=skipped-robots').first()).toBeVisible();
    await expect(dashboard.locator('text=failed-auth').first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test('site audit against a real local HTTPS server: robots, gzip sitemap, redirect, headers and slow response', async () => {
  test.setTimeout(120_000);
  const { port } = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../test-results/local-server/state.json'), 'utf8'),
  ) as { port: number };
  const origin = `https://fixture.test:${port}`;
  const { context, extensionId } = await loadExtension('e2e', [
    '--use-fake-ui-for-permission-flow',
    '--host-resolver-rules=MAP fixture.test 127.0.0.1',
    '--ignore-certificate-errors',
  ]);
  try {
    const dashboard = await context.newPage();
    await dashboard.goto(extensionPageUrl(extensionId, 'dashboard.html'));
    await dashboard.getByTestId('nav-site').click();
    await dashboard.getByTestId('site-origin-input').fill(origin);
    await dashboard.getByTestId('site-grant').click();
    await expect(dashboard.getByTestId('site-consent')).toBeVisible({ timeout: 10000 });
    const readableHeaders = await dashboard.evaluate(async (base) => {
      const response = await fetch(`${base}/about/`, { method: 'GET', credentials: 'omit' });
      return [
        'content-type',
        'content-length',
        'content-encoding',
        'x-robots-tag',
        'cache-control',
        'strict-transport-security',
        'content-security-policy',
        'x-content-type-options',
        'referrer-policy',
        'x-frame-options',
      ].map((name) => [name, response.headers.get(name)]);
    }, origin);
    expect(Object.fromEntries(readableHeaders)).toMatchObject({
      'content-type': 'text/html',
      'content-encoding': 'identity',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-cache',
      'strict-transport-security': 'max-age=31536000',
      'content-security-policy': "default-src 'self'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    });
    await dashboard.getByTestId('site-start').click();
    await expect(dashboard.getByTestId('site-summary')).toBeVisible({ timeout: 45000 });
    await expect(dashboard.getByTestId('site-cancel')).toHaveCount(0, { timeout: 45000 });
    const state = await dashboard.evaluate(async () => {
      const request = indexedDB.open('vittix-seo');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [pages, sessions] = await Promise.all([
        new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const get = database.transaction('sitePages').objectStore('sitePages').getAll();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        }),
        new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const get = database.transaction('siteAudits').objectStore('siteAudits').getAll();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        }),
      ]);
      database.close();
      return { pages, sessions };
    });
    expect(
      state.pages.some(
        (row) => String(row.url).endsWith('/about') && String(row.finalUrl).endsWith('/about/'),
      ),
    ).toBe(true);
    const about = state.pages.find(
      (row) => String(row.url).endsWith('/about') && row.status === 'ok',
    ) as { responseMetadata?: Record<string, unknown> } | undefined;
    expect(about?.responseMetadata).toMatchObject({
      xRobotsTag: 'noindex',
      hasHsts: true,
      hasCsp: true,
      hasXContentTypeOptions: true,
      hasReferrerPolicy: true,
      hasFrameProtection: true,
    });
    const slow = state.pages.find((row) => String(row.url).endsWith('/slow')) as
      { responseMetadata?: { durationMs?: number | null } } | undefined;
    expect(slow?.responseMetadata?.durationMs).toBeGreaterThanOrEqual(2000);
    const sitemap = (state.sessions[0]?.sitemap ?? {}) as {
      fullyRead?: boolean;
      entries?: { url: string }[];
    };
    expect(sitemap.fullyRead).toBe(true);
    expect(sitemap.entries?.some((entry) => entry.url.endsWith('/about/'))).toBe(true);
    expect(
      state.pages.some((row) => String(row.url).endsWith('/loop-a') && row.status === 'failed'),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

/**
 * RC robustness: the crawler must survive malformed HTML, oversized pages
 * (bodies beyond the 2 MB parse cap) and non-HTML content types without
 * crashing, and Clear site-audit data must leave the databases empty.
 */
test('site audit robustness: oversized, malformed and non-HTML pages + clear-data persistence', async () => {
  test.setTimeout(120_000);
  const { context, extensionId } = await loadExtension('e2e', [
    '--use-fake-ui-for-permission-flow',
  ]);
  try {
    const hugeBody = '<p>x</p>'.repeat(600_000); // ~3.6 MB, above the 2 MB cap
    await context.route('https://fixture.test/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/robots.txt') {
        return route.fulfill({ contentType: 'text/plain', body: 'User-agent: *\n' });
      }
      if (url.pathname === '/huge') {
        return route.fulfill({ contentType: 'text/html', body: hugeBody });
      }
      if (url.pathname === '/malformed') {
        return route.fulfill({
          contentType: 'text/html',
          body: '<html><head><title>Broken <b>Unclosed</head><body><p>>>><a href=/x>partial',
        });
      }
      if (url.pathname === '/binary') {
        return route.fulfill({ contentType: 'application/octet-stream', body: 'MZZZ' });
      }
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><head><title>RC Home Fixture</title></head><body><h1>RC</h1><a href="https://fixture.test/huge">huge</a><a href="https://fixture.test/malformed">malformed</a><a href="https://fixture.test/binary">binary</a></body></html>',
      });
    });

    const dashboard = await context.newPage();
    await dashboard.goto(extensionPageUrl(extensionId, 'dashboard.html'));
    await dashboard.getByTestId('nav-site').click();
    await dashboard.getByTestId('site-origin-input').fill('https://fixture.test');
    await dashboard.getByTestId('site-grant').click();
    await expect(dashboard.getByTestId('site-consent')).toBeVisible({ timeout: 10_000 });
    await dashboard.getByTestId('site-start').click();
    await expect(dashboard.getByTestId('site-summary')).toBeVisible({ timeout: 60_000 });

    // The 3.6 MB page exceeds the 100 kB text-sample cap — the audit MUST
    // be marked incomplete rather than presented as fully verified.
    await expect(dashboard.getByText(/Incomplete audit/).first()).toBeVisible({ timeout: 10_000 });

    // Every recorded page reached a terminal state; nothing crashed.
    await expect(dashboard.locator('text=skipped-non-html').first()).toBeVisible();
    await dashboard.getByTestId('site-url-filter').fill('fixture.test/huge');
    await expect(dashboard.locator('text=ok').first()).toBeVisible();
    const hugePage = await dashboard.evaluate(async () => {
      const request = indexedDB.open('vittix-seo');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const get = database.transaction('sitePages').objectStore('sitePages').getAll();
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      database.close();
      return rows.find((row) => String(row.url).endsWith('/huge'));
    });
    expect(
      (hugePage?.responseMetadata as { bodyTruncated?: boolean } | undefined)?.bodyTruncated,
    ).toBe(true);
    expect((hugePage?.result as { truncated?: boolean } | undefined)?.truncated).toBe(true);
    await dashboard.getByTestId('site-url-filter').fill('fixture.test/malformed');
    await expect(dashboard.locator('text=ok').first()).toBeVisible();

    // Clear site-audit data → the databases are verifiably empty.
    await dashboard.getByTestId('site-clear').click();
    await dashboard.getByTestId('site-clear-confirm').click();
    await expect(dashboard.getByTestId('site-origin-input')).toBeVisible({ timeout: 15_000 });
    const dump = await dashboard.evaluate(async () => {
      const request = indexedDB.open('vittix-seo');
      const database = await new Promise((resolve, onerror) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => onerror(request.error);
      });
      const out: Record<string, number> = {};
      for (const name of ['siteAudits', 'sitePages'] as const) {
        out[name] = await new Promise((resolve) => {
          const read = database.transaction(name).objectStore(name).count();
          read.onsuccess = () => resolve(read.result);
        });
      }
      database.close();
      return out;
    });
    expect(dump.siteAudits).toBe(0);
    expect(dump.sitePages).toBe(0);
  } finally {
    await context.close();
  }
});
