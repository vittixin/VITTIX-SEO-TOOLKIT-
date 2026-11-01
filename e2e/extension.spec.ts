import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extensionPageUrl, loadExtension } from './helpers/extension';
import { highlightOnPage } from '../apps/extension/src/highlight/overlay';
import { analyzeSnapshot } from '../packages/seo-core/src/analyze';
import { buildSnapshot } from '../packages/seo-core/src/testing/fixtures';
import { RULE_SET_VERSION } from '../packages/seo-core/src/rules';

const SECTION_TITLES: Record<string, string> = {
  metadata: 'Metadata',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
  findings: 'Findings',
  history: 'Audit History',
  export: 'Export',
  settings: 'Settings',
};

test.describe('Vittix SEO Toolkit smoke tests', () => {
  test('production and e2e manifests differ only by documented test host access', () => {
    const production = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../apps/extension/.output/chrome-mv3/manifest.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    const e2e = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../apps/extension/.output/chrome-mv3-e2e/chrome-mv3/manifest.json',
        ),
        'utf8',
      ),
    ) as Record<string, unknown>;

    expect(e2e.permissions).toEqual(production.permissions);
    expect(e2e.optional_permissions).toEqual(production.optional_permissions);
    expect(e2e.optional_host_permissions).toEqual(production.optional_host_permissions);
    expect(production.host_permissions).toBeUndefined();
    expect(e2e.host_permissions).toEqual([
      'https://fixture.test/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ]);
    expect(e2e.name).toBe('Vittix SEO Toolkit (E2E TEST BUILD)');

    const normalize = (manifest: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(manifest).filter(([key]) => key !== 'name' && key !== 'host_permissions'),
      );
    expect(normalize(e2e)).toEqual(normalize(production));
  });

  test('built production manifest declares its locale and resolves every message reference', () => {
    const outputDir = resolve(import.meta.dirname, '../apps/extension/.output/chrome-mv3');
    const manifest = JSON.parse(readFileSync(resolve(outputDir, 'manifest.json'), 'utf8')) as {
      default_locale?: string;
      [key: string]: unknown;
    };
    expect(manifest.default_locale).toBe('en');

    const locale = JSON.parse(
      readFileSync(resolve(outputDir, `_locales/${manifest.default_locale}/messages.json`), 'utf8'),
    ) as Record<string, { message: string }>;
    const visit = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(visit);
      if (value && typeof value === 'object') return Object.values(value).flatMap(visit);
      return [];
    };
    const references = visit(manifest).flatMap((value) =>
      [...value.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((match) => match[1]),
    );
    expect(references).toEqual([...new Set(references)]);
    for (const key of references)
      expect(locale[key]?.message, `Missing locale message: ${key}`).toBeTruthy();
  });

  test('page highlight is bounded, dismissible, stale-safe and makes no requests', async () => {
    const { context, page } = await loadExtension('e2e');
    const requests: string[] = [];
    context.on('request', (request) => requests.push(request.url()));
    await context.route('https://fixture.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><h1>Fixture target</h1><a href="/next">Next</a>',
      }),
    );
    try {
      await page.goto('https://fixture.test/highlight');
      await page.evaluate(highlightOnPage, [{ kind: 'heading', nthIndex: 0 }]);
      await expect(page.getByRole('status')).toContainText('Highlighted 1 element');
      expect(
        await page.locator('h1').evaluate((el) => (el as HTMLElement).style.outline),
      ).toContain('solid');
      await page.getByRole('button', { name: 'Dismiss page highlights' }).click();
      await expect(page.getByRole('status')).toHaveCount(0);
      expect(await page.locator('h1').evaluate((el) => (el as HTMLElement).style.outline)).toBe('');
      await page.evaluate(highlightOnPage, [{ kind: 'heading', nthIndex: 999 }]);
      await expect(page.getByRole('status')).toContainText('Element no longer found');
      expect(requests.filter((url) => !url.includes('fixture.test'))).toEqual([]);
    } finally {
      await context.close();
    }
  });
  test('permission probe: Chrome accepts localhost patterns and sidePanel as optional manifest entries', async () => {
    const { context, page, extensionId } = await loadExtension('e2e');
    try {
      await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
      const optional = await page.evaluate(() => chrome.runtime.getManifest());
      expect(optional.optional_host_permissions).toContain('http://localhost/*');
      expect(optional.optional_host_permissions).toContain('http://127.0.0.1/*');
      expect(optional.optional_permissions).toContain('sidePanel');
      expect(
        await page.evaluate(() => chrome.permissions.contains({ permissions: ['sidePanel'] })),
      ).toBe(false);
    } finally {
      await context.close();
    }
  });

  test('DNR is not runtime-grantable by the production test manifest', async () => {
    const { context, page, extensionId } = await loadExtension();
    try {
      await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
      await page.evaluate(() => {
        const button = document.createElement('button');
        button.id = 'probe-dnr-permission';
        button.textContent = 'probe';
        button.addEventListener('click', () => {
          void chrome.permissions
            .request({ permissions: ['declarativeNetRequest'] })
            .then((granted) => {
              (window as typeof window & { dnrProbe?: unknown }).dnrProbe = { granted };
            })
            .catch((error: unknown) => {
              (window as typeof window & { dnrProbe?: unknown }).dnrProbe = {
                rejected: String(error),
              };
            });
        });
        document.body.append(button);
      });
      await page.locator('#probe-dnr-permission').click();
      await expect
        .poll(() =>
          page.evaluate(() => (window as typeof window & { dnrProbe?: unknown }).dnrProbe),
        )
        .toEqual({
          rejected: 'Error: Only permissions specified in the manifest may be requested.',
        });
    } finally {
      await context.close();
    }
  });

  test('popup renders, runs the guard, and shows a friendly error on unsupported pages', async () => {
    const { context, page, extensionId } = await loadExtension();
    try {
      await page.goto(extensionPageUrl(extensionId, 'popup.html'));

      await expect(page.getByText('Vittix SEO Toolkit')).toBeVisible();
      await expect(page.getByTestId('analyze-button')).toBeEnabled();
      await expect(page.getByTestId('open-dashboard')).toBeVisible();
      await expect(page.getByTestId('enable-side-panel')).toBeVisible();

      // The popup itself is a chrome-extension:// page — the analyzer must
      // reject it with an understandable message instead of failing silently.
      await page.getByTestId('analyze-button').click();
      const error = page.getByTestId('analysis-error');
      await expect(error).toBeVisible();
      await expect(error).toContainText(/only inspects regular http\(s\) web pages/i);
    } finally {
      await context.close();
    }
  });

  test('side panel page renders without automatic analysis', async () => {
    const { context, page, extensionId } = await loadExtension('production');
    try {
      await page.goto(extensionPageUrl(extensionId, 'panel.html'));
      await expect(page.getByTestId('sidepanel-active-tab-help')).toBeVisible();
      await expect(page.getByTestId('sidepanel-active-tab-help')).toContainText('Ctrl+Shift+U');
      await expect(page.getByTestId('analyze-button')).toHaveCount(0);
      await expect(page.getByTestId('analysis-summary')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('production popup and panel render their main UI within two seconds', async () => {
    const { context, page, extensionId } = await loadExtension('production');
    try {
      for (const entrypoint of [
        { file: 'popup.html', locator: page.getByTestId('analyze-button') },
        { file: 'panel.html', locator: page.getByTestId('sidepanel-active-tab-help') },
      ]) {
        const startedAt = Date.now();
        await page.goto(extensionPageUrl(extensionId, entrypoint.file));
        await expect(entrypoint.locator).toBeVisible({ timeout: 2000 });
        const renderTime = Date.now() - startedAt;
        console.log(`production ${entrypoint.file} main UI visible in ${renderTime} ms`);
        expect(renderTime, `${entrypoint.file} render time`).toBeLessThan(2000);
      }
    } finally {
      await context.close();
    }
  });

  test('production side panel has no activeTab grant and explains the toolbar path', async () => {
    const { context, page, extensionId } = await loadExtension('production');
    await context.route('https://fixture.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Production permission probe</h1>' }),
    );
    try {
      await page.goto(extensionPageUrl(extensionId, 'panel.html'));
      await expect(page.getByTestId('sidepanel-active-tab-help')).toContainText(
        'Click the Vittix toolbar icon and use Analyze, or press Ctrl+Shift+U',
      );
      const target = await context.newPage();
      await target.goto('https://fixture.test/permission-probe');
      await target.bringToFront();

      const outcome = await page.evaluate(async () => {
        const active = await chrome.tabs.query({ active: true, currentWindow: true });
        const hasExplicitHost = await chrome.permissions.contains({
          origins: ['https://fixture.test/*'],
        });
        const manifest = chrome.runtime.getManifest();
        const response = await chrome.runtime.sendMessage({ type: 'vittix/analyze-active-tab' });
        return {
          activeUrl: active[0]?.url,
          hasExplicitHost,
          requiredActiveTab: manifest.permissions?.includes('activeTab') ?? false,
          response,
        };
      });

      console.log('production side panel permission probe', JSON.stringify(outcome));
      // activeTab is installed, but no action/command gesture granted it for
      // this tab, so Chrome withholds the tab URL from tabs.query.
      expect(outcome.activeUrl).toBeUndefined();
      expect(outcome.requiredActiveTab).toBe(true);
      expect(outcome.hasExplicitHost).toBe(false);
      expect(outcome.response.ok).toBe(false);
      expect(outcome.response.error.code).toBe('ERR_NO_TAB_URL');
      expect(outcome.response.error.message).toBe(
        'Active tab URL unavailable (no access granted).',
      );
    } finally {
      await context.close();
    }
  });

  test('production Show on page refuses a stale audit after same-tab cross-origin navigation', async () => {
    const { context, page, extensionId } = await loadExtension('production');
    await context.route('https://fixture.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Audited page</h1>' }),
    );
    await context.route('https://other.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Different page</h1>' }),
    );
    try {
      await page.goto(extensionPageUrl(extensionId, 'popup.html'));
      const target = await context.newPage();
      await target.goto('https://fixture.test/audited');
      await target.bringToFront();

      const snapshot = buildSnapshot({
        url: 'https://fixture.test/audited',
        headings: [{ tag: 'h1', text: 'Audited page' }],
      });
      const record = {
        url: snapshot.url,
        title: snapshot.title,
        analyzedAt: '2026-11-01T00:00:00.000Z',
        ruleSetVersion: RULE_SET_VERSION,
        profileId: 'standard',
        snapshot,
        result: analyzeSnapshot(snapshot),
      };
      const auditId = await page.evaluate(
        (row) =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('vittix-seo');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const add = database
                .transaction('audits', 'readwrite')
                .objectStore('audits')
                .add(row);
              add.onsuccess = () => {
                resolve(Number(add.result));
                database.close();
              };
              add.onerror = () => reject(add.error);
            };
          }),
        record,
      );

      await target.goto('https://other.test/different');
      await target.bringToFront();
      const outcome = await page.evaluate(async (id) => {
        const active = await chrome.tabs.query({ active: true, currentWindow: true });
        const hasHost = await chrome.permissions.contains({ origins: ['https://other.test/*'] });
        const response = await chrome.runtime.sendMessage({
          type: 'vittix/show-highlights',
          auditId: id,
        });
        return { activeUrl: active[0]?.url, hasHost, response };
      }, auditId);

      console.log('production stale-highlight probe', JSON.stringify(outcome));
      // The target page was navigated to other.test in the same tab; without
      // a fresh user gesture Chrome withholds its URL and the stored audit is
      // rejected before any scripting attempt.
      expect(outcome.activeUrl).toBeUndefined();
      expect(outcome.hasHost).toBe(false);
      expect(outcome.response).toEqual({
        ok: false,
        message:
          'The active page differs from this audit. Re-analyze the active page before showing highlights.',
      });
      await expect(target.getByRole('status')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('sidePanel optional permission can be requested at runtime', async () => {
    const { context, page, extensionId } = await loadExtension('e2e', [
      '--use-fake-ui-for-permission-flow',
    ]);
    try {
      await page.goto(extensionPageUrl(extensionId, 'popup.html'));
      await page.evaluate(() => {
        const button = document.createElement('button');
        button.id = 'sidepanel-permission-probe';
        button.textContent = 'Request sidePanel';
        button.addEventListener('click', () => {
          void chrome.permissions.request({ permissions: ['sidePanel'] }).then((granted) => {
            (window as typeof window & { sidePanelGrant?: boolean }).sidePanelGrant = granted;
          });
        });
        document.body.append(button);
      });
      await page.locator('#sidepanel-permission-probe').click();
      await expect
        .poll(
          () =>
            page.evaluate(
              () => (window as typeof window & { sidePanelGrant?: boolean }).sidePanelGrant,
            ),
          {
            timeout: 10_000,
          },
        )
        .toBe(true);
      expect(
        await page.evaluate(() => chrome.permissions.contains({ permissions: ['sidePanel'] })),
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('dashboard renders with sidebar navigation and an empty overview', async () => {
    const { context, page, extensionId } = await loadExtension();
    try {
      await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));

      await expect(page.getByText('Vittix SEO Toolkit')).toBeVisible();
      await expect(page.getByTestId('nav-overview')).toBeVisible();
      await expect(page.getByTestId('nav-metadata')).toBeVisible();
      await expect(page.getByTestId('nav-headings')).toBeVisible();
      await expect(page.getByTestId('nav-images')).toBeVisible();
      await expect(page.getByTestId('nav-links')).toBeVisible();
      await expect(page.getByTestId('nav-findings')).toBeVisible();
      await expect(page.getByTestId('nav-history')).toBeVisible();
      await expect(page.getByTestId('nav-export')).toBeVisible();
      await expect(page.getByTestId('nav-settings')).toBeVisible();

      // Fresh profile → no audits yet → empty state, no fabricated results.
      await expect(page.getByText('No audit yet')).toBeVisible();

      // Navigate through every section and confirm its title.
      for (const [section, title] of Object.entries(SECTION_TITLES)) {
        await page.getByTestId(`nav-${section}`).click();
        await expect(page.getByTestId('section-title')).toContainText(title);
      }

      // History shows the empty state on a fresh profile.
      await page.getByTestId('nav-history').click();
      await expect(page.getByText('No audits stored yet')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('theme preference is saved and applied before dashboard content', async () => {
    const { context, page, extensionId } = await loadExtension('e2e');
    try {
      await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
      await page.getByTestId('nav-settings').click();
      const theme = page.getByLabel('Theme');
      await expect(theme).toBeVisible();
      await theme.selectOption('dark');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('vittix-theme')))
        .toBe('dark');
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise<string | undefined>((resolve) => {
                const request = indexedDB.open('vittix-seo');
                request.onsuccess = () => {
                  const database = request.result;
                  const get = database
                    .transaction('settings')
                    .objectStore('settings')
                    .get('app-settings');
                  get.onsuccess = () => {
                    resolve(get.result?.value?.theme);
                    database.close();
                  };
                };
              }),
          ),
        )
        .toBe('dark');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.getByTestId('nav-settings').click();
      await expect(page.getByLabel('Theme')).toHaveValue('dark');
      await page.getByLabel('Theme').scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'docs/acceptance-evidence/d6-theme-dark.png', fullPage: true });
    } finally {
      await context.close();
    }
  });

  test('options page renders settings, clear-data flow and privacy information', async () => {
    const { context, page, extensionId } = await loadExtension();
    try {
      await page.goto(extensionPageUrl(extensionId, 'options.html'));

      await expect(page.getByText('Vittix SEO Toolkit — Options')).toBeVisible();
      await expect(page.getByText('History retention')).toBeVisible();
      await expect(page.getByText('Maximum stored audits')).toBeVisible();

      // Danger zone: two-step clear-all confirmation. The completion state
      // waits on a real IndexedDB write, so give it a generous, still
      // deterministic window (a state wait, not a sleep).
      await page.getByTestId('clear-all-button').click();
      await expect(page.getByTestId('clear-all-confirm')).toBeVisible();
      await page.getByTestId('clear-all-confirm').click();
      await expect(page.getByTestId('clear-all-done')).toBeVisible({ timeout: 15_000 });

      // Privacy information is present.
      await expect(page.getByText('Audit data stays on your device')).toBeVisible();
      await expect(page.getByText('Minimal permissions by design')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
