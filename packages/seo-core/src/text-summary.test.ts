import { describe, expect, it } from 'vitest';
import {
  countParagraphs,
  countSentences,
  estimateSyllables,
  fleschReadingEase,
  fnv1a64Hex,
  keywordProminence,
  readingTimeMinutes,
  selectStopWords,
  tokenizeWords,
  topKeywords,
} from './text-summary.js';

describe('tokenizeWords', () => {
  it('lowercases, strips punctuation, keeps numbers', () => {
    expect(tokenizeWords('Hello, World! 42 times — again.')).toEqual([
      'hello',
      'world',
      '42',
      'times',
      'again',
    ]);
  });

  it('returns [] for punctuation-only text', () => {
    expect(tokenizeWords('!!! ... ;;;')).toEqual([]);
  });
});

describe('stop-word selection', () => {
  it('uses the English list for en and unknown languages', () => {
    expect(selectStopWords('en')).toBe(selectStopWords('en-US'));
    expect(selectStopWords('xx')).toEqual(selectStopWords('en'));
    expect(selectStopWords(null)).toEqual(selectStopWords('en'));
  });

  it('the English list contains common stop words', () => {
    const stop = new Set(selectStopWords('en'));
    expect(stop.has('the')).toBe(true);
    expect(stop.has('and')).toBe(true);
    expect(stop.has('keyword')).toBe(false);
  });
});

describe('topKeywords', () => {
  it('removes stop words from unigrams and ranks by count', () => {
    const keywords = topKeywords('Coffee coffee tea. The coffee shop. Tea and coffee.', 'en', 5);
    expect(keywords[0]).toEqual({ term: 'coffee', count: 4 });
    expect(keywords.some((k) => k.term === 'the')).toBe(false);
  });

  it('produces bigrams and trigrams without stop-word-containing n-grams', () => {
    const keywords = topKeywords(
      'Vintage coffee grinder reviews. Vintage coffee grinder guide.',
      'en',
      20,
    );
    expect(keywords.some((k) => k.term === 'vintage coffee grinder')).toBe(true);
    // "the" filtered → no bigram containing it
    expect(keywords.some((k) => k.term.includes(' the '))).toBe(false);
  });

  it('respects the limit and deterministic ordering', () => {
    const text = Array.from({ length: 30 }, (_, i) => `topic${i} topic${i}`).join(' ');
    const keywords = topKeywords(text, 'en', 20);
    expect(keywords.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < keywords.length; i += 1) {
      const prev = keywords[i - 1];
      const curr = keywords[i];
      expect(prev?.count ?? 0).toBeGreaterThanOrEqual(curr?.count ?? 0);
    }
  });

  it('returns [] for empty/stop-word-only text', () => {
    expect(topKeywords('', 'en', 20)).toEqual([]);
    expect(topKeywords('the and of', 'en', 20)).toEqual([]);
  });
});

describe('sentence/paragraph counting', () => {
  it('counts sentence terminators', () => {
    expect(countSentences('One. Two? Three! Four')).toBe(3);
    expect(countSentences('')).toBe(0);
    expect(countSentences('No terminator')).toBe(1);
  });

  it('counts paragraphs on blank-line boundaries', () => {
    expect(countParagraphs('Para one.\n\nPara two.\n\n\nPara three.')).toBe(3);
    expect(countParagraphs('Single paragraph')).toBe(1);
    expect(countParagraphs('')).toBe(0);
  });
});

describe('fnv1a64Hex', () => {
  it('is deterministic and hex-formatted (16 chars)', () => {
    const hash = fnv1a64Hex('hello world');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(fnv1a64Hex('hello world')).toBe(hash);
  });

  it('differs for different inputs', () => {
    expect(fnv1a64Hex('a')).not.toBe(fnv1a64Hex('b'));
  });

  it('handles empty string', () => {
    expect(fnv1a64Hex('')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('fleschReadingEase', () => {
  it('returns a score for English text', () => {
    // "The cat sat." → 3 words, 1 sentence, ~3 syllables → very easy (~116)
    const score = fleschReadingEase(3, 1, 3, 'en');
    expect(score).not.toBeNull();
    expect(score).toBeGreaterThan(100);
  });

  it('returns null for non-English languages', () => {
    expect(fleschReadingEase(10, 2, 8, 'de')).toBeNull();
    expect(fleschReadingEase(10, 2, 8, 'fr-FR')).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(fleschReadingEase(0, 0, 0, 'en')).toBeNull();
  });
});

describe('estimateSyllables / readingTimeMinutes', () => {
  it('estimates syllables heuristically', () => {
    expect(estimateSyllables('cat')).toBe(1);
    expect(estimateSyllables('table')).toBe(2);
    expect(estimateSyllables('')).toBe(0);
  });

  it('reading time: 200 wpm, minimum 1 minute for non-empty', () => {
    expect(readingTimeMinutes(0)).toBe(0);
    expect(readingTimeMinutes(100)).toBe(1);
    expect(readingTimeMinutes(1000)).toBe(5);
  });
});

describe('keywordProminence', () => {
  const surfaces = {
    title: 'Best Coffee Grinders 2026',
    h1Texts: ['Choosing a coffee grinder'],
    description: 'We review coffee grinders for espresso.',
    url: 'https://example.com/coffee-grinders',
    first100Words: 'coffee grinder coffee grinder ...',
  };

  it('detects presence in each surface', () => {
    const result = keywordProminence('coffee grinder', surfaces);
    expect(result).toEqual({
      inTitle: true,
      inH1: true,
      inDescription: true,
      inUrl: true,
      inFirst100Words: true,
    });
  });

  it('is case-insensitive and reports misses', () => {
    const result = keywordProminence('BLENDER', surfaces);
    expect(result.inTitle).toBe(false);
    expect(result.inH1).toBe(false);
  });

  it('empty keyword is never "present"', () => {
    const result = keywordProminence('  ', surfaces);
    expect(Object.values(result).every((value) => value === false)).toBe(true);
  });
});
