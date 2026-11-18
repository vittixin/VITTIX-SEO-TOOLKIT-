import { describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { parseRobotsTxt, PRODUCT_TOKEN } from './robots';

/**
 * RFC 9309 robots.txt parser tests — grouping, group selection, wildcards,
 * $ anchors, tie-breaking, percent-encoding, Sitemap collection.
 */

const policy = (body: string) => parseRobotsTxt(body);

const matcherWorkerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const esbuild = require('esbuild');
esbuild.transform(fs.readFileSync(workerData.sourcePath, 'utf8'), { loader: 'ts', format: 'esm' })
  .then(async ({ code }) => {
    const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
    const { parseRobotsTxt } = await import(moduleUrl);
    const policy = parseRobotsTxt('User-agent: VittixBot\\nDisallow: ' + workerData.pattern);
    parentPort.postMessage({ ready: true });
    const started = performance.now();
    const allowed = policy.allows(workerData.path);
    parentPort.postMessage({ allowed, elapsedMs: performance.now() - started });
  })
  .catch((error) => { throw error; });
`;

function measureMatcher(pattern: string, path: string): Promise<number> {
  const worker = new Worker(matcherWorkerSource, {
    eval: true,
    workerData: {
      sourcePath: fileURLToPath(new URL('./robots.ts', import.meta.url)),
      pattern,
      path,
    },
  });
  return new Promise((resolve, reject) => {
    let timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('robots matcher worker did not initialize'));
    }, 5_000);
    worker.on('message', (result: { ready?: boolean; elapsedMs?: number }) => {
      if (result.ready) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          void worker.terminate();
          reject(new Error('robots matcher exceeded 100 ms'));
        }, 100);
        return;
      }
      clearTimeout(timeout);
      void worker.terminate();
      resolve(result.elapsedMs!);
    });
    worker.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

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

  it('matches the product token exactly (case-insensitive), not by prefix', () => {
    const p = policy(
      'User-agent: Vittix\nDisallow: /short\n\nUser-agent: VittixBot\nDisallow: /long\n',
    );
    // "Vittix" is a prefix token but must NOT match VittixBot.
    expect(p.allows('/short')).toBe(true);
    expect(p.allows('/long')).toBe(false);

    expect(policy('User-agent: V\nDisallow: /\n').allows('/anything')).toBe(true);
    expect(policy('User-agent: vittixbot\nDisallow: /x\n').allows('/x')).toBe(false);
  });

  it('merges all groups whose user-agent matches and takes max Crawl-delay (RFC 9309 §2.2.1)', () => {
    const starMerged = policy(
      'User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\nCrawl-delay: 2\n\nUser-agent: *\nCrawl-delay: 5\n',
    );
    expect(starMerged.allows('/a')).toBe(false);
    expect(starMerged.allows('/b')).toBe(false);
    expect(starMerged.crawlDelayMs).toBe(5_000);

    const specificMerged = policy(
      'User-agent: VittixBot\nDisallow: /x\nCrawl-delay: 1\n\nUser-agent: VittixBot\nDisallow: /y\nCrawl-delay: 3\n',
    );
    expect(specificMerged.allows('/x')).toBe(false);
    expect(specificMerged.allows('/y')).toBe(false);
    expect(specificMerged.crawlDelayMs).toBe(3_000);
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

describe('robots matching complexity and input limits', () => {
  it('matches a 30-star pattern against a 5,000-character path in under 50 ms', async () => {
    const elapsedMs = await measureMatcher('/' + '*'.repeat(30), '/' + 'a'.repeat(4_999));
    console.info(`30-star robots matcher: ${elapsedMs.toFixed(3)} ms`);
    expect(elapsedMs).toBeLessThan(50);
  });

  it('matches an adversarial repeated-literal pattern against a long path in under 50 ms', async () => {
    const elapsedMs = await measureMatcher('/*a*a*a*a*a*b', '/' + 'a'.repeat(4_999));
    console.info(`adversarial robots matcher: ${elapsedMs.toFixed(3)} ms`);
    expect(elapsedMs).toBeLessThan(50);
  });

  it('ignores patterns longer than 2,000 characters', () => {
    const longPath = '/' + 'a'.repeat(2_000);
    const p = policy(`User-agent: VittixBot\nDisallow: ${longPath}\n`);
    expect(p.allows(longPath)).toBe(true);
  });

  it('ignores rules after the first 10,000 in a group', () => {
    const rules = Array.from({ length: 10_000 }, (_, index) => `Disallow: /other-${index}`).join(
      '\n',
    );
    const p = policy(`User-agent: VittixBot\n${rules}\nDisallow: /target\n`);
    expect(p.allows('/target')).toBe(true);
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
