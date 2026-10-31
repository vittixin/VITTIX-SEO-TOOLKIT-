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
  // v4: social-preview additions (field-level defaults keep v1–v3 rows valid).
  ogSiteName: z.string().nullable().default(null),
  ogUrl: z.string().nullable().default(null),
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
  // v4 performance attributes (all defaulted so v1–v3 rows validate).
  width: z.string().nullable().default(null),
  height: z.string().nullable().default(null),
  /** `loading` attribute: 'lazy' | 'eager' | null (unset). */
  loading: z.string().nullable().default(null),
  decoding: z.string().nullable().default(null),
  /** Has a srcset attribute. */
  srcset: z.boolean().default(false),
  sizes: z.string().nullable().default(null),
  /** Image is wrapped in a <picture> with at least one <source>. */
  inPicture: z.boolean().default(false),
  fetchpriority: z.string().nullable().default(null),
  /** Format inferred from the src extension ('' when unknown). No fetching. */
  format: z.string().default(''),
  /**
   * 0-based index among above-the-fold candidates (first 20 images measured
   * with getBoundingClientRect at extraction); null when not measured.
   */
  foldIndex: nonNegativeInt.nullable().default(null),
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
   * records remain readable. Added during release-candidate hardening —
   * see docs/ROADMAP.md "RC closure & hardening".
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

/** Bounded content summary computed at extraction time (v4). */
export const TextSummarySchema = z.object({
  sentenceCount: nonNegativeInt.default(0),
  paragraphCount: nonNegativeInt.default(0),
  /** Top keyword frequencies (unigrams/bigrams/trigrams mixed, stop-words removed). */
  keywords: z
    .array(z.object({ term: z.string().max(200), count: nonNegativeInt }))
    .max(SNAPSHOT_LIMITS.keywords)
    .default([]),
  /** SHA-256 of the normalized text sample (duplicate detection later). */
  sampleHash: z.string().default(''),
});
export type TextSummary = z.infer<typeof TextSummarySchema>;

/** http:// resource samples found on an https page (v4, bounded). */
export const PaginationSchema = z.object({
  prev: z.string().nullable().default(null),
  next: z.string().nullable().default(null),
});
export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * A bounded, serializable snapshot of a page. This is the ONLY data the
 * extractor takes out of a page — nothing else is collected or transmitted.
 *
 * v2/v3/v4 fields carry defaults so stored audits from earlier versions
 * still validate. Fresh extractions always use the current
 * SNAPSHOT_SCHEMA_VERSION.
 */
export const PageSnapshotSchema = z.object({
  schemaVersion: z.union([
    z.literal(SNAPSHOT_SCHEMA_VERSIONS[0]),
    z.literal(SNAPSHOT_SCHEMA_VERSIONS[1]),
    z.literal(SNAPSHOT_SCHEMA_VERSIONS[2]),
    z.literal(SNAPSHOT_SCHEMA_VERSIONS[3]),
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
  omitted: OmittedCountsSchema.prefault({}),
  /** Per-collection counts of hidden elements (excluded from analysis). (v3) */
  hidden: HiddenCountsSchema.prefault({}),
  /** Inline SVG accessibility stats. (v3) */
  svg: SvgStatsSchema.prefault({ total: 0, unnamed: 0 }),
  textStats: TextStatsSchema,
  /** Bounded content summary: counts, top keywords, sample hash. (v4) */
  textSummary: TextSummarySchema.prefault({}),
  /** http:// resource URLs found on https pages (bounded samples). (v4) */
  mixedContentSamples: z
    .array(z.string().max(2_000))
    .max(SNAPSHOT_LIMITS.mixedContentSamples)
    .default([]),
  /** A favicon is declared (link rel~="icon" or /favicon.ico convention). (v4) */
  faviconPresent: z.boolean().default(false),
  /** rel=prev / rel=next pagination links. (v4) */
  pagination: PaginationSchema.prefault({}),
  /**
   * Microdata (itemscope/itemtype) and RDFa (typeof) type values detected on
   * the page — detected types only, no deep validation. Bounded. (v4)
   */
  microdataRdfaTypes: z.array(z.string().max(200)).max(10).default([]),
  extractedAt: z.string().min(1),
});
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;

export const CURRENT_SNAPSHOT_SCHEMA_VERSION = SNAPSHOT_SCHEMA_VERSION;
