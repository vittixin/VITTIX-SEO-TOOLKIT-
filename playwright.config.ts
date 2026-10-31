import { defineConfig } from '@playwright/test';

/**
 * Extension smoke tests run against the production Chrome MV3 build in
 * `apps/extension/.output/chrome-mv3`.
 *
 * The full Chromium build is required (channel "chromium"): Playwright's
 * default headless shell has no extension support, and branded Chrome
 * (channel "chrome") ignores --load-extension since Chrome 137. Run
 * `npx playwright install chromium` once before the first run.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
    headless: true,
  },
});
