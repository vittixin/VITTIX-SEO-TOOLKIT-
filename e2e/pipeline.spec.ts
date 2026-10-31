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
  <link rel="alternate" hreflang="en" href="https://fixture.test/page" />
  <link rel="alternate" hreflang="de" href="https://fixture.test/de" />
  <link rel="alternate" hreflang="de" href="https://fixture.test/de-at" />
  <link rel="alternate" hreflang="en_US" href="https://fixture.test/en-us" />
  <script type="application/ld+json">{ "name": "Fixture page without schema structure" }</script>
</head>
<body>
  <h1>Fixture main heading</h1>
  <h2 hidden>Hidden heading — must not be analyzed</h2>
  <div aria-hidden="true"><h2>Another hidden heading</h2></div>
  <h2>Section one</h2>
  <img src="/img/chart.png" alt="A chart of fixture data" />
  <img src="/img/missing-alt.png" />
  <img src="/img/decorative.png" alt="" style="display:none" />
  <svg role="img"><rect width="10" height="10" /></svg>
  <a href="/internal">Internal link</a>
  <a href="https://external.example/">External link</a>
  <a href="/empty-anchor"></a>
  <a id="label-source">Search the site</a>
  <a href="/labelled" aria-labelledby="label-source"></a>
  <a href="/click-here">click here</a>
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
    // Hidden headings (hidden attr + aria-hidden ancestor) are excluded from
    // analysis collections but counted.
    expect(snapshot.headingCounts.h1).toBe(1);
    expect(snapshot.headingCounts.h2).toBe(1);
    expect(snapshot.hidden.headings).toBe(2);
    // The display:none decorative image is hidden; visible: chart + missing-alt.
    expect(snapshot.imageCount).toBe(2);
    expect(snapshot.hidden.images).toBe(1);
    expect(snapshot.linkCount).toBe(5);
    // v2/v3: accessible names incl. aria-labelledby resolution.
    const emptyAnchor = snapshot.links.find((link) => link.href === '/empty-anchor');
    const ariaLink = snapshot.links.find((link) => link.href === 'https://external.example/');
    const labelledLink = snapshot.links.find((link) => link.href === '/labelled');
    expect(emptyAnchor?.accessibleName).toBe('');
    expect(ariaLink?.accessibleName).toBe('External link');
    expect(labelledLink?.accessibleName).toBe('Search the site');
    // v3: hreflang extraction.
    expect(snapshot.hreflangCount).toBe(4);
    expect(snapshot.hreflang).toHaveLength(4);
    expect(snapshot.hreflang.some((entry) => entry.lang === 'en_US')).toBe(true);
    // v3: inline SVG stats — one role="img" svg without any name.
    expect(snapshot.svg.total).toBe(1);
    expect(snapshot.svg.unnamed).toBe(1);

    // 3. Analysis: real rules over the real snapshot (v3 severities).
    const result = analyzeSnapshot(snapshot);
    const byRule = new Map(result.findings.map((finding) => [finding.ruleId, finding]));
    expect(byRule.get('title-present')?.severity).toBe('pass');
    expect(byRule.get('h1-present')?.severity).toBe('pass');
    // One visible img has NO alt attribute → error; the display:none one is
    // excluded; no decorative alt="" among visible images.
    expect(byRule.get('image-alt-present')?.severity).toBe('error');
    expect(byRule.get('image-alt-empty')?.severity).toBe('pass');
    // The empty-anchor link has no accessible name → error; the labelled
    // link is named via aria-labelledby → info (named non-visually).
    expect(byRule.get('link-anchor-text')?.severity).toBe('error');
    expect(byRule.get('link-named-nonvisually')?.severity).toBe('info');
    // Generic internal anchor text → warn.
    expect(byRule.get('internal-link-quality')?.severity).toBe('warn');
    // hreflang: malformed en_US → warn; duplicate de → warn; self-referencing
    // cluster present, canonical agrees → pass.
    expect(byRule.get('hreflang-syntax')?.severity).toBe('warn');
    expect(byRule.get('hreflang-duplicates')?.severity).toBe('warn');
    expect(byRule.get('hreflang-consistency')?.severity).toBe('pass');
    // JSON-LD fixture block parses (syntax pass) but declares no @context /
    // @type → the structural check warns.
    expect(byRule.get('structured-data-valid')?.severity).toBe('pass');
    expect(byRule.get('structured-data-context')?.severity).toBe('warn');
    // Every actionable finding carries a remediation hint.
    for (const finding of result.findings) {
      if (finding.severity === 'error' || finding.severity === 'warn') {
        expect(finding.remediation?.length ?? 0).toBeGreaterThan(0);
      }
    }
    expect(result.score.total).toBeGreaterThan(0);
    expect(result.score.total).toBeLessThanOrEqual(100);
    expect(result.score.preliminary).toBe(true);
    expect(result.ruleSetVersion).toBe('0.4.0');
  } finally {
    await context.close();
  }
});
