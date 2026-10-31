import type {
  HeadingCounts,
  HiddenCounts,
  HreflangEntry,
  OmittedCounts,
  PageMeta,
  PageSnapshot,
  SvgStats,
} from '@vittix/shared';

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
 * One-shot page extraction (snapshot schema v3). Runs in the page's ISOLATED
 * world (no access to page JavaScript variables). Reads only what the SEO
 * analyzers need, caps every collection, and returns a plain serializable
 * object. Nothing is fetched and nothing is transmitted.
 *
 * v3 accuracy improvements:
 *  - aria-labelledby resolution (multiple IDREFs, joined in reference order)
 *  - hidden content is excluded from analysis collections and counted
 *    (deterministic subset: [hidden], aria-hidden="true" ancestors, inline
 *    display:none / visibility:hidden — stylesheet-only hiding is NOT
 *    detected and is a documented limitation)
 *  - accessible names for image-based links include descendant <img alt> and
 *    inline <svg> <title>/aria-label
 *  - inline <svg role="img"> accessibility stats
 *  - hreflang link extraction, every robots meta value, per-collection
 *    omitted counts
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

  /**
   * Deterministic hidden-content check. Covers the cheap, unambiguous cases:
   * the hidden attribute, aria-hidden="true" on the element or an ancestor,
   * and inline display:none / visibility:hidden. Stylesheet-driven hiding is
   * intentionally not computed per element (cost on large pages); documented
   * limitation.
   */
  const isHidden = (el: Element): boolean => {
    if (el.closest('[hidden], [aria-hidden="true"]') !== null) return true;
    const style = el.getAttribute('style');
    if (style !== null) {
      const lowered = style.toLowerCase();
      if (/(^|;)\s*display\s*:\s*none/.test(lowered)) return true;
      if (/(^|;)\s*visibility\s*:\s*hidden/.test(lowered)) return true;
    }
    return false;
  };

  /** Resolve aria-labelledby (one or more space-separated IDREFs). */
  const resolveLabelledBy = (el: Element): string => {
    const idrefs = (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter((id) => id !== '');
    if (idrefs.length === 0) return '';
    const parts: string[] = [];
    for (const id of idrefs) {
      const target = document.getElementById(id);
      if (target === null) continue;
      const ownLabel = target.getAttribute('aria-label');
      const text = (target.textContent ?? '').replace(/\s+/g, ' ').trim();
      const resolved = ownLabel !== null && ownLabel.trim() !== '' ? ownLabel.trim() : text;
      if (resolved !== '') parts.push(resolved);
    }
    return parts.join(' ').trim();
  };

  /**
   * Accessible-name resolution for links and image-based links:
   * aria-labelledby → aria-label → visible text → descendant img alt →
   * descendant svg title/aria-label.
   */
  const accessibleNameOf = (anchor: HTMLAnchorElement, visibleText: string): string => {
    const labelledBy = resolveLabelledBy(anchor);
    if (labelledBy !== '') return labelledBy;
    const ariaLabel = anchor.getAttribute('aria-label');
    if (ariaLabel !== null && ariaLabel.trim() !== '') return ariaLabel.trim();
    if (visibleText !== '') return visibleText;
    const pick = (value: string | null | undefined): string => (value ?? '').trim();
    const imgAlt = pick(anchor.querySelector('img[alt]')?.getAttribute('alt'));
    if (imgAlt !== '') return imgAlt;
    const svg = anchor.querySelector('svg');
    if (svg !== null) {
      const svgTitle = pick(svg.querySelector('title')?.textContent);
      if (svgTitle !== '') return svgTitle;
      const svgLabel = pick(svg.getAttribute('aria-label'));
      if (svgLabel !== '') return svgLabel;
    }
    return '';
  };

  // --- headings --------------------------------------------------------------
  const headingCounts: HeadingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const headings: PageSnapshot['headings'] = [];
  const hiddenCounts: HiddenCounts = { headings: 0, images: 0, links: 0 };
  let headingsSeen = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
    const tag = el.tagName.toLowerCase() as PageSnapshot['headings'][number]['tag'];
    if (isHidden(el)) {
      hiddenCounts.headings += 1;
      return;
    }
    headingCounts[tag] += 1;
    headingsSeen += 1;
    if (headings.length < limits.headings) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      headings.push({ tag, text: text.slice(0, limits.textField) });
    }
  });

  // --- images ----------------------------------------------------------------
  const imageEls = document.querySelectorAll('img');
  const images: PageSnapshot['images'] = [];
  let imagesHidden = 0;
  imageEls.forEach((el) => {
    if (isHidden(el)) {
      imagesHidden += 1;
      return;
    }
    if (images.length >= limits.images) return;
    const src = el.getAttribute('src') ?? el.getAttribute('data-src') ?? '';
    const alt = el.getAttribute('alt');
    images.push({
      src: src.trim().slice(0, 500),
      // null = no alt attribute; '' = explicitly empty (decorative)
      alt: alt === null ? null : alt.slice(0, 300),
    });
  });
  hiddenCounts.images = imagesHidden;

  // --- inline SVG accessibility (deterministic subset) ------------------------
  const svgStats: SvgStats = { total: 0, unnamed: 0 };
  document.querySelectorAll('svg[role="img" i]').forEach((svg) => {
    svgStats.total += 1;
    const title = (svg.querySelector('title')?.textContent ?? '').trim();
    const label = (svg.getAttribute('aria-label') ?? '').trim();
    const labelledBy = resolveLabelledBy(svg);
    if (title === '' && label === '' && labelledBy === '') svgStats.unnamed += 1;
  });

  // --- links -----------------------------------------------------------------
  const linkEls = document.querySelectorAll('a[href]');
  const links: PageSnapshot['links'] = [];
  let linksSeen = 0;
  linkEls.forEach((el) => {
    if (isHidden(el)) {
      hiddenCounts.links += 1;
      return;
    }
    linksSeen += 1;
    if (links.length >= limits.links) return;
    const anchor = el as HTMLAnchorElement;
    const text = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim();
    links.push({
      href: (anchor.getAttribute('href') ?? '').trim().slice(0, 1000),
      text: text.slice(0, 200),
      rel: anchor.getAttribute('rel'),
      target: anchor.getAttribute('target'),
      accessibleName: accessibleNameOf(anchor, text).slice(0, 300),
    });
  });

  // --- head metadata -----------------------------------------------------------
  const descriptionValues: string[] = [];
  let descriptionsOmitted = 0;
  document.querySelectorAll('meta[name="description" i]').forEach((el) => {
    if (descriptionValues.length >= 5) {
      descriptionsOmitted += 1;
      return;
    }
    const content = el.getAttribute('content');
    if (content !== null && content.trim() !== '') {
      descriptionValues.push(content.trim().slice(0, 2000));
    }
  });

  const canonicalValues: string[] = [];
  let canonicalsOmitted = 0;
  document.querySelectorAll('link[rel~="canonical" i], link[rel="canonical" i]').forEach((el) => {
    if (canonicalValues.length >= 5) {
      canonicalsOmitted += 1;
      return;
    }
    const href = el.getAttribute('href');
    if (href !== null && href.trim() !== '') {
      canonicalValues.push(href.trim().slice(0, 2000));
    }
  });

  const robotsValues: string[] = [];
  document.querySelectorAll('meta[name="robots" i]').forEach((el) => {
    if (robotsValues.length >= 5) return;
    const content = el.getAttribute('content');
    if (content !== null && content.trim() !== '') {
      robotsValues.push(content.trim().slice(0, 500));
    }
  });

  const hreflangEntries: HreflangEntry[] = [];
  let hreflangOmitted = 0;
  document.querySelectorAll('link[rel~="alternate" i][hreflang]').forEach((el) => {
    if (hreflangEntries.length >= 10) {
      hreflangOmitted += 1;
      return;
    }
    const lang = (el.getAttribute('hreflang') ?? '').trim();
    const href = (el.getAttribute('href') ?? '').trim();
    if (lang !== '') {
      hreflangEntries.push({ lang: lang.slice(0, 35), href: href.slice(0, 2000) });
    }
  });

  const pageMeta: PageMeta = {
    description: descriptionValues[0] ?? null,
    canonical: canonicalValues[0] ?? null,
    robots: robotsValues[0] ?? null,
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
  let structuredDataOmitted = 0;
  jsonLdEls.forEach((el) => {
    if (structuredData.length >= 5) {
      structuredDataOmitted += 1;
      return;
    }
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

  const omitted: OmittedCounts = {
    headings: Math.max(0, headingsSeen - headings.length),
    images: Math.max(0, imageEls.length - imagesHidden - images.length),
    links: Math.max(0, linksSeen - links.length),
    descriptions: descriptionsOmitted,
    canonicals: canonicalsOmitted,
    structuredData: structuredDataOmitted,
    hreflang: hreflangOmitted,
  };

  return {
    // Keep in sync with SNAPSHOT_SCHEMA_VERSION in @vittix/shared.
    schemaVersion: 3,
    url: location.href,
    title: (document.title ?? '').slice(0, 500),
    titleCount: document.querySelectorAll('title').length,
    meta: pageMeta,
    descriptions: descriptionValues,
    canonicals: canonicalValues,
    headings,
    headingCounts,
    images,
    imageCount: Math.max(0, imageEls.length - imagesHidden),
    links,
    linkCount: linksSeen,
    structuredData,
    structuredDataCount: jsonLdEls.length,
    robotsValues,
    hreflang: hreflangEntries,
    hreflangCount: hreflangEntries.length + hreflangOmitted,
    omitted,
    hidden: hiddenCounts,
    svg: svgStats,
    textStats: { wordCount, textSampleTruncated: sample.length >= limits.textSampleChars },
    extractedAt: new Date().toISOString(),
  };
}
