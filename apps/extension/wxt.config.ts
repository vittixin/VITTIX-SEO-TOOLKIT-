import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

/**
 * The base manifest, shared by the production build and the E2E test build.
 * Exported so wxt.config.e2e.ts can re-apply it without relying on WXT's
 * function-form manifest hook typing.
 */
export const BASE_MANIFEST = {
  name: 'Vittix SEO Toolkit',
  short_name: 'Vittix',
  description:
    'Privacy-first SEO audits for metadata, headings, images and links. All analysis is local — nothing ever leaves your browser.',
  permissions: ['activeTab', 'scripting'],
  minimum_chrome_version: '111',
  // A keyboard command is a user gesture and grants activeTab exactly like
  // clicking the toolbar action — no extra permission required.
  commands: {
    'analyze-page': {
      suggested_key: { default: 'Ctrl+Shift+U' },
      description: 'Analyze the current page with Vittix SEO Toolkit',
    },
  },
  /**
   * Site-audit mode (opt-in): a CATALOG of grantable patterns, NOT a grant.
   * No host access exists at install time; chrome.permissions.request asks
   * for exactly one user-chosen origin at runtime and it can be revoked.
   * docs/SITE_AUDIT.md documents the threat model; scripts/verify-manifest.mjs
   * enforces that this list never grows beyond the https wildcard and that
   * host_permissions stays absent.
   */
  optional_host_permissions: ['https://*/*'],
  icons: {
    '16': 'icon/16.png',
    '32': 'icon/32.png',
    '48': 'icon/48.png',
    '96': 'icon/96.png',
    '128': 'icon/128.png',
  },
  action: {
    default_title: 'Vittix SEO Toolkit — analyze this page',
    default_icon: {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
      '48': 'icon/48.png',
      '96': 'icon/96.png',
      '128': 'icon/128.png',
    },
  },
};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: BASE_MANIFEST,
});
