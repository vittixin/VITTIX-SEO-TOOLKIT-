import { ArrowDownRight, ArrowUpRight, GitCompareArrows, Minus } from 'lucide-react';
import type { AuditRecord, SeverityCounts } from '@vittix/shared';
import { countSeverities } from '@vittix/shared';
import { formatDate } from '@/src/lib/format';

/** Delta rendering with an explicit "no change" state. */
function Delta({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-400">
        <Minus className="size-3" aria-hidden /> no change
      </span>
    );
  }
  const improved = delta < 0; // fewer findings = better
  const Icon = improved ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        improved ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(delta)} {improved ? 'fewer' : 'more'}
    </span>
  );
}

/**
 * Side-by-side comparison of an audit with the previous audit of the same
 * URL. Purely additive UI — it reads both records and renders deltas of the
 * score and per-severity counts, plus rule-level changes.
 */
export function ComparePanel({
  current,
  previous,
}: {
  current: AuditRecord;
  previous: AuditRecord;
}) {
  const now = countSeverities(current.result.findings);
  const before = countSeverities(previous.result.findings);

  const rulesBefore = new Map(
    previous.result.findings
      .filter((f) => f.severity === 'error' || f.severity === 'warn')
      .map((f) => [f.ruleId, f.severity]),
  );
  const rulesNow = new Map(
    current.result.findings
      .filter((f) => f.severity === 'error' || f.severity === 'warn')
      .map((f) => [f.ruleId, f.severity]),
  );
  const resolved = [...rulesBefore.keys()].filter((ruleId) => !rulesNow.has(ruleId));
  const introduced = [...rulesNow.keys()].filter((ruleId) => !rulesBefore.has(ruleId));

  const scoreDelta = current.result.score.total - previous.result.score.total;
  // Rule sets evolve; a delta across different rule-set versions mixes two
  // different scoring models and would be misleading.
  const crossVersion = current.result.ruleSetVersion !== previous.result.ruleSetVersion;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <GitCompareArrows className="size-4 text-indigo-500" aria-hidden />
        Compared with previous audit of this URL
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">
        {formatDate(previous.analyzedAt)} → {formatDate(current.analyzedAt)}
      </p>

      {crossVersion ? (
        <p
          data-testid="compare-version-warning"
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
        >
          These audits were produced by different rule-set versions (
          <span className="font-mono">v{previous.result.ruleSetVersion}</span> vs{' '}
          <span className="font-mono">v{current.result.ruleSetVersion}</span>). Rules and scoring
          changed in between, so score and count deltas are <strong>not directly comparable</strong>{' '}
          — treat them as indicative only.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-500">Preliminary score</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {current.result.score.total}
            </span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                scoreDelta === 0
                  ? 'text-slate-400'
                  : scoreDelta > 0
                    ? 'text-emerald-600'
                    : 'text-rose-600'
              }`}
            >
              {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['error', 'warn'] as const).map((severity) => (
            <div key={severity} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-500">
                {severity === 'error' ? 'Errors' : 'Warnings'}
              </p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums text-slate-900">
                  {now[severity as keyof SeverityCounts]}
                </span>
                <Delta before={before[severity]} after={now[severity]} />
              </p>
            </div>
          ))}
        </div>
      </div>

      {(resolved.length > 0 || introduced.length > 0) && (
        <div className="mt-4 space-y-2 text-sm">
          {resolved.length > 0 && (
            <p>
              <span className="font-semibold text-emerald-700">Resolved since last run: </span>
              <span className="text-slate-600">{resolved.join(', ')}</span>
            </p>
          )}
          {introduced.length > 0 && (
            <p>
              <span className="font-semibold text-rose-700">New since last run: </span>
              <span className="text-slate-600">{introduced.join(', ')}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
