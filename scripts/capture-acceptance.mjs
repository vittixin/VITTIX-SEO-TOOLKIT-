#!/usr/bin/env node
/**
 * Acceptance-evidence capture for the owner's manual checklist.
 *
 * Runs the REAL unpacked extension (production build for static pages, E2E
 * build for a populated site audit) in headful Chromium with a DISPOSABLE
 * profile and saves screenshots for every check that can be evidenced
 * without the owner's hands. Items that require the real Chrome toolbar
 * (badge), the native permission prompt or the owner's eyes are NOT covered
 * here — see docs/ACCEPTANCE_WORKSHEET.md.
 *
 * Output: docs/acceptance-evidence/*.png
 */
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = resolve(ROOT, 'docs/acceptance-evidence');
const PROD = resolve(ROOT, 'apps/extension/.output/chrome-mv3');
const E2E = resolve(ROOT, 'apps/extension/.output/chrome-mv3-e2e/chrome-mv3');
const PROFILE = resolve(ROOT, 'test-results/acceptance-profile');

mkdirSync(EVIDENCE, { recursive: true });

async function launch(extensionDir) {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--window-position=2000,2000', // off-screen: capture via element shots
    ],
  });
  let worker = context.serviceWorkers()[0] ?? null;
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  return { context, extensionId: new URL(worker.url()).host };
}

async function shot(page, testId, name) {
  await page.waitForTimeout(400); // settle transitions
  if (testId) {
    await page.getByTestId(testId).screenshot({ path: resolve(EVIDENCE, `${name}.png`) });
  } else {
    await page.screenshot({ path: resolve(EVIDENCE, `${name}.png`), fullPage: false });
  }
  console.log(`  📸 ${name}.png`);
}

rmSync(PROFILE, { recursive: true, force: true });

// ---------- 1. Production build: popup, dashboard, options -------------------
console.log('[1] production build — static page visuals');
{
  const { context, extensionId } = await launch(PROD);
  const url = (page) => `chrome-extension://${extensionId}/${page}`;

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 640 });
  await popup.goto(url('popup.html'));
  await shot(popup, null, '01-popup-initial');

  const dashboard = await context.newPage();
  await dashboard.goto(url('dashboard.html'));
  await shot(dashboard, null, '02-dashboard-overview-empty');
  for (const section of ['metadata', 'headings', 'images', 'links', 'findings', 'history']) {
    await dashboard.getByTestId(`nav-${section}`).click();
    await shot(dashboard, null, `03-dashboard-${section}`);
  }
  await dashboard.getByTestId('nav-settings').click();
  await shot(dashboard, null, '04-dashboard-settings');

  const options = await context.newPage();
  await options.goto(url('options.html'));
  await shot(options, null, '05-options');
  await context.close();
}

// ---------- 2. E2E build: populated audit, findings, site summary ------------
console.log('[2] e2e build — populated visuals via real crawl');
{
  const { context, extensionId } = await launch(E2E);
  const url = (page) => `chrome-extension://${extensionId}/${page}`;

  await context.route('https://fixture.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/robots.txt') {
      return route.fulfill({ contentType: 'text/plain', body: 'User-agent: *\n' });
    }
    if (path === '/locked') {
      return route.fulfill({ status: 403, contentType: 'text/html', body: '<p>403</p>' });
    }
    const html = (title, links = []) =>
      `<!doctype html><html lang="en"><head><title>${title}</title><meta name="description" content="A description long enough to be healthy for the analyzer checks on ${title}." /></head><body><h1>${title}</h1>${links
        .map((href) => `<a href="${href}">link text</a>`)
        .join('')}</body></html>`;
    if (path === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: html('Fixture Home', [
          'https://fixture.test/a',
          'https://fixture.test/b',
          'https://fixture.test/locked',
        ]),
      });
    }
    return route.fulfill({ contentType: 'text/html', body: html(`Fixture ${path}`) });
  });

  const page = await context.newPage();
  await page.goto(url('popup.html'));
  await shot(page, null, '06-popup-e2e-profile');

  // Run a single-page audit from the popup (the fixture home page in a tab).
  const fixtureTab = await context.newPage();
  await fixtureTab.goto('https://fixture.test/');
  await page.bringToFront();
  // The popup-as-tab cannot query the active tab — use the dashboard message
  // path via the options page trick is unnecessary: drive the popup's
  // analyze through the fixture tab focus.
  await fixtureTab.bringToFront();
  await page.bringToFront();
  await page
    .getByTestId('analyze-button')
    .click()
    .catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, null, '07-popup-after-analyze');

  // Site audit populated summary.
  const dashboard = await context.newPage();
  await dashboard.goto(url('dashboard.html'));
  await dashboard.getByTestId('nav-site').click();
  await dashboard.getByTestId('site-origin-input').fill('https://fixture.test');
  await dashboard.getByTestId('site-grant').click();
  await dashboard.getByTestId('site-start').click();
  await expectVisible(dashboard.getByTestId('site-summary'), 30_000);
  await shot(dashboard, null, '08-site-summary');

  // Single-page audit via the production message path (the same runtime
  // message the popup sends) so Overview/Findings render populated. The
  // fixture tab must be the ACTIVE tab when the message is sent.
  await fixtureTab.bringToFront();
  const response = await dashboard.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'vittix/analyze-active-tab' }),
  );
  console.log(
    '  single-page analyze:',
    response.ok ? `ok (audit ${response.auditId})` : JSON.stringify(response.error),
  );
  await dashboard.getByTestId('nav-overview').click();
  await shot(dashboard, null, '10-overview-populated');
  await dashboard.getByTestId('nav-findings').click();
  await shot(dashboard, null, '11-findings-grouped');
  await context.close();
}

async function expectVisible(locator, timeout) {
  await locator.waitFor({ state: 'visible', timeout });
}

// Evidence manifest
writeFileSync(
  resolve(EVIDENCE, 'MANIFEST.txt'),
  `Acceptance evidence captured ${new Date().toISOString()}\n` +
    'Build: production (01-05) + e2e test-variant (06-09)\n' +
    'Profile: disposable Chromium (Playwright), not the owner profile\n',
);
console.log(`✓ Evidence saved to ${EVIDENCE}`);
