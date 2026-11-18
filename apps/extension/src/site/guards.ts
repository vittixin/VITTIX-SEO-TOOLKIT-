/**
 * Site-audit origin guards — the SSRF / private-network boundary.
 *
 * Default-deny: https URLs with a public hostname pass, plus the two explicit
 * HTTP development origins supported for local testing.
 * These checks run BEFORE the permission request and again on every URL
 * considered for fetching. See docs/SITE_AUDIT.md.
 */

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.lan$/i,
  /\.home\.arpa$/i,
  /\.localdomain$/i,
];

const PRIVATE_IP_CHECKS: { match: (host: string) => boolean; label: string }[] = [
  // IPv4 loopback 127.0.0.0/8 and 0.0.0.0
  { match: (h) => /^127\./.test(h) || h === '0.0.0.0', label: 'loopback' },
  // IPv4 link-local 169.254.0.0/16
  { match: (h) => /^169\.254\./.test(h), label: 'link-local' },
  // IPv4 private 10.0.0.0/8
  { match: (h) => /^10\./.test(h), label: 'private' },
  // IPv4 private 172.16.0.0/12
  {
    match: (h) => {
      const match = /^172\.(\d+)\./.exec(h);
      if (!match) return false;
      const second = Number(match[1]);
      return second >= 16 && second <= 31;
    },
    label: 'private',
  },
  // IPv4 private 192.168.0.0/16
  { match: (h) => /^192\.168\./.test(h), label: 'private' },
  // IPv6 loopback / link-local / unique-local
  {
    match: (h) => {
      const lowered = h.replace(/^\[|\]$/g, '').toLowerCase();
      return (
        lowered === '::1' ||
        lowered === '::' ||
        lowered.startsWith('fe80:') ||
        lowered.startsWith('fc') ||
        lowered.startsWith('fd')
      );
    },
    label: 'local-ipv6',
  },
];

export type OriginCheckResult =
  { allowed: true; origin: string } | { allowed: false; reason: string };

/** Validate a user-entered site URL as an audit target. */
export function checkCrawlableOrigin(input: string): OriginCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { allowed: false, reason: 'Not a valid URL.' };
  }

  const localDev =
    parsed.protocol === 'http:' &&
    (parsed.hostname.toLowerCase() === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !localDev) {
    return {
      allowed: false,
      reason: 'Site audits support https:// only (http, files and other schemes are rejected).',
    };
  }

  // Fail closed on embedded credentials (https://user:pass@host/): they are
  // never legitimate for an audit target and could smuggle secrets into
  // logs or redirects.
  if (parsed.username !== '' || parsed.password !== '') {
    return {
      allowed: false,
      reason: 'URLs with embedded credentials (user:pass@host) cannot be audited.',
    };
  }

  const host = parsed.hostname;
  if (host === '') {
    return { allowed: false, reason: 'URL has no host.' };
  }

  // Reject single-label hostnames (no dot, not localhost) and known private
  // suffixes to avoid accidentally auditing intranet names.
  if (!localDev && !host.includes('.') && host.toLowerCase() !== 'localhost') {
    return {
      allowed: false,
      reason: `"${host}" is a single-label hostname and cannot be audited.`,
    };
  }

  if (!localDev && PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return {
      allowed: false,
      reason: `"${host}" is a local or private hostname and cannot be audited.`,
    };
  }

  // Any IPv4/IPv6 literal host is rejected: private-network ranges are
  // forbidden, and public IP literals offer no meaningful origin identity.
  if (!localDev && /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const blockedBy = PRIVATE_IP_CHECKS.find((check) => check.match(host));
    if (blockedBy) {
      return {
        allowed: false,
        reason: `"${host}" is a ${blockedBy.label} address and cannot be audited.`,
      };
    }
    return {
      allowed: false,
      reason: 'IP-literal hosts cannot be audited — enter a domain name instead.',
    };
  }
  if (!localDev && host.includes(':')) {
    // IPv6 literal (hostname keeps brackets inside URL.hostname? No —
    // URL.hostname strips brackets for IPv6; detect by colon presence).
    return {
      allowed: false,
      reason: 'IPv6 hosts cannot be audited — enter a domain name instead.',
    };
  }

  return { allowed: true, origin: parsed.origin };
}

/** Re-check an arbitrary candidate URL against the approved origin. */
export function isSameOriginUrl(candidate: string, approvedOrigin: string): boolean {
  try {
    // Normalize the approved origin too: URL.origin never carries a trailing
    // slash, but a stored origin string might.
    return new URL(candidate).origin === new URL(approvedOrigin).origin;
  } catch {
    return false;
  }
}

/** Chrome match patterns ignore ports; same-origin checks retain the port. */
export function permissionPatternForOrigin(origin: string): string {
  const parsed = new URL(origin);
  return `${parsed.protocol}//${parsed.hostname}/*`;
}
