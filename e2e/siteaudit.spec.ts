import { expect, test } from '@playwright/test';
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
    const jsonDownload = dashboard.waitForEvent('download');
    await dashboard.getByTestId('site-export-json').click();
    expect((await jsonDownload).suggestedFilename()).toContain('vittix-site-audit');

    const csvDownload = dashboard.waitForEvent('download');
    await dashboard.getByTestId('site-export-csv').click();
    expect((await csvDownload).suggestedFilename()).toContain('vittix-site-pages');

    // Session finished and page statuses are grounded.
    await expect(dashboard.getByTestId('site-url-filter')).toBeVisible();
    await expect(dashboard.locator('text=skipped-robots').first()).toBeVisible();
    await expect(dashboard.locator('text=failed-auth').first()).toBeVisible();
  } finally {
    await context.close();
  }
});
