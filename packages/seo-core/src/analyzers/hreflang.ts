import type { Finding, PageSnapshot } from '@vittix/shared';
import { HREFLANG_SPECIAL_VALUES, LANG_TAG_PATTERN } from '../rules.js';
import { finding } from './util.js';

function isValidHreflangValue(value: string): boolean {
  const lowered = value.toLowerCase();
  if ((HREFLANG_SPECIAL_VALUES as readonly string[]).includes(lowered)) return true;
  // hreflang values use hyphenated subtags; underscores are a common error.
  return LANG_TAG_PATTERN.test(lowered);
}

/**
 * Hreflang rules — evaluated purely from the page's own <link rel="alternate"
 * hreflang> entries. Cross-page return-link verification would require
 * fetching other URLs, which the zero-network policy forbids; that check is
 * explicitly out of scope.
 */
export function analyzeHreflang(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];
  const entries = snapshot.hreflang;

  if (entries.length === 0) {
    findings.push(
      finding(
        'hreflang-syntax',
        'technical',
        'pass',
        'No hreflang annotations',
        'The page declares no <link rel="alternate" hreflang> entries. This is fine for single-language sites; multi-language sites should declare language variants.',
      ),
    );
    findings.push(
      finding(
        'hreflang-duplicates',
        'technical',
        'pass',
        'Nothing to check for duplicates',
        'No hreflang entries are present.',
      ),
    );
    findings.push(
      finding(
        'hreflang-consistency',
        'technical',
        'pass',
        'Nothing to reconcile with the canonical',
        'No hreflang entries are present.',
      ),
    );
    return findings;
  }

  // --- syntax ----------------------------------------------------------------
  const invalid: string[] = [];
  const missingHref: string[] = [];
  for (const entry of entries) {
    if (entry.href.trim() === '') missingHref.push(entry.lang);
    if (!isValidHreflangValue(entry.lang.trim())) invalid.push(entry.lang);
  }
  const truncated = snapshot.hreflangCount > entries.length;

  if (invalid.length === 0 && missingHref.length === 0) {
    findings.push(
      finding(
        'hreflang-syntax',
        'technical',
        'pass',
        `Hreflang annotations are well-formed (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`,
        `Declared languages: ${entries
          .map((entry) => entry.lang)
          .slice(0, 6)
          .join(
            ', ',
          )}${truncated ? ' …' : ''}. Codes match the expected language-tag shape; cross-page return links are NOT verified (zero-network policy).`,
      ),
    );
  } else {
    findings.push(
      finding(
        'hreflang-syntax',
        'technical',
        missingHref.length > 0 ? 'error' : 'warn',
        'Hreflang annotation problems',
        'Hreflang values must be valid language tags (or x-default) and every entry needs an href. Underscores ("en_US") are a common mistake — hreflang requires hyphens ("en-US").',
        {
          evidence: [
            ...(invalid.length > 0 ? [`invalid codes: ${invalid.slice(0, 3).join(', ')}`] : []),
            ...(missingHref.length > 0
              ? [`missing href: ${missingHref.slice(0, 3).join(', ')}`]
              : []),
          ].join('; '),
          remediation:
            'Fix each <link rel="alternate" hreflang="…"> to use a valid hyphenated language tag and an absolute href.',
        },
      ),
    );
  }

  // --- duplicates ------------------------------------------------------------
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.lang.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
  if (duplicated.length > 0) {
    findings.push(
      finding(
        'hreflang-duplicates',
        'technical',
        'warn',
        'Duplicate hreflang values',
        `${duplicated.length} language code${duplicated.length === 1 ? ' is' : 's are'} declared more than once (${duplicated
          .slice(0, 3)
          .map(([lang, count]) => `${lang}×${count}`)
          .join(
            ', ',
          )}). Search engines cannot tell which URL to serve for that language and may ignore all of the duplicates.`,
        {
          evidence: duplicated
            .slice(0, 3)
            .map(([lang]) => lang)
            .join(', '),
          remediation:
            'Declare each language (or region variant) exactly once; use x-default for the language-selection fallback.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'hreflang-duplicates',
        'technical',
        'pass',
        'No duplicate hreflang values',
        `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} checked; every language code appears once.`,
      ),
    );
  }

  // --- consistency with canonical / self-reference -----------------------------
  // Within available page evidence only: a self-referencing entry (or
  // x-default pointing at the audited URL) is expected, and a canonical that
  // points elsewhere while hreflang self-refers is contradictory.
  const pageUrl = snapshot.url.replace(/\/$/, '').toLowerCase();
  const selfReferencing = entries.filter((entry) => {
    try {
      const resolved = new URL(entry.href, snapshot.url);
      return resolved.href.replace(/\/$/, '').toLowerCase() === pageUrl;
    } catch {
      return false;
    }
  });
  const xDefault = entries.find((entry) => entry.lang.trim().toLowerCase() === 'x-default');
  const hasSelfReference = selfReferencing.length > 0 || (xDefault?.href.trim() ?? '') !== '';

  const canonical = snapshot.meta.canonical?.trim() ?? '';
  let canonicalPointsElsewhere = false;
  if (canonical !== '') {
    try {
      const resolved = new URL(canonical, snapshot.url);
      canonicalPointsElsewhere = resolved.href.replace(/\/$/, '').toLowerCase() !== pageUrl;
    } catch {
      canonicalPointsElsewhere = false;
    }
  }

  if (!hasSelfReference) {
    findings.push(
      finding(
        'hreflang-consistency',
        'technical',
        'info',
        'No self-referencing hreflang entry',
        'Best practice is to include the page in its own hreflang cluster (a link with its own language, or x-default). Clusters without self-references are frequently ignored.',
        {
          remediation:
            'Add a <link rel="alternate" hreflang="…"> entry pointing at this page itself (its own language), plus x-default if a language selector exists.',
        },
      ),
    );
  } else if (canonicalPointsElsewhere) {
    findings.push(
      finding(
        'hreflang-consistency',
        'technical',
        'warn',
        'Canonical contradicts the hreflang cluster',
        'The page participates in an hreflang cluster (self-reference present) but its canonical URL points at a different address. Canonicalizing away from a hreflang member tells search engines to ignore this variant, defeating the annotations.',
        {
          evidence: snapshot.meta.canonical ?? undefined,
          remediation:
            'Either update the canonical to this page’s own URL, or remove this page from the hreflang cluster — the two signals must agree.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'hreflang-consistency',
        'technical',
        'pass',
        'Hreflang cluster is consistent with the canonical',
        hasSelfReference && canonical === ''
          ? 'A self-referencing entry exists and no canonical contradicts it.'
          : 'A self-referencing entry exists and the canonical agrees with it.',
      ),
    );
  }

  return findings;
}
