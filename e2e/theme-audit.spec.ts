import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extensionPageUrl, loadExtension } from './helpers/extension';

const EVIDENCE_DIR = resolve(import.meta.dirname, '../docs/acceptance-evidence/dark-theme');
const DASHBOARD_SECTIONS = [
  'overview',
  'metadata',
  'headings',
  'images',
  'links',
  'findings',
  'history',
  'site',
  'previews',
  'content',
  'export',
  'settings',
] as const;

test('light and dark theme contrast audit across extension views', async () => {
  test.setTimeout(360_000);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const { context, page, extensionId } = await loadExtension('production');
  const contrastFailures: Array<{
    view: string;
    width: number;
    text: string;
    selector: string;
    foreground: string;
    background: string;
    ratio: number;
  }> = [];
  const colorStats = new Map<string, number>();
  let auditedVisibleTextNodeCount = 0;
  const nonTextFailures: Array<{
    theme: string;
    view: string;
    width: number;
    selector: string;
    part: string;
    foreground: string;
    background: string;
    ratio: number;
  }> = [];

  const auditAndScreenshot = async (theme: 'light' | 'dark', view: string, width: number) => {
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.screenshot({
      path: resolve(EVIDENCE_DIR, `${theme}-${view}-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    const result = await page.evaluate(() => {
      const parseColor = (value: string): [number, number, number, number] | null => {
        const srgb = value.match(
          /color\(srgb\s+([-\d.]+%?)\s+([-\d.]+%?)\s+([-\d.]+%?)(?:\s*\/\s*([\d.]+%?))?\s*\)/,
        );
        if (srgb) {
          const channel = (part: string) =>
            Number.parseFloat(part) * (part.endsWith('%') ? 2.55 : 255);
          return [
            channel(srgb[1]!),
            channel(srgb[2]!),
            channel(srgb[3]!),
            srgb[4] ? Number.parseFloat(srgb[4]) / (srgb[4].endsWith('%') ? 100 : 1) : 1,
          ];
        }
        const oklch = value.match(
          /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)/,
        );
        if (oklch) {
          const lightness = Number.parseFloat(oklch[1]!) / (oklch[1]!.endsWith('%') ? 100 : 1);
          const chroma = Number.parseFloat(oklch[2]!) / (oklch[2]!.endsWith('%') ? 100 : 1);
          const hue = (Number.parseFloat(oklch[3]!) * Math.PI) / 180;
          const a = chroma * Math.cos(hue);
          const b = chroma * Math.sin(hue);
          const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
          const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
          const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
          const l = lRoot ** 3;
          const m = mRoot ** 3;
          const s = sRoot ** 3;
          const gamma = (channel: number) => {
            const clamped = Math.min(1, Math.max(0, channel));
            return (
              255 * (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055)
            );
          };
          return [
            gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
            oklch[4] ? Number.parseFloat(oklch[4]) / (oklch[4].endsWith('%') ? 100 : 1) : 1,
          ];
        }
        const numbers = value
          .match(/[\d.]+%?/g)
          ?.map((part) =>
            part.endsWith('%') ? (Number.parseFloat(part) / 100) * 255 : Number.parseFloat(part),
          );
        if (!numbers || numbers.length < 3) return null;
        const alpha = numbers.length > 3 ? numbers[3]! : 1;
        return [numbers[0]!, numbers[1]!, numbers[2]!, alpha];
      };
      const composite = (
        foreground: [number, number, number, number],
        background: [number, number, number],
      ): [number, number, number] => {
        const alpha = Math.min(1, Math.max(0, foreground[3]));
        return [
          foreground[0] * alpha + background[0] * (1 - alpha),
          foreground[1] * alpha + background[1] * (1 - alpha),
          foreground[2] * alpha + background[2] * (1 - alpha),
        ];
      };
      const luminance = (color: [number, number, number]) => {
        const linear = color.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
      };
      const contrast = (a: [number, number, number], b: [number, number, number]) => {
        const high = Math.max(luminance(a), luminance(b));
        const low = Math.min(luminance(a), luminance(b));
        return (high + 0.05) / (low + 0.05);
      };
      const describe = (element: Element) => {
        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const testId = element.getAttribute('data-testid');
        const classes = [...element.classList].slice(0, 2).join('.');
        return `${tag}${id}${testId ? `[data-testid="${testId}"]` : ''}${classes ? `.${classes}` : ''}`;
      };
      const failures: Array<{
        text: string;
        selector: string;
        foreground: string;
        background: string;
        ratio: number;
      }> = [];
      const nonTextFailures: Array<{
        selector: string;
        part: string;
        foreground: string;
        background: string;
        ratio: number;
      }> = [];
      let visibleTextNodeCount = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const text = node.textContent?.replace(/\s+/g, ' ').trim();
        const element = node.parentElement;
        if (!text || !element || !element.getClientRects().length) continue;
        visibleTextNodeCount += 1;
        const foregroundCss = getComputedStyle(element).color;
        const foreground = parseColor(foregroundCss);
        if (!foreground) continue;

        const ancestors: Element[] = [];
        for (let current: Element | null = element; current; current = current.parentElement) {
          ancestors.push(current);
        }
        let background: [number, number, number] =
          document.documentElement.dataset.theme === 'dark' ? [15, 23, 42] : [255, 255, 255];
        for (const ancestor of ancestors.reverse()) {
          const style = getComputedStyle(ancestor);
          const parsed = parseColor(style.backgroundColor);
          if (parsed) {
            const opacity = Number.parseFloat(style.opacity || '1');
            parsed[3] *= opacity;
            background = composite(parsed, background);
          }
        }
        let effectiveForeground = foreground;
        for (let current: Element | null = element; current; current = current.parentElement) {
          const opacity = Number.parseFloat(getComputedStyle(current).opacity || '1');
          effectiveForeground = [
            effectiveForeground[0],
            effectiveForeground[1],
            effectiveForeground[2],
            effectiveForeground[3] * opacity,
          ];
        }
        const renderedForeground = composite(effectiveForeground, background);
        const ratio = contrast(renderedForeground, background);
        if (ratio < 4.5) {
          failures.push({
            text: text.slice(0, 120),
            selector: describe(element),
            foreground: foregroundCss,
            background: `rgb(${background.map(Math.round).join(' ')})`,
            ratio: Number(ratio.toFixed(2)),
          });
        }
      }
      const surfaces = (element: Element) => {
        for (let current: Element | null = element; current; current = current.parentElement) {
          const parsed = parseColor(getComputedStyle(current).backgroundColor);
          if (parsed && parsed[3] > 0) return composite(parsed, [255, 255, 255]);
        }
        return [255, 255, 255] as [number, number, number];
      };
      const inspectEdge = (element: Element, part: 'border' | 'outline' | 'ring' | 'indicator') => {
        const style = getComputedStyle(element);
        let colorText =
          part === 'outline'
            ? style.outlineColor
            : part === 'ring'
              ? style.getPropertyValue('--tw-ring-color')
              : style.borderTopColor;
        if (part === 'indicator') colorText = style.stroke || style.color;
        const parsed = colorText ? parseColor(colorText) : null;
        if (!parsed || parsed[3] === 0) return;
        const background = surfaces(element);
        const rendered = composite(parsed, background);
        const ratio = contrast(rendered, background);
        if (ratio < 3)
          nonTextFailures.push({
            selector: describe(element),
            part,
            foreground: colorText,
            background: `rgb(${background.map(Math.round).join(' ')})`,
            ratio: Number(ratio.toFixed(2)),
          });
      };
      const visible = [
        ...document.querySelectorAll(
          'button, input, select, textarea, [role="button"], [class*="severity"], [data-severity], svg circle, svg path',
        ),
      ].filter((element) => element.getClientRects().length);
      for (const element of visible) {
        const tag = element.tagName.toLowerCase();
        if (['input', 'select', 'textarea'].includes(tag)) inspectEdge(element, 'border');
        if (element.matches('button, [role="button"]')) {
          const computed = getComputedStyle(element);
          if (computed.outlineStyle !== 'none' && computed.outlineWidth !== '0px')
            inspectEdge(element, 'outline');
          if (computed.borderTopWidth !== '0px') inspectEdge(element, 'border');
        }
        if (element.matches('[class*="severity"], [data-severity]')) inspectEdge(element, 'border');
        if (element.matches('svg circle, svg path')) {
          const svg = element.closest('svg');
          if (svg && (svg.getAttribute('aria-label') || svg.querySelector('circle')))
            inspectEdge(element, 'indicator');
        }
      }
      const firstFocusable = document.querySelector<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
      const focused = document.activeElement;
      if (focused && focused !== document.body) {
        const computed = getComputedStyle(focused);
        if (computed.outlineStyle !== 'none' && computed.outlineWidth !== '0px')
          inspectEdge(focused, 'outline');
        if (computed.getPropertyValue('--tw-ring-color')) inspectEdge(focused, 'ring');
      }
      return { failures, nonTextFailures, visibleTextNodeCount };
    });
    auditedVisibleTextNodeCount += result.visibleTextNodeCount;
    const failures = result.failures;
    for (const failure of failures) {
      contrastFailures.push({ theme, view, width, ...failure });
      const key = `${failure.selector} | ${failure.foreground} on ${failure.background}`;
      colorStats.set(key, (colorStats.get(key) ?? 0) + 1);
    }
    for (const failure of result.nonTextFailures)
      nonTextFailures.push({ theme, view, width, ...failure });
  };

  try {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
      await page.getByTestId('nav-settings').click();
      await page.getByLabel('Theme').selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
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
        .toBe(theme);

      for (const width of [1280, 400]) {
        console.log(`Contrast audit progress: ${theme} ${width}`);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(extensionPageUrl(extensionId, 'popup.html'));
        console.log(`Contrast audit view: ${theme} popup ${width}`);
        await auditAndScreenshot(theme, 'popup', width);

        await page.goto(extensionPageUrl(extensionId, 'panel.html'));
        await auditAndScreenshot(theme, 'side-panel', width);

        await page.goto(extensionPageUrl(extensionId, 'options.html'));
        await auditAndScreenshot(theme, 'options', width);

        await page.goto(extensionPageUrl(extensionId, 'dashboard.html'));
        for (const section of DASHBOARD_SECTIONS) {
          if (width < 768) await page.getByTestId('mobile-menu').click();
          await page.getByTestId(`nav-${section}`).click();
          await expect(page.getByTestId('section-title')).toHaveText(/.+/);
          await expect(page.getByText('Loading section…')).toHaveCount(0);
          console.log(`Contrast audit view: ${theme} dashboard-${section} ${width}`);
          await auditAndScreenshot(theme, `dashboard-${section}`, width);
        }
      }
    }
  } finally {
    writeFileSync(
      resolve(EVIDENCE_DIR, 'contrast-failures.json'),
      JSON.stringify(
        {
          threshold: '4.5:1 for normal text',
          nonTextThreshold: '3:1 for visible controls and indicators',
          auditedVisibleTextNodeCount,
          failureCount: contrastFailures.length,
          nonTextFailureCount: nonTextFailures.length,
          commonColorPairs: [...colorStats].sort((a, b) => b[1] - a[1]),
          failures: contrastFailures,
          nonTextFailures,
        },
        null,
        2,
      ),
    );
    await context.close();
  }

  console.log(`Light/dark visible text contrast failures: ${contrastFailures.length}`);
  console.log(`Light/dark visible text nodes audited: ${auditedVisibleTextNodeCount}`);
  console.log(`Non-text UI contrast failures: ${nonTextFailures.length}`);
  console.log(`Common failing text color pairs: ${JSON.stringify([...colorStats])}`);
  expect(contrastFailures.length, 'all visible text should meet 4.5:1 contrast').toBe(0);
  expect(nonTextFailures.length, 'visible controls and indicators should meet 3:1 contrast').toBe(
    0,
  );
});
