import { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, Search, Clipboard } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { EmptyState } from '@/src/components/EmptyState';
import {
  copyTextToClipboard,
  exportAuditJson,
  exportAuditMarkdown,
  exportFindingsCsv,
} from '@/src/export/download';
import { buildAuditMarkdown } from '@vittix/seo-core';
import { getTargetKeyword } from '@/src/storage/keywords';

export function ExportView({ audit }: { audit: AuditRecord | null }) {
  const [copied, setCopied] = useState(false);
  const [includeKeyword, setIncludeKeyword] = useState(false);
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to export yet">
        <p>Run an analysis first, then come back to export it as JSON or CSV.</p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Exports are generated entirely in your browser from the locally stored audit. Downloading a
        file is the only thing that ever leaves the extension — because you asked it to.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          data-testid="export-json"
          onClick={() =>
            void getTargetKeyword(audit.url).then((keyword) =>
              exportAuditJson(audit, {
                targetKeyword: includeKeyword ? keyword : undefined,
                includePageTextExcerpt: includeExcerpt,
              }),
            )
          }
          className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <FileJson className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-slate-900">Export full audit (JSON)</span>
          <span className="text-xs leading-relaxed text-slate-500">
            The complete audit: page snapshot, every finding and the preliminary score. Ideal for
            archiving or programmatic processing.
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
            <Download className="size-3.5" aria-hidden /> Download .json
          </span>
        </button>

        <button
          type="button"
          data-testid="export-csv"
          onClick={() => exportFindingsCsv(audit)}
          className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 hover:shadow"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <FileSpreadsheet className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-slate-900">Export findings (CSV)</span>
          <span className="text-xs leading-relaxed text-slate-500">
            One row per finding with severity, category and evidence — RFC 4180 escaped, ready for
            Excel or Google Sheets.
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Download className="size-3.5" aria-hidden /> Download .csv
          </span>
        </button>

        <section className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
            <FileJson className="size-5" aria-hidden />
          </span>
          <h2 className="text-sm font-semibold text-slate-900">Markdown issue ticket</h2>
          <p className="text-xs leading-relaxed text-slate-500">
            A task-list report grouped by severity, with evidence and remediation for an issue
            tracker.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="export-markdown"
              onClick={() =>
                void getTargetKeyword(audit.url).then((keyword) =>
                  exportAuditMarkdown(audit, {
                    includeKeyword,
                    targetKeyword: includeKeyword ? keyword : undefined,
                    includePageTextExcerpt: includeExcerpt,
                    includeContentStats: includeExcerpt,
                  }),
                )
              }
              className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <Download className="size-3.5" aria-hidden /> Download .md
            </button>
            <button
              type="button"
              data-testid="copy-markdown"
              onClick={() => {
                const options = {
                  includeKeyword,
                  includePageTextExcerpt: includeExcerpt,
                  includeContentStats: includeExcerpt,
                };
                void getTargetKeyword(audit.url).then((keyword) =>
                  copyTextToClipboard(
                    buildAuditMarkdown(audit, {
                      ...options,
                      targetKeyword: includeKeyword ? keyword : undefined,
                    }),
                  ).then((ok) => setCopied(ok)),
                );
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              <Clipboard className="size-3.5" aria-hidden /> Copy Markdown
            </button>
          </div>
          {copied ? (
            <p role="status" className="text-xs text-emerald-700">
              Markdown copied.
            </p>
          ) : null}
        </section>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={includeKeyword}
          onChange={(event) => setIncludeKeyword(event.target.checked)}
          aria-label="Include target keyword in JSON export"
        />
        Include the locally stored target keyword in JSON export
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={includeExcerpt}
          onChange={(event) => setIncludeExcerpt(event.target.checked)}
          aria-label="Include page text excerpt in JSON export"
        />
        Include page text excerpt in JSON export
      </label>
    </div>
  );
}
