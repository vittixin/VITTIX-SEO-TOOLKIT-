/**
 * Content-summary and readability helpers. PURE TypeScript: no DOM, no
 * Chrome APIs, no network. Both extraction paths use these results — the
 * live-DOM injector embeds an equivalent self-contained copy (it is
 * serialized via func.toString() and cannot import), while the fetched-HTML
 * path imports this module directly. A parity note is documented in
 * docs/ARCHITECTURE.md.
 *
 * English-focused by design; other languages fall back gracefully (see
 * selectStopWords and fleschReadingEase).
 */

/** Small embedded English stop-word list (subset, enough for top-keyword filtering). */
export const ENGLISH_STOP_WORDS: readonly string[] = [
  'a',
  'about',
  'above',
  'after',
  'again',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'you',
  'your',
  'yours',
];

const STOP_WORD_SETS: Record<string, readonly string[]> = {
  en: ENGLISH_STOP_WORDS,
};

/**
 * Language-aware stop-word selection. Unknown languages fall back to the
 * English list (graceful degradation); callers surface the limitation.
 */
export function selectStopWords(lang: string | null | undefined): readonly string[] {
  const code = (lang ?? '').trim().toLowerCase().split('-')[0] ?? '';
  return STOP_WORD_SETS[code] ?? ENGLISH_STOP_WORDS;
}

/** Lowercased word tokens, punctuation stripped, numbers kept. */
export function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9\u00c0-\u024f']+/g) ?? []).map((word) =>
    word.replace(/^'+|'+$/g, ''),
  );
}

/** Approximate sentence count: terminator characters, minimum 1 when text is non-empty. */
export function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(\s|$)/g);
  if (matches !== null && matches.length > 0) return matches.length;
  return text.trim() === '' ? 0 : 1;
}

/** Approximate paragraph count from block separators, minimum 1 when text is non-empty. */
export function countParagraphs(text: string): number {
  const parts = text.split(/\n\s*\n/).filter((part) => part.trim() !== '');
  return parts.length;
}

/**
 * Top keyword frequencies (unigrams + bigrams + trigrams, stop-words removed
 * from unigrams; n-grams containing stop-words at any position are dropped).
 * Returns up to `limit` entries sorted by count desc, then term asc.
 */
export function topKeywords(
  text: string,
  lang: string | null | undefined,
  limit: number,
): { term: string; count: number }[] {
  const stop = new Set(selectStopWords(lang));
  const tokens = tokenizeWords(text).filter((word) => word !== '' && !stop.has(word));
  const counts = new Map<string, number>();
  const bump = (term: string) => counts.set(term, (counts.get(term) ?? 0) + 1);
  for (const word of tokens) bump(word);
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    const first = tokens[i];
    const second = tokens[i + 1];
    if (first === undefined || second === undefined) continue;
    bump(`${first} ${second}`);
  }
  for (let i = 0; i + 2 < tokens.length; i += 1) {
    const first = tokens[i];
    const second = tokens[i + 1];
    const third = tokens[i + 2];
    if (first === undefined || second === undefined || third === undefined) continue;
    bump(`${first} ${second} ${third}`);
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}

/**
 * FNV-1a 64-bit hash, hex-encoded. NOT cryptographic — used only for
 * duplicate-content detection where collision resistance against adversaries
 * is not required.
 */
export function fnv1a64Hex(text: string): string {
  // Emulated 64-bit FNV-1a via two 32-bit halves (JS numbers lack int64).
  let hLow = 0x84222325;
  let hHigh = 0xcbf29ce4;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // XOR low byte of the char code (UTF-16 code unit — good enough for
    // duplicate detection of the same decoded text).
    hLow ^= code & 0xff;
    hLow = Math.imul(hLow, 0x01000193) >>> 0;
    hHigh ^= (code >>> 8) & 0xff;
    hHigh = Math.imul(hHigh, 0x01000193) >>> 0;
  }
  return hHigh.toString(16).padStart(8, '0') + hLow.toString(16).padStart(8, '0');
}

/** Rough English syllable estimator (heuristic; documented as approximate). */
export function estimateSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean === '') return 0;
  if (clean.length <= 3) return 1;
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups === null ? 1 : groups.length);
}

/**
 * Flesch Reading Ease for ENGLISH text. Returns null for other languages —
 * the syllable heuristic is English-specific and the UI says so.
 * Score = 206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words).
 */
export function fleschReadingEase(
  words: number,
  sentences: number,
  syllables: number,
  lang: string | null | undefined,
): number | null {
  const code = (lang ?? 'en').trim().toLowerCase().split('-')[0];
  if (code !== 'en') return null;
  if (words === 0 || sentences === 0) return null;
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  return Math.round(score * 10) / 10;
}

/** Reading time in whole minutes at 200 wpm, minimum 1 for non-empty text. */
export function readingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.round(wordCount / 200));
}

export interface KeywordProminence {
  inTitle: boolean;
  inH1: boolean;
  inDescription: boolean;
  inUrl: boolean;
  inFirst100Words: boolean;
}

/** Where does the target keyword appear? Case-insensitive; URL treats -/_// as word separators. */
export function keywordProminence(
  term: string,
  surfaces: {
    title: string;
    h1Texts: readonly string[];
    description: string;
    url: string;
    first100Words: string;
  },
): KeywordProminence {
  const needle = term.trim().toLowerCase();
  const has = (haystack: string) => needle !== '' && haystack.toLowerCase().includes(needle);
  // Slugs separate words with -/_/; normalize so "coffee grinder" matches
  // /coffee-grinders.
  const normalizedUrl = surfaces.url.toLowerCase().replace(/[-_/]/g, ' ');
  const normalizedNeedle = needle.replace(/[-_]/g, ' ');
  const inUrl = normalizedNeedle !== '' && normalizedUrl.includes(normalizedNeedle);
  return {
    inTitle: has(surfaces.title),
    inH1: surfaces.h1Texts.some((h1) => has(h1)),
    inDescription: has(surfaces.description),
    inUrl,
    inFirst100Words: has(surfaces.first100Words),
  };
}
