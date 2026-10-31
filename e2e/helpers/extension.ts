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

export interface LaunchOptions {
  /**
   * Persistent profile directory. Pass the SAME directory twice to test a
   * real browser restart (IndexedDB and the extension survive).
   */
  profileDir?: string;
  /** Wipe the profile before launch (default: true for the shared default). */
  freshProfile?: boolean;
}

export async function launchExtensionContext(
  build: ExtensionBuild,
  extraArgs: string[],
  options: LaunchOptions = {},
): Promise<{ context: BrowserContext; extensionId: string }> {
  const extensionDir = EXTENSION_BUILD_DIRS[build];
  const profileDir = options.profileDir ?? PROFILE_DIR;
  if (options.freshProfile !== false) {
    rmSync(profileDir, { recursive: true, force: true });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
    // PLAYWRIGHT_HEADED=1 enables installed-Chrome (channel "chrome") runs:
    // branded Chrome only loads extensions headfully, so acceptance runs on
    // the installed browser use a visible window with a disposable profile.
    headless: process.env.PLAYWRIGHT_HEADED !== '1',
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      ...extraArgs,
    ],
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
  return { context, extensionId: new URL(worker.url()).host };
}

/**
 * Launch Chromium with a built extension and return a ready page.
 *
 * Browser notes:
 * - Requires the FULL Chromium build with new headless (`channel:
 *   'chromium'`). Playwright's default headless shell has no extension
 *   support, and branded Chrome (channel 'chrome') ignores
 *   --load-extension since Chrome 137.
 * - Each call starts from a fresh profile, so tests get a clean database.
 *   For restart/recovery tests use `launchExtensionContext` with a shared
 *   `profileDir` and `freshProfile: false` on the second launch.
 */
export async function loadExtension(
  build: ExtensionBuild = 'production',
  extraArgs: string[] = [],
): Promise<{
  context: BrowserContext;
  page: Page;
  extensionId: string;
}> {
  const { context, extensionId } = await launchExtensionContext(build, extraArgs);
  const page = await context.newPage();
  return { context, page, extensionId };
}

export function extensionPageUrl(extensionId: string, page: string): string {
  return `chrome-extension://${extensionId}/${page}`;
}
