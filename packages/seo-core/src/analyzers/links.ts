import type { Finding, PageSnapshot } from '@vittix/shared';
import { GENERIC_ANCHOR_TEXTS } from '../rules.js';
import { finding } from './util.js';

/**
 * Link rules. Anchor accessibility uses the accessible name computed at
 * extraction (aria-label → visible text → first descendant img alt).
 *
 *  - link-anchor-text (error): no accessible name at all — a real
 *    accessibility failure
 *  - link-named-nonvisually (info): named, but only via aria-label/image alt
 *    (no visible text) — informational, never score-affecting, because a
 *    non-visual name is valid practice for icon links
 *  - link-profile (info): internal/external/nofollow summary
 */
export function analyzeLinks(snapshot: PageSnapshot): Finding[] {
  const findings: Finding[] = [];

  let internal = 0;
  let external = 0;
  let unresolvable = 0;
  let nofollow = 0;
  const unnamed: string[] = [];
  const namedNonVisually: string[] = [];

  let pageOrigin: string | null = null;
  try {
    pageOrigin = new URL(snapshot.url).host;
  } catch {
    pageOrigin = null;
  }

  for (const link of snapshot.links) {
    const href = link.href.trim();
    try {
      const resolved = new URL(href, snapshot.url);
      if (pageOrigin !== null && resolved.host === pageOrigin) {
        internal += 1;
      } else {
        external += 1;
      }
    } catch {
      unresolvable += 1;
    }
    if ((link.rel ?? '').toLowerCase().includes('nofollow')) {
      nofollow += 1;
    }

    const visibleText = link.text.trim();
    const accessibleName = (link.accessibleName ?? '').trim();
    if (accessibleName === '') {
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
        'These links expose no text, aria-label or image-alt-based name. Screen readers announce them as "link" with no context, and search engines cannot use the anchor as a relevance signal.',
        {
          evidence:
            unnamed.slice(0, 3).join(', ') +
            (unnamed.length > 3 ? `, … (${unnamed.length} total)` : ''),
          remediation:
            'Give each link visible text, an aria-label, or an alt on its inner image. Note: names referenced only via aria-labelledby are not yet detected and may be reported here.',
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
  const detailParts = [
    `${internal} internal · ${external} external link${internal + external === 1 ? '' : 's'}`,
  ];
  if (nofollow > 0) detailParts.push(`${nofollow} nofollow`);
  if (unresolvable > 0) {
    detailParts.push(`${unresolvable} unresolvable href${unresolvable === 1 ? '' : 's'}`);
  }
  if (truncated) detailParts.push(`capped at first ${snapshot.links.length} links`);

  // --- internal link quality: generic anchor texts -----------------------------
  const genericAnchors: string[] = [];
  for (const link of snapshot.links) {
    const name = (link.accessibleName ?? '').trim().toLowerCase();
    if (name === '') continue;
    try {
      const resolved = new URL(link.href.trim(), snapshot.url);
      if (pageOrigin !== null && resolved.host !== pageOrigin) continue;
    } catch {
      continue;
    }
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
