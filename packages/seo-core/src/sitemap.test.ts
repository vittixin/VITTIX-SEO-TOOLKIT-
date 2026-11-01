import { describe, expect, it } from 'vitest';
import { diffSitemap, normalizeSitemapDocument } from './sitemap';

describe('sitemap pure transformations', () => {
  it('normalizes bounded parsed XML values', () => {
    const result = normalizeSitemapDocument({
      entries: [
        { url: 'https://s.test/a', lastmod: '2026-01-01', alternates: ['https://s.test/en'] },
      ],
      nested: ['https://s.test/map.xml'],
    });
    expect(result).toEqual({
      entries: [
        { url: 'https://s.test/a', lastmod: '2026-01-01', alternates: ['https://s.test/en'] },
      ],
      nested: ['https://s.test/map.xml'],
      malformed: false,
      urlCount: 2,
    });
  });

  it('does not report absent URLs unless the sitemap was fully read', () => {
    const state = {
      entries: [{ url: 'https://s.test/a', lastmod: null, alternates: [] }],
      fullyRead: false,
      truncated: true,
      invalidLastmodCount: 0,
      duplicateCount: 0,
      crossOriginCount: 1,
      warnings: [],
    };
    expect(diffSitemap({ state, crawledUrls: ['https://s.test/b'], pageStates: [] })).toMatchObject(
      { notCrawled: ['https://s.test/a'], crawledAbsent: null, checked: false },
    );
    expect(
      diffSitemap({
        state: { ...state, fullyRead: true, truncated: false },
        crawledUrls: ['https://s.test/b'],
        pageStates: [],
      }).crawledAbsent,
    ).toEqual(['https://s.test/b']);
  });

  it('reports only inspected sitemap signals', () => {
    const state = {
      entries: [{ url: 'https://s.test/a', lastmod: null, alternates: [] }],
      fullyRead: true,
      truncated: false,
      invalidLastmodCount: 1,
      duplicateCount: 2,
      crossOriginCount: 3,
      warnings: [],
    };
    expect(
      diffSitemap({
        state,
        crawledUrls: ['https://s.test/a'],
        pageStates: [
          {
            url: 'https://s.test/a',
            noindex: true,
            status: 200,
            redirected: false,
            canonical: 'https://elsewhere.test/',
          },
        ],
      }).inspectedSitemapUrls[0],
    ).toEqual({
      url: 'https://s.test/a',
      noindex: true,
      non2xx: false,
      redirected: false,
      canonicalizedElsewhere: true,
    });
  });
});
