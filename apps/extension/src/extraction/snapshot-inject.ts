import type { HeadingCounts, PageMeta, PageSnapshot } from '@vittix/shared';

/**
 * Limits are passed in as an execution argument (never imported at runtime)
 * so this function remains fully self-contained: chrome.scripting.executeScript
 * serializes it with `func.toString()` and runs it in the page's isolated
 * world. Type-only imports above are erased at build time.
 */
export interface ExtractorLimits {
  headings: number;
  images: number;
  links: number;
  textSampleChars: number;
  textField: number;
}

/**
 * One-shot page extraction (snapshot schema v2). Runs in the page's ISOLATED
 * world (no access to page JavaScript variables). Reads only what the SEO
 * analyzers need, caps every collection, and returns a plain serializable
 * object. Nothing is fetched and nothing is transmitted.
 *
 * IMPORTANT: this function is serialized with `func.toString()` and must be
 * fully self-contained — no references to module-level helpers or imports
 * (type-only imports are erased and therefore fine). The pipeline e2e test
 * executes it exactly the way chrome.scripting does and guards this
 * constraint.
 */
export function extractPageSnapshot(limits: ExtractorLimits): PageSnapshot {
  const notBlank = (value: string | null | undefined, max = 500): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, max) : null;
  };

  const meta = (selector: string): string | null =>
    notBlank(document.querySelector(selector)?.getAttribute('content'));

  // --- headings --------------------------------------------------------------
  const headingCounts: HeadingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const headings: PageSnapshot['headings'] = [];
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
    const tag = el.tagName.toLowerCase() as PageSnapshot['headings'][number]['tag'];
    headingCounts[tag] += 1;
    if (headings.length < limits.headings) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      headings.push({ tag, text: text.slice(0, limits.textField) });
    }
  });

  // --- images ----------------------------------------------------------------
  const imageEls = document.querySelectorAll('img');
  const images: PageSnapshot['images'] = [];
  imageEls.forEach((el) => {
    if (images.length >= limits.images) return;
    const src = el.getAttribute('src') ?? el.getAttribute('data-src') ?? '';
    const alt = el.getAttribute('alt');
    images.push({
      src: src.trim().slice(0, 500),
      // null = no alt attribute; '' = explicitly empty (decorative)
      alt: alt === null ? null : alt.slice(0, 300),
    });
  });

  // --- links -----------------------------------------------------------------
  // Accessible name: aria-label → visible text → first descendant img alt.
  // (aria-labelledby is intentionally not resolved — documented limitation.)
  const linkEls = document.querySelectorAll('a[href]');
  const links: PageSnapshot['links'] = [];
  linkEls.forEach((el) => {
    if (links.length >= limits.links) return;
    const anchor = el as HTMLAnchorElement;
    const text = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim();
    const pick = (value: string | null | undefined): string => (value ?? '').trim();
    const ariaText = pick(anchor.getAttribute('aria-label'));
    const imageAltText = pick(anchor.querySelector('img[alt]')?.getAttribute('alt'));
    const accessibleName = (ariaText !== '' ? ariaText : text !== '' ? text : imageAltText).trim();
    links.push({
      href: (anchor.getAttribute('href') ?? '').trim().slice(0, 1000),
      text: text.slice(0, 200),
      rel: anchor.getAttribute('rel'),
      target: anchor.getAttribute('target'),
      accessibleName: accessibleName.slice(0, 300),
    });
  });

  // --- head metadata -----------------------------------------------------------
  const descriptionValues: string[] = [];
  document.querySelectorAll('meta[name="description" i]').forEach((el) => {
    if (descriptionValues.length >= 5) return;
    const content = el.getAttribute('content');
    if (content !== null && content.trim() !== '') {
      descriptionValues.push(content.trim().slice(0, 2000));
    }
  });

  const canonicalValues: string[] = [];
  document.querySelectorAll('link[rel="canonical" i]').forEach((el) => {
    if (canonicalValues.length >= 5) return;
    const href = el.getAttribute('href');
    if (href !== null && href.trim() !== '') {
      canonicalValues.push(href.trim().slice(0, 2000));
    }
  });

  const pageMeta: PageMeta = {
    description: descriptionValues[0] ?? null,
    canonical: canonicalValues[0] ?? null,
    robots: meta('meta[name="robots" i]'),
    viewport: meta('meta[name="viewport" i]'),
    charset: notBlank(document.characterSet) ?? meta('meta[charset]'),
    lang: notBlank(document.documentElement.getAttribute('lang'), 50),
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: meta('meta[property="og:image"]'),
    twitterCard: meta('meta[name="twitter:card" i]'),
    twitterTitle: meta('meta[name="twitter:title" i]'),
    twitterDescription: meta('meta[name="twitter:description" i]'),
    twitterImage: meta('meta[name="twitter:image" i]'),
  };

  // --- structured data (JSON-LD) ---------------------------------------------
  const jsonLdEls = document.querySelectorAll('script[type="application/ld+json"]');
  const structuredData: PageSnapshot['structuredData'] = [];
  jsonLdEls.forEach((el) => {
    if (structuredData.length >= 5) return;
    const raw = (el.textContent ?? '').trim();
    if (raw !== '') structuredData.push({ raw: raw.slice(0, 10_000) });
  });

  // --- body text sample --------------------------------------------------------
  let sample = '';
  try {
    sample = (document.body?.innerText ?? '').slice(0, limits.textSampleChars);
  } catch {
    sample = '';
  }
  const wordCount = (sample.match(/\S+/g) ?? []).length;

  return {
    // Keep in sync with SNAPSHOT_SCHEMA_VERSION in @vittix/shared.
    schemaVersion: 2,
    url: location.href,
    title: (document.title ?? '').slice(0, 500),
    titleCount: document.querySelectorAll('title').length,
    meta: pageMeta,
    descriptions: descriptionValues,
    canonicals: canonicalValues,
    headings,
    headingCounts,
    images,
    imageCount: imageEls.length,
    links,
    linkCount: linkEls.length,
    structuredData,
    structuredDataCount: jsonLdEls.length,
    textStats: { wordCount },
    extractedAt: new Date().toISOString(),
  };
}
