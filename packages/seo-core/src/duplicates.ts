/** Deterministic, bounded duplicate heuristics for site audits (not a search-engine verdict). */
export interface SimilarityPage {
  url: string;
  title?: string | null;
  description?: string | null;
  text?: string | null;
  canonical?: string | null;
  noindex?: boolean;
  normalizedTextHash?: string | null;
  simhash64?: string | null;
  wordCount?: number;
}
export interface DuplicateCluster {
  kind: 'exact-body' | 'near-body' | 'near-title' | 'near-description';
  urls: string[];
  disposition: 'properly-consolidated' | 'unconsolidated';
  similarity: number;
}
const words = (s: string) =>
  s
    .normalize('NFKC')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const normalized = (s: string) => words(s).join(' ');
const canonicalTarget = (value: string | null | undefined, base: string): string | null => {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    u.hash = '';
    if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.href;
  } catch {
    return null;
  }
};
const hash = (s: string) => {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(normalized(s).slice(0, 50_000)))
    h = BigInt.asUintN(64, (h ^ BigInt(byte)) * 0x100000001b3n);
  return h.toString(16).padStart(16, '0');
};
export function normalizedTextHash(text: string): string {
  return hash(text);
}
/** SimHash over word trigrams, using the first 50,000 visible characters. */
export function simhash64(text: string): string {
  const tokens = words(text.slice(0, 50_000));
  const shingles: string[] = [];
  for (let i = 0; i + 2 < tokens.length; i++) shingles.push(tokens.slice(i, i + 3).join(' '));
  if (!shingles.length) return '0000000000000000';
  const sums = Array<number>(64).fill(0);
  for (const shingle of shingles) {
    const n = BigInt(`0x${hash(shingle)}`);
    for (let bit = 0; bit < 64; bit++) sums[bit] = sums[bit]! + ((n >> BigInt(bit)) & 1n ? 1 : -1);
  }
  return sums
    .reduce((n, score, bit) => (score > 0 ? n | (1n << BigInt(bit)) : n), 0n)
    .toString(16)
    .padStart(16, '0');
}
export function hammingDistance64(a: string, b: string): number {
  try {
    let n = BigInt(`0x${a}`) ^ BigInt(`0x${b}`),
      count = 0;
    while (n) {
      count += Number(n & 1n);
      n >>= 1n;
    }
    return count;
  } catch {
    return 64;
  }
}
const jaccard = (a: string, b: string) => {
  const aa = new Set(words(a)),
    bb = new Set(words(b));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const t of aa) if (bb.has(t)) intersection++;
  return intersection / (aa.size + bb.size - intersection);
};
function clusters(
  pages: readonly SimilarityPage[],
  kind: DuplicateCluster['kind'],
  pair: (a: SimilarityPage, b: SimilarityPage) => number | null,
): DuplicateCluster[] {
  const eligible = pages
    .filter((p) => !p.noindex)
    .slice(0, 50)
    .sort((a, b) => a.url.localeCompare(b.url));
  const groups: SimilarityPage[][] = [];
  for (const p of eligible) {
    const matching = groups.filter((g) => g.some((x) => pair(p, x) !== null));
    if (matching.length === 0) groups.push([p]);
    else {
      const first = matching[0]!;
      first.push(p);
      for (const other of matching.slice(1)) {
        first.push(...other);
        groups.splice(groups.indexOf(other), 1);
      }
      first.sort((a, b) => a.url.localeCompare(b.url));
    }
  }
  return groups
    .filter((g) => g.length > 1)
    .map((g) => {
      const primary = g[0]!;
      const vals = g.slice(1).map((p) => pair(primary, p) ?? 0);
      const consolidated = g
        .slice(1)
        .every(
          (p) => canonicalTarget(p.canonical, p.url) === canonicalTarget(primary.url, primary.url),
        );
      return {
        kind,
        urls: g.map((p) => p.url),
        disposition: consolidated ? 'properly-consolidated' : 'unconsolidated',
        similarity: vals.length ? Math.min(...vals) : 1,
      };
    });
}
export function detectDuplicateClusters(pages: readonly SimilarityPage[]): DuplicateCluster[] {
  const bounded = pages.slice(0, 50);
  return [
    ...clusters(bounded, 'exact-body', (a, b) =>
      (a.wordCount ?? words(a.text ?? '').length) >= 50 &&
      (b.wordCount ?? words(b.text ?? '').length) >= 50 &&
      ((a.normalizedTextHash &&
        b.normalizedTextHash &&
        a.normalizedTextHash === b.normalizedTextHash) ||
        (a.text && b.text && hash(a.text) === hash(b.text)))
        ? 1
        : null,
    ),
    ...clusters(bounded, 'near-body', (a, b) => {
      if (
        (a.wordCount ?? words(a.text ?? '').length) < 50 ||
        (b.wordCount ?? words(b.text ?? '').length) < 50
      )
        return null;
      const ah = a.simhash64 ?? (a.text ? simhash64(a.text) : null),
        bh = b.simhash64 ?? (b.text ? simhash64(b.text) : null);
      if (!ah || !bh) return null;
      const d = hammingDistance64(ah, bh);
      return d <= 3 ? 1 - d / 64 : null;
    }),
    ...clusters(bounded, 'near-title', (a, b) =>
      a.title && b.title && jaccard(a.title, b.title) >= 0.9 ? jaccard(a.title, b.title) : null,
    ),
    ...clusters(bounded, 'near-description', (a, b) =>
      a.description && b.description && jaccard(a.description, b.description) >= 0.9
        ? jaccard(a.description, b.description)
        : null,
    ),
  ];
}
