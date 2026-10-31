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
 * v2 (Phase 1) added: titleCount, descriptions[], canonicals[],
 * links[].accessibleName, twitter:* meta fields, structuredData[] and
 * structuredDataCount. All v2 fields carry defaults, so v1 records stored
 * by Phase 0 remain readable (the schema accepts both versions).
 */
export const SNAPSHOT_SCHEMA_VERSION = 2;

/** Snapshot versions the schema can still read (legacy stored audits). */
export const SNAPSHOT_SCHEMA_VERSIONS = [1, 2] as const;

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
} as const;
