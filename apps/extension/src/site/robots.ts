/**
 * robots.txt evaluation per RFC 9309 (subset — see docs/SITE_AUDIT.md):
 *
 * - Grouping: consecutive `User-agent:` lines form ONE group. A group ends
 *   at the first rule line followed by another User-agent line.
 * - Group selection: groups whose user-agent token exactly matches our
 *   product token (case-insensitive, "VittixBot") apply; if several match,
 *   their rules are merged and the maximum Crawl-delay is used. The `*`
 *   groups apply only when no specific group matches (all matching `*`
 *   groups are merged, per RFC 9309 §2.2.1).
 * - Patterns: `Disallow` / `Allow` prefixes supporting `*` wildcards and a
 *   trailing `$` end-anchor; longest pattern wins, Allow wins ties.
 * - Paths are matched against path + query after percent-encoding
 *   normalization (decode unreserved/recoverable escapes on BOTH sides).
 * - `Crawl-delay` (seconds) is taken as the maximum from matched groups.
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

/** Our crawler's product token — groups match by exact token (case-insensitive). */
export const PRODUCT_TOKEN = 'VittixBot';
const MAX_PATTERN_LENGTH = 2_000;
const MAX_RULES_PER_GROUP = 10_000;
const MAX_MERGED_RULES = 10_000;

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

/** Greedy two-pointer glob match; `*` spans any chars and a final `$` anchors end. */
function globMatches(pattern: string, text: string): boolean {
  const anchored = pattern.endsWith('$');
  const limit = anchored ? pattern.length - 1 : pattern.length;
  let patternIndex = 0;
  let textIndex = 0;
  let lastStarIndex = -1;
  let lastStarTextIndex = -1;

  while (textIndex < text.length) {
    if (patternIndex === limit && !anchored) return true;
    const char = pattern[patternIndex];
    if (char === '*') {
      // Collapse adjacent wildcards while remembering the final star for
      // greedy backtracking. This avoids regex compilation and regex backtracking.
      while (patternIndex + 1 < limit && pattern[patternIndex + 1] === '*') patternIndex++;
      lastStarIndex = patternIndex;
      lastStarTextIndex = textIndex;
      patternIndex++;
      continue;
    }
    if (patternIndex < limit && char === text[textIndex]) {
      patternIndex++;
      textIndex++;
      continue;
    }
    if (lastStarIndex !== -1) {
      patternIndex = lastStarIndex + 1;
      textIndex = ++lastStarTextIndex;
      continue;
    }
    return false;
  }

  while (patternIndex < limit && pattern[patternIndex] === '*') patternIndex++;
  return patternIndex === limit;
}

function patternMatches(pattern: string, normalizedPath: string, rawPath: string): boolean {
  // RFC 9309 crawlers match the DECODED path against the DECODED pattern;
  // testing the raw forms too keeps the original escapes significant (e.g.
  // a pattern containing a literal %2F must not suddenly match a slash).
  if (globMatches(pattern, rawPath) || globMatches(pattern, normalizedPath)) return true;
  const decodedPattern = normalizePath(pattern);
  if (decodedPattern !== pattern) {
    if (globMatches(decodedPattern, normalizedPath) || globMatches(decodedPattern, rawPath))
      return true;
  }
  return false;
}

/** Merge all groups whose user-agent token applies to PRODUCT_TOKEN (RFC 9309). */
function selectGroups(groups: RobotsGroup[]): RobotsGroup[] {
  const token = PRODUCT_TOKEN.toLowerCase();
  const specific = groups.filter((group) =>
    group.agents.some((agent) => agent.toLowerCase() === token),
  );
  if (specific.length > 0) return specific;
  return groups.filter((group) => group.agents.some((agent) => agent === '*'));
}

function mergeGroups(groups: RobotsGroup[]): RobotsGroup | null {
  if (groups.length === 0) return null;
  const merged: RobotsGroup = { agents: [], rules: [], crawlDelayMs: null };
  for (const group of groups) {
    for (const rule of group.rules) {
      if (merged.rules.length >= MAX_MERGED_RULES) break;
      merged.rules.push(rule);
    }
    if (group.crawlDelayMs !== null) {
      merged.crawlDelayMs = Math.max(merged.crawlDelayMs ?? 0, group.crawlDelayMs);
    }
  }
  return merged;
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
      if (
        value !== '' &&
        value.length <= MAX_PATTERN_LENGTH &&
        current.rules.length < MAX_RULES_PER_GROUP
      ) {
        current.rules.push({ allow: false, pattern: value });
      }
    } else if (field === 'allow') {
      if (
        value !== '' &&
        value.length <= MAX_PATTERN_LENGTH &&
        current.rules.length < MAX_RULES_PER_GROUP
      ) {
        current.rules.push({ allow: true, pattern: value });
      }
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelayMs = Math.max(current.crawlDelayMs ?? 0, Math.round(seconds * 1000));
      }
    }
    // Unknown fields (e.g. Cache-delay) are ignored per spec leniency.
  }

  const group = mergeGroups(selectGroups(groups));
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
