import { escapeReportHtml, escapeReportMarkdown, type AuditReportOptions } from './report.js';

export interface SiteReportInput {
  session: {
    origin: string;
    status: string;
    startedAt: string;
    finishedAt?: string | null;
    ruleSetVersion?: string;
    stopReason?: string | null;
    pagesDone?: number;
    pagesFailed?: number;
    pagesSkipped?: number;
    pendingPages?: number;
    incomplete?: boolean;
  };
  summary: {
    auditedPages: number;
    failedPages: number;
    skippedPages: number;
    pendingPages: number;
    totalErrors: number;
    totalWarnings: number;
    duplicateTitles: { title: string; urls: string[] }[];
    duplicateDescriptions: { description: string; urls: string[] }[];
    missingTitle: string[];
    missingDescription: string[];
    missingCanonical?: string[];
    noindexPages: string[];
    brokenLinkCandidates: { url: string; httpStatus: number | null; linkedFrom: string[] }[];
    orphanPages: string[] | null;
    scoreDistribution: { poor: number; needsWork: number; good: number; excellent: number };
    errorDistribution: { clean: number; some: number; many: number };
    incomplete: boolean;
    pages: {
      url: string;
      status: string;
      score: number | null;
      errorCount: number;
      warnCount: number;
      truncated: boolean;
      contentType?: string | null;
      responseTimeMs?: number | null;
      redirectCount?: number | null;
      xRobotsTag?: string | null;
    }[];
    sitemap?: {
      notCrawled: string[];
      crawledAbsent: string[] | null;
      inspectedSitemapUrls: {
        url: string;
        noindex: boolean;
        non2xx: boolean;
        redirected: boolean;
        canonicalizedElsewhere: boolean;
      }[];
      invalidLastmodCount: number;
      duplicateCount: number;
      crossOriginCount: number;
      warnings: string[];
      checked: boolean;
    };
  };
  profileId?: string;
  ignoredRuleIds?: string[];
  pages?: readonly {
    url: string;
    result?: {
      findings?: readonly {
        ruleId: string;
        severity: string;
        title: string;
        ignored?: boolean;
        remediation?: string;
      }[];
      score?: { capReason?: string | null };
    } | null;
    snapshot?: {
      textStats?: { wordCount?: number; textSampleTruncated?: boolean };
      textSummary?: { sentenceCount?: number; paragraphCount?: number; leadText?: string };
    } | null;
    targetKeyword?: string;
  }[];
}

export interface SiteReportOptions extends AuditReportOptions {
  profileId?: string;
  ignoredRuleIds?: readonly string[];
}

function tableRows(rows: readonly (readonly unknown[])[]): string {
  return rows
    .map((row) => `<tr>${row.map((value) => `<td>${escapeReportHtml(value)}</td>`).join('')}</tr>`)
    .join('');
}

function duplicateList(title: string, groups: { value: string; urls: string[] }[]): string {
  return `<section><h2>${escapeReportHtml(title)}</h2>${groups.length ? `<ul>${groups.map((group) => `<li><strong>${escapeReportHtml(group.value)}</strong> — ${group.urls.length} pages: ${group.urls.map(escapeReportHtml).join(', ')}</li>`).join('')}</ul>` : '<p>None found in inspected pages.</p>'}</section>`;
}

/** Build self-contained site-level HTML without DOM, browser, or network APIs. */
function buildSiteAuditReportHtmlBase(
  input: SiteReportInput,
  options: SiteReportOptions = {},
): string {
  const { session, summary } = input;
  const pages = summary.pages.slice(0, 200);
  const rows = pages.map((page) => [
    page.url,
    page.status,
    page.score ?? '—',
    page.errorCount,
    page.warnCount,
    page.truncated ? 'Yes' : 'No',
    page.contentType ?? 'Unavailable',
    page.responseTimeMs == null ? 'Unavailable' : Math.round(page.responseTimeMs),
    page.redirectCount == null ? 'Unavailable' : page.redirectCount,
    page.xRobotsTag ?? '—',
  ]);
  const issues = [
    ['Missing title', summary.missingTitle.length],
    ['Missing meta description', summary.missingDescription.length],
    ['Duplicate titles', summary.duplicateTitles.length],
    ['Duplicate descriptions', summary.duplicateDescriptions.length],
    ['Noindex pages', summary.noindexPages.length],
    ['Broken-link candidates', summary.brokenLinkCandidates.length],
  ];
  const stop = session.stopReason
    ? `<p class="notice"><strong>Stop reason:</strong> ${escapeReportHtml(session.stopReason)}</p>`
    : '';
  const incomplete =
    summary.incomplete || summary.pendingPages > 0 || session.status !== 'completed';
  const ignored =
    options.includeIgnoredRules === false
      ? []
      : [
          ...new Set([
            ...(input.ignoredRuleIds ?? options.ignoredRuleIds ?? []),
            ...(input.pages ?? []).flatMap(
              (page) =>
                page.result?.findings
                  ?.filter((finding) => finding.ignored)
                  .map((finding) => finding.ruleId) ?? [],
            ),
          ]),
        ];
  const capReasons = [
    ...new Set(
      (input.pages ?? [])
        .map((page) => page.result?.score?.capReason)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const profile = input.profileId ?? options.profileId ?? 'unknown';
  const accent =
    options.branding?.accentColor && /^#[\da-f]{6}$/i.test(options.branding.accentColor)
      ? options.branding.accentColor
      : '#3157d5';
  const logo =
    options.branding?.logoDataUri &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z\d+/]+=*$/.test(options.branding.logoDataUri) &&
    options.branding.logoDataUri.length <= 136_600
      ? options.branding.logoDataUri
      : null;
  const topRows = tableRows(issues);
  const pageRows = tableRows(rows);
  const sitemap = summary.sitemap;
  const sitemapHtml = sitemap
    ? `<section><h2>Sitemap discovery</h2><p>${sitemap.checked ? 'Checked: sitemap set was fully read.' : 'Unchecked: sitemap set was incomplete or unavailable.'} ${sitemap.invalidLastmodCount} invalid lastmod values; ${sitemap.duplicateCount} duplicate entries; ${sitemap.crossOriginCount} cross-origin entries ignored.</p>${sitemap.warnings.length ? `<ul>${sitemap.warnings.map((warning) => `<li>${escapeReportHtml(warning)}</li>`).join('')}</ul>` : ''}<h3>Sitemap URLs not crawled</h3>${
        sitemap.notCrawled.length
          ? `<ul>${sitemap.notCrawled
              .slice(0, 200)
              .map((url) => `<li>${escapeReportHtml(url)} — not crawled</li>`)
              .join('')}</ul>`
          : '<p>None in the sitemap set.</p>'
      }<h3>Crawled URLs absent from sitemap</h3>${sitemap.crawledAbsent === null ? '<p>Unchecked: sitemap was not fully read.</p>' : sitemap.crawledAbsent.length ? `<ul>${sitemap.crawledAbsent.map((url) => `<li>${escapeReportHtml(url)}</li>`).join('')}</ul>` : '<p>None among crawled pages.</p>'}<h3>Crawled sitemap URL signals</h3>${sitemap.inspectedSitemapUrls.length ? `<ul>${sitemap.inspectedSitemapUrls.map((item) => `<li>${escapeReportHtml(item.url)} — ${[item.noindex && 'noindex', item.non2xx && 'non-2xx', item.redirected && 'redirected', item.canonicalizedElsewhere && 'canonicalized elsewhere'].filter(Boolean).join(', ') || 'no listed signal'}</li>`).join('')}</ul>` : '<p>Unchecked: no sitemap URLs were crawled.</p>'}</section>`
    : '<section><h2>Sitemap discovery</h2><p>Unchecked: sitemap discovery data is unavailable.</p></section>';
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${logo ? 'data:' : "'none'"};`;
  const brandHtml = logo ? `<p class="brand"><img alt="" src="${escapeReportHtml(logo)}"></p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Site audit report — ${escapeReportHtml(session.origin)}</title><style>:root{color-scheme:light dark;--accent:${accent};--bg:#fff;--fg:#172033;--muted:#4b5563;--line:#cbd5e1;--soft:#f1f5f9;--warn:#854d0e}@media(prefers-color-scheme:dark){:root{--bg:#111827;--fg:#f3f4f6;--muted:#cbd5e1;--line:#475569;--soft:#1f2937;--warn:#fcd34d}}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:28px}h1{font-size:2rem}h2{margin-top:2rem;border-bottom:1px solid var(--line)}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{text-align:left;border:1px solid var(--line);padding:8px;overflow-wrap:anywhere}th{background:var(--soft)}.muted{color:var(--muted)}.notice{border-left:5px solid var(--warn);background:var(--soft);padding:12px}.brand{color:var(--accent);font-weight:700}@media print{main{max-width:none;padding:0}tr,li{break-inside:avoid}h2{break-after:avoid}}</style></head><body><main>${options.branding?.agencyName ? `<p class="brand">${escapeReportHtml(options.branding.agencyName.slice(0, 80))}</p>` : ''}<header><p class="muted">Vittix SEO Toolkit · Site audit report</p><h1>Site audit: ${escapeReportHtml(session.origin)}</h1><p>Started: ${escapeReportHtml(session.startedAt)} · Status: ${escapeReportHtml(session.status)} · Profile: ${escapeReportHtml(profile)} · Rule set: ${escapeReportHtml(session.ruleSetVersion ?? 'unknown')}</p></header>${incomplete ? '<p class="notice"><strong>Incomplete site audit.</strong> Results cover completed fetches only and may undercount.</p>' : '<p>Site audit completed.</p>'}${stop}<section><h2>Summary</h2><p>Pages inspected: ${summary.auditedPages} · Failed: ${summary.failedPages} · Skipped: ${summary.skippedPages} · Pending: ${summary.pendingPages} · Errors: ${summary.totalErrors} · Warnings: ${summary.totalWarnings}</p><p>Score distribution: Poor ${summary.scoreDistribution.poor}; Needs work ${summary.scoreDistribution.needsWork}; Good ${summary.scoreDistribution.good}; Excellent ${summary.scoreDistribution.excellent}.</p><p>Error distribution: 0 errors ${summary.errorDistribution.clean}; 1–2 ${summary.errorDistribution.some}; 3+ ${summary.errorDistribution.many}.</p></section><section><h2>Top issues by page count</h2><table><thead><tr><th scope="col">Issue</th><th scope="col">Pages/groups</th></tr></thead><tbody>${topRows}</tbody></table></section>${duplicateList(
    'Duplicate titles',
    summary.duplicateTitles.map((item) => ({ value: item.title, urls: item.urls })),
  )}${duplicateList(
    'Duplicate descriptions',
    summary.duplicateDescriptions.map((item) => ({ value: item.description, urls: item.urls })),
  )}<section><h2>Missing title</h2>${summary.missingTitle.length ? `<ul>${summary.missingTitle.map((url) => `<li>${escapeReportHtml(url)}</li>`).join('')}</ul>` : '<p>None in inspected pages.</p>'}</section><section><h2>Missing meta description</h2>${summary.missingDescription.length ? `<ul>${summary.missingDescription.map((url) => `<li>${escapeReportHtml(url)}</li>`).join('')}</ul>` : '<p>None in inspected pages.</p>'}</section><section><h2>Noindex pages</h2>${summary.noindexPages.length ? `<ul>${summary.noindexPages.map((url) => `<li>${escapeReportHtml(url)}</li>`).join('')}</ul>` : '<p>None in inspected pages.</p>'}</section><section><h2>Broken-link candidates</h2><p>Verified candidates were fetched by this crawl and returned an HTTP error. Unchecked targets are not listed as verified.</p>${summary.brokenLinkCandidates.length ? `<ul>${summary.brokenLinkCandidates.map((candidate) => `<li>${escapeReportHtml(candidate.url)} — HTTP ${candidate.httpStatus ?? 'unknown'}, linked from ${candidate.linkedFrom.length} inspected pages</li>`).join('')}</ul>` : '<p>No verified candidates in this crawl.</p>'}</section><section><h2>Orphan analysis</h2>${summary.orphanPages === null ? '<p>Unchecked: there is not enough inspected link evidence to determine orphan pages.</p>' : summary.orphanPages.length ? `<ul>${summary.orphanPages.map((url) => `<li>${escapeReportHtml(url)}</li>`).join('')}</ul>` : '<p>Checked: no orphan pages found among inspected pages.</p>'}</section>${ignored.length ? `<section><h2>Ignored rules</h2><ul>${ignored.map((id) => `<li><code>${escapeReportHtml(id)}</code> — Ignored</li>`).join('')}</ul></section>` : ''}${capReasons.length ? `<section><h2>Score cap reasons</h2><ul>${capReasons.map((reason) => `<li>${escapeReportHtml(reason)}</li>`).join('')}</ul></section>` : ''}<section><h2>Pages (first 200)</h2><table><thead><tr><th scope="col">URL</th><th scope="col">Status</th><th scope="col">Score</th><th scope="col">Errors</th><th scope="col">Warnings</th><th scope="col">Truncated</th></tr></thead><tbody>${pageRows}</tbody></table>${summary.pages.length > 200 ? '<p>Showing 200 rows. See CSV for the full list.</p>' : ''}</section><footer><p>Scores are preliminary and are not ranking predictions. Page excerpts and target keywords are excluded unless explicitly opted in.</p></footer></main></body></html>`
    .replace('<main>', `<main>${brandHtml}`)
    .replace(
      '<th scope="col">Truncated</th>',
      '<th scope="col">Truncated</th><th scope="col">Content type</th><th scope="col">Response ms</th><th scope="col">Redirects</th><th scope="col">X-Robots-Tag</th>',
    )
    .replace('</footer>', `${sitemapHtml}</footer>`);
}

/** Add excerpt/keyword content only when the export dialog explicitly opts in. */
export function buildSiteAuditReportHtml(
  input: SiteReportInput,
  options: SiteReportOptions = {},
): string {
  const html = buildSiteAuditReportHtmlBase(input, options);
  if (!options.includeContentStats && !options.includePageTextExcerpt && !options.includeKeyword)
    return html;
  const rows = (input.pages ?? [])
    .slice(0, 200)
    .map((page) => {
      const stats = page.snapshot?.textStats;
      const summary = page.snapshot?.textSummary;
      return `<tr><td>${escapeReportHtml(page.url)}</td><td>${stats?.wordCount ?? 'Unavailable'}</td><td>${summary?.sentenceCount ?? 'Unavailable'}</td><td>${summary?.paragraphCount ?? 'Unavailable'}</td>${options.includeKeyword ? `<td>${escapeReportHtml(page.targetKeyword ?? 'Not set')}</td>` : ''}</tr>${options.includePageTextExcerpt && summary?.leadText ? `<tr><td colspan="${options.includeKeyword ? 5 : 4}"><strong>Page excerpt:</strong> ${escapeReportHtml(summary.leadText)}</td></tr>` : ''}`;
    })
    .join('');
  const section = `<section><h2>Content summary (first 200 pages)</h2><table><thead><tr><th scope="col">URL</th><th scope="col">Words</th><th scope="col">Sentences</th><th scope="col">Paragraphs</th>${options.includeKeyword ? '<th scope="col">Target keyword</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></section>`;
  return html.replace('</footer>', `${section}</footer>`);
}

/** Markdown site summary; every page-derived value is escaped before output. */
export function buildSiteAuditMarkdown(
  input: SiteReportInput,
  options: SiteReportOptions = {},
): string {
  const { session, summary } = input;
  const ignoredRuleIds =
    options.includeIgnoredRules === false
      ? []
      : [
          ...new Set([
            ...(input.ignoredRuleIds ?? options.ignoredRuleIds ?? []),
            ...(input.pages ?? []).flatMap(
              (page) =>
                page.result?.findings
                  ?.filter((finding) => finding.ignored)
                  .map((finding) => finding.ruleId) ?? [],
            ),
          ]),
        ];
  const capReasons = [
    ...new Set(
      (input.pages ?? [])
        .map((page) => page.result?.score?.capReason)
        .filter((reason): reason is string => Boolean(reason)),
    ),
  ];
  const lines = [
    ...(options.branding?.agencyName
      ? [`> ${escapeReportMarkdown(options.branding.agencyName.slice(0, 80))}`, '']
      : []),
    `# Site audit: ${escapeReportMarkdown(session.origin)}`,
    '',
    `Status: ${escapeReportMarkdown(session.status)} · Profile: ${escapeReportMarkdown(input.profileId ?? options.profileId ?? 'unknown')} · Rule set: ${escapeReportMarkdown(session.ruleSetVersion ?? 'unknown')}`,
    `Pages inspected: ${summary.auditedPages}; failed: ${summary.failedPages}; skipped: ${summary.skippedPages}; pending: ${summary.pendingPages}`,
    `Errors: ${summary.totalErrors}; warnings: ${summary.totalWarnings}`,
    `Score distribution: poor ${summary.scoreDistribution.poor}, needs work ${summary.scoreDistribution.needsWork}, good ${summary.scoreDistribution.good}, excellent ${summary.scoreDistribution.excellent}`,
    `Error distribution: clean ${summary.errorDistribution.clean}, 1–2 ${summary.errorDistribution.some}, 3+ ${summary.errorDistribution.many}`,
  ];
  const sitemap = summary.sitemap;
  lines.push('', '## Sitemap discovery', '');
  if (!sitemap) {
    lines.push('Unchecked: sitemap discovery data is unavailable.');
  } else {
    lines.push(
      sitemap.checked
        ? 'Checked: sitemap set was fully read.'
        : 'Unchecked: sitemap set was incomplete or unavailable.',
    );
    lines.push(
      `Invalid lastmod: ${sitemap.invalidLastmodCount}; duplicate entries: ${sitemap.duplicateCount}; cross-origin ignored: ${sitemap.crossOriginCount}.`,
    );
    lines.push(...sitemap.warnings.map((warning) => `- ${escapeReportMarkdown(warning)}`));
    lines.push(
      '',
      '### Sitemap URLs not crawled',
      '',
      ...(sitemap.notCrawled.length
        ? sitemap.notCrawled
            .slice(0, 200)
            .map((url) => `- ${escapeReportMarkdown(url)} — not crawled`)
        : ['None in the sitemap set.']),
    );
    lines.push(
      '',
      '### Crawled URLs absent from sitemap',
      '',
      ...(sitemap.crawledAbsent === null
        ? ['Unchecked: sitemap was not fully read.']
        : sitemap.crawledAbsent.length
          ? sitemap.crawledAbsent.map(escapeReportMarkdown)
          : ['None among crawled pages.']),
    );
    lines.push(
      '',
      '### Crawled sitemap URL signals',
      '',
      ...(sitemap.inspectedSitemapUrls.length
        ? sitemap.inspectedSitemapUrls.map(
            (page) =>
              `- ${escapeReportMarkdown(page.url)}: ${[page.noindex && 'noindex', page.non2xx && 'non-2xx', page.redirected && 'redirected', page.canonicalizedElsewhere && 'canonicalized elsewhere'].filter(Boolean).join(', ') || 'no listed signal'}`,
          )
        : ['Unchecked: no sitemap URLs were crawled.']),
    );
  }
  if (summary.incomplete || summary.pendingPages > 0 || session.status !== 'completed')
    lines.push(
      '',
      '> Incomplete site audit; results cover completed fetches only and may undercount.',
    );
  if (session.stopReason)
    lines.push('', `Stop reason: ${escapeReportMarkdown(session.stopReason)}`);
  const list = (heading: string, values: readonly string[]) =>
    lines.push(
      '',
      `## ${heading}`,
      '',
      ...(values.length
        ? values.map((value) => `- ${escapeReportMarkdown(value)}`)
        : ['None in inspected pages.']),
    );
  list('Missing title', summary.missingTitle);
  list('Missing meta description', summary.missingDescription);
  list('Noindex pages', summary.noindexPages);
  lines.push(
    '',
    '## Duplicate titles',
    '',
    ...(summary.duplicateTitles.length
      ? summary.duplicateTitles.map(
          (entry) =>
            `- ${escapeReportMarkdown(entry.title)} — ${entry.urls.length} pages: ${entry.urls.map(escapeReportMarkdown).join(', ')}`,
        )
      : ['None in inspected pages.']),
  );
  lines.push(
    '',
    '## Duplicate descriptions',
    '',
    ...(summary.duplicateDescriptions.length
      ? summary.duplicateDescriptions.map(
          (entry) =>
            `- ${escapeReportMarkdown(entry.description)} — ${entry.urls.length} pages: ${entry.urls.map(escapeReportMarkdown).join(', ')}`,
        )
      : ['None in inspected pages.']),
  );
  lines.push(
    '',
    '## Broken-link candidates',
    '',
    'Verified means the crawl fetched the target and received an HTTP error. Unchecked targets are not marked verified.',
    ...(summary.brokenLinkCandidates.length
      ? summary.brokenLinkCandidates.map(
          (entry) =>
            `- ${escapeReportMarkdown(entry.url)} — HTTP ${entry.httpStatus ?? 'unknown'}; linked from ${entry.linkedFrom.length} inspected pages`,
        )
      : ['No verified candidates in this crawl.']),
  );
  lines.push(
    '',
    '## Orphan analysis',
    '',
    ...(summary.orphanPages === null
      ? ['Unchecked: insufficient inspected link evidence.']
      : summary.orphanPages.length
        ? summary.orphanPages.map((url) => `- ${escapeReportMarkdown(url)}`)
        : ['Checked: none found among inspected pages.']),
  );
  lines.push(
    '',
    '## Top issues by page count',
    '',
    '| Issue | Pages/groups |',
    '| --- | ---: |',
    `| Missing title | ${summary.missingTitle.length} |`,
    `| Missing description | ${summary.missingDescription.length} |`,
    `| Duplicate titles | ${summary.duplicateTitles.length} |`,
    `| Duplicate descriptions | ${summary.duplicateDescriptions.length} |`,
    `| Noindex pages | ${summary.noindexPages.length} |`,
    `| Broken-link candidates | ${summary.brokenLinkCandidates.length} |`,
  );
  const pages = summary.pages.slice(0, 200);
  lines.push(
    '',
    '## Pages (first 200)',
    '',
    '| URL | Status | Score | Errors | Warnings | Content type | Response ms | Redirects | X-Robots-Tag |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |',
    ...pages.map(
      (page) =>
        `| ${escapeReportMarkdown(page.url)} | ${escapeReportMarkdown(page.status)} | ${page.score ?? '—'} | ${page.errorCount} | ${page.warnCount} | ${escapeReportMarkdown(page.contentType ?? 'Unavailable')} | ${page.responseTimeMs == null ? '—' : Math.round(page.responseTimeMs)} | ${page.redirectCount == null ? '—' : page.redirectCount} | ${escapeReportMarkdown(page.xRobotsTag ?? '—')} |`,
    ),
  );
  if (summary.pages.length > 200) lines.push('', 'See CSV for the full page list.');
  if (options.includeContentStats || options.includePageTextExcerpt || options.includeKeyword) {
    lines.push('', '## Content summary (first 200 pages)', '');
    for (const page of (input.pages ?? []).slice(0, 200)) {
      const stats = page.snapshot?.textStats;
      const summaryForPage = page.snapshot?.textSummary;
      lines.push(
        `- ${escapeReportMarkdown(page.url)}: ${stats?.wordCount ?? 'Unavailable'} words, ${summaryForPage?.sentenceCount ?? 'Unavailable'} sentences, ${summaryForPage?.paragraphCount ?? 'Unavailable'} paragraphs${options.includeKeyword ? `; target keyword: ${escapeReportMarkdown(page.targetKeyword ?? 'Not set')}` : ''}`,
      );
      if (options.includePageTextExcerpt && summaryForPage?.leadText)
        lines.push(`  - Page excerpt: ${escapeReportMarkdown(summaryForPage.leadText)}`);
    }
  }
  if (capReasons.length)
    lines.push(
      '',
      '## Score cap reasons',
      '',
      ...capReasons.map((reason) => `- ${escapeReportMarkdown(reason)}`),
    );
  if (options.includeIgnoredRules !== false)
    lines.push(
      '',
      '## Ignored rules',
      '',
      ...(ignoredRuleIds.length
        ? ignoredRuleIds.map((id) => `- ${escapeReportMarkdown(id)} — ignored`)
        : ['None.']),
    );
  lines.push('', 'Scores are preliminary and are not ranking predictions.', '');
  return lines.join('\n');
}
