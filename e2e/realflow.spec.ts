import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extensionPageUrl, loadExtension } from './helpers/extension';

/**
 * REAL end-to-end flow through the production pipeline.
 *
 * MV3 toolbar clicks and keyboard commands cannot be driven by automation,
 * so this test uses the E2E build variant (adds a host permission for the
 * fixture origin only) and triggers analysis with the exact runtime message
 * the popup sends, while the fixture tab is focused. Everything downstream
 * is the production code path: URL guard → real chrome.scripting injection
 * on a real page → Zod validation → seo-core analysis → Dexie persistence →
 * dashboard rendering → real JSON/CSV file downloads.
 */
test('real message → real injection → persisted history → exports', async () => {
  test.setTimeout(120_000);
  const { context, page: fixturePage, extensionId } = await loadExtension('e2e');
  try {
    const fixtureHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Vittix Real Flow Fixture Page With A Long Title</title>
  <meta name="description" content="A fixture description crafted to sit inside the healthy seventy to one hundred sixty character window used by the analyzer." />
  <link rel="canonical" href="https://fixture.test/real-flow" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta property="og:title" content="Vittix Real Flow Fixture" />
  <meta name="twitter:card" content="summary" />
</head>
<body>
  <h1>Real flow main heading</h1>
  <h2>Details</h2>
  <img src="/img/a.png" alt="A fixture chart" />
  <a href="/other">Another fixture page</a>
</body>
</html>`;

    await context.route('https://fixture.test/real-flow', (route) =>
      route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
    );
    await fixturePage.goto('https://fixture.test/real-flow');

    // Extension page that will send the analyze message (like the popup does).
    const triggerPage = await context.newPage();
    await triggerPage.goto(extensionPageUrl(extensionId, 'options.html'));

    // Focus the fixture tab so the background worker analyzes IT.
    await fixturePage.bringToFront();

    const response = await triggerPage.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'vittix/analyze-active-tab' }),
    );
    expect(response.ok).toBe(true);
    expect(response.score.total).toBeGreaterThanOrEqual(0);
    expect(response.score.preliminary).toBe(true);
    expect(response.counts.pass).toBeGreaterThan(0);

    // Dashboard must render the persisted audit from IndexedDB.
    const dashboard = await context.newPage();
    await dashboard.goto(extensionPageUrl(extensionId, 'dashboard.html'));
    await expect(dashboard.getByTestId('section-title')).toContainText('Overview');
    await expect(
      dashboard.getByText('Vittix Real Flow Fixture Page With A Long Title').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(dashboard.getByText(/preliminary/i).first()).toBeVisible();

    // Persisted history lists the audit for this URL.
    await dashboard.getByTestId('nav-history').click();
    await expect(dashboard.getByText('fixture.test/real-flow').first()).toBeVisible();

    await dashboard.getByTestId('nav-previews').click();
    await expect(dashboard.getByTestId('previews-estimate-note')).toContainText(
      'Google may rewrite',
    );
    await expect(dashboard.getByText('Facebook / LinkedIn card')).toBeVisible();
    await expect(dashboard.getByText(/Images are never loaded by Vittix/i)).toBeVisible();
    await dashboard.screenshot({
      path: resolve(import.meta.dirname, '../docs/acceptance-evidence/12-previews.png'),
      fullPage: true,
    });
    await dashboard.getByTestId('nav-history').click();

    await dashboard.getByTestId('nav-content').click();
    await expect(dashboard.getByText('Top keywords and phrases')).toBeVisible();
    await dashboard.getByLabel('Target keyword').fill('fixture');
    await dashboard.getByRole('button', { name: 'Save keyword' }).click();
    await expect(
      dashboard.getByText('Keyword rules are active for the next analysis.'),
    ).toBeVisible();
    await dashboard.screenshot({
      path: resolve(import.meta.dirname, '../docs/acceptance-evidence/13-content.png'),
      fullPage: true,
    });
    await dashboard.getByRole('button', { name: 'Re-analyze saved snapshot' }).click();
    await expect(dashboard.getByText(/Keyword rules are active/i)).toBeVisible();
    await dashboard.getByTestId('nav-settings').click();
    await dashboard.getByLabel('Scoring profile').selectOption('content-site');
    await dashboard.getByRole('button', { name: 'Save settings' }).first().click();
    await expect(dashboard.getByText('Settings saved on this device.')).toBeVisible();
    await dashboard.screenshot({
      path: resolve(import.meta.dirname, '../docs/acceptance-evidence/14-rule-controls.png'),
      fullPage: true,
    });
    await dashboard.getByRole('button', { name: 'Reset to defaults' }).click();
    await dashboard.getByTestId('nav-content').click();
    await dashboard.getByRole('button', { name: 'Clear' }).click();
    await dashboard.getByTestId('nav-history').click();

    // Load it back from history via the View button (deep-link path).
    await dashboard.getByTestId('history-view').first().click();
    await expect(dashboard.getByTestId('section-title')).toContainText('Overview');
    await expect(
      dashboard.getByText('Vittix Real Flow Fixture Page With A Long Title').first(),
    ).toBeVisible();

    // JSON export: a real download with real content.
    await dashboard.getByTestId('nav-export').click();
    const jsonDownloadPromise = dashboard.waitForEvent('download');
    await dashboard.getByTestId('export-json').click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = resolve(import.meta.dirname, '../test-results/export-audit.json');
    await jsonDownload.saveAs(jsonPath);
    const exportedJson = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      format: string;
      audit: { url: string; result: { findings: { ruleId: string }[]; score: { total: number } } };
    };
    expect(exportedJson.format).toBe('vittix-seo-audit');
    expect(exportedJson.audit.url).toContain('fixture.test/real-flow');
    const exportedRules = exportedJson.audit.result.findings.map((f) => f.ruleId);
    expect(exportedRules).toContain('title-present');
    expect(exportedRules).toContain('h1-present');
    expect(exportedJson.audit.result.score.total).toBeGreaterThanOrEqual(0);

    // CSV export: header + finding rows.
    const csvDownloadPromise = dashboard.waitForEvent('download');
    await dashboard.getByTestId('export-csv').click();
    const csvDownload = await csvDownloadPromise;
    const csvPath = resolve(import.meta.dirname, '../test-results/export-findings.csv');
    await csvDownload.saveAs(csvPath);
    const csv = readFileSync(csvPath, 'utf8');
    expect(csv.startsWith('analyzedAt,url,pageTitle,category,severity,ruleId')).toBe(true);
    expect(csv).toContain('title-present');
  } finally {
    await context.close();
  }
});

/** The keyboard command exists and is bound (feature for real users). */
test('analyze-page keyboard command is registered', async () => {
  const { context, page, extensionId } = await loadExtension('production');
  try {
    await page.goto(extensionPageUrl(extensionId, 'options.html'));
    const commands = await page.evaluate(() =>
      chrome.commands
        .getAll()
        .then((all) => all.map((command) => ({ name: command.name, shortcut: command.shortcut }))),
    );
    const analyze = commands.find((command) => command.name === 'analyze-page');
    expect(analyze?.shortcut).toBeTruthy();
  } finally {
    await context.close();
  }
});

/**
 * REGRESSION (Phase 8): a dashboard opened BEFORE an audit runs must show
 * the new audit once the user navigates to Overview — never a stale empty
 * state.
 */
test('dashboard shows audits saved while it was open (stale-state regression)', async () => {
  const { context, extensionId } = await loadExtension('e2e');
  try {
    const fixtureHtml = `<!doctype html>
<html lang="en"><head><title>Concurrent Audit Fixture</title></head>
<body><h1>Concurrent heading</h1></body></html>`;
    await context.route('https://fixture.test/concurrent', (route) =>
      route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
    );
    const fixtureTab = await context.newPage();
    await fixtureTab.goto('https://fixture.test/concurrent');

    // Open the dashboard FIRST (empty state).
    const dashboard = await context.newPage();
    await dashboard.goto(extensionPageUrl(extensionId, 'dashboard.html'));
    await expect(dashboard.getByText('No audit yet')).toBeVisible();

    // Run the audit while the dashboard is open (fixture tab focused —
    // creating the trigger page makes IT active, so re-focus the fixture).
    const trigger = await context.newPage();
    await trigger.goto(extensionPageUrl(extensionId, 'options.html'));
    await fixtureTab.bringToFront();
    const response = await trigger.evaluate(() =>
      chrome.runtime.sendMessage({ type: 'vittix/analyze-active-tab' }),
    );
    expect(response.ok).toBe(true);
    await trigger.close();

    // Navigating to Overview must re-read durable state.
    await dashboard.bringToFront();
    await dashboard.getByTestId('nav-overview').click();
    await expect(dashboard.getByText('Concurrent Audit Fixture').first()).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await context.close();
  }
});
