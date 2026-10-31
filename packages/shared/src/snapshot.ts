import { z } from 'zod';
import { SNAPSHOT_LIMITS, SNAPSHOT_SCHEMA_VERSION, SNAPSHOT_SCHEMA_VERSIONS } from './constants.js';

const nonNegativeInt = z.number().int().nonnegative();

export const HeadingTagSchema = z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
export type HeadingTag = z.infer<typeof HeadingTagSchema>;

/** Metadata fields extracted from <head>. `null` means "not present". */
export const PageMetaSchema = z.object({
  description: z.string().nullable(),
  canonical: z.string().nullable(),
  robots: z.string().nullable(),
  viewport: z.string().nullable(),
  charset: z.string().nullable(),
  lang: z.string().nullable(),
  ogTitle: z.string().nullable(),
  ogDescription: z.string().nullable(),
  ogImage: z.string().nullable(),
  twitterCard: z.string().nullable(),
  twitterTitle: z.string().nullable(),
  twitterDescription: z.string().nullable(),
  twitterImage: z.string().nullable(),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;

export const HeadingEntrySchema = z.object({
  tag: HeadingTagSchema,
  text: z.string(),
});
export type HeadingEntry = z.infer<typeof HeadingEntrySchema>;

export const ImageEntrySchema = z.object({
  src: z.string(),
  /** `null` = no alt attribute at all; `''` = explicitly empty (decorative). */
  alt: z.string().nullable(),
});
export type ImageEntry = z.infer<typeof ImageEntrySchema>;

export const LinkEntrySchema = z.object({
  href: z.string(),
  text: z.string(),
  rel: z.string().nullable(),
  target: z.string().nullable(),
  /**
   * Accessible name computed at extraction: aria-label → visible text →
   * first descendant img alt. Empty string = no accessible name found.
   * (aria-labelledby is not resolved — documented limitation.)
   */
  accessibleName: z.string().default(''),
});
export type LinkEntry = z.infer<typeof LinkEntrySchema>;

export const TextStatsSchema = z.object({
  wordCount: nonNegativeInt,
  /**
   * True when the body-text sample hit the extraction cap (the word count
   * therefore covers only part of the page). Defaulted so v1–v3 stored
   * records remain readable. (v3.1, Phase 7)
   */
  textSampleTruncated: z.boolean().default(false),
});
export type TextStats = z.infer<typeof TextStatsSchema>;

export const HeadingCountsSchema = z.object({
  h1: nonNegativeInt,
  h2: nonNegativeInt,
  h3: nonNegativeInt,
  h4: nonNegativeInt,
  h5: nonNegativeInt,
  h6: nonNegativeInt,
});
export type HeadingCounts = z.infer<typeof HeadingCountsSchema>;

/** One `<script type="application/ld+json">` block (raw contents). */
export const StructuredDataEntrySchema = z.object({
  raw: z.string().max(10_000),
});
export type StructuredDataEntry = z.infer<typeof StructuredDataEntrySchema>;

/** One `<link rel="alternate" hreflang>` entry. */
export const HreflangEntrySchema = z.object({
  lang: z.string().max(35),
  href: z.string().max(2_000),
});
export type HreflangEntry = z.infer<typeof HreflangEntrySchema>;

/** Counts of elements omitted because extraction caps were hit (v3). */
export const OmittedCountsSchema = z.object({
  headings: nonNegativeInt.default(0),
  images: nonNegativeInt.default(0),
  links: nonNegativeInt.default(0),
  descriptions: nonNegativeInt.default(0),
  canonicals: nonNegativeInt.default(0),
  structuredData: nonNegativeInt.default(0),
  hreflang: nonNegativeInt.default(0),
});
export type OmittedCounts = z.infer<typeof OmittedCountsSchema>;

/** Counts of hidden elements excluded from analysis collections (v3). */
export const HiddenCountsSchema = z.object({
  headings: nonNegativeInt.default(0),
  images: nonNegativeInt.default(0),
  links: nonNegativeInt.default(0),
});
export type HiddenCounts = z.infer<typeof HiddenCountsSchema>;

/** Inline `<svg>` accessibility inspection (v3, deterministic subset). */
export const SvgStatsSchema = z.object({
  /** Inline <svg role="img"> elements found. */
  total: nonNegativeInt.default(0),
  /** Of those, how many expose no accessible name (title text or aria-label). */
  unnamed: nonNegativeInt.default(0),
});
export type SvgStats = z.infer<typeof SvgStatsSchema>;

/**
 * A bounded, serializable snapshot of a page. This is the ONLY data the
 * extractor takes out of a page — nothing else is collected or transmitted.
 *
 * v2/v3 fields carry defaults so stored v1/v2 audits (earlier phases) still
 * validate. Fresh extractions always use the current SNAPSHOT_SCHEMA_VERSION.
 */
export const PageSnapshotSchema = z.object({
  schemaVersion: z.union([
    z.literal(SNAPSHOT_SCHEMA_VERSIONS[0]),
    z.literal(SNAPSHOT_SCHEMA_VERSIONS[1]),
    z.literal(SNAPSHOT_SCHEMA_VERSIONS[2]),
  ]),
  url: z.string().min(1),
  title: z.string(),
  /** Total <title> elements on the page (1 is expected). */
  titleCount: nonNegativeInt.default(1),
  meta: PageMetaSchema,
  /** Every meta[name=description] content value (cap 5; first duplicates `meta.description`). */
  descriptions: z.array(z.string().max(2_000)).max(SNAPSHOT_LIMITS.descriptions).default([]),
  /** Every <link rel=canonical> href (cap 5; first duplicates `meta.canonical`). */
  canonicals: z.array(z.string().max(2_000)).max(SNAPSHOT_LIMITS.canonicals).default([]),
  headings: z.array(HeadingEntrySchema).max(SNAPSHOT_LIMITS.headings),
  headingCounts: HeadingCountsSchema,
  images: z.array(ImageEntrySchema).max(SNAPSHOT_LIMITS.images),
  /** Total <img> count on the page (may exceed retained entries). */
  imageCount: nonNegativeInt,
  links: z.array(LinkEntrySchema).max(SNAPSHOT_LIMITS.links),
  /** Total <a href> count on the page (may exceed retained entries). */
  linkCount: nonNegativeInt,
  /** JSON-LD script blocks (cap 5; syntax checked by seo-core). */
  structuredData: z
    .array(StructuredDataEntrySchema)
    .max(SNAPSHOT_LIMITS.structuredData)
    .default([]),
  /** Total JSON-LD script count (may exceed retained entries). */
  structuredDataCount: nonNegativeInt.default(0),
  /**
   * Every meta[name=robots] content value (cap 5; first duplicates
   * `meta.robots`). Enables duplicate/conflicting-directive detection. (v3)
   */
  robotsValues: z.array(z.string().max(500)).max(SNAPSHOT_LIMITS.robotsValues).default([]),
  /** Hreflang alternate links (cap 10). (v3) */
  hreflang: z.array(HreflangEntrySchema).max(SNAPSHOT_LIMITS.hreflang).default([]),
  /** Total hreflang link count (may exceed retained entries). (v3) */
  hreflangCount: nonNegativeInt.default(0),
  /** Per-collection counts of elements omitted due to extraction caps. (v3) */
  omitted: OmittedCountsSchema.default({
    headings: 0,
    images: 0,
    links: 0,
    descriptions: 0,
    canonicals: 0,
    structuredData: 0,
    hreflang: 0,
  }),
  /** Per-collection counts of hidden elements (excluded from analysis). (v3) */
  hidden: HiddenCountsSchema.default({ headings: 0, images: 0, links: 0 }),
  /** Inline SVG accessibility stats. (v3) */
  svg: SvgStatsSchema.default({ total: 0, unnamed: 0 }),
  textStats: TextStatsSchema,
  extractedAt: z.string().min(1),
});
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;

export const CURRENT_SNAPSHOT_SCHEMA_VERSION = SNAPSHOT_SCHEMA_VERSION;
