import type { Finding, PageSnapshot } from '@vittix/shared';
import { finding } from './util.js';

/** Heading structure rules: exactly one h1, logical level order. */
export function analyzeHeadings(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  const h1Count = snapshot.headingCounts.h1;

  if (h1Count === 0) {
    findings.push(
      finding(
        'h1-present',
        'headings',
        'error',
        'Page has no h1 heading',
        'The h1 is the main heading of the page and should state its topic. Use exactly one h1 per page.',
        {
          remediation: 'Add a single <h1> that names the page’s main topic.',
        },
      ),
    );
  } else {
    findings.push(
      finding('h1-present', 'headings', 'pass', 'Page has an h1 heading', `${h1Count} h1 found.`),
    );
    if (h1Count > 1) {
      findings.push(
        finding(
          'h1-unique',
          'headings',
          'error',
          'Multiple h1 headings',
          `${h1Count} h1 elements were found. Multiple h1s dilute the topical signal of the page and usually indicate a structural template issue.`,
          {
            remediation: `Demote ${h1Count - 1} of the h1 elements to h2/h3 so only the page’s main heading remains.`,
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'h1-unique',
          'headings',
          'pass',
          'Exactly one h1 heading',
          'The page has a single main heading, as recommended.',
        ),
      );
    }
  }

  if (snapshot.headings.length === 0) {
    findings.push(
      finding(
        'heading-order',
        'headings',
        'warn',
        'Page has no heading outline',
        'No h1–h6 elements were found. Headings structure content for users, assistive technology and search engines.',
        {
          remediation:
            'Structure the content with headings, starting from one h1 and nesting h2–h6 without gaps.',
        },
      ),
    );
    return findings;
  }

  // Detect skipped levels (e.g. h1 followed by h3).
  const skips: string[] = [];
  let previousLevel = 0;
  for (const heading of snapshot.headings) {
    const level = Number(heading.tag[1]);
    if (previousLevel > 0 && level > previousLevel + 1) {
      skips.push(`h${previousLevel} → h${level}`);
    }
    previousLevel = level;
  }

  if (skips.length > 0) {
    findings.push(
      finding(
        'heading-order',
        'headings',
        'warn',
        'Heading levels are skipped',
        'Heading levels should increase one step at a time so the outline stays machine- and reader-friendly.',
        {
          evidence:
            skips.slice(0, 5).join(', ') + (skips.length > 5 ? `, … (${skips.length} skips)` : ''),
          remediation:
            'Fill in the missing intermediate level (e.g. add an h2 before an h3 that follows an h1).',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'heading-order',
        'headings',
        'pass',
        'Heading order is logical',
        `${snapshot.headings.length} heading${snapshot.headings.length === 1 ? '' : 's'} analyzed with no skipped levels.`,
      ),
    );
  }

  return findings;
}
