import { Check, Minus, Search } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { EmptyState } from '@/src/components/EmptyState';
import { FindingList } from '@/src/components/FindingList';

export function MetadataView({ audit }: { audit: AuditRecord | null }) {
  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to show yet">
        <p>Run an analysis from the popup first — the page metadata will be listed here.</p>
      </EmptyState>
    );
  }

  const meta = audit.snapshot.meta;

  const rows: { label: string; value: string | null }[] = [
    { label: 'Title', value: audit.snapshot.title || null },
    { label: 'Meta description', value: meta.description },
    { label: 'Canonical URL', value: meta.canonical },
    { label: 'Robots', value: meta.robots },
    { label: 'Viewport', value: meta.viewport },
    { label: 'Charset', value: meta.charset },
    { label: 'Language (html lang)', value: meta.lang },
    { label: 'og:title', value: meta.ogTitle },
    { label: 'og:description', value: meta.ogDescription },
    { label: 'og:image', value: meta.ogImage },
    { label: 'twitter:card', value: meta.twitterCard },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-slate-100 last:border-0">
                <td className="w-44 bg-slate-50/60 px-4 py-2.5 align-top font-medium text-slate-600">
                  {row.label}
                </td>
                <td className="px-4 py-2.5 text-slate-800">
                  {row.value ? (
                    <span className="break-words">{row.value}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Minus className="size-3.5" aria-hidden /> not set
                    </span>
                  )}
                </td>
                <td className="w-16 px-4 py-2.5 text-right">
                  {row.value ? (
                    <Check className="inline size-4 text-emerald-500" aria-label="present" />
                  ) : (
                    <Minus className="inline size-4 text-slate-300" aria-label="absent" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Metadata findings</h3>
        <FindingList
          findings={audit.result.findings.filter((finding) =>
            finding.category === 'metadata' ||
            finding.category === 'social' ||
            finding.category === 'technical'
              ? true
              : false,
          )}
        />
      </section>
      <p className="text-xs text-slate-400">
        Presence indicators reflect the extracted snapshot only ({ruleCount(audit)} rules
        evaluated).
      </p>
    </div>
  );
}

function ruleCount(audit: AuditRecord): number {
  return audit.result.findings.length;
}
