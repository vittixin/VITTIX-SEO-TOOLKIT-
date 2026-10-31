import { useMemo, useState } from 'react';
import { ListChecks, Search, SearchX } from 'lucide-react';
import type { AuditRecord, Category, Finding, Severity } from '@vittix/shared';
import { countSeverities } from '@vittix/shared';
import { FindingList } from '@/src/components/FindingList';
import { EmptyState } from '@/src/components/EmptyState';

type Filter = 'all' | Severity;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warn', label: 'Warnings' },
  { id: 'info', label: 'Info' },
  { id: 'pass', label: 'Passed' },
];

const CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All categories' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'headings', label: 'Headings' },
  { id: 'images', label: 'Images' },
  { id: 'links', label: 'Links' },
  { id: 'social', label: 'Social' },
  { id: 'technical', label: 'Technical' },
];

const CATEGORY_LABELS: Record<Category, string> = {
  metadata: 'Metadata',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
  social: 'Social',
  technical: 'Technical',
};

function matches(finding: Finding, query: string): boolean {
  if (query === '') return true;
  const haystack = `${finding.title} ${finding.detail} ${finding.ruleId} ${finding.evidence ?? ''}`;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

export function FindingsView({ audit }: { audit: AuditRecord | null }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [grouped, setGrouped] = useState(true);

  const filtered = useMemo(() => {
    if (!audit) return [];
    return audit.result.findings.filter(
      (finding) =>
        (filter === 'all' || finding.severity === filter) &&
        (category === 'all' || finding.category === category) &&
        matches(finding, query),
    );
  }, [audit, filter, category, query]);

  const groupedFindings = useMemo(() => {
    if (!grouped) return null;
    const byCategory = new Map<Category, Finding[]>();
    for (const finding of filtered) {
      const list = byCategory.get(finding.category) ?? [];
      list.push(finding);
      byCategory.set(finding.category, list);
    }
    return [...byCategory.entries()];
  }, [filtered, grouped]);

  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to show yet">
        <p>Run an analysis from the popup first — every rule result will be listed here.</p>
      </EmptyState>
    );
  }

  const counts = countSeverities(audit.result.findings);
  const selectClasses =
    'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
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
              placeholder="Search findings…"
              data-testid="findings-search"
              aria-label="Search findings"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category | 'all')}
            aria-label="Filter by category"
            className={selectClasses}
          >
            {CATEGORIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(event) => setGrouped(event.target.checked)}
              className="size-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
            />
            Group by category
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ListChecks className="size-4 text-slate-400" aria-hidden />
          {FILTERS.map((option) => {
            const count = option.id === 'all' ? audit.result.findings.length : counts[option.id];
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label} <span className="tabular-nums opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="No matching findings">
          <p>Try a different search term, category or severity filter.</p>
        </EmptyState>
      ) : groupedFindings ? (
        <div className="space-y-5">
          {groupedFindings.map(([groupCategory, groupFindings]) => (
            <section key={groupCategory} aria-label={CATEGORY_LABELS[groupCategory]}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                {CATEGORY_LABELS[groupCategory]}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 tabular-nums">
                  {groupFindings.length}
                </span>
              </h3>
              <FindingList findings={groupFindings} />
            </section>
          ))}
        </div>
      ) : (
        <FindingList findings={filtered} />
      )}
    </div>
  );
}
