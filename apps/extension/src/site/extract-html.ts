import type { ExtractorLimits } from '../extraction/snapshot-inject';
import { EXTRACTOR_LIMITS } from '../extraction/limits';
import type { PageMeta, PageSnapshot } from '@vittix/shared';
import { SNAPSHOT_SCHEMA_VERSION } from '@vittix/shared';
import {
  countParagraphs,
  countSentences,
  countSyllables,
  extractLeadText,
  fnv1a64Hex,
  topKeywords,
} from '@vittix/seo-core';

export type SiteExtractorLimits = ExtractorLimits;

/** Visible text used only to compute bounded hashes; raw text is not persisted. */
export function extractVisibleTextForSimilarity(html: string, charLimit = 50_000): string {
  const doc = new DOMParser().parseFromString(html.slice(0, 2_000_000), 'text/html');
  const parts: string[] = [];
  const hidden = (el: Element): boolean => {
    if (el.closest('[hidden], [aria-hidden="true"]')) return true;
    const style = (el.getAttribute('style') ?? '').toLowerCase();
    return (
      /(^|;)\s*display\s*:\s*none/.test(style) || /(^|;)\s*visibility\s*:\s*hidden/.test(style)
    );
  };
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let size = 0;
  while (node && size < charLimit) {
    let parent = node.parentElement;
    let skip = false;
    while (parent) {
      if (hidden(parent) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) {
        skip = true;
        break;
      }
      parent = parent.parentElement;
    }
    const chunk = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    if (!skip && chunk) {
      const clipped = chunk.slice(0, charLimit - size);
      parts.push(clipped);
      size += clipped.length + 1;
    }
    node = walker.nextNode();
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, charLimit);
}

function notBlankGlobal(value: string | null | undefined, max = 500): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function metaCharsetFromDoc(doc: Document): string | null {
  const metaCharset = doc.querySelector('meta[charset]')?.getAttribute('charset');
  if (metaCharset && metaCharset.trim() !== '') return metaCharset.trim();
  const httpEquiv = doc.querySelector(
    'meta[http-equiv="content-type" i], meta[http-equiv=\'content-type\' i]',
  );
  const content = httpEquiv?.getAttribute('content') ?? '';
  const m = /charset\s*=\s*([a-zA-Z0-9._:-]+)/i.exec(content);
  return m ? (m[1] ?? null) : null;
}

/**
 * Snapshot extraction for FETCHED HTML (site mode).
 *
 * Runs in the dashboard page (full DOM available — DOMParser works there;
 * it does not exist in service workers, which is why site-mode
 * orchestration lives in the dashboard, see docs/SITE_AUDIT.md).
 *
 * Differences vs. the live-DOM injector (documented):
 *  - word count uses visible text (no layout / innerText in a detached doc)
 *  - stylesheet-driven hiding cannot apply; the same inline
 *    display:none/visibility:hidden checks are used
 *  - elements inside <noscript>/<template> are excluded from counted content
 * Everything else (aria-labelledby resolution, hidden counts, hreflang,
 * SVG stats, per-collection omitted counts) mirrors the live injector.
 */
export function parsePageSnapshot(
  html: string,
  url: string,
  limits: SiteExtractorLimits = EXTRACTOR_LIMITS,
  options: { charset?: string | null } = {},
): PageSnapshot {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // In site mode the decoded charset is provided by the fetcher (Content-Type /
  // meta sniff / UTF-8 fallback). Do not report DOMParser's characterSet.
  const detectedCharset =
    notBlankGlobal(options.charset) ?? metaCharsetFromDoc(doc) ?? 'utf-8';
  const inNoscriptOrTemplate = (el: Element): boolean => el.closest('noscript, template') !== null;
  const headTitleCount = (): number => {
    const head = doc.head;
    if (!head) return doc.querySelectorAll('title').length;
    let count = 0;
    head.querySelectorAll('title').forEach((el) => {
      // Count only HTML <title> elements in head (exclude inline SVG <title>).
      if (el.namespaceURI === 'http://www.w3.org/1999/xhtml') count += 1;
    });
    return count;
  };

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

  const collectVisibleBodyText = (charLimit: number): string => {
    const root = doc.body;
    if (root === null) return '';
    const parts: string[] = [];
    let charCount = 0;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node !== null && charCount < charLimit + 1) {
      let parent = node.parentElement;
      let hidden = false;
      while (parent !== null) {
        if (
          isHidden(parent) ||
          ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)
        ) {
          hidden = true;
          break;
        }
        parent = parent.parentElement;
      }
      const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
      if (!hidden && text !== '') {
        const remaining = Math.max(0, charLimit + 1 - charCount);
        const clipped = text.slice(0, remaining);
        if (clipped !== '') {
          parts.push(clipped);
          charCount += clipped.length + 1;
        }
      }
      node = walker.nextNode();
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
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
      const svgTitleEl = svg.querySelector('title');
      const svgTitle =
        svgTitleEl && svgTitleEl.closest('noscript, template') === null
          ? pick(svgTitleEl.textContent)
          : '';
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
    if (inNoscriptOrTemplate(el)) return;
    const tag = el.tagName.toLowerCase() as PageSnapshot['headings'][number]['tag'];
    if (isHidden(el)) {
      hiddenCounts.headings += 1;
      return;
    }
    headingCounts[tag] += 1;
    headingsSeen += 1;
    if (headings.length < limits.headings) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      headings.push({ tag, text: text.slice(0, limits.textField), locator: null });
    }
  });

  // --- images (v4: performance attributes; foldIndex unavailable here) -------
  const imageEls = doc.querySelectorAll('img');
  const images: PageSnapshot['images'] = [];
  let imagesHidden = 0;
  const isHttpsPage = url.toLowerCase().startsWith('https://');
  const mixedContentSamples: string[] = [];
  const formatFromSrc = (src: string): string => {
    const match = /\.(avif|webp|png|jpe?g|gif|bmp|svg)(?=$|[?#])/i.exec(src);
    const ext = match === null ? '' : (match[1] ?? '');
    const lowered = ext.toLowerCase();
    return lowered === 'jpeg' ? 'jpeg' : lowered;
  };
  imageEls.forEach((el) => {
    if (inNoscriptOrTemplate(el)) return;
    if (isHidden(el)) {
      imagesHidden += 1;
      return;
    }
    const src = (el.getAttribute('src') ?? el.getAttribute('data-src') ?? '').trim();
    if (images.length < limits.images) {
      const alt = el.getAttribute('alt');
      const parent = el.parentElement;
      const inPicture =
        parent !== null &&
        (parent.tagName === 'PICTURE' || parent.querySelectorAll('source[srcset]').length > 0);
      images.push({
        src: src.slice(0, 500),
        alt: alt === null ? null : alt.slice(0, 300),
        width: notBlank(el.getAttribute('width'), 20),
        height: notBlank(el.getAttribute('height'), 20),
        loading: notBlank(el.getAttribute('loading'), 10),
        decoding: notBlank(el.getAttribute('decoding'), 10),
        srcset: el.hasAttribute('srcset'),
        sizes: notBlank(el.getAttribute('sizes'), 200),
        inPicture,
        fetchpriority: notBlank(el.getAttribute('fetchpriority'), 10),
        format: formatFromSrc(src),
        foldIndex: null,
        locator: null,
      });
    }
    if (
      isHttpsPage &&
      src.toLowerCase().startsWith('http://') &&
      mixedContentSamples.length < limits.mixedContentSamples
    ) {
      mixedContentSamples.push(src.slice(0, 2000));
    }
  });
  hiddenCounts.images = imagesHidden;

  // --- SVG stats ---------------------------------------------------------------
  const svgStats = { total: 0, unnamed: 0 };
  doc.querySelectorAll('svg[role="img" i]').forEach((svg) => {
    if (inNoscriptOrTemplate(svg)) return;
    svgStats.total += 1;
    const titleEl = svg.querySelector('title');
    const title =
      titleEl && titleEl.closest('noscript, template') === null
        ? (titleEl.textContent ?? '').trim()
        : '';
    const label = (svg.getAttribute('aria-label') ?? '').trim();
    const labelledBy = resolveLabelledBy(svg);
    if (title === '' && label === '' && labelledBy === '') svgStats.unnamed += 1;
  });

  // --- links -----------------------------------------------------------------
  const linkEls = doc.querySelectorAll('a[href]');
  const links: PageSnapshot['links'] = [];
  let linksSeen = 0;
  linkEls.forEach((el) => {
    if (inNoscriptOrTemplate(el)) return;
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
      locator: null,
    });
  });

  // --- head metadata -----------------------------------------------------------
  const descriptionValues: string[] = [];
  let descriptionsOmitted = 0;
  doc.querySelectorAll('meta[name="description" i]').forEach((el) => {
    if (descriptionValues.length >= limits.descriptions) {
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
    if (canonicalValues.length >= limits.canonicals) {
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
    if (robotsValues.length >= limits.robotsValues) return;
    const content = el.getAttribute('content');
    if (content !== null && content.trim() !== '') {
      robotsValues.push(content.trim().slice(0, 500));
    }
  });

  const hreflangEntries: PageSnapshot['hreflang'] = [];
  let hreflangOmitted = 0;
  doc.querySelectorAll('link[rel~="alternate" i][hreflang]').forEach((el) => {
    if (hreflangEntries.length >= limits.hreflang) {
      hreflangOmitted += 1;
      return;
    }
    const lang = (el.getAttribute('hreflang') ?? '').trim();
    const href = (el.getAttribute('href') ?? '').trim();
    if (lang !== '') {
      hreflangEntries.push({ lang: lang.slice(0, 35), href: href.slice(0, 2000) });
    }
  });

  // v4: favicon + pagination
  let faviconPresent = false;
  doc.querySelectorAll('link[rel~="icon" i]').forEach((el) => {
    const href = (el.getAttribute('href') ?? '').trim();
    if (href !== '') faviconPresent = true;
  });

  let paginationPrev: string | null = null;
  let paginationNext: string | null = null;
  doc.querySelectorAll('link[rel~="prev" i], link[rel~="next" i]').forEach((el) => {
    const rel = (el.getAttribute('rel') ?? '').toLowerCase();
    const href = (el.getAttribute('href') ?? '').trim();
    if (href === '') return;
    if (rel === 'prev' && paginationPrev === null) paginationPrev = href.slice(0, 2000);
    if (rel === 'next' && paginationNext === null) paginationNext = href.slice(0, 2000);
  });

  const pageMeta: PageMeta = {
    description: descriptionValues[0] ?? null,
    canonical: canonicalValues[0] ?? null,
    robots: robotsValues[0] ?? null,
    viewport: meta('meta[name="viewport" i]'),
    charset: detectedCharset ?? meta('meta[charset]'),
    lang: notBlank(doc.documentElement.getAttribute('lang'), 50),
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: meta('meta[property="og:image"]'),
    twitterCard: meta('meta[name="twitter:card" i]'),
    twitterTitle: meta('meta[name="twitter:title" i]'),
    twitterDescription: meta('meta[name="twitter:description" i]'),
    twitterImage: meta('meta[name="twitter:image" i]'),
    ogSiteName: meta('meta[property="og:site_name"]'),
    ogUrl: meta('meta[property="og:url"]'),
  };

  // --- structured data ----------------------------------------------------------
  const jsonLdEls = doc.querySelectorAll('script[type="application/ld+json"]');
  const structuredData: PageSnapshot['structuredData'] = [];
  let structuredDataOmitted = 0;
  jsonLdEls.forEach((el) => {
    if (structuredData.length >= limits.structuredData) {
      structuredDataOmitted += 1;
      return;
    }
    const raw = (el.textContent ?? '').trim();
    if (raw !== '') structuredData.push({ raw: raw.slice(0, 10_000) });
  });

  // --- microdata / RDFa type detection (v4, bounded, detected types only) -----
  const microdataRdfaTypes: string[] = [];
  doc.querySelectorAll('[itemscope][itemtype], [typeof]').forEach((el) => {
    if (microdataRdfaTypes.length >= 10) return;
    const itemtype = (el.getAttribute('itemtype') ?? '').trim();
    const typeofAttr = (el.getAttribute('typeof') ?? '').trim();
    const value = itemtype !== '' ? itemtype : typeofAttr;
    if (value !== '') microdataRdfaTypes.push(value.slice(0, 200));
  });

  // --- text stats + content summary from visible text only ----------------------
  // Visible text excludes SCRIPT/STYLE/NOSCRIPT/TEMPLATE and hidden nodes, so
  // word counts, sentence/paragraph/syllable stats, keywords and the sample hash
  // are derived from content users/bots can see (not inline scripts or JSON).
  const leadText = extractLeadText(
    collectVisibleBodyText(limits.leadTextChars),
    limits.leadTextWords,
    limits.leadTextChars,
  );
  const sample = collectVisibleBodyText(limits.textSampleChars);
  const wordCount = (sample.match(/\S+/g) ?? []).length;
  const sentenceCount = countSentences(sample) || 0;
  const paragraphCount = countParagraphs(sample);
  const syllableCount = countSyllables(sample);

  const omitted = {
    headings: Math.max(0, headingsSeen - headings.length),
    images: Math.max(0, imageEls.length - imagesHidden - images.length),
    links: Math.max(0, linksSeen - links.length),
    descriptions: descriptionsOmitted,
    canonicals: canonicalsOmitted,
    structuredData: structuredDataOmitted,
    hreflang: hreflangOmitted,
  };

  const pageLang = pageMeta.lang;

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    url,
    title: (doc.title ?? '').slice(0, 500),
    titleCount: headTitleCount(),
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
    textSummary: {
      sentenceCount,
      paragraphCount,
      keywords: topKeywords(sample, pageLang, limits.keywords),
      sampleHash: fnv1a64Hex(sample),
      syllableCount,
      leadText,
    },
    mixedContentSamples,
    faviconPresent,
    pagination: { prev: paginationPrev, next: paginationNext },
    microdataRdfaTypes,
    extractedAt: new Date().toISOString(),
  };
}
