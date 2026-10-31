import type { PageMeta, PageSnapshot } from '@vittix/shared';
import { SNAPSHOT_SCHEMA_VERSION } from '@vittix/shared';

/**
 * Test-only snapshot builder for the v3 schema. Not exported from the
 * package index. New-in-v3 fields default to healthy values (no omissions,
 * no hidden content, no SVG) so tests only specify what a rule exercises.
 */
export function buildSnapshot(
  overrides: {
    schemaVersion?: PageSnapshot['schemaVersion'];
    url?: string;
    title?: string;
    titleCount?: number;
    meta?: Partial<PageMeta>;
    descriptions?: string[];
    canonicals?: string[];
    robotsValues?: string[];
    headings?: PageSnapshot['headings'];
    headingCounts?: PageSnapshot['headingCounts'];
    images?: PageSnapshot['images'];
    imageCount?: number;
    links?: PageSnapshot['links'];
    linkCount?: number;
    structuredData?: PageSnapshot['structuredData'];
    structuredDataCount?: number;
    hreflang?: PageSnapshot['hreflang'];
    hreflangCount?: number;
    omitted?: Partial<PageSnapshot['omitted']>;
    hidden?: Partial<PageSnapshot['hidden']>;
    svg?: Partial<PageSnapshot['svg']>;
    textStats?: PageSnapshot['textStats'];
    extractedAt?: string;
  } = {},
): PageSnapshot {
  const canonicals = overrides.canonicals ?? ['https://example.com/page'];
  const descriptions = overrides.descriptions ?? [
    'A sufficiently long example meta description that comfortably sits inside the healthy seventy to one hundred sixty character target range.',
  ];
  const robotsValues = overrides.robotsValues ?? ['index, follow'];
  const meta: PageMeta = {
    description: descriptions[0] ?? null,
    canonical: canonicals[0] ?? null,
    robots: robotsValues[0] ?? null,
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
    ...overrides.meta,
  };
  const links = overrides.links ?? [
    { href: '/about', text: 'About us', rel: null, target: null, accessibleName: 'About us' },
    {
      href: 'https://other.com/',
      text: 'Other site',
      rel: 'noopener',
      target: '_blank',
      accessibleName: 'Other site',
    },
  ];
  const images = overrides.images ?? [
    { src: 'https://example.com/a.png', alt: 'A bar chart of quarterly sales' },
    { src: 'https://example.com/b.png', alt: 'A photo of the workshop' },
  ];
  const structuredData = overrides.structuredData ?? [
    {
      raw: '{ "@context": "https://schema.org", "@type": "WebPage" }',
    },
  ];
  const hreflang = overrides.hreflang ?? [];
  return {
    schemaVersion: overrides.schemaVersion ?? SNAPSHOT_SCHEMA_VERSION,
    url: overrides.url ?? 'https://example.com/page',
    title: overrides.title ?? 'Example Page Title For Healthy Tests',
    titleCount: overrides.titleCount ?? 1,
    meta,
    descriptions,
    canonicals,
    headings: overrides.headings ?? [
      { tag: 'h1', text: 'Main heading' },
      { tag: 'h2', text: 'Section' },
    ],
    headingCounts: overrides.headingCounts ?? { h1: 1, h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 },
    images,
    imageCount: overrides.imageCount ?? images.length,
    links,
    linkCount: overrides.linkCount ?? links.length,
    structuredData,
    structuredDataCount: overrides.structuredDataCount ?? structuredData.length,
    robotsValues,
    hreflang,
    hreflangCount: overrides.hreflangCount ?? hreflang.length,
    omitted: {
      headings: 0,
      images: 0,
      links: 0,
      descriptions: 0,
      canonicals: 0,
      structuredData: 0,
      hreflang: 0,
      ...overrides.omitted,
    },
    hidden: { headings: 0, images: 0, links: 0, ...overrides.hidden },
    svg: { total: 0, unnamed: 0, ...overrides.svg },
    textStats: overrides.textStats ?? { wordCount: 350, textSampleTruncated: false },
    extractedAt: overrides.extractedAt ?? '2026-10-31T12:00:00.000Z',
  };
}

/** A finding-shaped assertion helper. */
export function findByRuleId<T extends { ruleId: string }>(items: T[], ruleId: string): T {
  const match = items.find((item) => item.ruleId === ruleId);
  if (!match) {
    throw new Error(
      `Expected a finding with ruleId "${ruleId}", got: ${items.map((i) => i.ruleId).join(', ')}`,
    );
  }
  return match;
}
