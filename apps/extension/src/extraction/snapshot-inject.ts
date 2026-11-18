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
  descriptions: number;
  canonicals: number;
  robotsValues: number;
  structuredData: number;
  hreflang: number;
  keywords: number;
  leadTextWords: number;
  leadTextChars: number;
  mixedContentSamples: number;
  foldCandidates: number;
}

/**
 * One-shot page extraction (snapshot schema v6). Runs in the page's ISOLATED
 * world (no access to page JavaScript variables). Reads only what the SEO
 * analyzers need, caps every collection, and returns a plain serializable
 * object. Nothing is fetched and nothing is transmitted.
 *
 * IMPORTANT: this function is serialized with `func.toString()` and must be
 * fully self-contained — no references to module-level helpers or imports
 * (type-only imports are erased and therefore fine). The text-analysis
 * helpers below are embedded copies of packages/seo-core/src/text-summary.ts
 * (documented duplication; the pipeline e2e test guards self-containment).
 */
export function extractPageSnapshot(limits: ExtractorLimits): PageSnapshot {
  // === embedded-helpers:start — parity-tested copies of seo-core text-summary.ts
  // (do not reference anything outside this block from within it)
  const STOP_WORDS = [
    'a',
    'about',
    'above',
    'after',
    'again',
    'all',
    'am',
    'an',
    'and',
    'any',
    'are',
    'as',
    'at',
    'be',
    'because',
    'been',
    'before',
    'being',
    'below',
    'between',
    'both',
    'but',
    'by',
    'can',
    'did',
    'do',
    'does',
    'doing',
    'down',
    'during',
    'each',
    'few',
    'for',
    'from',
    'further',
    'had',
    'has',
    'have',
    'having',
    'he',
    'her',
    'here',
    'hers',
    'him',
    'his',
    'how',
    'i',
    'if',
    'in',
    'into',
    'is',
    'it',
    'its',
    'itself',
    'just',
    'me',
    'more',
    'most',
    'my',
    'no',
    'nor',
    'not',
    'now',
    'of',
    'off',
    'on',
    'once',
    'only',
    'or',
    'other',
    'our',
    'out',
    'over',
    'own',
    'same',
    'she',
    'should',
    'so',
    'some',
    'such',
    'than',
    'that',
    'the',
    'their',
    'them',
    'then',
    'there',
    'these',
    'they',
    'this',
    'those',
    'through',
    'to',
    'too',
    'under',
    'until',
    'up',
    'very',
    'was',
    'we',
    'were',
    'what',
    'when',
    'where',
    'which',
    'while',
    'who',
    'whom',
    'why',
    'will',
    'with',
    'you',
    'your',
    'yours',
  ];
  const stopSet = new Set(STOP_WORDS);
  const tokenize = (text: string): string[] =>
    (text.toLowerCase().match(/[a-z0-9\u00c0-\u024f']+/g) ?? []).map((word) =>
      word.replace(/^'+|'+$/g, ''),
    );
  const topKeywords = (text: string, limit: number) => {
    const tokens = tokenize(text).filter((word) => word !== '' && !stopSet.has(word));
    const counts = new Map<string, number>();
    const bump = (term: string) => counts.set(term, (counts.get(term) ?? 0) + 1);
    for (const word of tokens) bump(word);
    for (let i = 0; i + 1 < tokens.length; i += 1) bump(`${tokens[i]} ${tokens[i + 1]}`);
    for (let i = 0; i + 2 < tokens.length; i += 1) {
      bump(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
    return [...counts.entries()]
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
      .slice(0, limit);
  };
  const fnv1a64Hex = (text: string): string => {
    let hLow = 0x84222325;
    let hHigh = 0xcbf29ce4;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      hLow ^= code & 0xff;
      hLow = Math.imul(hLow, 0x01000193) >>> 0;
      hHigh ^= (code >>> 8) & 0xff;
      hHigh = Math.imul(hHigh, 0x01000193) >>> 0;
    }
    return hHigh.toString(16).padStart(8, '0') + hLow.toString(16).padStart(8, '0');
  };
  const countSentencesEmb = (text: string): number =>
    (text.match(/[.!?]+(\s|$)/g) ?? []).length || (text.trim() === '' ? 0 : 1);
  const countParagraphsEmb = (text: string): number =>
    text.split(/\n\s*\n/).filter((part) => part.trim() !== '').length;
  const estimateSyllablesEmb = (word: string): number => {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '');
    if (clean === '') return 0;
    if (clean.length <= 3) return 1;
    const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const groups = trimmed.match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups === null ? 1 : groups.length);
  };
  const countSyllablesEmb = (text: string): number =>
    (text.trim() === '' ? [] : text.trim().split(/\s+/)).reduce(
      (total, word) => total + estimateSyllablesEmb(word),
      0,
    );
  const extractLeadTextEmb = (text: string, wordLimit: number, charLimit: number): string =>
    wordLimit <= 0 || charLimit <= 0
      ? ''
      : text
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .slice(0, wordLimit)
          .join(' ')
          .slice(0, charLimit);
  // === embedded-helpers:end ===

  const notBlank = (value: string | null | undefined, max = 500): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, max) : null;
  };

  const meta = (selector: string): string | null =>
    notBlank(document.querySelector(selector)?.getAttribute('content'));

  /**
   * Deterministic hidden-content check: the hidden attribute, aria-hidden
   * ancestors, and inline display:none / visibility:hidden. Stylesheet-driven
   * hiding is intentionally not computed per element (documented limitation).
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

  const collectVisibleBodyText = (charLimit: number): string => {
    const root = document.body;
    if (root === null) return '';
    const parts: string[] = [];
    let charCount = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

  const formatFromSrc = (src: string): string => {
    const match = /\.(avif|webp|png|jpe?g|gif|bmp|svg)(?=$|[?#])/i.exec(src);
    const ext = match === null ? '' : (match[1] ?? '');
    const lowered = ext.toLowerCase();
    return lowered === 'jpeg' ? 'jpeg' : lowered;
  };

  // --- headings --------------------------------------------------------------
  const headingCounts: HeadingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const headings: PageSnapshot['headings'] = [];
  const hiddenCounts = { headings: 0, images: 0, links: 0 };
  let headingsSeen = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el, locatorIndex) => {
    const tag = el.tagName.toLowerCase() as PageSnapshot['headings'][number]['tag'];
    if (isHidden(el)) {
      hiddenCounts.headings += 1;
      return;
    }
    headingCounts[tag] += 1;
    headingsSeen += 1;
    if (headings.length < limits.headings) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      headings.push({
        tag,
        text: text.slice(0, limits.textField),
        locator: locatorIndex <= 100_000 ? { kind: 'heading', nthIndex: locatorIndex } : null,
      });
    }
  });

  // --- images (v4: performance attributes + above-fold candidates) ------------
  const imageEls = document.querySelectorAll('img');
  const images: PageSnapshot['images'] = [];
  let imagesHidden = 0;
  const isHttps = location.protocol === 'https:';
  const mixedContentSamples: string[] = [];
  imageEls.forEach((el, locatorIndex) => {
    if (isHidden(el)) {
      imagesHidden += 1;
      return;
    }
    const src = (el.getAttribute('src') ?? el.getAttribute('data-src') ?? '').trim();
    let foldIndex: number | null = null;
    if (images.length < limits.foldCandidates) {
      try {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 900) {
          foldIndex = images.length;
        }
      } catch {
        foldIndex = null; // layout not available — documented limitation
      }
    }
    if (images.length < limits.images) {
      const alt = el.getAttribute('alt');
      const parent = el.parentElement;
      const inPicture =
        parent !== null &&
        (parent.tagName === 'PICTURE' || parent.querySelectorAll('source[srcset]').length > 0);
      images.push({
        src: src.slice(0, 500),
        // null = no alt attribute; '' = explicitly empty (decorative)
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
        foldIndex,
        locator: locatorIndex <= 100_000 ? { kind: 'image', nthIndex: locatorIndex } : null,
      });
    }
    // Mixed-content detection: http:// subresources on an https page.
    if (
      isHttps &&
      src.toLowerCase().startsWith('http://') &&
      mixedContentSamples.length < limits.mixedContentSamples
    ) {
      mixedContentSamples.push(src.slice(0, 2_000));
    }
  });
  hiddenCounts.images = imagesHidden;

  // --- inline SVG accessibility (deterministic subset) ------------------------
  const svgStats = { total: 0, unnamed: 0 };
  document.querySelectorAll('svg[role="img" i]').forEach((svg) => {
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
  const linkEls = document.querySelectorAll('a[href]');
  const links: PageSnapshot['links'] = [];
  let linksSeen = 0;
  linkEls.forEach((el, locatorIndex) => {
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
      locator: locatorIndex <= 100_000 ? { kind: 'link', nthIndex: locatorIndex } : null,
    });
  });

  // --- head metadata -----------------------------------------------------------
  const descriptionValues: string[] = [];
  let descriptionsOmitted = 0;
  document.querySelectorAll('meta[name="description" i]').forEach((el) => {
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
  document.querySelectorAll('link[rel~="canonical" i]').forEach((el) => {
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
  document.querySelectorAll('meta[name="robots" i]').forEach((el) => {
    if (robotsValues.length >= limits.robotsValues) return;
    const content = el.getAttribute('content');
    if (content !== null && content.trim() !== '') {
      robotsValues.push(content.trim().slice(0, 500));
    }
  });

  const hreflangEntries: PageSnapshot['hreflang'] = [];
  let hreflangOmitted = 0;
  document.querySelectorAll('link[rel~="alternate" i][hreflang]').forEach((el) => {
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
  document.querySelectorAll('link[rel~="icon" i]').forEach((el) => {
    const href = (el.getAttribute('href') ?? '').trim();
    if (href !== '') faviconPresent = true;
  });

  let paginationPrev: string | null = null;
  let paginationNext: string | null = null;
  document.querySelectorAll('link[rel~="prev" i], link[rel~="next" i]').forEach((el) => {
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
    charset: notBlank(document.characterSet) ?? meta('meta[charset]'),
    lang: notBlank(document.documentElement.getAttribute('lang'), 50),
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

  // --- structured data (JSON-LD) ---------------------------------------------
  const jsonLdEls = document.querySelectorAll('script[type="application/ld+json"]');
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
  document.querySelectorAll('[itemscope][itemtype], [typeof]').forEach((el) => {
    if (microdataRdfaTypes.length >= 10) return;
    const itemtype = (el.getAttribute('itemtype') ?? '').trim();
    const typeofAttr = (el.getAttribute('typeof') ?? '').trim();
    const value = itemtype !== '' ? itemtype : typeofAttr;
    if (value !== '') microdataRdfaTypes.push(value.slice(0, 200));
  });

  // --- body text sample + content summary --------------------------------------
  let sample = '';
  try {
    sample = (document.body?.innerText ?? '').slice(0, limits.textSampleChars);
  } catch {
    sample = '';
  }
  const wordCount = (sample.match(/\S+/g) ?? []).length;
  const sentenceCount = countSentencesEmb(sample);
  const paragraphCount = countParagraphsEmb(sample);
  const syllableCount = countSyllablesEmb(sample);
  const leadText = extractLeadTextEmb(
    collectVisibleBodyText(limits.leadTextChars),
    limits.leadTextWords,
    limits.leadTextChars,
  );

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
    // Keep in sync with SNAPSHOT_SCHEMA_VERSION in @vittix/shared.
    schemaVersion: 6,
    url: location.href,
    title: (document.title ?? '').slice(0, 500),
    titleCount: (() => {
      const head = document.head;
      if (!head) return document.querySelectorAll('title').length;
      let count = 0;
      head.querySelectorAll('title').forEach((el) => {
        if (el.namespaceURI === 'http://www.w3.org/1999/xhtml') count += 1;
      });
      return count;
    })(),
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
      keywords: topKeywords(sample, limits.keywords),
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
