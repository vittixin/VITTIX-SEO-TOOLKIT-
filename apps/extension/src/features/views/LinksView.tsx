import { Search } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { EmptyState } from '@/src/components/EmptyState';
import { FindingList } from '@/src/components/FindingList';
import { StatCard } from '@/src/components/StatCard';
import { truncateMiddle } from '@/src/lib/format';

export function LinksView({ audit }: { audit: AuditRecord | null }) {
  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to show yet">
        <p>Run an analysis from the popup first — link results will appear here.</p>
      </EmptyState>
    );
  }

  const { links, linkCount, url } = audit.snapshot;
  const truncated = linkCount > links.length;

  let internal = 0;
  let external = 0;
  let empty = 0;
  try {
    const pageHost = new URL(url).host;
    for (const link of links) {
      try {
        const host = new URL(link.href, url).host;
        if (host === pageHost) internal += 1;
        else external += 1;
      } catch {
        // unresolvable href — counted nowhere special
      }
      if (link.text.trim() === '') empty += 1;
    }
  } catch {
    // page URL unparseable (should not happen; snapshot validated earlier)
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Links on page" value={linkCount} />
        <StatCard label="Internal" value={internal} />
        <StatCard label="External" value={external} />
        <StatCard label="Empty anchors" value={empty} tone={empty > 0 ? 'amber' : 'slate'} />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {links.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">This page contains no links.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">URL</th>
                <th className="px-4 py-2 font-medium">Anchor text</th>
                <th className="px-4 py-2 font-medium">rel</th>
              </tr>
            </thead>
            <tbody>
              {links.slice(0, 100).map((link, index) => (
                <tr
                  key={`${link.href}-${index}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="max-w-72 px-4 py-2 font-mono text-xs text-indigo-600">
                    {truncateMiddle(link.href, 56)}
                  </td>
                  <td className="max-w-48 truncate px-4 py-2 text-slate-800">
                    {link.text || <span className="text-amber-600">(empty)</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{link.rel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {truncated ? (
        <p className="text-xs text-slate-400">
          The page has {linkCount} links — only the first {links.length} are retained.
        </p>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Link findings</h3>
        <FindingList
          findings={audit.result.findings.filter((finding) => finding.category === 'links')}
        />
      </section>
    </div>
  );
}
