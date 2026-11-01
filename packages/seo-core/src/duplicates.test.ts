import { describe, expect, it } from 'vitest';
import {
  detectDuplicateClusters,
  hammingDistance64,
  normalizedTextHash,
  simhash64,
} from './duplicates.js';

describe('bounded duplicate heuristics', () => {
  it('handles empty and unicode text deterministically', () => {
    expect(normalizedTextHash('')).toBe(normalizedTextHash('   '));
    expect(simhash64('')).toBe('0000000000000000');
    expect(simhash64('東京 café')).toBe(simhash64('東京 café'));
    expect(hammingDistance64('0', 'f')).toBe(4);
  });
  it('clusters duplicates, canonical consolidation, and ignores noindex', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const found = detectDuplicateClusters([
      { url: 'https://e.test/a', text, title: 'Same title words', canonical: 'https://e.test/a' },
      { url: 'https://e.test/b', text, title: 'Same title words', canonical: 'https://e.test/a' },
      { url: 'https://e.test/c', text, title: 'Same title words', noindex: true },
    ]);
    expect(
      found.some((c) => c.kind === 'exact-body' && c.disposition === 'properly-consolidated'),
    ).toBe(true);
    expect(found.every((c) => !c.urls.includes('https://e.test/c'))).toBe(true);
  });
  it('skips short body text and caps at 50 pages', () => {
    expect(
      detectDuplicateClusters([
        { url: 'a', text: 'too short' },
        { url: 'b', text: 'too short' },
      ]).some((c) => c.kind.includes('body')),
    ).toBe(false);
    const pages = Array.from({ length: 52 }, (_, i) => ({ url: `${i}`, title: 'same title' }));
    expect(detectDuplicateClusters(pages).flatMap((c) => c.urls).length).toBeLessThanOrEqual(50);
  });
});
