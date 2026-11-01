import { useState } from 'react';
import { Globe, Info, OctagonX, Play, RefreshCw, ShieldQuestion, Trash2, X } from 'lucide-react';
import { SITE_LIMITS } from '@vittix/shared';
import type { SitePageRecord } from '@vittix/shared';
import { useSiteAudit } from '@/src/features/useSiteAudit';
import { formatDate } from '@/src/lib/format';
import { ExportDialog } from '@/src/components/ExportDialog';

const STATUS_BADGES: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-slate-100 text-slate-500',
  failed: 'bg-rose-100 text-rose-700',
  'failed-auth': 'bg-rose-100 text-rose-700',
  'skipped-robots': 'bg-amber-100 text-amber-700',
  'skipped-duplicate': 'bg-slate-100 text-slate-500',
  'skipped-external-redirect': 'bg-amber-100 text-amber-700',
  'skipped-non-html': 'bg-sky-100 text-sky-700',
};

export function SiteAuditView() {
  const site = useSiteAudit();
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const progressTotal = site.session?.maxPages ?? SITE_LIMITS.maxPagesDefault;
  const processed =
    (site.session?.pagesDone ?? 0) +
    (site.session?.pagesFailed ?? 0) +
    (site.session?.pagesSkipped ?? 0);
  const progressPct = Math.min(100, Math.round((processed / progressTotal) * 100));
  const running = site.phase === 'running';

  return (
    <div className="space-y-6" data-testid="site-audit-view">
      {/* Disclosure — site mode is the only mode with network activity */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <strong>Site mode performs network activity</strong>, unlike single-page mode: it fetches
          pages and <span className="font-mono">/robots.txt</span> from the one origin you approve
          (GET only, without cookies or credentials). Everything found is stored and analyzed
          locally. Robots rules are honored for discovered URLs. Redirects are followed by the
          browser so canonical URLs can be inspected; a redirect may issue a request to another
          origin before its final URL can be checked. Off-origin response bodies are discarded.
        </p>
      </div>

      {/* Setup / consent */}
      {site.session === null || site.phase === 'setup' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Audit a website</h3>
          <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="site-origin">
            Site origin (https only)
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <div className="relative min-w-64 flex-1">
              <Globe
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="site-origin"
                type="url"
                value={site.originInput}
                onChange={(event) => site.setOriginInput(event.target.value)}
                placeholder="https://example.com"
                data-testid="site-origin-input"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <button
              type="button"
              data-testid="site-grant"
              onClick={() => void site.requestAccess()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <ShieldQuestion className="size-4" aria-hidden /> Grant access &amp; continue
            </button>
          </div>
          {site.error ? (
            <p data-testid="site-error" className="mt-2 text-sm text-rose-600" role="alert">
              {site.error}
            </p>
          ) : null}

          {site.grantedOrigin !== null && !site.consented ? (
            <div
              className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4"
              data-testid="site-consent"
            >
              <p className="text-sm text-slate-700">
                Permission granted for{' '}
                <span className="font-mono font-semibold">{site.grantedOrigin}</span>. Confirm the
                scope before starting:
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                <li>
                  • Up to <strong>{site.maxPages}</strong> pages, depth {SITE_LIMITS.maxDepth},
                  paced at ≥{SITE_LIMITS.delayMsFloor} ms between requests
                </li>
                <li>• Same-origin pages only · robots.txt honored · no forms, no credentials</li>
                <li>• The audit runs while this dashboard tab is open</li>
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={site.seedFromSitemap}
                    onChange={(event) => site.setSeedFromSitemap(event.target.checked)}
                    aria-label="Seed crawl from sitemap"
                  />
                  Seed crawl from sitemap
                </label>
                <button
                  type="button"
                  data-testid="site-start"
                  onClick={() => void site.startAudit()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  <Play className="size-4" aria-hidden /> Start site audit
                </button>
                <label className="text-xs font-medium text-slate-600">
                  Pages:
                  <select
                    value={site.maxPages}
                    onChange={(event) => site.setMaxPages(Number(event.target.value))}
                    className="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    aria-label="Page limit"
                  >
                    {[10, 20, 30, 40, 50].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Active / finished session */}
      {site.session !== null && site.phase !== 'setup' ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  <span className="font-mono">{site.session.origin}</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Started {formatDate(site.session.startedAt)} · status{' '}
                  <span className="font-semibold uppercase">{site.session.status}</span>
                  {site.session.robotsStatus === 'unreachable'
                    ? ' · robots.txt unreachable (allowed per RFC 9309)'
                    : ''}
                  {site.session.robotsStatus === 'blocked'
                    ? ' · blocked by robots.txt fetch failure'
                    : ''}
                  {' · '}
                  <span data-testid="site-permission-status">
                    {site.permissionGranted === null
                      ? 'permission unknown'
                      : site.permissionGranted
                        ? 'origin permission granted'
                        : 'origin permission REVOKED'}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {running ? (
                  <button
                    type="button"
                    data-testid="site-cancel"
                    onClick={() => void site.cancelAudit()}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    <OctagonX className="size-4" aria-hidden /> Cancel
                  </button>
                ) : null}
                {site.session.status === 'running' && !running ? (
                  <button
                    type="button"
                    data-testid="site-resume"
                    onClick={() => void site.startAudit()}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    <RefreshCw className="size-4" aria-hidden /> Resume audit
                  </button>
                ) : null}
                {(site.session.status !== 'running' || !running) && (
                  <button
                    type="button"
                    data-testid="site-discard"
                    onClick={() => void site.discardSession()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    <X className="size-3.5" aria-hidden /> Discard
                  </button>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span data-testid="site-progress-text">
                  {site.session.pagesDone} analyzed · {site.session.pagesFailed} failed ·{' '}
                  {site.session.pagesSkipped} skipped
                </span>
                <span>
                  {processed}/{progressTotal} pages
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {running ? (
                <p className="mt-1 text-xs text-amber-600">
                  Crawling while this tab is open — closing it pauses the audit (resumable).
                </p>
              ) : null}
            </div>

            {site.session.stopReason !== null ? (
              <div
                data-testid="site-stop-reason"
                role="alert"
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                <strong>Audit stopped:</strong> {site.session.stopReason}
                {site.summary !== null && site.summary.pendingPages > 0
                  ? ' Pending pages were left untouched and can be retried after the cause is resolved.'
                  : ''}
              </div>
            ) : null}
            {site.comparison !== null ? (
              <div
                data-testid="site-comparison"
                className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                  site.comparison.comparable
                    ? 'border-slate-200 bg-slate-50 text-slate-600'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <strong>Compared with previous audit of this origin:</strong>{' '}
                {site.comparison.reason}{' '}
                {site.comparison.partial ? (
                  <strong className="block">
                    Partial: coverage differed; removed-page conclusions are withheld.
                  </strong>
                ) : null}
                {site.comparison.comparable ? (
                  <span className="block tabular-nums">
                    Pages {site.comparison.before.auditedPages}→{site.comparison.after.auditedPages}{' '}
                    ({site.comparison.deltas.auditedPages >= 0 ? '+' : ''}
                    {site.comparison.deltas.auditedPages}) · Errors{' '}
                    {site.comparison.before.totalErrors}→{site.comparison.after.totalErrors} (
                    {site.comparison.deltas.totalErrors >= 0 ? '+' : ''}
                    {site.comparison.deltas.totalErrors}) · Warnings{' '}
                    {site.comparison.before.totalWarnings}→{site.comparison.after.totalWarnings} (
                    {site.comparison.deltas.totalWarnings >= 0 ? '+' : ''}
                    {site.comparison.deltas.totalWarnings})
                  </span>
                ) : null}
                {site.comparison.comparable ? (
                  <div className="mt-2">
                    <strong>Regressions ({site.comparison.regressions.length})</strong>
                    {site.comparison.regressions.length ? (
                      <ul className="list-inside list-disc">
                        {site.comparison.regressions.map((item, index) => (
                          <li key={`${item.kind}-${item.url ?? ''}-${index}`}>
                            <span className="font-semibold">{item.severity}</span> {item.kind}:{' '}
                            {item.url ?? ''} {item.detail}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No regressions detected in comparable stored data.</p>
                    )}
                    <p>
                      Resolved issues: {site.comparison.resolvedIssues.length}; added pages:{' '}
                      {site.comparison.addedPages.length}; removed pages:{' '}
                      {site.comparison.removedPages.length}.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Site summary */}
          {site.summary !== null ? <SiteSummaryPanel summary={site.summary} /> : null}

          {/* Page list */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={site.urlFilter}
                onChange={(event) => site.setUrlFilter(event.target.value)}
                placeholder="Filter URLs…"
                data-testid="site-url-filter"
                aria-label="Filter audited URLs"
                className="min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <label className="sr-only" htmlFor="site-response-filter">
                Filter response metadata
              </label>
              <select
                id="site-response-filter"
                aria-label="Filter response metadata"
                value={site.responseFilter}
                onChange={(event) =>
                  site.setResponseFilter(event.target.value as typeof site.responseFilter)
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <option value="all">All responses</option>
                <option value="slow">Slow responses (≥2 s)</option>
                <option value="non-html">Non-HTML</option>
                <option value="redirected">Redirects</option>
              </select>
              <button
                type="button"
                data-testid="site-open-export-dialog"
                onClick={() => setExportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 transition hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                Export site audit
              </button>
              {exportOpen && site.session && site.summary ? (
                <ExportDialog
                  site={{
                    session: site.session,
                    pages: site.pages,
                    summary: site.summary,
                    comparison: site.comparison,
                  }}
                  onClose={() => setExportOpen(false)}
                />
              ) : null}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">URL</th>
                    <th className="px-4 py-2 font-medium">Final URL</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Score</th>
                    <th className="px-4 py-2 font-medium">Err/Warn</th>
                    <th className="px-4 py-2 font-medium">Content type</th>
                    <th className="px-4 py-2 font-medium">Response ms</th>
                    <th className="px-4 py-2 font-medium">Redirects</th>
                    <th className="px-4 py-2 font-medium">Redirect status</th>
                    <th className="px-4 py-2 font-medium">X-Robots-Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {site.filteredPages.map((page) => (
                    <PageRow key={page.id ?? page.url} page={page} />
                  ))}
                  {site.filteredPages.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-400">
                        No pages {site.urlFilter ? 'match the filter' : 'yet'}.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* Danger zone */}
          <section className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    data-testid="site-clear-confirm"
                    onClick={() => {
                      void site.clearSiteData();
                      setConfirmClear(false);
                    }}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                  >
                    Yes, delete all site audits
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid="site-clear"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                >
                  <Trash2 className="size-4" aria-hidden /> Clear site-audit data
                </button>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function PageRow({ page }: { page: SitePageRecord }) {
  const result = page.result as {
    score?: { total?: number };
    findings?: { severity: string }[];
    truncated?: boolean;
  } | null;
  const findings = result?.findings ?? [];
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="max-w-96 px-4 py-2">
        <span className="block truncate font-mono text-xs text-slate-700" title={page.url}>
          {page.url}
        </span>
      </td>
      <td className="max-w-96 px-4 py-2">
        <span
          className="block truncate font-mono text-xs text-slate-700"
          title={page.finalUrl ?? ''}
        >
          {page.finalUrl ?? '—'}
        </span>
      </td>
      <td className="px-4 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_BADGES[page.status] ?? 'bg-slate-100 text-slate-500'
          }`}
        >
          {page.status}
        </span>
      </td>
      <td className="px-4 py-2 text-sm font-semibold tabular-nums text-slate-800">
        {result?.score?.total ?? '—'}
      </td>
      <td className="px-4 py-2 text-xs tabular-nums text-slate-600">
        {findings.filter((f) => f.severity === 'error').length}/
        {findings.filter((f) => f.severity === 'warn').length}
        {result?.truncated === true ? (
          <span className="ml-1 text-amber-600" title="Incomplete extraction">
            ⚠
          </span>
        ) : null}
      </td>
      <td
        className="max-w-48 truncate px-4 py-2 text-xs text-slate-600"
        title={page.responseMetadata?.contentType ?? ''}
      >
        {page.responseMetadata?.contentType ?? '—'}
      </td>
      <td className="px-4 py-2 text-xs tabular-nums text-slate-600">
        {page.responseMetadata?.durationMs === null ||
        page.responseMetadata?.durationMs === undefined
          ? '—'
          : Math.round(page.responseMetadata.durationMs)}
      </td>
      <td className="px-4 py-2 text-xs tabular-nums text-slate-600">
        {page.responseMetadata?.redirectObservationUnavailable
          ? 'Unavailable'
          : (page.responseMetadata?.redirectChain.length ?? '—')}
      </td>
      <td className="px-4 py-2 text-xs text-slate-600">
        {page.responseMetadata?.redirected
          ? page.responseMetadata.redirectOffOrigin
            ? 'Followed off-origin; body discarded'
            : 'Redirect followed'
          : 'No redirect observed'}
      </td>
      <td
        className="max-w-40 truncate px-4 py-2 text-xs text-slate-600"
        title={page.responseMetadata?.xRobotsTag ?? ''}
      >
        {page.responseMetadata?.xRobotsTag ?? '—'}
      </td>
    </tr>
  );
}

function SiteSummaryPanel({ summary }: { summary: ReturnType<typeof useSiteAudit>['summary'] }) {
  if (summary === null) return null;
  const completeness =
    summary.pendingPages > 0
      ? 'Incomplete audit — pages are still pending; figures cover completed fetches only.'
      : summary.incomplete
        ? 'Incomplete audit — some pages were truncated at extraction caps. Figures may undercount.'
        : null;
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="site-summary"
    >
      <h3 className="text-sm font-semibold text-slate-900">Site summary</h3>
      {completeness !== null ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {completeness}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages audited" value={summary.auditedPages} />
        <Stat label="Errors" value={summary.totalErrors} tone="rose" />
        <Stat label="Warnings" value={summary.totalWarnings} tone="amber" />
        <Stat label="Failed / skipped" value={`${summary.failedPages}/${summary.skippedPages}`} />
      </div>

      {/* Distributions */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">Score distribution (preliminary)</p>
          <div className="mt-2 flex gap-2 text-center text-xs">
            <DistributionCell label="Poor" value={summary.scoreDistribution.poor} tone="rose" />
            <DistributionCell
              label="Needs work"
              value={summary.scoreDistribution.needsWork}
              tone="amber"
            />
            <DistributionCell label="Good" value={summary.scoreDistribution.good} tone="sky" />
            <DistributionCell
              label="Excellent"
              value={summary.scoreDistribution.excellent}
              tone="emerald"
            />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">Pages by error count</p>
          <div className="mt-2 flex gap-2 text-center text-xs">
            <DistributionCell
              label="0 errors"
              value={summary.errorDistribution.clean}
              tone="emerald"
            />
            <DistributionCell label="1–2" value={summary.errorDistribution.some} tone="amber" />
            <DistributionCell label="3+" value={summary.errorDistribution.many} tone="rose" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <DetailList
          title={`Duplicate titles (${summary.duplicateTitles.length})`}
          entries={summary.duplicateTitles.map((entry) => ({
            key: entry.title,
            label: entry.title,
            detail: `${entry.urls.length} pages`,
          }))}
        />
        <DetailList
          title={`Duplicate meta descriptions (${summary.duplicateDescriptions.length})`}
          entries={summary.duplicateDescriptions.map((entry) => ({
            key: entry.description,
            label: entry.description,
            detail: `${entry.urls.length} pages`,
          }))}
        />
        <DetailList
          title={`Missing title (${summary.missingTitle.length})`}
          entries={summary.missingTitle.map((url) => ({ key: url, label: url, detail: '' }))}
        />
        <DetailList
          title={`Missing meta description (${summary.missingDescription.length})`}
          entries={summary.missingDescription.map((url) => ({ key: url, label: url, detail: '' }))}
        />
        <DetailList
          title={`Missing canonical (${summary.missingCanonical.length})`}
          entries={summary.missingCanonical.map((url) => ({ key: url, label: url, detail: '' }))}
        />
        <DetailList
          title={`Indexability warnings — noindex (${summary.noindexPages.length})`}
          entries={summary.noindexPages.map((url) => ({ key: url, label: url, detail: '' }))}
        />
        <DetailList
          title={`Broken-link candidates (${summary.brokenLinkCandidates.length})`}
          subtitle="Verified: this crawl failed to fetch them with an HTTP error, and an audited page links there."
          entries={summary.brokenLinkCandidates.map((candidate) => ({
            key: candidate.url,
            label: candidate.url,
            detail: `HTTP ${candidate.httpStatus ?? '?'} · linked from ${candidate.linkedFrom.length} page${candidate.linkedFrom.length === 1 ? '' : 's'}`,
          }))}
        />
        <DetailList
          title={
            summary.orphanPages === null
              ? 'Orphan pages (not enough evidence)'
              : `Orphan pages (${summary.orphanPages.length})`
          }
          subtitle={
            summary.orphanPages === null
              ? 'Orphan analysis needs at least 3 audited pages with link evidence — unchecked here, not "none".'
              : 'Audited pages that no other audited page links to internally.'
          }
          entries={(summary.orphanPages ?? []).map((url) => ({ key: url, label: url, detail: '' }))}
        />
        <section
          className="rounded-lg border border-slate-200 p-4 md:col-span-2"
          aria-labelledby="similarity-title"
        >
          <h3 id="similarity-title" className="font-semibold">
            Duplicate similarity heuristics
          </h3>
          <p className="text-xs text-slate-600">
            Similarity heuristic only, not a Google duplicate verdict. Body comparison skips pages
            under 50 words.
          </p>
          {summary.duplicateClusters.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {summary.duplicateClusters.map((cluster, index) => (
                <li key={`${cluster.kind}-${index}`}>
                  <strong>{cluster.kind}</strong>: {cluster.urls.join(', ')} — {cluster.disposition}{' '}
                  ({Math.round(cluster.similarity * 100)}%)
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm">No duplicate clusters found by these heuristics.</p>
          )}
        </section>
        {summary.siteFindings.map((finding) => (
          <section
            key={finding.ruleId}
            className="rounded-lg border border-sky-200 bg-sky-50 p-4 md:col-span-2"
            aria-label={`${finding.severity}: ${finding.title}`}
          >
            <p className="text-sm font-semibold">
              {finding.severity}: {finding.title}
            </p>
            <p className="mt-1 text-sm">{finding.detail}</p>
            {finding.evidence ? (
              <p className="mt-1 break-all text-xs">Evidence: {finding.evidence}</p>
            ) : null}
          </section>
        ))}
        <InternalLinkGraphPanel graph={summary.linkGraph} />
        <section
          className="rounded-lg border border-slate-200 p-4"
          aria-labelledby="sitemap-results-title"
        >
          <h3 id="sitemap-results-title" className="font-semibold">
            Sitemap discovery
          </h3>
          <p className="mt-1 text-sm">
            {summary.sitemap.checked
              ? 'Checked: sitemap data was fully read.'
              : 'Unchecked: sitemap data was incomplete or unavailable.'}{' '}
            Invalid lastmod: {summary.sitemap.invalidLastmodCount}; duplicates:{' '}
            {summary.sitemap.duplicateCount}; cross-origin entries ignored:{' '}
            {summary.sitemap.crossOriginCount}.
          </p>
          {summary.sitemap.warnings.map((warning) => (
            <p className="text-sm text-amber-800" key={warning}>
              {warning}
            </p>
          ))}
          <h4 className="mt-3 text-sm font-medium">Sitemap URLs not crawled</h4>
          {summary.sitemap.notCrawled.length ? (
            <ul className="list-inside list-disc text-sm">
              {summary.sitemap.notCrawled.slice(0, 100).map((url) => (
                <li key={url}>
                  <span className="font-mono break-all">{url}</span> — not crawled
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">No uncrawled sitemap URLs recorded.</p>
          )}
          <h4 className="mt-3 text-sm font-medium">Crawled URLs absent from sitemap</h4>
          {summary.sitemap.crawledAbsent === null ? (
            <p className="text-sm">Unchecked because the sitemap was not fully read.</p>
          ) : summary.sitemap.crawledAbsent.length ? (
            <ul className="list-inside list-disc text-sm">
              {summary.sitemap.crawledAbsent.slice(0, 100).map((url) => (
                <li className="font-mono break-all" key={url}>
                  {url}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">None among crawled pages.</p>
          )}
        </section>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Internal links: {summary.internalLinks} · External links: {summary.externalLinks} · Findings
        are grounded only in the {summary.auditedPages} page
        {summary.auditedPages === 1 ? '' : 's'} actually inspected; failed and skipped URLs are
        listed but contribute no findings.
      </p>
    </section>
  );
}

function DistributionCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'rose' | 'amber' | 'sky' | 'emerald';
}) {
  const tones: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <div className={`flex-1 rounded-md px-2 py-1.5 ${tones[tone]}`}>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function InternalLinkGraphPanel({ graph }: { graph: import('@vittix/seo-core').LinkGraph }) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'depth' | 'inbound' | 'outbound' | 'anchorDiversity'>(
    'depth',
  );
  const nodes = graph.nodes
    .filter((node) => node.url.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .slice()
    .sort(
      (a, b) =>
        ((a[sortBy] ?? Number.MAX_SAFE_INTEGER) as number) -
        ((b[sortBy] ?? Number.MAX_SAFE_INTEGER) as number),
    );
  const depths = Object.entries(graph.depthHistogram).sort(([a], [b]) => Number(a) - Number(b));
  const max = Math.max(1, ...depths.map(([, count]) => count));
  return (
    <section
      className="rounded-lg border border-slate-200 p-4 md:col-span-2"
      aria-labelledby="link-graph-title"
    >
      <h3 id="link-graph-title" className="font-semibold">
        Internal link graph
      </h3>
      <p className="text-xs text-slate-600">
        Orphan analysis: {graph.orphanStatus}. An unchecked result means the crawl did not read
        enough complete sources.
      </p>
      <svg
        role="img"
        aria-label="Pages by click depth"
        viewBox={`0 0 ${Math.max(120, depths.length * 64)} 120`}
        className="mt-2 h-28 w-full"
        preserveAspectRatio="xMinYMid meet"
      >
        {depths.map(([depth, count], index) => (
          <g key={depth}>
            <rect
              x={index * 64 + 8}
              y={90 - (count / max) * 68}
              width="36"
              height={(count / max) * 68}
              fill="#2563eb"
            />
            <text x={index * 64 + 26} y="108" textAnchor="middle" fontSize="11" fill="currentColor">
              Depth {depth}
            </text>
            <text
              x={index * 64 + 26}
              y={82 - (count / max) * 68}
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
            >
              {count}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="text-xs">
          Filter pages{' '}
          <input
            className="ml-1 rounded border px-2 py-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Sort by{' '}
          <select
            className="ml-1 rounded border px-2 py-1"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="depth">Depth</option>
            <option value="inbound">Inbound links</option>
            <option value="outbound">Outbound links</option>
            <option value="anchorDiversity">Anchor diversity</option>
          </select>
        </label>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th scope="col">Page</th>
              <th scope="col">Depth</th>
              <th scope="col">Inbound</th>
              <th scope="col">Outbound</th>
              <th scope="col">Anchor diversity</th>
            </tr>
          </thead>
          <tbody>
            {nodes.slice(0, 200).map((node) => (
              <tr key={node.url}>
                <td className="max-w-80 truncate" title={node.url}>
                  {node.url}
                </td>
                <td>{node.depth ?? 'Unreachable'}</td>
                <td>{node.inbound}</td>
                <td>{node.outbound}</td>
                <td>{Math.round(node.anchorDiversity * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs">
        {graph.edges.length} internal edges. CSV includes nodes and up to 5,000 edges.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  const tones: Record<string, string> = {
    slate: 'text-slate-900',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className={`text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function DetailList({
  title,
  subtitle,
  entries,
}: {
  title: string;
  subtitle?: string;
  entries: { key: string; label: string; detail: string }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      {subtitle !== undefined ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{subtitle}</p>
      ) : null}
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">None found.</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {entries.slice(0, 5).map((entry) => (
            <li key={entry.key} className="truncate text-xs text-slate-600" title={entry.label}>
              {entry.label}
              {entry.detail !== '' ? (
                <span className="ml-1 text-slate-400">({entry.detail})</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
