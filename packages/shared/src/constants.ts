/**
 * Project-wide constants. No runtime dependencies allowed in this package
 * beyond Zod.
 */
export const EXTENSION_NAME = 'Vittix SEO Toolkit';

/** IndexedDB database name used by the extension (Dexie). */
export const DB_NAME = 'vittix-seo';

/**
 * Current page-snapshot schema version. Bump when adding snapshot fields.
 *
 * - v2: titleCount, descriptions[], canonicals[], links[].accessibleName,
 *   twitter:* meta fields, structuredData[].
 * - v3: hreflang[]/hreflangCount, robotsValues[], omitted{} (per-collection
 *   counts of capped-away elements), hidden{} (per-collection counts of
 *   hidden elements), svg{} (inline SVG accessibility stats),
 *   textStats.textSampleTruncated.
 * - v4: meta.ogSiteName/ogUrl, textSummary{} (sentence/paragraph counts,
 *   top keyword frequencies, sample hash), extended image attributes
 *   (dimensions, loading/decoding/srcset/sizes, picture, fetchpriority,
 *   format, above-fold index), mixedContentSamples[], faviconPresent,
 *   pagination{prev,next}.
 * - v5: textSummary.syllableCount and a locally stored leadText excerpt
 *   (first 100 visible words, whitespace-normalized, capped at 800 chars).
 * - v6: nullable element locators for captured headings, images, and links.
 *
 * All v2/v3/v4/v5/v6 additions carry defaults, so records stored by earlier
 * versions remain readable (the schema accepts all six versions). See
 * docs/ROADMAP.md for the changelog of when each version landed.
 */
export const SNAPSHOT_SCHEMA_VERSION = 6;

/** Snapshot versions the schema can still read (legacy stored audits). */
export const SNAPSHOT_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Hard bounds applied while extracting a page so that audits stay small and
 * deterministic regardless of page size.
 */
export const SNAPSHOT_LIMITS = {
  /** Maximum heading elements retained. */
  headings: 300,
  /** Maximum image entries retained. */
  images: 500,
  /** Maximum link entries retained. */
  links: 500,
  /** Maximum characters of body text sampled for word counting. */
  textSampleChars: 100_000,
  /** Maximum characters stored for a single text field (heading/link text). */
  textField: 300,
  /** Maximum meta-description values retained. */
  descriptions: 5,
  /** Maximum canonical link values retained. */
  canonicals: 5,
  /** Maximum JSON-LD script blocks retained. */
  structuredData: 5,
  /** Maximum robots meta values retained. */
  robotsValues: 5,
  /** Maximum hreflang entries retained. */
  hreflang: 10,
  /** Maximum keyword frequencies retained in the content summary. */
  keywords: 20,
  /** Maximum visible words retained for keyword prominence. */
  leadTextWords: 100,
  /** Maximum characters retained for the lead-text excerpt. */
  leadTextChars: 800,
  /** Maximum http:// resource samples retained on https pages. */
  mixedContentSamples: 10,
  /** Maximum images measured as above-the-fold candidates. */
  foldCandidates: 20,
} as const;
