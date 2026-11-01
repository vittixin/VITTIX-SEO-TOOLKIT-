import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { Finding, Severity } from '@vittix/shared';
import { SeverityBadge } from './SeverityBadge';

const ICONS: Record<Severity, ComponentType<SVGProps<SVGSVGElement>>> = {
  error: XCircle,
  warn: TriangleAlert,
  info: Info,
  pass: CheckCircle2,
};

const ICON_CLASSES: Record<Severity, string> = {
  error: 'text-rose-500',
  warn: 'text-amber-500',
  info: 'text-sky-500',
  pass: 'text-emerald-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  metadata: 'Metadata',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
  content: 'Content',
  social: 'Social',
  technical: 'Technical',
};

export function FindingList({
  findings,
  onUnignore,
}: {
  findings: readonly Finding[];
  onUnignore?: (ruleId: string) => void;
}) {
  if (findings.length === 0) {
    return <p className="text-sm text-slate-500">No findings recorded.</p>;
  }
  return (
    <ul className="space-y-3">
      {findings.map((finding) => {
        const Icon = ICONS[finding.severity];
        return (
          <li
            key={`${finding.ruleId}-${finding.title}`}
            className={`rounded-xl border border-slate-200 p-4 shadow-sm ${finding.ignored ? 'bg-slate-100 opacity-70' : 'bg-white'}`}
          >
            <div className="flex items-start gap-3">
              <Icon
                className={`mt-0.5 size-5 shrink-0 ${ICON_CLASSES[finding.severity]}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">{finding.title}</h4>
                  <SeverityBadge severity={finding.severity} />
                  {finding.ignored ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      ignored
                    </span>
                  ) : null}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {CATEGORY_LABELS[finding.category] ?? finding.category}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{finding.detail}</p>
                {finding.evidence ? (
                  <p className="mt-2 truncate rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">
                    {finding.evidence}
                  </p>
                ) : null}
                {finding.remediation ? (
                  <p className="mt-2 rounded-md border-l-2 border-indigo-300 bg-indigo-50/60 px-3 py-1.5 text-sm leading-relaxed text-slate-700">
                    <span className="font-semibold text-indigo-700">How to fix: </span>
                    {finding.remediation}
                  </p>
                ) : null}
                <p className="mt-1.5 font-mono text-[11px] text-slate-400">{finding.ruleId}</p>
                {finding.ignored && onUnignore ? (
                  <button
                    type="button"
                    onClick={() => onUnignore(finding.ruleId)}
                    className="mt-2 rounded text-xs font-medium text-indigo-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                  >
                    Un-ignore
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
