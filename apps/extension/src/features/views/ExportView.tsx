import { Download, FileJson, FileSpreadsheet, Search } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { EmptyState } from '@/src/components/EmptyState';
import { exportAuditJson, exportFindingsCsv } from '@/src/export/download';

export function ExportView({ audit }: { audit: AuditRecord | null }) {
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
          onClick={() => exportAuditJson(audit)}
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
      </div>
    </div>
  );
}
