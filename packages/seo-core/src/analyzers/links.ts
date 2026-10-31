import type { Finding, PageSnapshot } from '@vittix/shared';
import { GENERIC_ANCHOR_TEXTS } from '../rules.js';
import { finding } from './util.js';

/**
 * Link classification policy (v0.4.0):
 *
 * - **internal** — http(s) links whose host equals the page host after
 *   stripping a single leading `www.` from BOTH hosts. `www.example.com` and
 *   `example.com` are the same site in practice; any OTHER subdomain
 *   (`cdn.example.com`) is external.
 * - **external** — http(s) links to any other host.
 * - **other** — non-http(s) schemes (`mailto:`, `tel:`, `sms:`,
 *   `javascript:`, `data:`) and pure in-page fragments (`#…`). These are
 *   navigation aids or code, not web resources: they are excluded from the
 *   internal/external counts, the nofollow tally and the generic-anchor
 *   check — but a nameless `mailto:` link is still an accessibility error
 *   (link-anchor-text covers ALL links).
 *
 * Anchor accessibility uses the accessible name computed at extraction
 * (aria-labelledby → aria-label → visible text → img alt → svg title).
 *
 * Severity map:
 *  - link-anchor-text (error): no accessible name at all
 *  - link-named-nonvisually (info): named only via aria/alt/svg (valid for
 *    icon links) — never score-affecting
 *  - internal-link-quality (warn): generic anchor text on internal links
 *  - link-profile (info): bucketed summary
 */

/** Classify one href against the page host. */
export function classifyLink(
  href: string,
  pageHost: string | null,
): 'internal' | 'external' | 'other' {
  const trimmed = href.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return 'other';
  let resolved: URL;
  try {
    resolved = new URL(trimmed);
    // Relative hrefs resolve against the page — but a bare relative path
    // with no scheme is internal by construction when the page is http(s).
  } catch {
    return pageHost === null ? 'other' : 'internal';
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return 'other';
  if (pageHost === null) return 'external';
  const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, '');
  return stripWww(resolved.host) === stripWww(pageHost) ? 'internal' : 'external';
}

export function analyzeLinks(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];

  let internal = 0;
  let external = 0;
  let other = 0;
  let nofollow = 0;
  const unnamed: string[] = [];
  const namedNonVisually: string[] = [];

  let pageHost: string | null = null;
  try {
    pageHost = new URL(snapshot.url).host;
  } catch {
    pageHost = null;
  }

  for (const link of snapshot.links) {
    const href = link.href.trim();
    const bucket = classifyLink(href, pageHost);
    if (bucket === 'internal') internal += 1;
    else if (bucket === 'external') external += 1;
    else other += 1;

    // nofollow is only meaningful for crawlable http(s) links.
    if (bucket !== 'other' && (link.rel ?? '').toLowerCase().includes('nofollow')) {
      nofollow += 1;
    }

    const visibleText = link.text.trim();
    const accessibleName = (link.accessibleName ?? '').trim();
    if (accessibleName === '') {
      // A nameless mailto/tel link is as unusable for screen readers as a
      // nameless http link — the accessibility check covers ALL links.
      unnamed.push(href);
    } else if (visibleText === '') {
      namedNonVisually.push(href);
    }
  }

  if (unnamed.length > 0) {
    findings.push(
      finding(
        'link-anchor-text',
        'links',
        'error',
        `${unnamed.length} ${unnamed.length === 1 ? 'link has' : 'links have'} no accessible name`,
        'These links expose no text, aria-label or image-alt-based name. Screen readers announce them as "link" with no context, and search engines cannot use the anchor as a relevance signal. This includes nameless mailto:/tel: links.',
        {
          evidence:
            unnamed.slice(0, 3).join(', ') +
            (unnamed.length > 3 ? `, … (${unnamed.length} total)` : ''),
          remediation:
            'Give each link visible text, an aria-label, or an alt on its inner image. Note: names referenced only via aria-labelledby are not yet detected and may be reported here.',
          // Affected/checked ratio drives penalty scaling in the scorer.
          // Every <a href> counts — a nameless mailto link is as unusable
          // for screen readers as a nameless http link.
          ratio: snapshot.links.length > 0 ? unnamed.length / snapshot.links.length : 1,
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'link-anchor-text',
        'links',
        'pass',
        'All links have an accessible name',
        `${snapshot.links.length} links checked.`,
      ),
    );
  }

  if (namedNonVisually.length > 0) {
    findings.push(
      finding(
        'link-named-nonvisually',
        'links',
        'info',
        `${namedNonVisually.length} ${namedNonVisually.length === 1 ? 'link is' : 'links are'} named non-visually`,
        'These links have no visible text but do have an accessible name from aria-label or an inner image alt — valid practice for icon links. Informational only; this does not affect the score.',
        {
          evidence:
            namedNonVisually.slice(0, 3).join(', ') +
            (namedNonVisually.length > 3 ? `, … (${namedNonVisually.length} total)` : ''),
          remediation:
            'No action required. If the link is important for sighted users too, consider adding visible text.',
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'link-named-nonvisually',
        'links',
        'pass',
        'All link names are visible as text',
        `${snapshot.links.length} links checked; every name comes from visible text.`,
      ),
    );
  }

  const truncated = snapshot.linkCount > snapshot.links.length;
  const detailParts = [`${internal} internal · ${external} external · ${other} mailto/tel/other`];
  if (nofollow > 0) detailParts.push(`${nofollow} nofollow`);
  if (truncated) detailParts.push(`capped at first ${snapshot.links.length} links`);

  // --- internal link quality: generic anchor texts -----------------------------
  // Internal http(s) links only — mailto:/tel:/fragment links have no
  // topical anchor semantics to evaluate.
  const genericAnchors: string[] = [];
  for (const link of snapshot.links) {
    const name = (link.accessibleName ?? '').trim().toLowerCase();
    if (name === '') continue;
    if (classifyLink(link.href.trim(), pageHost) !== 'internal') continue;
    if ((GENERIC_ANCHOR_TEXTS as readonly string[]).includes(name)) {
      genericAnchors.push(link.href);
    }
  }
  if (genericAnchors.length > 0) {
    findings.push(
      finding(
        'internal-link-quality',
        'links',
        'warn',
        `${genericAnchors.length} internal ${genericAnchors.length === 1 ? 'link uses' : 'links use'} generic anchor text`,
        'Internal links whose text is "click here", "read more", "learn more" and similar generic phrases carry no topical signal about the destination. Descriptive anchors help both users and search engines.',
        {
          evidence:
            genericAnchors.slice(0, 3).join(', ') +
            (genericAnchors.length > 3 ? `, … (${genericAnchors.length} total)` : ''),
          remediation:
            'Rewrite generic anchors to describe the destination, e.g. "read the pricing guide" instead of "read more".',
          // Affected/checked ratio (generic anchors / internal links) drives
          // penalty scaling in the scorer.
          ratio: internal > 0 ? genericAnchors.length / internal : 1,
        },
      ),
    );
  } else {
    findings.push(
      finding(
        'internal-link-quality',
        'links',
        'pass',
        'Internal link anchors are descriptive',
        `${internal} internal link${internal === 1 ? '' : 's'} checked; none use generic phrases like "click here" or "read more".`,
      ),
    );
  }

  findings.push(finding('link-profile', 'links', 'info', 'Link profile', detailParts.join(' — ')));

  return findings;
}
