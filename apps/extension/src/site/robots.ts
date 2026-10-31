/**
 * robots.txt evaluation per RFC 9309 (subset — see docs/SITE_AUDIT.md):
 *
 * - Grouping: consecutive `User-agent:` lines form ONE group. A group ends
 *   at the first rule line followed by another User-agent line.
 * - Group selection: the group whose user-agent token is the longest
 *   case-insensitive PREFIX of our product token wins ("VittixBot"); the `*`
 *   group applies only when no specific group matches.
 * - Patterns: `Disallow` / `Allow` prefixes supporting `*` wildcards and a
 *   trailing `$` end-anchor; longest pattern wins, Allow wins ties.
 * - Paths are matched against path + query after percent-encoding
 *   normalization (decode unreserved/recoverable escapes on BOTH sides).
 * - `Crawl-delay` (seconds) is taken from the matched group.
 * - `Sitemap:` lines are collected additively (same-origin enforcement is
 *   the caller's job).
 */

export interface RobotsPolicy {
  /** true = the path is crawlable under the selected group. */
  allows(pathWithQuery: string): boolean;
  crawlDelayMs: number | null;
  /** Sitemap URLs declared anywhere in the file (additive, unfiltered). */
  sitemaps: string[];
}

export const EMPTY_ROBOTS_POLICY: RobotsPolicy = {
  allows: () => true,
  crawlDelayMs: null,
  sitemaps: [],
};

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelayMs: number | null;
}

/** Our crawler's product token — groups match by case-insensitive prefix. */
export const PRODUCT_TOKEN = 'VittixBot';

/**
 * Normalize a path for matching: percent-decode (best-effort, leaving the
 * `%` itself encoded if the escape is invalid) and keep the raw form as a
 * fallback. RFC 9309 crawlers match on the decoded path.
 */
function normalizePath(pathWithQuery: string): string {
  try {
    return decodeURIComponent(pathWithQuery);
  } catch {
    return pathWithQuery;
  }
}

/** Convert a robots pattern (`*` wildcard, optional trailing `$`) to a regex. */
function patternToRegex(pattern: string): RegExp {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (source.endsWith('\\$')) source = source.slice(0, -2) + '$';
  return new RegExp(`^${source}`);
}

function patternMatches(pattern: string, normalizedPath: string, rawPath: string): boolean {
  // RFC 9309 crawlers match the DECODED path against the DECODED pattern;
  // testing the raw forms too keeps the original escapes significant (e.g.
  // a pattern containing a literal %2F must not suddenly match a slash).
  const rawRegex = patternToRegex(pattern);
  if (rawRegex.test(rawPath) || rawRegex.test(normalizedPath)) return true;
  const decodedPattern = normalizePath(pattern);
  if (decodedPattern !== pattern) {
    const decodedRegex = patternToRegex(decodedPattern);
    if (decodedRegex.test(normalizedPath) || decodedRegex.test(rawPath)) return true;
  }
  return false;
}

/** Pick the group whose agent is the longest case-insensitive prefix of PRODUCT_TOKEN. */
function selectGroup(groups: RobotsGroup[]): RobotsGroup | null {
  let best: RobotsGroup | null = null;
  let bestLength = -1;
  const token = PRODUCT_TOKEN.toLowerCase();
  for (const group of groups) {
    for (const agent of group.agents) {
      const lowered = agent.toLowerCase();
      if (lowered === '*') continue;
      // RFC 9309 "matching": the group's token is a prefix of the crawler's
      // product token (e.g. group "Vittix" matches crawler "VittixBot").
      if (token.startsWith(lowered) && lowered.length > bestLength) {
        best = group;
        bestLength = lowered.length;
      }
    }
  }
  if (best !== null) return best;
  return groups.find((group) => group.agents.some((agent) => agent === '*')) ?? null;
}

function longestMatchWins(group: RobotsGroup, normalizedPath: string, rawPath: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!patternMatches(rule.pattern, normalizedPath, rawPath)) continue;
    if (
      best === null ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best === null || best.allow;
}

/**
 * Parse a robots.txt body. The returned policy evaluates the group matching
 * our product token (falling back to `*`), with wildcard/anchor support,
 * percent-encoding normalization, Crawl-delay and Sitemap collection.
 */
export function parseRobotsTxt(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue; // malformed line — ignored per spec leniency
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!lastLineWasAgent || current === null) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
      }
      if (value !== '') current.agents.push(value);
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;

    if (field === 'sitemap') {
      if (value !== '') sitemaps.push(value);
      continue;
    }
    if (current === null) continue; // rule before any User-agent — ignored

    if (field === 'disallow') {
      // Empty Disallow in a group means "allow everything".
      if (value !== '') current.rules.push({ allow: false, pattern: value });
    } else if (field === 'allow') {
      if (value !== '') current.rules.push({ allow: true, pattern: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelayMs = Math.max(current.crawlDelayMs ?? 0, Math.round(seconds * 1000));
      }
    }
    // Unknown fields (e.g. Cache-delay) are ignored per spec leniency.
  }

  const group = selectGroup(groups);
  if (group === null) return { ...EMPTY_ROBOTS_POLICY, sitemaps };

  return {
    allows(pathWithQuery: string) {
      const raw = pathWithQuery || '/';
      return longestMatchWins(group, normalizePath(raw), raw);
    },
    crawlDelayMs: group.crawlDelayMs,
    sitemaps,
  };
}
