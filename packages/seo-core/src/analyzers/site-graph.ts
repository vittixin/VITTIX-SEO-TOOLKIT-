import type { Finding } from '@vittix/shared';
/** Site-only link hygiene finding; `redirectedUrls` comes from recorded crawl outcomes. */
export function analyzeInternalRedirectLinks(
  pages: readonly { url: string; links: readonly { url: string }[] }[],
  redirectedUrls: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const page of pages) {
    const targets = [
      ...new Set(page.links.map((link) => link.url).filter((url) => redirectedUrls.has(url))),
    ];
    if (targets.length)
      findings.push({
        ruleId: 'redirect-in-internal-links',
        category: 'technical',
        severity: 'info',
        title: 'Internal links point to redirecting URLs',
        detail: `${targets.length} internal link target(s) redirected during this crawl.`,
        remediation:
          'Update internal links to point directly to each observed final URL when practical.',
        evidence: targets.slice(0, 10).join(', '),
      });
  }
  return findings;
}
