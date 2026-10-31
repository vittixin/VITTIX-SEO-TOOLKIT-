import { useState } from 'react';
import {
  FileJson,
  FileSpreadsheet,
  Globe,
  Info,
  OctagonX,
  Play,
  RefreshCw,
  ShieldQuestion,
  Trash2,
  X,
} from 'lucide-react';
import { SITE_LIMITS } from '@vittix/shared';
import { siteAuditToJson, sitePagesToCsv } from '@vittix/seo-core';
import type { SitePageRecord } from '@vittix/shared';
import { useSiteAudit } from '@/src/features/useSiteAudit';
import { formatDate } from '@/src/lib/format';

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

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function SiteAuditView() {
  const site = useSiteAudit();
  const [confirmClear, setConfirmClear] = useState(false);

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
          locally. Discovery never leaves that origin, and robots rules are honored.
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
              <button
                type="button"
                data-testid="site-export-json"
                onClick={() =>
                  site.session &&
                  download(
                    `vittix-site-audit-${site.session.id ?? 'latest'}.json`,
                    siteAuditToJson(site.session, site.pages),
                    'application/json',
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <FileJson className="size-3.5" aria-hidden /> Site JSON
              </button>
              <button
                type="button"
                data-testid="site-export-csv"
                onClick={() =>
                  site.session &&
                  download(
                    `vittix-site-pages-${site.session.id ?? 'latest'}.csv`,
                    sitePagesToCsv(site.session, site.pages),
                    'text/csv',
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <FileSpreadsheet className="size-3.5" aria-hidden /> Pages CSV
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">URL</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Score</th>
                    <th className="px-4 py-2 font-medium">Err/Warn</th>
                  </tr>
                </thead>
                <tbody>
                  {site.filteredPages.map((page) => (
                    <PageRow key={page.id ?? page.url} page={page} />
                  ))}
                  {site.filteredPages.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
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
    </tr>
  );
}

function SiteSummaryPanel({ summary }: { summary: ReturnType<typeof useSiteAudit>['summary'] }) {
  if (summary === null) return null;
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="site-summary"
    >
      <h3 className="text-sm font-semibold text-slate-900">Site summary</h3>
      {summary.incomplete ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Incomplete audit — some pages were truncated at extraction caps or are still pending.
          Figures may undercount.
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages audited" value={summary.auditedPages} />
        <Stat label="Errors" value={summary.totalErrors} tone="rose" />
        <Stat label="Warnings" value={summary.totalWarnings} tone="amber" />
        <Stat label="Failed / skipped" value={`${summary.failedPages}/${summary.skippedPages}`} />
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
          title={`Missing canonical (${summary.missingCanonical.length})`}
          entries={summary.missingCanonical.map((url) => ({ key: url, label: url, detail: '' }))}
        />
        <DetailList
          title={`Indexability warnings — noindex (${summary.noindexPages.length})`}
          entries={summary.noindexPages.map((url) => ({ key: url, label: url, detail: '' }))}
        />
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Internal links: {summary.internalLinks} · External links: {summary.externalLinks} · Findings
        are grounded only in the {summary.auditedPages} page
        {summary.auditedPages === 1 ? '' : 's'} actually inspected.
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
  entries,
}: {
  title: string;
  entries: { key: string; label: string; detail: string }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-700">{title}</p>
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
