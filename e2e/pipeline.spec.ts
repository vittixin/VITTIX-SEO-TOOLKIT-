import { expect, test } from '@playwright/test';
// Direct source imports: the workspace packages are not dependencies of the
// repo root, so bare specifiers would not resolve from e2e/.
import { PageSnapshotSchema } from '../packages/shared/src/index.js';
import { analyzeSnapshot } from '../packages/seo-core/src/analyze.js';
import { extractPageSnapshot } from '../apps/extension/src/extraction/snapshot-inject.js';
import { loadExtension } from './helpers/extension.js';

const LIMITS = { headings: 300, images: 500, links: 500, textSampleChars: 100_000, textField: 300 };

/**
 * Full vertical-slice test: the REAL extractor function runs inside a REAL
 * rendered page (served locally via route interception — no network), the
 * result is validated against the Zod schema and analyzed by the REAL
 * seo-core rule set.
 *
 * The only parts not covered here are the toolbar click (which grants
 * activeTab) and the chrome.scripting.executeScript glue, neither of which
 * can be automated for MV3 popups; the guard/error path is covered by the
 * popup smoke test.
 */
test('real extraction → validation → analysis pipeline', async () => {
  const { context, page } = await loadExtension();
  try {
    const fixtureHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Vittix Fixture Page With A Good Long Title</title>
  <meta name="description" content="A fixture description crafted to sit inside the healthy seventy to one hundred sixty character window for this test page." />
  <link rel="canonical" href="https://fixture.test/page" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta property="og:title" content="Vittix Fixture Page" />
</head>
<body>
  <h1>Fixture main heading</h1>
  <h2>Section one</h2>
  <img src="/img/chart.png" alt="A chart of fixture data" />
  <img src="/img/missing-alt.png" />
  <a href="/internal">Internal link</a>
  <a href="https://external.example/">External link</a>
  <a href="/empty-anchor"></a>
</body>
</html>`;

    await context.route('https://fixture.test/page', (route) =>
      route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
    );
    await page.goto('https://fixture.test/page');

    // Run the actual injector function in the page context, exactly the way
    // chrome.scripting serializes it (func.toString() + args).
    const extractorSource = extractPageSnapshot.toString();
    const extracted: unknown = await page.evaluate(
      `(() => { const extract = (${extractorSource}); return extract(${JSON.stringify(LIMITS)}); })()`,
    );

    // 1. Validation: the extracted snapshot must satisfy the Zod schema.
    const parsed = PageSnapshotSchema.safeParse(extracted);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const snapshot = parsed.data;

    // 2. Extraction correctness on the fixture.
    expect(snapshot.title).toBe('Vittix Fixture Page With A Good Long Title');
    expect(snapshot.meta.canonical).toBe('https://fixture.test/page');
    expect(snapshot.headingCounts.h1).toBe(1);
    expect(snapshot.imageCount).toBe(2);
    expect(snapshot.linkCount).toBe(3);
    // v2 fields: aria-label link + empty-anchor link extracted correctly.
    const emptyAnchor = snapshot.links.find((link) => link.href === '/empty-anchor');
    const ariaLink = snapshot.links.find((link) => link.href === 'https://external.example/');
    expect(emptyAnchor?.accessibleName).toBe('');
    expect(ariaLink?.accessibleName).toBe('External link');

    // 3. Analysis: real rules over the real snapshot (v2 severities).
    const result = analyzeSnapshot(snapshot);
    const byRule = new Map(result.findings.map((finding) => [finding.ruleId, finding]));
    expect(byRule.get('title-present')?.severity).toBe('pass');
    expect(byRule.get('h1-present')?.severity).toBe('pass');
    // One img has NO alt attribute → error; no decorative alt="" present.
    expect(byRule.get('image-alt-present')?.severity).toBe('error');
    expect(byRule.get('image-alt-empty')?.severity).toBe('pass');
    // The empty-anchor link has no accessible name → error; all other links
    // have visible text, so nothing is named non-visually.
    expect(byRule.get('link-anchor-text')?.severity).toBe('error');
    expect(byRule.get('link-named-nonvisually')?.severity).toBe('pass');
    // JSON-LD fixture block parses.
    expect(byRule.get('structured-data-valid')?.severity).toBe('pass');
    // Every actionable finding carries a remediation hint.
    for (const finding of result.findings) {
      if (finding.severity === 'error' || finding.severity === 'warn') {
        expect(finding.remediation?.length ?? 0).toBeGreaterThan(0);
      }
    }
    expect(result.score.total).toBeGreaterThan(0);
    expect(result.score.total).toBeLessThanOrEqual(100);
    expect(result.score.preliminary).toBe(true);
  } finally {
    await context.close();
  }
});
