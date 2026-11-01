import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  countParagraphs,
  countSentences,
  fnv1a64Hex,
  tokenizeWords,
  topKeywords,
} from '../../../../packages/seo-core/src/text-summary.js';

/**
 * PARITY TEST — the live injector embeds self-contained copies of the
 * text-summary helpers (it is serialized via func.toString() and cannot
 * import). This test extracts the marked embedded-helpers block from the
 * injector source, evaluates it, and asserts IDENTICAL output to the
 * seo-core implementations over a fixture corpus (English, empty,
 * non-English, very long, punctuation-heavy).
 */
const INJECTOR_SRC = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/extension/src/extraction/snapshot-inject.ts',
);

function loadEmbeddedHelpers() {
  const source = readFileSync(INJECTOR_SRC, 'utf8');
  const start = source.indexOf('// === embedded-helpers:start');
  const end = source.indexOf('// === embedded-helpers:end ===');
  expect(start, 'embedded-helpers:start marker missing').toBeGreaterThan(-1);
  expect(end, 'embedded-helpers:end marker missing').toBeGreaterThan(start);
  // The embedded block is TypeScript (annotations on the helpers); strip
  // types with esbuild so the snippet is evaluable as plain JS.
  const esbuild = require('esbuild') as {
    transformSync: (input: string, opts: { loader: string }) => { code: string };
  };
  const snippet = esbuild.transformSync(source.slice(start, end), { loader: 'ts' }).code;
  const factory = new Function(
    `${snippet}; return { tokenize, topKeywords, fnv1a64Hex, countSentences: countSentencesEmb, countParagraphs: countParagraphsEmb };`,
  );
  return factory() as {
    tokenize: (text: string) => string[];
    topKeywords: (text: string, limit: number) => { term: string; count: number }[];
    fnv1a64Hex: (text: string) => string;
    countSentences: (text: string) => number;
    countParagraphs: (text: string) => number;
  };
}

const CORPUS: Record<string, string> = {
  english:
    'Fresh coffee beans matter. The best coffee grinder reviews! Grinding coffee at home\n\n saves flavor. Coffee, coffee, and more coffee.',
  empty: '',
  nonEnglish:
    'Kaffee mahlen zu Hause. Der Kaffeemühlen Test: frisch & lecker. 日本語のテキストも処理します。',
  veryLong: 'quality content word '.repeat(5_000),
  punctuationHeavy:
    '!! "quotes" — dashes... {braces}; [brackets], (parens)? #hash @at 100% --- ...',
};

describe('PRE-STEP: injector/seo-core helper parity', () => {
  const embedded = loadEmbeddedHelpers();

  function parity(name: string, text: string) {
    expect(embedded.tokenize(text)).toEqual(tokenizeWords(text));
    expect(embedded.topKeywords(text, 20)).toEqual(topKeywords(text, 'en', 20));
    expect(embedded.fnv1a64Hex(text)).toBe(fnv1a64Hex(text));
    expect(embedded.countSentences(text)).toBe(countSentences(text));
    expect(embedded.countParagraphs(text)).toBe(countParagraphs(text));
  }

  it.each(Object.keys(CORPUS))('parity over %s corpus', (name) => {
    parity(name, CORPUS[name]);
  });
});
