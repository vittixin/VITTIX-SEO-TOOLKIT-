import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

function bundleReportPlugin(): Plugin {
  let outputDirectory = '';
  return {
    name: 'vittix-production-bundle-report',
    configResolved(config: ResolvedConfig) {
      outputDirectory = config.build.outDir;
    },
    generateBundle(_options, bundle) {
      if (!outputDirectory.endsWith('chrome-mv3') || outputDirectory.includes('chrome-mv3-e2e'))
        return;
      const assets = new Map<string, number>();
      const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
          const asset = output;
          const source = asset.source;
          const size = typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength;
          assets.set(asset.fileName, size);
        }
      }

      const entrypoints = chunks
        .filter((chunk) => chunk.isEntry)
        .map((chunk) => {
          const cssFiles = [...(chunk.viteMetadata?.importedCss ?? [])];
          const jsBytes = Buffer.byteLength(chunk.code);
          const cssBytes = cssFiles.reduce((sum, file) => sum + (assets.get(file) ?? 0), 0);
          return {
            name: chunk.name,
            file: chunk.fileName,
            jsBytes,
            cssFiles,
            cssBytes,
            totalBytes: jsBytes + cssBytes,
          };
        });
      const moduleSizes = new Map<string, number>();
      for (const chunk of chunks) {
        for (const [id, info] of Object.entries(chunk.modules)) {
          moduleSizes.set(id, (moduleSizes.get(id) ?? 0) + info.renderedLength);
        }
      }
      const largestModules = [...moduleSizes.entries()]
        .map(([id, bytes]) => ({ module: id.replace(`${resolve(process.cwd())}/`, ''), bytes }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 10);
      const reportPath = resolve(outputDirectory, '..', 'bundle-analysis.json');
      writeFileSync(reportPath, JSON.stringify({ entrypoints, largestModules }, null, 2));
    },
  };
}

/**
 * The base manifest, shared by the production build and the E2E test build.
 * Exported so wxt.config.e2e.ts can re-apply it without relying on WXT's
 * function-form manifest hook typing.
 */
export const BASE_MANIFEST = {
  name: 'Vittix SEO Toolkit',
  short_name: 'Vittix',
  default_locale: 'en',
  description:
    'Privacy-first SEO audits for metadata, headings, images and links. All analysis is local — nothing ever leaves your browser.',
  permissions: ['activeTab', 'scripting'],
  // Chrome 114+ recognizes this API permission as optional; WXT's
  // ManifestOptionalPermission union predates the sidePanel API.
  optional_permissions: ['sidePanel'] as never,
  minimum_chrome_version: '114',
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
  optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
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
    plugins: [tailwindcss(), bundleReportPlugin()],
  }),
  manifest: BASE_MANIFEST,
});
