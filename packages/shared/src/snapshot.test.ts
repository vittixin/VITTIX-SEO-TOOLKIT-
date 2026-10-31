import { describe, expect, it } from 'vitest';
import { PageSnapshotSchema, type PageSnapshot } from './snapshot.js';
import { SNAPSHOT_LIMITS, SNAPSHOT_SCHEMA_VERSION } from './constants.js';

export function buildSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  const base: PageSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    url: 'https://example.com/page',
    title: 'Example Page Title',
    titleCount: 1,
    meta: {
      description: 'An example page description.',
      canonical: 'https://example.com/page',
      robots: 'index, follow',
      viewport: 'width=device-width, initial-scale=1',
      charset: 'UTF-8',
      lang: 'en',
      ogTitle: 'Example Page Title',
      ogDescription: 'An example page description.',
      ogImage: 'https://example.com/og.png',
      twitterCard: 'summary_large_image',
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
    },
    descriptions: ['An example page description.'],
    canonicals: ['https://example.com/page'],
    headings: [
      { tag: 'h1', text: 'Main heading' },
      { tag: 'h2', text: 'Section heading' },
    ],
    headingCounts: { h1: 1, h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [
      { src: 'https://example.com/a.png', alt: 'A diagram' },
      { src: 'https://example.com/b.png', alt: null },
    ],
    imageCount: 2,
    links: [
      { href: '/about', text: 'About', rel: null, target: null, accessibleName: 'About' },
      {
        href: 'https://other.com/',
        text: 'Other',
        rel: 'noopener',
        target: '_blank',
        accessibleName: 'Other',
      },
    ],
    linkCount: 2,
    structuredData: [{ raw: '{ "@type": "WebPage" }' }],
    structuredDataCount: 1,
    robotsValues: ['index, follow'],
    hreflang: [],
    hreflangCount: 0,
    omitted: {
      headings: 0,
      images: 0,
      links: 0,
      descriptions: 0,
      canonicals: 0,
      structuredData: 0,
      hreflang: 0,
    },
    hidden: { headings: 0, images: 0, links: 0 },
    svg: { total: 0, unnamed: 0 },
    textStats: { wordCount: 42, textSampleTruncated: false },
    extractedAt: '2026-10-31T12:00:00.000Z',
  };
  return { ...base, ...overrides };
}

describe('PageSnapshotSchema (v2)', () => {
  it('accepts a valid v2 snapshot', () => {
    const result = PageSnapshotSchema.safeParse(buildSnapshot());
    expect(result.success).toBe(true);
  });

  it('still accepts legacy v1 snapshots (stored Phase 0 records)', () => {
    const v1 = buildSnapshot({
      schemaVersion: 1 as PageSnapshot['schemaVersion'],
      titleCount: undefined,
      descriptions: undefined,
      canonicals: undefined,
      structuredData: undefined,
      structuredDataCount: undefined,
      // Simulate a real v1 row: no link accessibleName field.
      // (Zod applies the default at runtime; the cast models the old shape.)
      links: [{ href: '/about', text: 'About', rel: null, target: null }] as PageSnapshot['links'],
    }) as unknown as Record<string, unknown>;
    delete v1.titleCount;
    delete v1.descriptions;
    delete v1.canonicals;
    delete v1.structuredData;
    delete v1.structuredDataCount;
    const result = PageSnapshotSchema.safeParse(v1);
    expect(result.success).toBe(true);
    if (result.success) {
      // Defaults applied.
      expect(result.data.titleCount).toBe(1);
      expect(result.data.structuredData).toEqual([]);
    }
  });

  it('rejects an unknown schema version', () => {
    const result = PageSnapshotSchema.safeParse(
      buildSnapshot({ schemaVersion: 99 as PageSnapshot['schemaVersion'] }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a negative total count', () => {
    const result = PageSnapshotSchema.safeParse(buildSnapshot({ imageCount: -1 }));
    expect(result.success).toBe(false);
  });

  it('rejects more images than the snapshot limit allows', () => {
    const images = Array.from({ length: SNAPSHOT_LIMITS.images + 1 }, (_, i) => ({
      src: `https://example.com/${i}.png`,
      alt: null,
    }));
    const result = PageSnapshotSchema.safeParse(
      buildSnapshot({ images, imageCount: images.length }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an invalid heading tag', () => {
    const result = PageSnapshotSchema.safeParse(
      buildSnapshot({ headings: [{ tag: 'h7' as never, text: 'Nope' }] }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects more descriptions than the cap', () => {
    const descriptions = Array.from({ length: SNAPSHOT_LIMITS.descriptions + 1 }, () => 'x');
    const result = PageSnapshotSchema.safeParse(buildSnapshot({ descriptions }));
    expect(result.success).toBe(false);
  });

  it('rejects more structured-data blocks than the cap', () => {
    const structuredData = Array.from({ length: SNAPSHOT_LIMITS.structuredData + 1 }, () => ({
      raw: '{}',
    }));
    const result = PageSnapshotSchema.safeParse(buildSnapshot({ structuredData }));
    expect(result.success).toBe(false);
  });

  it('distinguishes null alt (missing attribute) from empty alt (decorative)', () => {
    const parsed = PageSnapshotSchema.parse(
      buildSnapshot({
        images: [
          { src: 'https://example.com/a.png', alt: null },
          { src: 'https://example.com/b.png', alt: '' },
        ],
      }),
    );
    expect(parsed.images[0]?.alt).toBeNull();
    expect(parsed.images[1]?.alt).toBe('');
  });
});
