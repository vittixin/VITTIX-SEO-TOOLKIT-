import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { readingTimeMinutes } from '@vittix/seo-core';
import { EmptyState } from '@/src/components/EmptyState';
import { StatCard } from '@/src/components/StatCard';
import { getTargetKeyword, saveTargetKeyword } from '@/src/storage/keywords';

type SortKey = 'term' | 'count' | 'density';

export function ContentView({
  audit,
  onReanalyze,
}: {
  audit: AuditRecord | null;
  onReanalyze: () => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('count');
  const [ascending, setAscending] = useState(false);
  const [saved, setSaved] = useState(false);
  const url = audit?.url;

  useEffect(() => {
    let active = true;
    if (url) void getTargetKeyword(url).then((value) => active && setKeyword(value));
    else setKeyword('');
    return () => {
      active = false;
    };
  }, [url]);

  const rows = useMemo(() => {
    if (!audit) return [];
    return audit.snapshot.textSummary.keywords
      .map(({ term, count }) => ({
        term,
        count,
        density: audit.snapshot.textStats.wordCount
          ? (count / audit.snapshot.textStats.wordCount) * 100
          : 0,
      }))
      .filter((row) => row.term.includes(filter.trim().toLowerCase()))
      .sort((a, b) => {
        const compare = sort === 'term' ? a.term.localeCompare(b.term) : a[sort] - b[sort];
        return (ascending ? 1 : -1) * compare;
      });
  }, [audit, filter, sort, ascending]);

  if (!audit)
    return (
      <EmptyState icon={Search} title="No content summary yet">
        <p>Run an analysis to see the page’s text summary and keywords.</p>
      </EmptyState>
    );

  const summary = audit.snapshot.textSummary;
  const lang = audit.snapshot.meta.lang?.split('-')[0]?.toLowerCase();
  const isEnglish = !lang || lang === 'en';
  const words = audit.snapshot.textStats.wordCount;
  const keywordFindingsInactive = keyword.trim() === '';

  async function saveKeyword() {
    if (!audit) return;
    await saveTargetKeyword(audit.url, keyword);
    setKeyword(keyword.trim().slice(0, 200));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function chooseSort(key: SortKey) {
    if (sort === key) setAscending(!ascending);
    else {
      setSort(key);
      setAscending(key === 'term');
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Content statistics">
        <StatCard label="Words" value={words.toLocaleString()} />
        <StatCard label="Reading time" value={`${readingTimeMinutes(words)} min`} />
        <StatCard label="Sentences" value={summary.sentenceCount} />
        <StatCard label="Paragraphs" value={summary.paragraphCount} />
      </section>
      <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
        <BookOpen className="mr-1 inline size-4" aria-hidden />
        Flesch Reading Ease:{' '}
        {isEnglish ? 'Not available from this stored snapshot' : 'Not available for this language'}.
      </p>
      {audit.snapshot.textStats.textSampleTruncated ? (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Text sample was truncated; content statistics cover a partial sample.
        </p>
      ) : null}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Target keyword</h2>
        <p className="text-xs text-slate-600">
          Saved locally per URL. This term never leaves this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="target-keyword">
            Target keyword
          </label>
          <input
            id="target-keyword"
            value={keyword}
            maxLength={200}
            onChange={(event) => setKeyword(event.target.value)}
            className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            placeholder="e.g. coffee grinder"
          />
          <button
            type="button"
            onClick={() => void saveKeyword()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Save keyword
          </button>
          <button
            type="button"
            onClick={() => {
              setKeyword('');
              void saveTargetKeyword(audit.url, '');
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            Clear
          </button>
        </div>
        {saved ? (
          <p role="status" className="text-xs text-emerald-700">
            Keyword saved on this device.
          </p>
        ) : null}
        {keywordFindingsInactive ? (
          <p role="status" className="text-sm text-slate-600">
            Keyword rules are inactive because no target keyword is set.
          </p>
        ) : (
          <p className="text-sm text-slate-700">
            Keyword rules are active for the next analysis. Re-analyze to refresh findings.
          </p>
        )}
        {keyword.trim() ? (
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <Prominence
              label="Title"
              value={audit.snapshot.title.toLowerCase().includes(keyword.trim().toLowerCase())}
            />
            <Prominence
              label="H1"
              value={audit.snapshot.headings.some(
                (heading) =>
                  heading.tag === 'h1' &&
                  heading.text.toLowerCase().includes(keyword.trim().toLowerCase()),
              )}
            />
            <Prominence
              label="Description"
              value={(audit.snapshot.meta.description ?? '')
                .toLowerCase()
                .includes(keyword.trim().toLowerCase())}
            />
            <Prominence
              label="URL"
              value={audit.url
                .toLowerCase()
                .includes(keyword.trim().toLowerCase().replaceAll(' ', '-'))}
            />
            <Prominence label="First 100 words" value={null} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void saveKeyword().then(onReanalyze)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
        >
          Re-analyze saved snapshot
        </button>
        <p className="text-xs text-slate-500">
          Re-analysis uses this stored snapshot and does not access the page.
        </p>
      </section>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Top keywords and phrases</h2>
          <label className="sr-only" htmlFor="keyword-filter">
            Filter keywords
          </label>
          <input
            id="keyword-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value.toLowerCase())}
            placeholder="Filter keywords"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                {(['term', 'count', 'density'] as const).map((key) => (
                  <th key={key} className="py-2">
                    <button
                      type="button"
                      onClick={() => chooseSort(key)}
                      aria-label={`Sort by ${key}`}
                      className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                    >
                      {key === 'term' ? 'Keyword' : key === 'count' ? 'Count' : 'Density'}
                      {sort === key ? (ascending ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.term} className="border-b border-slate-100">
                  <td className="py-2">{row.term}</td>
                  <td className="py-2 tabular-nums">{row.count}</td>
                  <td className="py-2 tabular-nums">{row.density.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Prominence({ label, value }: { label: string; value: boolean | null }) {
  const text = value === null ? 'not captured' : value ? 'present' : 'not found';
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <span aria-hidden>{value === null ? '—' : value ? '✓' : '○'} </span>
      {label}: {text}
    </div>
  );
}
