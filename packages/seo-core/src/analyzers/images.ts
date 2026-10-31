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
    return findings;
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

  return findings;
}
