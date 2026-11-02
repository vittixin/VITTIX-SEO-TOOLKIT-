import { expect, test } from '@playwright/test';
import { analyzeSnapshot } from '../packages/seo-core/src/analyze';
import { buildSnapshot } from '../packages/seo-core/src/testing/fixtures';
import { RULE_SET_VERSION } from '../packages/seo-core/src/rules';
import { extensionPageUrl, loadExtension } from './helpers/extension';

test('production score ring and severity badges meet theme contrast thresholds', async () => {
  const { context, page, extensionId } = await loadExtension('production');
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
    await expect(page.getByTestId('section-title')).toHaveText(/.+/);

    const snapshot = buildSnapshot({
      url: 'https://contrast-fixture.test/audit',
      title: 'Contrast component fixture',
      headings: [{ tag: 'h1', text: 'Readable findings' }],
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

    for (const theme of ['light', 'dark'] as const) {
      await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
      await page.getByTestId('nav-settings').click();
      await page.getByLabel('Theme').selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.getByTestId('nav-overview').click();
      await expect(page.getByText('preliminary', { exact: true })).toBeVisible();
      await expect(page.getByTestId('score-ring')).toBeVisible();

      const ringRatios = await page.evaluate(() => {
        const circles = [...document.querySelectorAll('[data-testid="score-ring"] svg circle')];
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas color conversion is unavailable');
        const rgb = (color: string): [number, number, number] => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const data = context.getImageData(0, 0, 1, 1).data;
          return [data[0]!, data[1]!, data[2]!];
        };
        const luminance = (color: [number, number, number]) => {
          const linear = color.map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
        };
        const ratio = (a: string, b: string) => {
          const x = luminance(rgb(a));
          const y = luminance(rgb(b));
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const surface = circles[0]?.closest('section');
        if (!surface || circles.length !== 2) throw new Error('Score ring is incomplete');
        const background = getComputedStyle(surface).backgroundColor;
        return circles.map((circle) => ({
          stroke: getComputedStyle(circle).stroke,
          background,
          ratio: ratio(getComputedStyle(circle).stroke, background),
        }));
      });
      expect(ringRatios).toHaveLength(2);
      for (const ring of ringRatios)
        expect(ring.ratio, `${theme} score-ring stroke`).toBeGreaterThanOrEqual(3);
      console.log(
        `${theme} score-ring stroke ratios`,
        ringRatios.map((ring) => ring.ratio),
      );

      await page.getByTestId('nav-findings').click();
      const badges = page.locator('span.ring-1');
      await expect(badges.first()).toBeVisible();
      const badgeContrast = await badges.evaluateAll((elements) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas color conversion is unavailable');
        const luminance = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const data = context.getImageData(0, 0, 1, 1).data;
          const values = [data[0]!, data[1]!, data[2]!].map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
        };
        return elements.map((element) => {
          const style = getComputedStyle(element);
          const foreground = luminance(style.color);
          const background = luminance(style.backgroundColor);
          return {
            label: element.textContent?.trim() ?? '',
            ratio: Number(
              (
                (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05)
              ).toFixed(2),
            ),
          };
        });
      });
      expect(badgeContrast.length).toBeGreaterThan(0);
      for (const badge of badgeContrast) {
        expect(badge.ratio, `${theme} ${badge.label} severity badge`).toBeGreaterThanOrEqual(4.5);
      }
      console.log(
        `${theme} severity badges audited`,
        badgeContrast.length,
        'minimum ratio',
        Math.min(...badgeContrast.map((badge) => badge.ratio)),
      );
    }
  } finally {
    await context.close();
  }
});
