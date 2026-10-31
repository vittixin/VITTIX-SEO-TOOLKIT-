/**
 * URL guards. Only ordinary http(s) pages can be analyzed. Everything else —
 * browser-internal pages (chrome://, edge://, about:), other extensions'
 * pages, local files, PDF viewers — is rejected before any injection.
 */
export function isAnalyzableUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || url === '') return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Hostname helper for UI display; null for unparseable URLs. */
export function pageHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
