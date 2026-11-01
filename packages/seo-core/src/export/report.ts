import type { AuditRecord, Finding, Severity } from '@vittix/shared';

/** Escape all HTML metacharacters, including template-string backticks. */
export function escapeReportHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '`': '&#96;',
    };
    return entities[character]!;
  });
}

/** Escape Markdown control characters in untrusted page-derived values. */
export function escapeReportMarkdown(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\u2028\u2029]/g, ' ')
    .replace(/[\\`*_{}\[\]()#+\-.!|>~]/g, '\\$&');
}

export interface ReportBranding {
  agencyName?: string;
  accentColor?: string;
  /** Only validated raster data URIs are emitted. SVG is intentionally rejected. */
  logoDataUri?: string;
}

export interface AuditReportOptions {
  includePreviews?: boolean;
  includeContentStats?: boolean;
  includeIgnoredRules?: boolean;
  includePageTextExcerpt?: boolean;
  includeKeyword?: boolean;
  targetKeyword?: string;
  branding?: ReportBranding;
}

const SEVERITIES: Severity[] = ['error', 'warn', 'info', 'pass'];
const SEVERITY_NAMES: Record<Severity, string> = {
  error: 'Error',
  warn: 'Warning',
  info: 'Info',
  pass: 'Passed',
};
const CATEGORY_NAMES: Record<string, string> = {
  metadata: 'Metadata',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
  content: 'Content',
  social: 'Social',
  technical: 'Technical',
};

function safeAccentColor(value: string | undefined): string {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : '#3157d5';
}

function safeLogo(value: string | undefined): string | null {
  return value &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z\d+/]+=*$/.test(value) &&
    value.length <= 136_600
    ? value
    : null;
}

function text(value: unknown): string {
  return escapeReportHtml(value);
}

function findingSection(findings: Finding[], includeIgnored: boolean): string {
  const visible = findings.filter((finding) => includeIgnored || !finding.ignored);
  return SEVERITIES.map((severity) => {
    const matching = visible.filter((finding) => finding.severity === severity);
    if (!matching.length) return '';
    const categories = [...new Set(matching.map((finding) => finding.category))];
    return `<section class="severity"><h3>${SEVERITY_NAMES[severity]} (${matching.length})</h3>${categories
      .map((category) => {
        const group = matching.filter((finding) => finding.category === category);
        return `<h4>${CATEGORY_NAMES[category] ?? text(category)}</h4><ul>${group
          .map((finding) => {
            const ignoredLabel = finding.ignored ? '<span class="ignored">Ignored</span>' : '';
            return `<li><h5><code>${text(finding.ruleId)}</code> ${text(finding.title)} ${ignoredLabel}</h5><p>${text(finding.detail)}</p>${finding.evidence ? `<p><strong>Evidence:</strong> <code>${text(finding.evidence)}</code></p>` : ''}${finding.remediation ? `<p><strong>Remediation:</strong> ${text(finding.remediation)}</p>` : ''}</li>`;
          })
          .join('')}</ul>`;
      })
      .join('')}</section>`;
  }).join('');
}

function ignoredRulesSection(findings: Finding[]): string {
  const ids = [
    ...new Set(findings.filter((finding) => finding.ignored).map((finding) => finding.ruleId)),
  ];
  return ids.length
    ? `<section><h2>Ignored rules</h2><p>These rules were evaluated but excluded from scoring.</p><ul>${ids.map((id) => `<li><code>${text(id)}</code> — Ignored</li>`).join('')}</ul></section>`
    : '<section><h2>Ignored rules</h2><p>None.</p></section>';
}

function brandingHeader(branding: ReportBranding | undefined): string {
  const name = branding?.agencyName?.slice(0, 80).trim();
  const logo = safeLogo(branding?.logoDataUri);
  return name || logo
    ? `<div class="brand">${logo ? `<img alt="" src="${text(logo)}">` : ''}${name ? `<span>${text(name)}</span>` : ''}</div>`
    : '';
}

function previewsHtml(audit: AuditRecord): string {
  const snapshot = audit.snapshot;
  return `<section><h2>Search and social previews</h2><h3>Search result</h3><p class="preview-title">${text(snapshot.meta.description ? snapshot.title : snapshot.title)}</p><p class="preview-url">${text(snapshot.url)}</p><p>${text(snapshot.meta.description ?? 'No meta description captured.')}</p><h3>Social card</h3><p><strong>Title:</strong> ${text(snapshot.meta.ogTitle ?? snapshot.title)}</p><p><strong>Description:</strong> ${text(snapshot.meta.ogDescription ?? snapshot.meta.description ?? '')}</p>${snapshot.meta.ogImage ? `<p><strong>Image URL (not loaded):</strong> ${text(snapshot.meta.ogImage)}</p>` : ''}<p class="muted">Images are shown as text only to preserve privacy.</p></section>`;
}

function contentHtml(audit: AuditRecord, options: AuditReportOptions): string {
  const summary = audit.snapshot.textSummary;
  const stats = audit.snapshot.textStats;
  const keyword = options.includeKeyword ? options.targetKeyword : undefined;
  const excerpt = options.includePageTextExcerpt ? summary.leadText : undefined;
  return `<section><h2>Content summary</h2><dl><dt>Word count</dt><dd>${stats.wordCount}</dd><dt>Sentence count</dt><dd>${summary.sentenceCount}</dd><dt>Paragraph count</dt><dd>${summary.paragraphCount}</dd><dt>Syllable count</dt><dd>${summary.syllableCount}</dd><dt>Text sample</dt><dd>${stats.textSampleTruncated ? 'Truncated at extraction limits' : 'Complete within limits'}</dd>${keyword ? `<dt>Target keyword</dt><dd>${text(keyword)}</dd>` : ''}</dl>${stats.textSampleTruncated || audit.result.truncated ? '<p class="notice">This audit used partial page data; findings and scores may undercount issues.</p>' : ''}${excerpt ? `<h3>Page text excerpt (opt-in)</h3><blockquote>${text(excerpt)}</blockquote>` : ''}</section>`;
}

/** Pure, deterministic, complete self-contained report HTML. No DOM or extension APIs. */
export function buildAuditReportHtml(audit: AuditRecord, options: AuditReportOptions = {}): string {
  const score = Math.max(0, Math.min(100, audit.result.score.total));
  const ignored = audit.result.findings.filter((finding) => finding.ignored);
  const categories = audit.result.score.categories
    .map(
      (item) =>
        `<tr><th scope="row">${text(CATEGORY_NAMES[item.category] ?? item.category)}</th><td>${item.score}</td></tr>`,
    )
    .join('');
  const accent = safeAccentColor(options.branding?.accentColor);
  const logo = safeLogo(options.branding?.logoDataUri);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${logo ? 'data:' : "'none'"};`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>SEO audit report — ${text(audit.title)}</title><style>
:root{color-scheme:light dark;--accent:${accent};--bg:#fff;--fg:#172033;--muted:#4b5563;--line:#cbd5e1;--soft:#f1f5f9;--error:#9b1c1c;--warn:#854d0e;--info:#1e40af;--pass:#166534} @media(prefers-color-scheme:dark){:root{--bg:#111827;--fg:#f3f4f6;--muted:#cbd5e1;--line:#475569;--soft:#1f2937;--error:#fca5a5;--warn:#fcd34d;--info:#93c5fd;--pass:#86efac}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1000px;margin:0 auto;padding:32px}h1,h2,h3,h4,h5{line-height:1.25}h1{font-size:2rem;margin:.2rem 0}h2{margin:2rem 0 .8rem;border-bottom:1px solid var(--line);padding-bottom:.4rem}h3{margin:1.2rem 0 .5rem}a{color:var(--accent)}.muted,.preview-url{color:var(--muted);overflow-wrap:anywhere}.brand{display:flex;align-items:center;gap:12px;color:var(--accent);font-weight:700}.brand img{width:auto;max-width:160px;max-height:52px;object-fit:contain}.hero{display:grid;grid-template-columns:150px 1fr;gap:24px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:22px;margin:24px 0}.ring{width:140px;height:140px}.ring text{fill:var(--fg);font:700 30px system-ui}.cap,.notice{border-left:5px solid var(--warn);background:var(--soft);padding:12px 16px;margin:16px 0}.score{font-size:1.2rem;font-weight:700;color:var(--accent)}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{text-align:left;border:1px solid var(--line);padding:8px}th{background:var(--soft)}ul{padding-left:1.5rem}li{margin:.7rem 0}.severity{break-inside:avoid;margin:1rem 0}.severity h3{border-bottom:1px solid var(--line);padding-bottom:.4rem}.severity h5{margin:.4rem 0}.severity li{break-inside:avoid}.error{color:var(--error)}.warn{color:var(--warn)}.info{color:var(--info)}.pass{color:var(--pass)}.ignored{display:inline-block;border:1px solid var(--muted);border-radius:4px;padding:0 5px;color:var(--muted);font-size:.75rem}code{overflow-wrap:anywhere;background:var(--soft);padding:1px 4px;border-radius:3px}dl{display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:6px 14px}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}.preview-title{font-size:1.25rem;color:var(--accent)}blockquote{border-left:3px solid var(--line);padding-left:14px;white-space:pre-wrap}footer{margin-top:48px;border-top:1px solid var(--line);padding:16px 0;color:var(--muted);font-size:.9rem}@media print{ :root{color-scheme:light;--bg:#fff;--fg:#111827;--muted:#374151;--line:#9ca3af;--soft:#f3f4f6}body{background:#fff;color:#111}main{max-width:none;padding:0}.hero,li,table{break-inside:avoid}h2,h3{break-after:avoid}.severity{break-inside:auto}a{color:#111;text-decoration:none}}
</style></head><body><main>${brandingHeader(options.branding)}<header><p class="muted">Vittix SEO Toolkit · Audit report</p><h1>${text(audit.title)}</h1><p class="muted">Page URL: ${text(audit.url)}</p><p>Analyzed: ${text(audit.analyzedAt)} · Profile: <code>${text(audit.profileId)}</code> · Rule set: <code>${text(audit.ruleSetVersion)}</code></p></header><section class="hero" aria-label="Preliminary score"><svg class="ring" viewBox="0 0 120 120" role="img" aria-label="Preliminary score ${score} out of 100"><circle cx="60" cy="60" r="49" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="60" cy="60" r="49" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(score * 3.079).toFixed(2)} 308" transform="rotate(-90 60 60)"/><text x="60" y="69" text-anchor="middle">${score}</text></svg><div><p class="score">${text(audit.result.score.label)} · Preliminary score</p><p>SEO scores are preliminary indicators based on this local rule set.</p></div></section>${audit.result.score.capReason ? `<p class="cap"><strong>Score cap:</strong> ${text(audit.result.score.capReason)}</p>` : ''}${audit.result.truncated || audit.snapshot.textStats.textSampleTruncated ? '<p class="notice">Extraction was truncated. Findings and score may undercount page issues.</p>' : ''}<section><h2>Category breakdown</h2><table><thead><tr><th scope="col">Category</th><th scope="col">Score</th></tr></thead><tbody>${categories}</tbody></table></section><section><h2>Findings</h2>${findingSection(audit.result.findings, options.includeIgnoredRules ?? true)}</section>${options.includeIgnoredRules === false ? '' : ignoredRulesSection(ignored)}${options.includePreviews ? previewsHtml(audit) : ''}${options.includeContentStats ? contentHtml(audit, options) : ''}<footer>Vittix SEO Toolkit · Scores are preliminary and are not ranking predictions. This report contains locally generated analysis.</footer></main></body></html>`;
}

function markdownCode(value: string): string {
  return `\`${value.slice(0, 200).replace(/\\/g, '\\\\').replace(/</g, '\\<').replace(/>/g, '\\>').replace(/`/g, '\\`')}\``;
}

/** Pure deterministic task-list export for issue trackers. */
export function buildAuditMarkdown(audit: AuditRecord, options: AuditReportOptions = {}): string {
  const score = audit.result.score;
  const lines = [
    ...(options.branding?.agencyName
      ? [`> ${escapeReportMarkdown(options.branding.agencyName.slice(0, 80))}`, '']
      : []),
    `# SEO audit: ${escapeReportMarkdown(audit.title)}`,
    '',
    `URL: ${escapeReportMarkdown(audit.url)}`,
    `Analyzed: ${escapeReportMarkdown(audit.analyzedAt)} · Profile: ${escapeReportMarkdown(audit.profileId)} · Rule set: ${escapeReportMarkdown(audit.ruleSetVersion)}`,
    `Score: ${score.total}/100 — ${escapeReportMarkdown(score.label)} (preliminary)${score.capReason ? ` · Capped: ${escapeReportMarkdown(score.capReason)}` : ''}`,
    '',
  ];
  for (const severity of SEVERITIES) {
    const findings = audit.result.findings.filter(
      (finding) =>
        finding.severity === severity &&
        ((options.includeIgnoredRules ?? true) || !finding.ignored),
    );
    if (!findings.length) continue;
    lines.push(`## ${SEVERITY_NAMES[severity]} (${findings.length})`, '');
    for (const finding of findings) {
      lines.push(
        `- [ ] **${escapeReportMarkdown(finding.ruleId)} — ${escapeReportMarkdown(finding.title)}** (${CATEGORY_NAMES[finding.category]})${finding.ignored ? ' — _Ignored; excluded from scoring_' : ''}`,
      );
      lines.push(`  - ${escapeReportMarkdown(finding.detail)}`);
      if (finding.evidence) lines.push(`  - Evidence: ${markdownCode(finding.evidence)}`);
      if (finding.remediation)
        lines.push(`  - Remediation: ${escapeReportMarkdown(finding.remediation)}`);
    }
    lines.push('');
  }
  if (options.includeIgnoredRules !== false) {
    const ignored = [
      ...new Set(
        audit.result.findings.filter((finding) => finding.ignored).map((finding) => finding.ruleId),
      ),
    ];
    lines.push(
      '## Ignored rules',
      '',
      ignored.length
        ? ignored.map((id) => `- ${escapeReportMarkdown(id)} — ignored`).join('\n')
        : 'None.',
      '',
    );
  }
  if (options.includeContentStats) {
    const summary = audit.snapshot.textSummary;
    lines.push(
      '## Content summary',
      '',
      `- Words: ${audit.snapshot.textStats.wordCount}`,
      `- Sentences: ${summary.sentenceCount}`,
      `- Paragraphs: ${summary.paragraphCount}`,
    );
    if (options.includeKeyword && options.targetKeyword)
      lines.push(`- Target keyword: ${escapeReportMarkdown(options.targetKeyword)}`);
    if (options.includePageTextExcerpt && summary.leadText)
      lines.push(`- Page excerpt: ${escapeReportMarkdown(summary.leadText)}`);
    lines.push('');
  }
  lines.push('Scores are preliminary and are not ranking predictions.');
  return lines.join('\n') + '\n';
}
