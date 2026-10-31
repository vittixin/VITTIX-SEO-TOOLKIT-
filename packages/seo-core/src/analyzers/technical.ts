import type { Finding, PageSnapshot } from '@vittix/shared';
import { finding } from './util.js';

/**
 * Technical rules added in v0.5.0: canonical self-reference, favicon,
 * pagination rel links, mixed content, URL hygiene. All are pure functions
 * of the snapshot.
 */
export function analyzeTechnical(snapshot: PageSnapshot): Finding[] {
  const pagination = paginationRule(snapshot);
  return [
    ...canonicalSelfReferenceRules(snapshot),
    faviconRule(snapshot),
    ...(pagination !== null ? [pagination] : []),
    ...mixedContentRule(snapshot),
    ...urlHygieneRule(snapshot),
  ];
}

function canonicalSelfReferenceRules(snapshot: PageSnapshot): Finding[] {
  const canonical = snapshot.meta.canonical?.trim() ?? '';
  if (canonical === '') return []; // absence handled by canonical-present

  let canonicalHost: string | null = null;
  try {
    canonicalHost = new URL(canonical, snapshot.url).host;
  } catch {
    return []; // invalid canonical handled by canonical-valid
  }

  let pageHost: string | null = null;
  try {
    pageHost = new URL(snapshot.url).host;
  } catch {
    pageHost = null;
  }

  const sameHost = pageHost !== null && canonicalHost !== null && canonicalHost === pageHost;
  const sameUrl = canonical.replace(/\/$/, '') === snapshot.url.replace(/\/$/, '');
  if (sameUrl) {
    return [
      finding(
        'canonical-self-reference',
        'metadata',
        'pass',
        'Canonical URL is self-referencing',
        'The canonical points at this page itself — the clearest signal of the preferred version.',
      ),
    ];
  }
  const hasHreflang = snapshot.hreflang.length > 0;
  if (!sameHost && !hasHreflang) {
    return [
      finding(
        'canonical-self-reference',
        'metadata',
        'warn',
        'Canonical points to a different host without hreflang justification',
        'The canonical URL is on another host and this page declares no hreflang alternates. Cross-host canonicals without hreflang tell search engines to ignore this page entirely. If consolidation is intentional (e.g. syndication), no action is needed.',
        {
          evidence: canonical,
          remediation:
            'If this page should rank itself, make the canonical self-referencing or add hreflang alternates that justify the cross-host canonical.',
        },
      ),
    ];
  }
  return [
    finding(
      'canonical-self-reference',
      'metadata',
      'info',
      sameHost
        ? 'Canonical points elsewhere on the same host'
        : 'Cross-host canonical justified by hreflang',
      sameHost
        ? 'The canonical points to a different URL on the same host — consolidation of variants (parameters, pagination). Confirm the target is the preferred version.'
        : 'The canonical points to another host, but hreflang alternates are declared, which can justify the cross-host canonical.',
      { evidence: canonical },
    ),
  ];
}

function faviconRule(snapshot: PageSnapshot): Finding {
  if (snapshot.faviconPresent) {
    return finding(
      'favicon-present',
      'technical',
      'pass',
      'Favicon is declared',
      'A <link rel="icon"> was found in <head>.',
    );
  }
  return finding(
    'favicon-present',
    'technical',
    'info',
    'No favicon found',
    'No <link rel="icon"> was found. Browsers fall back to /favicon.ico; a declared favicon improves brand display in tabs, bookmarks and search results.',
    {
      remediation:
        'Add <link rel="icon" href="/favicon.ico" sizes="any"> (plus a touch/icon set) to <head>.',
    },
  );
}

function paginationRule(snapshot: PageSnapshot): Finding | null {
  const { prev, next } = snapshot.pagination;
  if (prev === null && next === null) return null; // silent: most pages aren't paginated
  const parts: string[] = [];
  if (prev !== null) parts.push(`rel="prev" → ${prev.slice(0, 120)}`);
  if (next !== null) parts.push(`rel="next" → ${next.slice(0, 120)}`);
  return finding(
    'pagination-rel',
    'technical',
    'info',
    'Pagination links detected',
    `This page declares pagination: ${parts.join('; ')}. Note: Google has confirmed rel=prev/next is not used for indexing — pages should stand on their own (distinct titles, self-referencing canonicals). Kept as an informational observation.`,
    { evidence: parts.join('; ') },
  );
}

function mixedContentRule(snapshot: PageSnapshot): Finding[] {
  if (snapshot.mixedContentSamples.length === 0) return [];
  return [
    finding(
      'mixed-content',
      'technical',
      'warn',
      `${snapshot.mixedContentSamples.length} http:// resource${snapshot.mixedContentSamples.length === 1 ? '' : 's'} on an https page`,
      'Mixed content undermines the page\u2019s TLS protection: browsers block or downgrade these resources and search engines may treat the page as insecure. Detected from img/script/link/iframe sources in the DOM (bounded sample).',
      {
        evidence:
          snapshot.mixedContentSamples.slice(0, 3).join(', ') +
          (snapshot.mixedContentSamples.length > 3
            ? `, … (${snapshot.mixedContentSamples.length} total)`
            : ''),
        remediation:
          'Serve every subresource over https:// (or protocol-relative removal: use https:// explicitly) and redirect http:// asset URLs.',
      },
    ),
  ];
}

function urlHygieneRule(snapshot: PageSnapshot): Finding[] {
  let parsed: URL;
  try {
    parsed = new URL(snapshot.url);
  } catch {
    return []; // invalid page URL already rejected before extraction
  }
  const issues: string[] = [];
  const path = parsed.pathname;
  if (/[A-Z]/.test(path)) issues.push('uppercase characters in the path');
  if (path.includes('_')) issues.push('underscores in the path (hyphens are preferred)');
  if (snapshot.url.length > 115)
    issues.push(`URL is very long (${snapshot.url.length} characters, guidance ≤ 115)`);
  const params = [...parsed.searchParams.keys()];
  if (params.length > 3) issues.push(`many query parameters (${params.length})`);
  const sessionLike = params.filter((key) =>
    /^(session|sid|sess|phpsessid|jsessionid|sessionid|utm_)/i.test(key),
  );
  if (sessionLike.length > 0) {
    issues.push(`session/tracking-style parameters (${sessionLike.slice(0, 3).join(', ')})`);
  }

  if (issues.length === 0) {
    return [
      finding(
        'url-hygiene',
        'technical',
        'pass',
        'URL hygiene is good',
        'No uppercase paths, underscores, excessive length, excessive parameters or session-style parameters detected.',
      ),
    ];
  }
  return [
    finding(
      'url-hygiene',
      'technical',
      'info',
      'URL hygiene observations',
      `URL hygiene is a minor ranking aid and mostly affects usability and link sharing: ${issues.join('; ')}. These are observations, not problems that block indexing.`,
      {
        evidence: snapshot.url.slice(0, 200),
        remediation:
          'Prefer lowercase hyphenated paths, short URLs, and few meaningful query parameters; avoid session identifiers in URLs.',
      },
    ),
  ];
}
