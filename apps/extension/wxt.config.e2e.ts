import { defineConfig } from 'wxt';
import baseConfig, { BASE_MANIFEST } from './wxt.config';

/**
 * TEST-ONLY build variant used exclusively by Playwright.
 *
 * MV3 toolbar clicks (and keyboard commands) cannot be automated, so the
 * real-flow e2e test authorizes chrome.scripting on the fixture origin via a
 * host permission INSTEAD of an activeTab gesture grant. Everything else is
 * the production code path. This artifact is never shipped, and
 * scripts/verify-manifest.mjs only ever audits the production build —
 * which keeps exactly ["activeTab", "scripting"].
 */
export default defineConfig({
  ...baseConfig,
  outDir: '.output/chrome-mv3-e2e',
  // Object form (not the function hook): the full base manifest is re-applied
  // explicitly, then only the name and the fixture host permission change.
  manifest: {
    ...BASE_MANIFEST,
    name: 'Vittix SEO Toolkit (E2E TEST BUILD)',
    host_permissions: ['https://fixture.test/*'],
  },
});
