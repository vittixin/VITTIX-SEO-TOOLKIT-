import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeSnapshot } from '../packages/seo-core/src/analyze';
import { buildSnapshot } from '../packages/seo-core/src/testing/fixtures';
import { RULE_SET_VERSION } from '../packages/seo-core/src/rules';
import { extensionPageUrl, loadExtension } from './helpers/extension';

const STORE_ASSET_DIR = resolve(import.meta.dirname, '../docs/store-assets');

test('capture Chrome Web Store screenshots from the production build at 1280x800', async () => {
  mkdirSync(STORE_ASSET_DIR, { recursive: true });
  const { context, page, extensionId } = await loadExtension('production');
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
    await expect(page.getByTestId('section-title')).toHaveText(/.+/);

    const snapshot = buildSnapshot({
      url: 'https://example.test/guide/technical-seo',
      title: 'Technical SEO Guide | Example',
      meta: {
        description:
          'A practical guide to page metadata, structured data, and technical SEO checks.',
        ogTitle: 'Technical SEO Guide',
        ogDescription: 'Review essential technical SEO checks in this guide.',
        ogImage: 'https://example.test/images/guide-card.png',
      },
      headings: [
        { tag: 'h1', text: 'Technical SEO Guide' },
        { tag: 'h2', text: 'Metadata and indexing' },
        { tag: 'h2', text: 'Structured data' },
      ],
      textStats: {
        wordCount: 620,
        textSampleTruncated: false,
      },
      textSummary: {
        sentenceCount: 31,
        paragraphCount: 14,
        syllableCount: 940,
        leadText: 'Technical SEO guide. Review metadata, indexing, and structured data.',
        keywords: [
          { term: 'technical seo', count: 12 },
          { term: 'metadata', count: 9 },
          { term: 'structured data', count: 7 },
        ],
      },
    });
    const record = {
      url: snapshot.url,
      title: snapshot.title,
      analyzedAt: '2026-11-01T12:00:00.000Z',
      ruleSetVersion: RULE_SET_VERSION,
      profileId: 'standard',
      snapshot,
      result: analyzeSnapshot(snapshot),
    };
    await page.evaluate(
      (audit) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('vittix-seo');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('audits', 'readwrite');
            transaction.objectStore('audits').add(audit);
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        }),
      record,
    );
    await page.evaluate(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('vittix-seo');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('targetKeywords', 'readwrite');
            transaction.objectStore('targetKeywords').put({ url, keyword: 'technical SEO' });
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        }),
      snapshot.url,
    );

    const captures = [
      { section: 'overview', file: '01-dashboard-overview.png' },
      { section: 'previews', file: '02-previews.png' },
      { section: 'content', file: '03-content.png' },
      { section: 'site', file: '04-site-audit.png' },
      { section: 'export', file: '05-export.png' },
    ];
    for (const capture of captures) {
      await page.getByTestId(`nav-${capture.section}`).click();
      await expect(page.getByTestId('section-title')).toHaveText(/.+/);
      await expect(page.getByText('Loading section…')).toHaveCount(0);
      await page.screenshot({
        path: resolve(STORE_ASSET_DIR, capture.file),
        animations: 'disabled',
      });
    }
  } finally {
    await context.close();
  }
});
