import type { Severity } from '@vittix/shared';

const STYLES: Record<Severity, { classes: string; label: string }> = {
  error: { classes: 'bg-rose-100 text-rose-700 ring-rose-600/20', label: 'Error' },
  warn: { classes: 'bg-amber-100 text-amber-800 ring-amber-600/20', label: 'Warning' },
  info: { classes: 'bg-sky-100 text-sky-700 ring-sky-600/20', label: 'Info' },
  pass: { classes: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20', label: 'Passed' },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const style = STYLES[severity];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.classes}`}
    >
      {style.label}
    </span>
  );
}
