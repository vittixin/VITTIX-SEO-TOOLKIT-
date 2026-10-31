import type { Finding, PageSnapshot } from '@vittix/shared';
import { finding } from './util.js';

/**
 * Target-keyword rules. Only fire when the user supplies a target keyword
 * for the URL (stored locally per URL); with no keyword, emit nothing.
 * All severities are informational — keyword placement guidance, not faults.
 */
export function analyzeKeywords(
  snapshot: PageSnapshot,
  targetKeyword: string | undefined,
): Finding[] {
  const trimmedKeyword = targetKeyword?.trim() ?? '';
  if (trimmedKeyword === '') return [];
  const keyword = trimmedKeyword;
  if (keyword === '') return [];

  const title = snapshot.title.toLowerCase();
  const h1Texts = snapshot.headings
    .filter((heading) => heading.tag === 'h1')
    .map((heading) => heading.text.toLowerCase());
  const needle = keyword.replace(/[-_]/g, ' ');

  const findings: Finding[] = [];

  findings.push(
    finding(
      'keyword-in-title',
      'content',
      title.includes(needle) ? 'pass' : 'info',
      title.includes(needle)
        ? `Target keyword found in the title`
        : 'Target keyword is not in the title',
      title.includes(needle)
        ? `The title contains the target keyword "${keyword}".`
        : `The title does not contain the target keyword "${keyword}". Titles with the target term (near the front) give a clear relevance signal.`,
      {
        evidence: snapshot.title,
        remediation: `Consider working "${keyword}" naturally into the title, preferably near the beginning.`,
      },
    ),
  );

  const h1Has = h1Texts.some((h1) => h1.includes(needle));
  findings.push(
    finding(
      'keyword-in-h1',
      'content',
      h1Has ? 'pass' : 'info',
      h1Has ? 'Target keyword found in the h1' : 'Target keyword is not in the h1',
      h1Has
        ? `At least one h1 contains the target keyword "${keyword}".`
        : h1Texts.length === 0
          ? `The page has no h1, so the target keyword "${keyword}" cannot appear in it.`
          : `No h1 contains the target keyword "${keyword}". Alignment between the h1 and the target term reinforces topical relevance.`,
      {
        evidence: h1Texts[0] ?? undefined,
        remediation: 'Align the h1 with the page\u2019s target keyword where it reads naturally.',
      },
    ),
  );

  return findings;
}
