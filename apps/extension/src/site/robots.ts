/**
 * Minimal robots.txt evaluation (RFC 9309 subset, documented in
 * docs/SITE_AUDIT.md): the `User-agent: *` group only, `Disallow`/`Allow`
 * prefixes with longest-match (Allow wins ties), and `Crawl-delay`.
 */

export interface RobotsPolicy {
  /** true = crawl permitted (no matching Disallow, or an Allow wins). */
  allows(path: string): boolean;
  crawlDelayMs: number | null;
}

const EMPTY_POLICY: RobotsPolicy = { allows: () => true, crawlDelayMs: null };

interface RobotsRule {
  allow: boolean;
  prefix: string;
}

export function parseRobotsTxt(text: string): RobotsPolicy {
  const rules: RobotsRule[] = [];
  let crawlDelayMs: number | null = null;
  let inStarGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      inStarGroup = value === '*';
      continue;
    }
    if (!inStarGroup) continue;
    if (field === 'disallow') {
      // Empty Disallow in a group means "allow everything".
      if (value !== '') rules.push({ allow: false, prefix: value });
    } else if (field === 'allow') {
      if (value !== '') rules.push({ allow: true, prefix: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        crawlDelayMs = Math.max(crawlDelayMs ?? 0, Math.round(seconds * 1000));
      }
    }
  }

  return {
    allows(path: string): boolean {
      // Longest prefix wins; Allow wins exact ties.
      let best: RobotsRule | null = null;
      for (const rule of rules) {
        if (!path.startsWith(rule.prefix)) continue;
        if (
          best === null ||
          rule.prefix.length > best.prefix.length ||
          (rule.prefix.length === best.prefix.length && rule.allow)
        ) {
          best = rule;
        }
      }
      return best === null || best.allow;
    },
    crawlDelayMs,
  };
}

export const EMPTY_ROBOTS_POLICY: RobotsPolicy = EMPTY_POLICY;
