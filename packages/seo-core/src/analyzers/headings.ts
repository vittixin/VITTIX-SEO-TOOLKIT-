import type { Finding, PageSnapshot } from '@vittix/shared';
import { selectStopWords, tokenizeWords } from '../text-summary.js';
import { finding } from './util.js';

const stopSet = new Set(selectStopWords('en'));

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

  // --- empty headings (v0.5.0) -------------------------------------------------
  const emptyHeadings = snapshot.headings.filter((heading) => heading.text.trim() === '');
  if (emptyHeadings.length > 0) {
    findings.push(
      finding(
        'heading-empty',
        'headings',
        'warn',
        `${emptyHeadings.length} empty heading${emptyHeadings.length === 1 ? '' : 's'}`,
        'Empty heading elements (no text) confuse the document outline: screen readers announce an empty level and search engines gain no context. Usually caused by empty tags left in templates or image-only headings without alt text.',
        {
          remediation:
            'Remove empty heading elements or give them text (an image-only heading should have equivalent text in alt or visually-hidden markup).',
        },
      ),
    );
  } else if (snapshot.headings.length > 0) {
    findings.push(
      finding(
        'heading-empty',
        'headings',
        'pass',
        'No empty headings',
        `${snapshot.headings.length} headings checked.`,
      ),
    );
  }

  // --- duplicate heading text (v0.5.0) ------------------------------------------
  const seen = new Map<string, number>();
  for (const heading of snapshot.headings) {
    const text = heading.text.trim().toLowerCase();
    if (text === '') continue;
    seen.set(text, (seen.get(text) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    findings.push(
      finding(
        'heading-duplicate',
        'headings',
        'info',
        `${duplicates.length} duplicate heading text${duplicates.length === 1 ? '' : 's'}`,
        'Multiple headings share identical text. Repeated headings (e.g. card grids, product tiles) are common and acceptable — but on content pages they can signal a weak outline. Informational only.',
        {
          evidence:
            duplicates
              .slice(0, 3)
              .map(([text, count]) => `"${text.slice(0, 40)}" ×${count}`)
              .join(', ') + (duplicates.length > 3 ? `, … (${duplicates.length} total)` : ''),
          remediation:
            'Where headings describe distinct content, differentiate them so the outline stays informative.',
        },
      ),
    );
  } else if (snapshot.headings.length > 0) {
    findings.push(
      finding(
        'heading-duplicate',
        'headings',
        'pass',
        'No duplicate heading text',
        `${snapshot.headings.length} headings checked.`,
      ),
    );
  }

  // --- title/h1 term alignment (v0.5.0) ------------------------------------------
  const titleWords = new Set(
    tokenizeWords(snapshot.title).filter((word) => word.length > 3 && !stopSet.has(word)),
  );
  const h1Words = new Set(
    snapshot.headings
      .filter((heading) => heading.tag === 'h1')
      .flatMap((heading) => tokenizeWords(heading.text)),
  );
  // Requires both to exist; absence is handled by title-present / h1-present.
  if (titleWords.size > 0 && h1Words.size > 0) {
    const shared = [...titleWords].filter((word) => h1Words.has(word));
    if (shared.length === 0) {
      findings.push(
        finding(
          'title-h1-alignment',
          'headings',
          'info',
          'Title and h1 share no meaningful terms',
          'The title and the h1 have no content words in common. Aligned title/h1 wording reinforces the page topic; divergence is not wrong (e.g. brand-style titles) but is worth a look.',
          {
            remediation: 'Consider aligning the h1 wording with the title\u2019s primary topic.',
          },
        ),
      );
    } else {
      findings.push(
        finding(
          'title-h1-alignment',
          'headings',
          'pass',
          'Title and h1 are aligned',
          `Shared terms: ${shared.slice(0, 5).join(', ')}.`,
        ),
      );
    }
  }

  return findings;
}
