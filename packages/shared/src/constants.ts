/**
 * Project-wide constants. No runtime dependencies allowed in this package
 * beyond Zod.
 */
export const EXTENSION_NAME = 'Vittix SEO Toolkit';

/** IndexedDB database name used by the extension (Dexie). */
export const DB_NAME = 'vittix-seo';

/**
 * Current page-snapshot schema version. Bump on breaking changes.
 *
 * - v2: titleCount, descriptions[], canonicals[], links[].accessibleName,
 *   twitter:* meta fields, structuredData[].
 * - v3: hreflang[]/hreflangCount, robotsValues[], omitted{} (per-collection
 *   counts of capped-away elements), hidden{} (per-collection counts of
 *   hidden elements), svg{} (inline SVG accessibility stats),
 *   textStats.textSampleTruncated.
 *
 * All v2/v3 fields carry defaults, so v1 and v2 records stored by earlier
 * versions remain readable (the schema accepts all three versions).
 * See docs/ROADMAP.md for the changelog of when each version landed.
 */
export const SNAPSHOT_SCHEMA_VERSION = 3;

/** Snapshot versions the schema can still read (legacy stored audits). */
export const SNAPSHOT_SCHEMA_VERSIONS = [1, 2, 3] as const;

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
} as const;
