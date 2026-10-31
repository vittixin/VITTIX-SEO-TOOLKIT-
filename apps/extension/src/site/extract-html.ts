import type { PageMeta, PageSnapshot } from '@vittix/shared';
import { SNAPSHOT_LIMITS, SNAPSHOT_SCHEMA_VERSION } from '@vittix/shared';

export interface SiteExtractorLimits {
  headings: number;
  images: number;
  links: number;
  textField: number;
}

/**
 * Snapshot extraction for FETCHED HTML (site mode).
 *
 * Runs in the dashboard page (full DOM available — DOMParser works there;
 * it does not exist in service workers, which is why site-mode
 * orchestration lives in the dashboard, see docs/SITE_AUDIT.md).
 *
 * Differences vs. the live-DOM injector (documented):
 *  - word count uses textContent (no layout / innerText in a detached doc)
 *  - stylesheet-driven hiding cannot apply; the same inline
 *    display:none/visibility:hidden checks are used
 * Everything else (aria-labelledby resolution, hidden counts, hreflang,
 * SVG stats, per-collection omitted counts) mirrors the live injector.
 */
export function parsePageSnapshot(
  html: string,
  url: string,
  limits: SiteExtractorLimits,
): PageSnapshot {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const notBlank = (value: string | null | undefined, max = 500): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, max) : null;
  };
  const meta = (selector: string): string | null =>
    notBlank(doc.querySelector(selector)?.getAttribute('content'));

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

  const resolveLabelledBy = (el: Element): string => {
    const idrefs = (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter((id) => id !== '');
    if (idrefs.length === 0) return '';
    const parts: string[] = [];
    for (const id of idrefs) {
      const target = doc.getElementById(id);
      if (target === null) continue;
      const ownLabel = target.getAttribute('aria-label');
      const text = (target.textContent ?? '').replace(/\s+/g, ' ').trim();
      const resolved = ownLabel !== null && ownLabel.trim() !== '' ? ownLabel.trim() : text;
      if (resolved !== '') parts.push(resolved);
    }
    return parts.join(' ').trim();
  };

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
  const headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const headings: PageSnapshot['headings'] = [];
  const hiddenCounts = { headings: 0, images: 0, links: 0 };
  let headingsSeen = 0;
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
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
  const imageEls = doc.querySelectorAll('img');
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
      alt: alt === null ? null : alt.slice(0, 300),
    });
  });
  hiddenCounts.images = imagesHidden;

  // --- SVG stats ---------------------------------------------------------------
  const svgStats = { total: 0, unnamed: 0 };
  doc.querySelectorAll('svg[role="img" i]').forEach((svg) => {
    svgStats.total += 1;
    const title = (svg.querySelector('title')?.textContent ?? '').trim();
    const label = (svg.getAttribute('aria-label') ?? '').trim();
    const labelledBy = resolveLabelledBy(svg);
    if (title === '' && label === '' && labelledBy === '') svgStats.unnamed += 1;
  });

  // --- links -----------------------------------------------------------------
  const linkEls = doc.querySelectorAll('a[href]');
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
  doc.querySelectorAll('meta[name="description" i]').forEach((el) => {
    if (descriptionValues.length >= SNAPSHOT_LIMITS.descriptions) {
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
  doc.querySelectorAll('link[rel~="canonical" i]').forEach((el) => {
    if (canonicalValues.length >= SNAPSHOT_LIMITS.canonicals) {
      canonicalsOmitted += 1;
      return;
    }
    const href = el.getAttribute('href');
    if (href !== null && href.trim() !== '') {
      canonicalValues.push(href.trim().slice(0, 2000));
    }
  });

  const robotsValues: string[] = [];
  doc.querySelectorAll('meta[name="robots" i]').forEach((el) => {
    if (robotsValues.length >= SNAPSHOT_LIMITS.robotsValues) return;
    const content = el.getAttribute('content');
    if (content !== null && content.trim() !== '') {
      robotsValues.push(content.trim().slice(0, 500));
    }
  });

  const hreflangEntries: PageSnapshot['hreflang'] = [];
  let hreflangOmitted = 0;
  doc.querySelectorAll('link[rel~="alternate" i][hreflang]').forEach((el) => {
    if (hreflangEntries.length >= SNAPSHOT_LIMITS.hreflang) {
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
    charset: notBlank(doc.characterSet) ?? meta('meta[charset]'),
    lang: notBlank(doc.documentElement.getAttribute('lang'), 50),
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: meta('meta[property="og:image"]'),
    twitterCard: meta('meta[name="twitter:card" i]'),
    twitterTitle: meta('meta[name="twitter:title" i]'),
    twitterDescription: meta('meta[name="twitter:description" i]'),
    twitterImage: meta('meta[name="twitter:image" i]'),
  };

  // --- structured data ----------------------------------------------------------
  const jsonLdEls = doc.querySelectorAll('script[type="application/ld+json"]');
  const structuredData: PageSnapshot['structuredData'] = [];
  let structuredDataOmitted = 0;
  jsonLdEls.forEach((el) => {
    if (structuredData.length >= SNAPSHOT_LIMITS.structuredData) {
      structuredDataOmitted += 1;
      return;
    }
    const raw = (el.textContent ?? '').trim();
    if (raw !== '') structuredData.push({ raw: raw.slice(0, 10_000) });
  });

  // --- text stats (textContent — no layout in a detached document) --------------
  let sample = '';
  try {
    sample = (doc.body?.textContent ?? '').slice(0, SNAPSHOT_LIMITS.textSampleChars);
  } catch {
    sample = '';
  }
  const wordCount = (sample.match(/\S+/g) ?? []).length;

  const omitted = {
    headings: Math.max(0, headingsSeen - headings.length),
    images: Math.max(0, imageEls.length - imagesHidden - images.length),
    links: Math.max(0, linksSeen - links.length),
    descriptions: descriptionsOmitted,
    canonicals: canonicalsOmitted,
    structuredData: structuredDataOmitted,
    hreflang: hreflangOmitted,
  };

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    url,
    title: (doc.title ?? '').slice(0, 500),
    titleCount: doc.querySelectorAll('title').length,
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
    textStats: { wordCount, textSampleTruncated: sample.length >= SNAPSHOT_LIMITS.textSampleChars },
    extractedAt: new Date().toISOString(),
  };
}
