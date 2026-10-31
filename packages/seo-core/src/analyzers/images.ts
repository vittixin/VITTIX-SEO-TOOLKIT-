import type { Finding, PageSnapshot } from '@vittix/shared';
import { ALT_MIN_MEANINGFUL_LENGTH } from '../rules.js';
import { finding } from './util.js';

const FILENAME_LIKE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;
const GENERIC_ALT = /^(image|photo|picture|img|icon|logo|graphic|banner|spacer|dummy)\s*\d*$/i;

/**
 * Image accessibility rules.
 *
 * Three separate concerns, deliberately split so one image is never
 * penalized twice:
 *  - image-alt-present (error): images with NO alt attribute at all
 *  - image-alt-empty   (info):  images with an explicitly empty alt=""
 *                              (the correct pattern for decorative images —
 *                              informational, never score-affecting)
 *  - image-alt-quality (warn):  present-but-possibly-uninformative alt text
 *                              (filename-like, generic words, very short).
 *                              Hedged language on purpose: we classify text
 *                              patterns, we do not understand image intent.
 */
export function analyzeImages(snapshot: PageSnapshot): Finding[] {
  if (snapshot.imageCount === 0) {
    return [
      finding(
        'image-alt-present',
        'images',
        'info',
        'No images found',
        'This page contains no <img> elements, so there is no alt-text risk.',
      ),
    ];
  }

  const truncated = snapshot.imageCount > snapshot.images.length;
  const checkedNote = truncated
    ? `${snapshot.images.length} of ${snapshot.imageCount} images checked (extraction is capped at ${snapshot.images.length} for very large pages)`
    : `${snapshot.images.length} images checked`;

  const missingAttr = snapshot.images.filter((image) => image.alt === null);
  const emptyAlt = snapshot.images.filter((image) => image.alt === '');
  const presentAlt = snapshot.images.filter(
    (image) => image.alt !== null && image.alt.trim() !== '',
  );

  // --- missing alt attribute -------------------------------------------------
  const findings: Finding[] = [];
  if (missingAttr.length === 0) {
    findings.push(
      finding(
        'image-alt-present',
        'images',
        'pass',
        'All images have an alt attribute',
        `${checkedNote}, and every image declares an alt attribute.`,
      ),
    );
  } else {
    findings.push(
      finding(
        'image-alt-present',
        'images',
        'error',
        `${missingAttr.length} ${missingAttr.length === 1 ? 'image is' : 'images are'} missing the alt attribute`,
        `The alt attribute is missing entirely on these images. Screen readers fall back to the filename, and image search cannot classify them. ${checkedNote}${truncated ? ', so this may undercount' : ''}.`,
        {
          evidence:
            missingAttr
              .slice(0, 3)
              .map((image) => image.src)
              .join(', ') + (missingAttr.length > 3 ? `, … (${missingAttr.length} total)` : ''),
          remediation:
            'Add alt="…" to every <img>. Describe the image content; use alt="" only for purely decorative images.',
          // Affected/checked ratio drives penalty scaling in the scorer.
          ratio: snapshot.images.length > 0 ? missingAttr.length / snapshot.images.length : 1,
        },
      ),
    );
  }

  // --- explicitly empty alt (decorative) --------------------------------------
  if (emptyAlt.length > 0) {
    findings.push(
      finding(
        'image-alt-empty',
        'images',
        'info',
        `${emptyAlt.length} ${emptyAlt.length === 1 ? 'image uses' : 'images use'} an explicitly empty alt (alt="")`,
        'An explicitly empty alt attribute is the recommended pattern for purely decorative images: it tells assistive technology to skip them. This is an observation, not a problem, and it does not affect the score.',
        {
          evidence:
            emptyAlt
              .slice(0, 3)
              .map((image) => image.src)
              .join(', ') + (emptyAlt.length > 3 ? `, … (${emptyAlt.length} total)` : ''),
          remediation:
            'No action needed if these images are decorative. If any carries information, give it descriptive alt text.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'image-alt-empty',
        'images',
        'pass',
        'No empty-alt images',
        `${checkedNote}; none use the decorative empty-alt pattern.`,
      ),
    );
  }

  // --- alt quality ------------------------------------------------------------
  if (presentAlt.length === 0) {
    findings.push(
      finding(
        'image-alt-quality',
        'images',
        'info',
        'No descriptive alt text to assess',
        `No image on this page has non-empty alt text, so there is nothing to classify. ${checkedNote}.`,
      ),
    );
    return [...findings, ...imagePerformanceRules(snapshot)];
  }

  const weak = presentAlt.filter((image) => {
    const alt = (image.alt ?? '').trim();
    if (alt.length < ALT_MIN_MEANINGFUL_LENGTH) return true;
    if (FILENAME_LIKE.test(alt)) return true;
    if (GENERIC_ALT.test(alt)) return true;
    return false;
  });

  if (weak.length > 0) {
    findings.push(
      finding(
        'image-alt-quality',
        'images',
        'warn',
        `${weak.length} alt ${weak.length === 1 ? 'value looks' : 'values look'} possibly uninformative`,
        `These alt values match patterns that rarely describe the image: filenames ("photo1.png"), generic labels ("image", "logo") or very short text. This is a heuristic classification of the text only — Vittix does not understand the actual image. ${checkedNote}.`,
        {
          evidence:
            weak
              .slice(0, 3)
              .map((image) => `${image.src} → "${image.alt?.trim().slice(0, 40)}"`)
              .join(', ') + (weak.length > 3 ? `, … (${weak.length} total)` : ''),
          remediation:
            'Replace filename-like or generic alt text with a short description of what the image shows.',
          // Affected/checked ratio drives penalty scaling in the scorer.
          ratio: presentAlt.length > 0 ? weak.length / presentAlt.length : 1,
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'image-alt-quality',
        'images',
        'pass',
        'Alt text looks descriptive',
        `${presentAlt.length} non-empty alt ${presentAlt.length === 1 ? 'value' : 'values'} checked; none matched filename-like or generic patterns.`,
      ),
    );
  }

  return [...findings, ...imagePerformanceRules(snapshot)];
}

/**
 * Image performance heuristics (v0.5.0). These are layout-markup heuristics
 * based on extracted attributes — NOT performance measurements (no fetching,
 * no Lighthouse). Wording is hedged accordingly.
 */
function imagePerformanceRules(snapshot: PageSnapshot): Finding[] {
  const images = snapshot.images;
  if (images.length === 0) return [];

  const findings: Finding[] = [];

  // --- dimensions missing (layout-shift risk) ----------------------------------
  const contentImages = images.filter(
    (image) => (image.alt ?? '').trim() !== '' || !image.inPicture,
  );
  const noDimensions = contentImages.filter(
    (image) => image.width === null || image.height === null,
  );
  if (noDimensions.length > 0) {
    const ratio = contentImages.length > 0 ? noDimensions.length / contentImages.length : 1;
    findings.push(
      finding(
        'image-dimensions-missing',
        'images',
        'warn',
        `${noDimensions.length} image${noDimensions.length === 1 ? '' : 's'} without width/height attributes`,
        'Images without width/height attributes can cause layout shift (CLS) while the page loads: the browser cannot reserve space before the image arrives. Setting intrinsic dimensions is a cheap, reliable fix. This is a markup heuristic, not a measured performance result.',
        {
          evidence:
            noDimensions
              .slice(0, 3)
              .map((image) => image.src)
              .join(', ') + (noDimensions.length > 3 ? `, … (${noDimensions.length} total)` : ''),
          remediation:
            'Add width and height attributes (or an aspect-ratio CSS rule) so the browser reserves space.',
          ratio,
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'image-dimensions-missing',
        'images',
        'pass',
        'All images declare dimensions',
        `${contentImages.length} content images checked.`,
      ),
    );
  }

  // --- lazy loading --------------------------------------------------------------
  const aboveFold = images.filter((image) => image.foldIndex !== null);
  const lazyAboveFold = aboveFold.filter((image) => (image.loading ?? '').toLowerCase() === 'lazy');
  if (lazyAboveFold.length > 0) {
    findings.push(
      finding(
        'image-lazy-loading',
        'images',
        'warn',
        'Above-the-fold image uses loading="lazy"',
        'Lazy-loading an above-the-fold image delays the Largest Contentful Paint: the browser must finish layout before discovering the image. Lazy-loading is for BELOW-the-fold images. Above-the-fold detection is a bounded heuristic (first images measured in the viewport at extraction), not a lab measurement.',
        {
          evidence: lazyAboveFold
            .slice(0, 3)
            .map((image) => image.src)
            .join(', '),
          remediation:
            'Remove loading="lazy" from above-the-fold images; keep it for images further down.',
        },
      ),
    );
  }
  const belowFoldCandidates = images.filter(
    (image) =>
      image.foldIndex === null &&
      (image.loading ?? '').toLowerCase() !== 'lazy' &&
      image.format !== 'svg',
  );
  if (belowFoldCandidates.length > 0) {
    findings.push(
      finding(
        'image-lazy-loading',
        'images',
        'info',
        `${belowFoldCandidates.length} image${belowFoldCandidates.length === 1 ? '' : 's'} could benefit from loading="lazy"`,
        'These images were not identified as above-the-fold candidates and do not use loading="lazy". Adding it defers offscreen downloads. Heuristic: pages where content starts below the fold may still want these eager; the above-fold detection is bounded and approximate.',
        {
          evidence:
            belowFoldCandidates
              .slice(0, 3)
              .map((image) => image.src)
              .join(', ') +
            (belowFoldCandidates.length > 3 ? `, … (${belowFoldCandidates.length} total)` : ''),
          remediation: 'Add loading="lazy" to images that start below the viewport.',
        },
      ),
    );
  } else if (aboveFold.length > 0 && lazyAboveFold.length === 0) {
    findings.push(
      finding(
        'image-lazy-loading',
        'images',
        'pass',
        'Lazy-loading usage looks sensible',
        'No above-the-fold image is lazy-loaded; below-fold images use it where detected.',
      ),
    );
  }

  // --- modern formats --------------------------------------------------------------
  const legacy = images.filter(
    (image) =>
      (image.format === 'jpeg' ||
        image.format === 'png' ||
        image.format === 'gif' ||
        image.format === 'bmp') &&
      !image.inPicture &&
      !image.srcset,
  );
  if (legacy.length > 0) {
    findings.push(
      finding(
        'image-modern-format',
        'images',
        'info',
        `${legacy.length} legacy-format image${legacy.length === 1 ? '' : 's'} without modern alternatives`,
        'JPEG/PNG/GIF/BMP images without a <picture> wrapper or srcset give up the size savings of AVIF/WebP. Serving modern formats typically cuts image bytes 20–50%. This is a source-extension heuristic — servers can serve modern formats from .jpg URLs, so treat it as a lead, not a verdict.',
        {
          evidence:
            legacy
              .slice(0, 3)
              .map((image) => image.src)
              .join(', ') + (legacy.length > 3 ? `, … (${legacy.length} total)` : ''),
          remediation:
            'Serve AVIF/WebP via <picture> or content negotiation, with the legacy format as fallback.',
        },
      ),
    );
  } else if (images.length > 0) {
    findings.push(
      finding(
        'image-modern-format',
        'images',
        'pass',
        'No legacy-format images without alternatives',
        `${images.length} images checked.`,
      ),
    );
  }

  // --- srcset on large images ----------------------------------------------------
  const largeImages = images.filter((image) => {
    const width = Number(image.width);
    return Number.isFinite(width) && width >= 400;
  });
  const noSrcset = largeImages.filter((image) => !image.srcset);
  if (noSrcset.length > 0) {
    findings.push(
      finding(
        'image-srcset-missing',
        'images',
        'info',
        `${noSrcset.length} large image${noSrcset.length === 1 ? '' : 's'} without srcset`,
        'Images declared at 400px width or more without srcset serve the same file to every device. srcset/sizes let high-DPI phones fetch a sharp version while small screens save bandwidth. Only images with an explicit width attribute are assessed.',
        {
          evidence:
            noSrcset
              .slice(0, 3)
              .map((image) => image.src)
              .join(', ') + (noSrcset.length > 3 ? `, … (${noSrcset.length} total)` : ''),
          remediation:
            'Provide a srcset with multiple widths plus a sizes attribute describing the layout width.',
        },
      ),
    );
  } else if (largeImages.length > 0) {
    findings.push(
      finding(
        'image-srcset-missing',
        'images',
        'pass',
        'Large images provide srcset',
        `${largeImages.length} large images checked.`,
      ),
    );
  }

  return findings;
}
