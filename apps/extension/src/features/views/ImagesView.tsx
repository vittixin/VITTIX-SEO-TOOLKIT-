import { Search } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { EmptyState } from '@/src/components/EmptyState';
import { FindingList } from '@/src/components/FindingList';
import { StatCard } from '@/src/components/StatCard';
import { truncateMiddle } from '@/src/lib/format';

export function ImagesView({ audit }: { audit: AuditRecord | null }) {
  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to show yet">
        <p>Run an analysis from the popup first — image alt-text results will appear here.</p>
      </EmptyState>
    );
  }

  const { images, imageCount } = audit.snapshot;
  const withAlt = images.filter((image) => image.alt !== null && image.alt.trim() !== '');
  const missingAlt = images.length - withAlt.length;
  const truncated = imageCount > images.length;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Images on page" value={imageCount} />
        <StatCard label="With alt text" value={withAlt.length} tone="emerald" />
        <StatCard
          label="Missing alt text"
          value={missingAlt}
          tone={missingAlt > 0 ? 'rose' : 'slate'}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {images.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">This page contains no images.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Alt text</th>
              </tr>
            </thead>
            <tbody>
              {images.slice(0, 100).map((image, index) => (
                <tr
                  key={`${image.src}-${index}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="max-w-80 px-4 py-2 font-mono text-xs text-slate-500">
                    {truncateMiddle(image.src, 60)}
                  </td>
                  <td className="px-4 py-2">
                    {image.alt && image.alt.trim() !== '' ? (
                      <span className="text-slate-800">{image.alt}</span>
                    ) : (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                        missing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {truncated ? (
        <p className="text-xs text-slate-400">
          The page has {imageCount} images — only the first {images.length} are retained.
        </p>
      ) : null}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Image findings</h3>
        <FindingList
          findings={audit.result.findings.filter((finding) => finding.category === 'images')}
        />
      </section>
    </div>
  );
}
