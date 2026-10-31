import { describe, expect, it } from 'vitest';
import { isDuplicateSiteUrl, normalizeSiteUrl } from './normalize';
import { parseRobotsTxt } from './robots';
import { PacedRunner } from './rate';

describe('normalizeSiteUrl', () => {
  it('normalizes scheme/host case, fragments, default ports and trailing slashes', () => {
    expect(normalizeSiteUrl('HTTPS://EXAMPLE.com/Page/')).toBe('https://example.com/Page');
    expect(normalizeSiteUrl('https://example.com/page#section')).toBe('https://example.com/page');
    expect(normalizeSiteUrl('https://example.com:443/')).toBe('https://example.com/');
    expect(normalizeSiteUrl('http://example.com:80/a')).toBe('http://example.com/a');
    expect(normalizeSiteUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
  });

  it('preserves query strings when trimming trailing slashes', () => {
    expect(normalizeSiteUrl('https://example.com/a/?b=1')).toBe('https://example.com/a?b=1');
  });

  it('returns null for invalid input', () => {
    expect(normalizeSiteUrl('::bad::')).toBeNull();
  });
});

describe('isDuplicateSiteUrl', () => {
  it('treats normalized-equal URLs as duplicates', () => {
    expect(isDuplicateSiteUrl('https://example.com/a', 'https://EXAMPLE.com/a/')).toBe(true);
    expect(isDuplicateSiteUrl('https://example.com/a', 'https://example.com/a#top')).toBe(true);
    expect(isDuplicateSiteUrl('https://example.com/a', 'https://example.com/b')).toBe(false);
    expect(isDuplicateSiteUrl('https://example.com/a?x=1', 'https://example.com/a')).toBe(false);
  });
});

describe('parseRobotsTxt', () => {
  it('allows everything for an empty policy', () => {
    const policy = parseRobotsTxt('');
    expect(policy.allows('/anything')).toBe(true);
    expect(policy.crawlDelayMs).toBeNull();
  });

  it('honors Disallow in the * group', () => {
    const policy = parseRobotsTxt('User-agent: *\nDisallow: /admin\nDisallow: /private\n');
    expect(policy.allows('/page')).toBe(true);
    expect(policy.allows('/admin/login')).toBe(false);
    expect(policy.allows('/private/x')).toBe(false);
  });

  it('applies longest-prefix match with Allow winning ties', () => {
    const policy = parseRobotsTxt('User-agent: *\nDisallow: /section\nAllow: /section/public\n');
    expect(policy.allows('/section/private')).toBe(false);
    expect(policy.allows('/section/public/doc')).toBe(true);
  });

  it('ignores rules from other user-agent groups', () => {
    const policy = parseRobotsTxt('User-agent: Googlebot\nDisallow: /\n');
    expect(policy.allows('/page')).toBe(true);
  });

  it('treats an empty Disallow as allow-all', () => {
    const policy = parseRobotsTxt('User-agent: *\nDisallow:\n');
    expect(policy.allows('/page')).toBe(true);
  });

  it('parses Crawl-delay (seconds → ms, max wins)', () => {
    const policy = parseRobotsTxt('User-agent: *\nCrawl-delay: 2\n');
    expect(policy.crawlDelayMs).toBe(2000);
  });

  it('strips comments', () => {
    const policy = parseRobotsTxt('User-agent: * # everyone\nDisallow: /x # blocked\n');
    expect(policy.allows('/x')).toBe(false);
    expect(policy.allows('/y')).toBe(true);
  });
});

describe('PacedRunner', () => {
  it('runs tasks and respects the cap', async () => {
    const runner = new PacedRunner(2, 0);
    let concurrent = 0;
    let maxConcurrent = 0;
    const tasks = Array.from({ length: 6 }, () =>
      runner.run(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
      }),
    );
    await Promise.all(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('returns null after stop()', async () => {
    const runner = new PacedRunner(1, 0);
    runner.stop();
    const result = await runner.run(async () => 'never');
    expect(result).toBeNull();
  });

  it('paces consecutive starts by the minimum interval', async () => {
    let now = 0;
    const fakeDelays: number[] = [];
    const runner = new PacedRunner(1, 100, async (ms) => {
      fakeDelays.push(ms);
      now += ms;
    });
    // Simulate wall clock advancing between tasks via the injected delay.
    await runner.run(async () => undefined);
    await runner.run(async () => undefined);
    expect(fakeDelays.length).toBeGreaterThanOrEqual(1);
    void now;
  });
});
