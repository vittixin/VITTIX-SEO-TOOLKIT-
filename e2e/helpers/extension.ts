import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUT_ROOT = resolve(import.meta.dirname, '../../apps/extension/.output');

export const EXTENSION_BUILD_DIRS = {
  /** Production build — exactly the shipped permissions. */
  production: resolve(OUTPUT_ROOT, 'chrome-mv3'),
  /**
   * Test-only build: adds a host permission for the fixture origin so the
   * real-flow test can authorize injection without an automatable toolbar
   * click. Never shipped; production manifest audit covers only `production`.
   * (WXT appends the browser dir, so the artifact lives one level deeper.)
   */
  e2e: resolve(OUTPUT_ROOT, 'chrome-mv3-e2e/chrome-mv3'),
} as const;

export type ExtensionBuild = keyof typeof EXTENSION_BUILD_DIRS;

const PROFILE_DIR = resolve(import.meta.dirname, '../../test-results/pw-profile');

/**
 * Launch Chromium with a built extension and return a ready page.
 *
 * Browser notes:
 * - Requires the FULL Chromium build with new headless (`channel:
 *   'chromium'`). Playwright's default headless shell has no extension
 *   support, and branded Chrome (channel 'chrome') ignores
 *   --load-extension since Chrome 137.
 * - Each call starts from a fresh profile, so tests get a clean database.
 */
export async function loadExtension(build: ExtensionBuild = 'production'): Promise<{
  context: BrowserContext;
  page: Page;
  extensionId: string;
}> {
  const extensionDir = EXTENSION_BUILD_DIRS[build];
  rmSync(PROFILE_DIR, { recursive: true, force: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });

  // The MV3 service worker registers at launch; it may stop again quickly,
  // so grab the ID as soon as it appears.
  let worker = context.serviceWorkers()[0] ?? null;
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 20_000 }).catch(() => null);
  }
  if (!worker) {
    await context.close();
    throw new Error('Extension service worker never registered (extension failed to load?)');
  }

  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  return { context, page, extensionId };
}

export function extensionPageUrl(extensionId: string, page: string): string {
  return `chrome-extension://${extensionId}/${page}`;
}
