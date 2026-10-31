import { Search } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { EmptyState } from '@/src/components/EmptyState';
import { FindingList } from '@/src/components/FindingList';

const TAG_STYLES: Record<string, string> = {
  h1: 'bg-indigo-100 text-indigo-700',
  h2: 'bg-violet-100 text-violet-700',
  h3: 'bg-sky-100 text-sky-700',
  h4: 'bg-teal-100 text-teal-700',
  h5: 'bg-amber-100 text-amber-700',
  h6: 'bg-slate-100 text-slate-600',
};

export function HeadingsView({ audit }: { audit: AuditRecord | null }) {
  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to show yet">
        <p>Run an analysis from the popup first — the heading outline will appear here.</p>
      </EmptyState>
    );
  }

  const { headings, headingCounts } = audit.snapshot;
  const truncated =
    Object.values(headingCounts).reduce((sum, count) => sum + count, 0) > headings.length;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap gap-2">
        {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
              headingCounts[tag] > 0 ? TAG_STYLES[tag] : 'bg-slate-50 text-slate-400'
            }`}
          >
            {tag}
            <span className="tabular-nums">{headingCounts[tag]}</span>
          </span>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {headings.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            This page has no h1–h6 elements at all.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {headings.map((heading, index) => (
              <li key={`${heading.tag}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`w-9 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${
                    TAG_STYLES[heading.tag]
                  }`}
                >
                  {heading.tag}
                </span>
                <span
                  className="min-w-0 truncate text-sm text-slate-800"
                  style={{ paddingLeft: `${(Number(heading.tag[1]) - 1) * 12}px` }}
                  title={heading.text}
                >
                  {heading.text || <span className="text-slate-400">(empty heading)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {truncated ? (
        <p className="text-xs text-slate-400">
          The page has more headings than the retention cap — only the first {headings.length} are
          shown.
        </p>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Heading findings</h3>
        <FindingList
          findings={audit.result.findings.filter((finding) => finding.category === 'headings')}
        />
      </section>
    </div>
  );
}
