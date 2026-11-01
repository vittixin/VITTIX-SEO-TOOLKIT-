import type { SitemapEntry, SitemapState } from '@vittix/shared';

export interface SitemapDocumentResult {
  entries: SitemapEntry[];
  nested: string[];
  malformed: boolean;
  urlCount: number;
}

/** Pure normalization of DOMParser-produced sitemap values. XML parsing stays in the extension. */
export function normalizeSitemapDocument(input: {
  entries: readonly { url: string; lastmod?: string | null; alternates?: readonly string[] }[];
  nested?: readonly string[];
  malformed?: boolean;
}): SitemapDocumentResult {
  return {
    entries: input.entries.map((entry) => ({
      url: entry.url.slice(0, 2048),
      lastmod: entry.lastmod?.slice(0, 128) ?? null,
      alternates: (entry.alternates ?? []).slice(0, 20).map((url) => url.slice(0, 2048)),
    })),
    nested: (input.nested ?? []).slice(0, 50_000).map((url) => url.slice(0, 2048)),
    malformed: input.malformed ?? false,
    urlCount: input.entries.length + (input.nested?.length ?? 0),
  };
}

/** Evidence-gated sitemap diff. Unreadable/truncated sets never claim absence. */
export function diffSitemap(input: {
  state: SitemapState;
  crawledUrls: readonly string[];
  pageStates: readonly {
    url: string;
    noindex: boolean;
    status: number | null;
    redirected: boolean;
    canonical: string | null;
  }[];
}) {
  const sitemapUrls = new Set(input.state.entries.map((entry) => entry.url));
  const crawled = new Set(input.crawledUrls);
  const pageMap = new Map(input.pageStates.map((page) => [page.url, page]));
  const inspectedSitemapUrls = [...sitemapUrls].flatMap((url) => {
    const page = pageMap.get(url);
    return page
      ? [
          {
            url,
            noindex: page.noindex,
            non2xx: page.status === null || page.status < 200 || page.status >= 300,
            redirected: page.redirected,
            canonicalizedElsewhere: Boolean(page.canonical && page.canonical !== url),
          },
        ]
      : [];
  });
  return {
    notCrawled: [...sitemapUrls].filter((url) => !crawled.has(url)),
    crawledAbsent:
      input.state.fullyRead && !input.state.truncated
        ? input.crawledUrls.filter((url) => !sitemapUrls.has(url))
        : null,
    inspectedSitemapUrls,
    invalidLastmodCount: input.state.invalidLastmodCount,
    duplicateCount: input.state.duplicateCount,
    crossOriginCount: input.state.crossOriginCount,
    warnings: input.state.warnings,
    checked: input.state.fullyRead && !input.state.truncated,
  };
}
