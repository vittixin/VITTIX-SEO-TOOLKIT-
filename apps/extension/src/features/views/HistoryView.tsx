import { useMemo, useState } from 'react';
import { Eye, FileSpreadsheet, History, Search, SearchX, Trash2 } from 'lucide-react';
import type { AuditSummary } from '@vittix/shared';
import { historyToCsv } from '@vittix/seo-core';
import { EmptyState } from '@/src/components/EmptyState';
import { formatDate, scoreTone, truncateMiddle } from '@/src/lib/format';

const BADGE_TONES: Record<ReturnType<typeof scoreTone>, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
};

export function HistoryView({
  summaries,
  loading,
  onView,
  onDelete,
}: {
  summaries: AuditSummary[];
  loading: boolean;
  onView: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (query.trim() === '') return summaries;
    const needle = query.trim().toLowerCase();
    return summaries.filter(
      (summary) =>
        summary.url.toLowerCase().includes(needle) || summary.title.toLowerCase().includes(needle),
    );
  }, [summaries, query]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading history…</p>;
  }

  if (summaries.length === 0) {
    return (
      <EmptyState icon={History} title="No audits stored yet">
        <p>
          Every analysis you run is saved locally in this browser and listed here. Nothing is
          uploaded anywhere.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search history by URL or page title…"
            data-testid="history-search"
            aria-label="Search audit history"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pl-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <button
          type="button"
          data-testid="history-export-csv"
          onClick={() => {
            const blob = new Blob([historyToCsv(summaries)], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'vittix-history-summary.csv';
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1_000);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <FileSpreadsheet className="size-3.5" aria-hidden /> History CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="No matching audits">
          <p>No stored audit matches “{query.trim()}”.</p>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {filtered.map((summary) => (
              <li key={summary.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                    BADGE_TONES[scoreTone(summary.score.total)]
                  }`}
                  title={`${summary.score.label} (preliminary)`}
                >
                  {summary.score.total}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {summary.title || summary.url}
                  </p>
                  <p className="truncate text-xs text-slate-400" title={summary.url}>
                    {truncateMiddle(summary.url, 64)} · {formatDate(summary.analyzedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    data-testid="history-view"
                    onClick={() => onView(summary.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Eye className="size-3.5" aria-hidden /> View
                  </button>
                  <button
                    type="button"
                    data-testid="history-delete"
                    onClick={() => onDelete(summary.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                    title="Delete this audit"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
