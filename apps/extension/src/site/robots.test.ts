import { describe, expect, it } from 'vitest';
import { parseRobotsTxt, PRODUCT_TOKEN } from './robots';

/**
 * RFC 9309 robots.txt parser tests — grouping, group selection, wildcards,
 * $ anchors, tie-breaking, percent-encoding, Sitemap collection.
 */

const policy = (body: string) => parseRobotsTxt(body);

describe('robots grouping', () => {
  it('consecutive User-agent lines form ONE group', () => {
    const p = policy('User-agent: Googlebot\nUser-agent: Bingbot\nDisallow: /x\n');
    // Neither token matches ours and there is no `*` group → allow all.
    expect(p.allows('/x')).toBe(true);
  });

  it('a group ends at the first rule followed by another User-agent', () => {
    const p = policy(
      'User-agent: Googlebot\nDisallow: /google-only\n\nUser-agent: VittixBot\nDisallow: /vittix-only\n',
    );
    expect(p.allows('/google-only')).toBe(true); // Googlebot group not ours
    expect(p.allows('/vittix-only')).toBe(false); // our exact group matched
  });

  it('the * group applies only when no specific group matches our token', () => {
    const withSpecific = policy(
      'User-agent: VittixBot\nDisallow: /specific\n\nUser-agent: *\nDisallow: /\n',
    );
    expect(withSpecific.allows('/specific')).toBe(false); // specific group wins
    expect(withSpecific.allows('/anything')).toBe(true); // star rules not applied

    const starOnly = policy('User-agent: *\nDisallow: /\n');
    expect(starOnly.allows('/anything')).toBe(false); // star applies
  });

  it('longest matching agent token wins between specific groups', () => {
    const p = policy(
      'User-agent: Vittix\nDisallow: /short\n\nUser-agent: VittixBot\nDisallow: /long\n',
    );
    // "Vittix" (6) and "VittixBot" (9) both prefix-match; longest wins.
    expect(p.allows('/short')).toBe(true);
    expect(p.allows('/long')).toBe(false);
  });

  it('product token is ' + PRODUCT_TOKEN, () => {
    const p = policy(`User-agent: ${PRODUCT_TOKEN}\nDisallow: /\n`);
    expect(p.allows('/anything')).toBe(false);
  });
});

describe('robots patterns: wildcards, anchors, tie-breaking', () => {
  it('supports the * wildcard inside patterns', () => {
    const p = policy('User-agent: *\nDisallow: /products/*.json$\n');
    expect(p.allows('/products/list.json')).toBe(false);
    expect(p.allows('/products/list.json?sort=asc')).toBe(true); // $ anchors
    expect(p.allows('/products/list')).toBe(true);
  });

  it('supports the $ end-anchor', () => {
    const p = policy('User-agent: *\nDisallow: /private$\n');
    expect(p.allows('/private')).toBe(false);
    expect(p.allows('/private/page')).toBe(true);
  });

  it('longest pattern wins; Allow wins ties', () => {
    const longest = policy('User-agent: *\nDisallow: /section\nAllow: /section/public\n');
    expect(longest.allows('/section/private')).toBe(false);
    expect(longest.allows('/section/public/doc')).toBe(true);

    const tie = policy('User-agent: *\nDisallow: /section/pub\nAllow: /section/pub\n');
    expect(tie.allows('/section/public/doc')).toBe(true); // tie → Allow
  });

  it('treats an empty Disallow as allow-all', () => {
    const p = policy('User-agent: *\nDisallow:\n');
    expect(p.allows('/page')).toBe(true);
  });
});

describe('robots matching details', () => {
  it('matches against path + query', () => {
    const p = policy('User-agent: *\nDisallow: /search?q=private\n');
    expect(p.allows('/search?q=private')).toBe(false);
    expect(p.allows('/search?q=public')).toBe(true);
  });

  it('normalizes percent-encoding on both sides', () => {
    const p = policy('User-agent: *\nDisallow: /caf%C3%A9\n');
    expect(p.allows('/caf%C3%A9')).toBe(false); // raw form still matches
    expect(p.allows('/café')).toBe(false); // decoded form matches too
    expect(p.allows('/cafe')).toBe(true);
  });

  it('is case-insensitive for user-agent tokens and schemes in paths', () => {
    const p = policy('user-agent: vittixbot\ndisallow: /x\n');
    expect(p.allows('/x')).toBe(false);
  });

  it('strips comments and handles CRLF line endings', () => {
    const p = policy('User-agent: * # all\r\nDisallow: /x # blocked\r\n');
    expect(p.allows('/x')).toBe(false);
    expect(p.allows('/y')).toBe(true);
  });

  it('ignores malformed lines without a colon', () => {
    const p = policy('garbage line\nUser-agent: *\nDisallow: /x\n');
    expect(p.allows('/x')).toBe(false);
    expect(p.allows('/y')).toBe(true);
  });

  it('ignores rules that appear before any User-agent line', () => {
    const p = policy('Disallow: /\nUser-agent: *\nDisallow: /x\n');
    expect(p.allows('/')).toBe(true);
  });
});

describe('robots Crawl-delay and Sitemap', () => {
  it('parses Crawl-delay from the matched group', () => {
    const p = policy('User-agent: VittixBot\nCrawl-delay: 2\n\nUser-agent: *\nCrawl-delay: 10\n');
    expect(p.crawlDelayMs).toBe(2_000); // our group, not the star group
  });

  it('collects Sitemap directives additively', () => {
    const p = policy(
      'User-agent: *\nDisallow: /x\nSitemap: https://example.com/sitemap.xml\nSitemap: https://example.com/sitemap-news.xml\n',
    );
    expect(p.sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/sitemap-news.xml',
    ]);
  });

  it('returns no sitemaps when none are declared', () => {
    expect(policy('User-agent: *\n').sitemaps).toEqual([]);
  });
});

describe('empty policy', () => {
  it('allows everything and exposes no sitemaps', () => {
    const p = policy('');
    expect(p.allows('/anything')).toBe(true);
    expect(p.crawlDelayMs).toBeNull();
    expect(p.sitemaps).toEqual([]);
  });
});
