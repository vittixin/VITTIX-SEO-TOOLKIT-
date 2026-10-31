import type { Finding, PageSnapshot } from '@vittix/shared';
import { CONTENT_LENGTH_MIN_WORDS } from '../rules.js';
import { finding } from './util.js';

/**
 * Thin-content rule (v0.4.0).
 *
 * - warn when the word count is below CONTENT_LENGTH_MIN_WORDS and the page
 *   is indexable (no noindex/none robots directive).
 * - info when the text sample was truncated at the extraction cap — the
 *   count is partial, so thinness cannot be confirmed.
 * - pass when the count is at or above the threshold.
 * - never errors: word count alone cannot prove a quality problem, and
 *   legitimately sparse pages (legal notices, contact pages) exist.
 *
 * "Obviously app/utility pages" cannot be detected reliably from markup
 * alone, so the only applicability filter is indexability; the heuristic is
 * documented as such.
 */
export function analyzeContent(snapshot: PageSnapshot): Finding[] {
  const wordCount = snapshot.textStats.wordCount;
  const robots = snapshot.meta.robots?.toLowerCase() ?? '';
  const indexable = !/\bnoindex\b/.test(robots) && !/\bnone\b/.test(robots);
  const partial = snapshot.textStats.textSampleTruncated === true;

  if (!indexable) {
    return [
      finding(
        'content-length',
        'content',
        'pass',
        'Content rule not applied (non-indexable page)',
        `The robots directive prevents indexing, so the ${wordCount}-word body length is not evaluated as a quality signal.`,
      ),
    ];
  }

  if (wordCount < CONTENT_LENGTH_MIN_WORDS) {
    if (partial) {
      return [
        finding(
          'content-length',
          'content',
          'info',
          `Thin content suspected, but the count is partial (${wordCount}+ words)`,
          `The word count is partial: the body text hit the extraction sample cap. The full page may exceed the ${CONTENT_LENGTH_MIN_WORDS}-word guidance — the audit cannot confirm either way.`,
          {
            remediation:
              'If the page is genuinely thin, expand the unique text content around the primary topic; re-run the audit after checking the full page.',
          },
        ),
      ];
    }
    return [
      finding(
        'content-length',
        'content',
        'warn',
        `Thin content: only ${wordCount} words`,
        `The page body contains only ${wordCount} words; pages with fewer than ${CONTENT_LENGTH_MIN_WORDS} words rarely rank for competitive queries and give search engines little context. This heuristic cannot detect genuinely sparse page types (legal notices, contact forms) — use judgment.`,
        {
          remediation: `Expand the unique, useful text content around the page's primary topic toward ${CONTENT_LENGTH_MIN_WORDS}+ words; avoid padding.`,
        },
      ),
    ];
  }

  return [
    finding(
      'content-length',
      'content',
      'pass',
      `Content length is healthy (${wordCount.toLocaleString()} words)`,
      partial
        ? `The counted sample already exceeds ${CONTENT_LENGTH_MIN_WORDS} words and the full page has more.`
        : `The page body contains ${wordCount.toLocaleString()} words (guidance: ${CONTENT_LENGTH_MIN_WORDS}+).`,
    ),
  ];
}
