/**
 * URL normalization for discovery deduplication.
 * Normalized form: lowercase scheme+host, no fragment, no default port,
 * no trailing slash on non-root paths.
 */
export function normalizeSiteUrl(input: string): string | null {
  try {
    const parsed = new URL(input.trim());
    parsed.hash = '';
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      if (parsed.pathname === '') parsed.pathname = '/';
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** True when two URLs are the same page after normalization. */
export function isDuplicateSiteUrl(a: string, b: string): boolean {
  const normalizedA = normalizeSiteUrl(a);
  const normalizedB = normalizeSiteUrl(b);
  return normalizedA !== null && normalizedA === normalizedB;
}
