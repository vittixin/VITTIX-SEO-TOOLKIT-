import { expect, test } from '@playwright/test';
import { extensionPageUrl, loadExtension } from './helpers/extension';
import { highlightOnPage } from '../apps/extension/src/highlight/overlay';

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
    const { context, page, extensionId } = await loadExtension('e2e');
    try {
      await page.goto(extensionPageUrl(extensionId, 'panel.html'));
      await expect(page.getByTestId('analyze-button')).toBeEnabled();
      await expect(page.getByTestId('analysis-summary')).toHaveCount(0);
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
