import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { extensionPageUrl, launchExtensionContext } from './helpers/extension';

/**
 * TRUE browser-restart recovery: the extension's profile (and therefore its
 * IndexedDB) survives a full browser process exit. The audit is interrupted
 * mid-crawl, the browser is CLOSED, a NEW browser process is started with
 * the SAME profile, and the audit resumes from durable state without
 * re-processing completed pages.
 *
 * This is what "restart recovery" means here — the dashboard tab is NOT
 * kept alive by any background process (there is none). Closing the
 * dashboard/browser pauses the crawl by design.
 */
test('site audit survives a full browser restart and resumes idempotently', async () => {
  test.setTimeout(180_000);
  const profileDir = resolve(import.meta.dirname, '../test-results/pw-restart-profile');
  rmSync(profileDir, { recursive: true, force: true });

  const fetchCounts = new Map<string, number>();
  const pageHtml = (title: string, links: string[] = []) =>
    `<!doctype html><html lang="en"><head><title>${title}</title><meta name="description" content="A description long enough to be healthy for the analyzer checks on ${title}." /></head><body><h1>${title}</h1>${links
      .map((href) => `<a href="${href}">link</a>`)
      .join('')}</body></html>`;

  const installRoutes = (context: import('@playwright/test').BrowserContext) => {
    void context.route('https://fixture.test/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      fetchCounts.set(path, (fetchCounts.get(path) ?? 0) + 1);
      if (path === '/robots.txt') {
        return route.fulfill({ contentType: 'text/plain', body: 'User-agent: *\n' });
      }
      if (path === '/') {
        return route.fulfill({
          contentType: 'text/html',
          body: pageHtml('Restart Home', [
            'https://fixture.test/a',
            'https://fixture.test/b',
            'https://fixture.test/c',
          ]),
        });
      }
      if (path === '/a') {
        return route.fulfill({ contentType: 'text/html', body: pageHtml('Restart Page A') });
      }
      // /b and /c respond SLOWLY (5 s) so the audit is guaranteed to be
      // mid-flight (pages still pending) when the browser is closed.
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return route.fulfill({ contentType: 'text/html', body: pageHtml(`Restart ${path}`) });
    });
  };

  /** Dump the extension's site-audit tables + the current extension ID. */
  async function dumpState(
    page: import('@playwright/test').Page,
    extensionId: string,
    tag: string,
  ) {
    const dump = await page.evaluate(async () => {
      const request = indexedDB.open('vittix-seo');
      const database = await new Promise((resolve, onerror) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => onerror(request.error);
      });
      const out: Record<string, unknown> = {};
      for (const name of ['siteAudits', 'sitePages'] as const) {
        out[name] = await new Promise((resolve) => {
          const read = database.transaction(name).objectStore(name).getAll();
          read.onsuccess = () => resolve(read.result);
        });
      }
      database.close();
      return out;
    });
    writeFileSync(
      `test-results/restart-${tag}.json`,
      JSON.stringify({ extensionId, dump }, null, 2),
    );
    return dump;
  }

  // --- run 1: grant, start, wait for one completed page, close the browser ---
  const first = await launchExtensionContext('e2e', ['--use-fake-ui-for-permission-flow'], {
    profileDir,
  });
  installRoutes(first.context);
  const dashboard1 = await first.context.newPage();
  await dashboard1.goto(extensionPageUrl(first.extensionId, 'dashboard.html'));
  await dashboard1.getByTestId('nav-site').click();
  await dashboard1.getByTestId('site-origin-input').fill('https://fixture.test');
  await dashboard1.getByTestId('site-grant').click();
  await expect(dashboard1.getByTestId('site-consent')).toBeVisible({ timeout: 10_000 });
  await dashboard1.getByTestId('site-start').click();

  // Deterministic readiness: at least one page analyzed (and /a fetched).
  await expect
    .poll(async () => fetchCounts.get('/a') ?? 0, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(1);
  await expect(dashboard1.getByTestId('site-progress-text')).toContainText(/([1-9]\d*) analyzed/, {
    timeout: 15_000,
  });

  // State check BEFORE the restart (the page is still alive here).
  const before = await dumpState(dashboard1, first.extensionId, 'run1');
  const fetchesBeforeRestart = new Map(fetchCounts);

  // Full browser process exit (not just the tab).
  await first.context.close();

  // --- run 2: same profile, NEW browser process ------------------------------
  const second = await launchExtensionContext('e2e', ['--use-fake-ui-for-permission-flow'], {
    profileDir,
    freshProfile: false,
  });
  installRoutes(second.context);
  try {
    expect(second.extensionId).toBe(first.extensionId);

    const dashboard2 = await second.context.newPage();
    await dashboard2.goto(extensionPageUrl(second.extensionId, 'dashboard.html'));
    await dashboard2.getByTestId('nav-site').click();

    // The persisted session is recovered (status running = paused).
    await expect(dashboard2.getByTestId('site-progress-text')).toBeVisible({ timeout: 15_000 });
    await dumpState(dashboard2, second.extensionId, 'run2-before-resume');

    // Resume from durable state.
    await dashboard2.getByTestId('site-resume').click();
    await expect(dashboard2.getByTestId('site-summary')).toBeVisible({ timeout: 30_000 });

    // Idempotency: completed pages were NOT re-fetched after the restart.
    expect(fetchCounts.get('/a')).toBe(fetchesBeforeRestart.get('/a'));

    const summaryText = await dashboard2.getByTestId('site-summary').innerText();
    expect(summaryText).toContain('Pages audited');
    await dashboard2.getByTestId('site-url-filter').fill('fixture.test/b');
    await expect(dashboard2.getByText('https://fixture.test/b').first()).toBeVisible();

    // Counters survived the restart and accumulated (not reset).
    await expect
      .poll(() => dashboard2.getByTestId('site-progress-text').innerText(), { timeout: 15_000 })
      .not.toContain('0 analyzed');
  } finally {
    await second.context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }

  // The pre-restart dump must have contained the session row.
  expect((before as { siteAudits: unknown[] }).siteAudits.length).toBeGreaterThan(0);
});
