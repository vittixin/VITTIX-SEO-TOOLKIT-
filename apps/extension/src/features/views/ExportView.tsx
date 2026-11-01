import { useCallback, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { AuditRecord } from '@vittix/shared';
import { EmptyState } from '@/src/components/EmptyState';
import { ExportDialog } from '@/src/components/ExportDialog';

export function ExportView({ audit }: { audit: AuditRecord | null }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to export yet">
        <p>Run an analysis first, then return here to create a local report.</p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Choose JSON, CSV, HTML or Markdown. Reports are generated locally; the HTML file has no
        remote resources or executable scripts.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="open-export-dialog"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
      >
        <Download className="size-4" aria-hidden /> Open export dialog
      </button>
      {open ? <ExportDialog audit={audit} onClose={close} /> : null}
    </div>
  );
}
