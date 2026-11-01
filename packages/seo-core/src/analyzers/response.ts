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

  if (metadata.redirected) {
    push(
      'redirect-present',
      'info',
      'URL redirects to another URL',
      'The browser followed a redirect and returned a final URL. Individual hops and status codes are not observable.',
      'Update internal links to point directly to the final URL when practical.',
      metadata.redirectFinalUrl ?? undefined,
    );
  }
  if (metadata.fetchFailedPossibleRedirect) {
    push(
      'fetch-failed-possible-redirect',
      'info',
      'Fetch failed; redirect could not be confirmed',
      'The browser returned a generic fetch failure. A cross-origin redirect blocked by CORS or another network failure is possible; the destination URL was not observable.',
      'Check the page URL and network configuration. This result does not establish that a redirect occurred.',
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
