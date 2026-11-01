import type { Finding, PageSnapshot, SiteResponseMetadata } from '@vittix/shared';

/** Site-only response rules. No DOM, fetch, Chrome, or browser state is read here. */
export function analyzeResponseMetadata(
  snapshot: Pick<PageSnapshot, 'meta'> | null,
  metadata: SiteResponseMetadata,
): Finding[] {
  const findings: Finding[] = [];
  const push = (
    ruleId: string,
    severity: Finding['severity'],
    title: string,
    detail: string,
    remediation = 'Review the response configuration with the site operator.',
    evidence?: string,
  ) =>
    findings.push({
      ruleId,
      category: 'technical',
      severity,
      title,
      detail,
      remediation,
      ...(evidence ? { evidence } : {}),
    });

  if (!metadata.redirectObservationUnavailable) {
    const hops = metadata.redirectChain;
    push(
      'redirect-chain-long',
      hops.length > 2 ? 'warn' : 'pass',
      hops.length > 2 ? 'Redirect chain is long' : 'Redirect chain is short',
      `${hops.length} redirect hop(s) were observed for this page.`,
      'Update internal links to point directly to the final URL and remove unnecessary redirects.',
      hops.map((hop) => `${hop.status ?? 'unknown'} ${hop.url}`).join(' → ') || undefined,
    );
    const temporary = hops.filter((hop) => hop.status === 302 || hop.status === 307);
    push(
      'redirect-temporary',
      temporary.length ? 'info' : 'pass',
      temporary.length ? 'Temporary redirect observed' : 'No temporary redirect observed',
      temporary.length
        ? `${temporary.length} temporary redirect response(s) used 302 or 307.`
        : 'No 302 or 307 redirect response was observed.',
      'Use a permanent redirect when the URL change is intended to last.',
      temporary.map((hop) => `${hop.status} ${hop.url}`).join(' → ') || undefined,
    );
  }

  const headerNoindex = /(?:^|[,;\s])(?:noindex|none)(?:$|[,;\s])/i.test(metadata.xRobotsTag ?? '');
  const metaNoindex = /(?:^|[,;\s])(?:noindex|none)(?:$|[,;\s])/i.test(snapshot?.meta.robots ?? '');
  // One underlying noindex signal should produce one blocking penalty. The
  // existing meta robots finding owns the issue when both sources agree.
  if (headerNoindex && !metaNoindex) {
    push(
      'x-robots-noindex-header',
      'error',
      'X-Robots-Tag blocks indexing',
      'The response header contains a noindex directive.',
      'Remove the X-Robots-Tag noindex directive if this page should be indexed.',
      metadata.xRobotsTag ?? undefined,
    );
  } else if (!headerNoindex) {
    push(
      'x-robots-noindex-header',
      'pass',
      'No X-Robots-Tag noindex directive',
      'No noindex or none directive was found in the response header.',
    );
  }

  const contentType = metadata.contentType ?? '';
  const isHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType);
  push(
    'non-html-content-type',
    isHtml ? 'pass' : 'info',
    isHtml ? 'HTML content type' : 'Non-HTML content type',
    isHtml
      ? 'The response content type is HTML.'
      : 'This response was not parsed as an HTML page because its content type is not HTML.',
    'Serve crawlable pages with a text/html or application/xhtml+xml content type.',
    contentType || '(missing content-type)',
  );

  const duration = metadata.durationMs;
  if (duration !== null) {
    const severity = duration >= 5000 ? 'warn' : duration >= 2000 ? 'info' : 'pass';
    push(
      'slow-response',
      severity,
      severity === 'warn' ? 'Slow response in this crawl' : 'Response timing observed',
      `The response took ${Math.round(duration)} ms from this browser and network; this is not a lab performance test.`,
      'Check server and network timing with repeatable performance tooling before changing infrastructure.',
      `${Math.round(duration)} ms`,
    );
  }

  const missing = [
    !metadata.hasHsts && 'Strict-Transport-Security',
    !metadata.hasCsp && 'Content-Security-Policy',
    !metadata.hasXContentTypeOptions && 'X-Content-Type-Options',
    !metadata.hasReferrerPolicy && 'Referrer-Policy',
    !metadata.hasFrameProtection && 'frame protection (CSP frame-ancestors or X-Frame-Options)',
  ].filter((value): value is string => Boolean(value));
  push(
    'missing-security-headers',
    'info',
    missing.length ? 'Some security headers were not observed' : 'Security headers were observed',
    missing.length
      ? `Not observed in this response: ${missing.join(', ')}.`
      : 'The checked security header families were present in this response.',
    'Review security-header policy with the site operator; this informational observation does not affect the SEO score.',
  );

  return findings;
}
