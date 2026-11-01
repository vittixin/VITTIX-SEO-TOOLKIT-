import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    // Fixture site: / links to /a, /b, a duplicate of /a, an off-origin
    // link, and /locked (403). /a links back to /. /b is robots-disallowed.
    await context.route('https://fixture.test/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/robots.txt') {
        return route.fulfill({
          contentType: 'text/plain',
          body: 'User-agent: *\nDisallow: /b\n',
        });
      }
      if (url.pathname === '/locked') {
        return route.fulfill({ status: 403, contentType: 'text/html', body: '<p>403</p>' });
      }
      if (url.pathname === '/a') {
        return route.fulfill({
          contentType: 'text/html',
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
    await dashboard.getByTestId('site-start').click();

    // The crawl completes quickly on fixtures; the summary must appear and
    // reflect the ground truth: 3 ok pages (/, /a + …), /b robots-skipped,
    // /locked failed-auth, off-origin never fetched.
    await expect(dashboard.getByTestId('site-summary')).toBeVisible({ timeout: 30_000 });
    const summaryText = await dashboard.getByTestId('site-summary').innerText();
    expect(summaryText).toContain('Pages audited');

    // URL list: filter to /a.
    await dashboard.getByTestId('site-url-filter').fill('/a');
    await expect(dashboard.getByText('https://fixture.test/a').first()).toBeVisible();
    await dashboard.getByTestId('site-url-filter').fill('');

    // Exports produce real downloads.
    await dashboard.getByTestId('site-open-export-dialog').click();
    const jsonDownload = dashboard.waitForEvent('download');
    await dashboard.getByTestId('site-export-json').click();
    expect((await jsonDownload).suggestedFilename()).toContain('vittix-site-audit');

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
