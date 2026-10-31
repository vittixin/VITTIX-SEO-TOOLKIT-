import { ExternalLink, Search, TriangleAlert } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { ComparePanel } from '@/src/components/ComparePanel';
import { EmptyState } from '@/src/components/EmptyState';
import { FindingList } from '@/src/components/FindingList';
import { ScoreRing } from '@/src/components/ScoreRing';
import { StatCard } from '@/src/components/StatCard';
import { formatDate, truncateMiddle } from '@/src/lib/format';

const CATEGORY_LABELS: Record<string, string> = {
  metadata: 'Metadata',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
  content: 'Content',
  social: 'Social',
  technical: 'Technical',
};

export function OverviewView({
  audit,
  previous,
}: {
  audit: AuditRecord | null;
  previous?: AuditRecord | null;
}) {
  if (!audit) {
    return (
      <EmptyState icon={Search} title="No audit yet">
        <p>
          Click the <strong>Vittix</strong> icon on any web page and run{' '}
          <em>Analyze Current Page</em>. The results will appear here and in your local history.
        </p>
      </EmptyState>
    );
  }

  const headingTotal = Object.values(audit.snapshot.headingCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">
              {audit.title || '(untitled page)'}
            </h2>
            <a
              href={audit.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-indigo-600 hover:underline"
            >
              <span className="truncate">{truncateMiddle(audit.url, 72)}</span>
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
            <p className="mt-1 text-xs text-slate-400">
              Analyzed {formatDate(audit.analyzedAt)} · Rule set v{audit.ruleSetVersion}
            </p>
          </div>
          <div className="flex flex-col items-center">
            <ScoreRing score={audit.result.score.total} />
            <p className="mt-1 text-sm font-medium text-slate-700">
              {audit.result.score.label}
              <span className="text-slate-400"> · </span>
              <span className="text-slate-500">preliminary</span>
            </p>
          </div>
        </div>
        {audit.result.score.capReason ? (
          <p
            data-testid="score-cap-reason"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800"
          >
            <strong>Score capped:</strong> {audit.result.score.capReason}. Resolve the blocking
            issues above to unlock the full score.
          </p>
        ) : null}
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
          The scoring model is still being calibrated. Treat the score as an on-page hygiene
          indicator, not a search-ranking prediction.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Errors" value={auditCount(audit, 'error')} tone="rose" />
        <StatCard label="Warnings" value={auditCount(audit, 'warn')} tone="amber" />
        <StatCard label="Info" value={auditCount(audit, 'info')} tone="sky" />
        <StatCard label="Passed checks" value={auditCount(audit, 'pass')} tone="emerald" />
      </section>

      {audit.result.truncated ? (
        <div
          data-testid="truncation-banner"
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Incomplete audit.</strong> This page exceeds the extraction caps, so some
            headings, images, links or metadata values were omitted. Counts and the score may
            undercount. Re-run the analysis on a smaller page variant for a complete audit.
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Category scores</h3>
        <div className="mt-3 space-y-3">
          {audit.result.score.categories.map((category) => (
            <div key={category.category} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs font-medium text-slate-500">
                {CATEGORY_LABELS[category.category] ?? category.category}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                  style={{ width: `${category.score}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs font-semibold tabular-nums text-slate-700">
                {category.score}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Words on page"
          value={audit.snapshot.textStats.wordCount.toLocaleString()}
        />
        <StatCard label="Headings" value={headingTotal} />
        <StatCard label="Images" value={audit.snapshot.imageCount} />
        <StatCard label="Links" value={audit.snapshot.linkCount} />
      </section>

      {previous ? <ComparePanel current={audit} previous={previous} /> : null}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Top findings</h3>
        <FindingList findings={audit.result.findings.slice(0, 6)} />
      </section>
    </div>
  );
}

function auditCount(audit: AuditRecord, severity: 'error' | 'warn' | 'info' | 'pass'): number {
  return audit.result.findings.filter((finding) => finding.severity === severity).length;
}
