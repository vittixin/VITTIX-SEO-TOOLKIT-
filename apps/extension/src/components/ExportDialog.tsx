import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import {
  siteAuditToJson,
  sitePagesToCsv,
  type SiteReportInput,
  type SiteComparison,
} from '@vittix/seo-core';
import type { AuditRecord, AnalysisResult, SitePageRecord, SiteSession } from '@vittix/shared';
import type { SiteSummary } from '@/src/storage/site';
import {
  copyTextToClipboard,
  exportAuditJson,
  exportAuditMarkdown,
  exportAuditReportHtml,
  exportSiteCsv,
  exportSiteJson,
  exportSiteReportHtml,
  exportSiteReportMarkdown,
} from '@/src/export/download';
import { getTargetKeyword } from '@/src/storage/keywords';
import { getSettings } from '@/src/storage/settings';

export type SiteExportSource = {
  session: SiteSession;
  pages: SitePageRecord[];
  summary: SiteSummary;
  comparison?: SiteComparison | null;
};

type Props =
  | { audit: AuditRecord; onClose: () => void; site?: never }
  | { audit?: never; onClose: () => void; site: SiteExportSource };

export function ExportDialog(props: Props) {
  const onClose = props.onClose;
  const dialogRef = useRef<HTMLElement>(null);
  const [includePreviews, setIncludePreviews] = useState(false);
  const [includeContentStats, setIncludeContentStats] = useState(false);
  const [includeIgnoredRules, setIncludeIgnoredRules] = useState(true);
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  const [includeKeyword, setIncludeKeyword] = useState(false);
  const [includeBranding, setIncludeBranding] = useState(false);
  const [copied, setCopied] = useState(false);
  const isSite = Boolean(props.site);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = dialogRef.current;
    const focusables = () =>
      [
        ...(root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.offsetParent !== null);
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab') {
        const items = focusables();
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  const siteInput = useMemo<SiteReportInput | null>(() => {
    if (!props.site) return null;
    return {
      session: props.site.session,
      summary: props.site.summary,
      profileId: props.site.session.profileId,
      ignoredRuleIds: props.site.session.ignoredRuleIds,
      comparison: props.site.comparison,
      pages: props.site.pages.map((page) => ({
        url: page.url,
        result: page.result as AnalysisResult | null,
        snapshot: page.snapshot as NonNullable<SiteReportInput['pages']>[number]['snapshot'],
      })),
    };
  }, [props.site]);

  async function siteInputWithOptions(): Promise<SiteReportInput | null> {
    if (!siteInput || !props.site) return siteInput;
    const values = includeKeyword
      ? Object.fromEntries(
          await Promise.all(
            props.site.pages.map(
              async (page) => [page.url, await getTargetKeyword(page.url)] as const,
            ),
          ),
        )
      : {};
    return {
      ...siteInput,
      profileId: props.site.session.profileId,
      ignoredRuleIds: props.site.session.ignoredRuleIds,
      comparison: props.site.comparison,
      pages: siteInput.pages?.map((page) => ({
        ...page,
        targetKeyword: values[page.url],
      })),
    };
  }

  async function reportOptions() {
    const settings = await getSettings();
    const keyword =
      !props.site && includeKeyword ? await getTargetKeyword(props.audit.url) : undefined;
    return {
      includePreviews,
      includeContentStats: includeContentStats || includeExcerpt || includeKeyword,
      includeIgnoredRules,
      includePageTextExcerpt: includeExcerpt,
      includeKeyword,
      profileId: props.site?.session.profileId,
      ignoredRuleIds: props.site?.session.ignoredRuleIds,
      targetKeyword: keyword,
      branding: includeBranding
        ? {
            ...settings.exportBranding,
            logoDataUri: settings.exportBranding.logoDataUri ?? undefined,
          }
        : undefined,
    };
  }

  async function json() {
    if (props.site) {
      const targetKeywords = includeKeyword
        ? Object.fromEntries(
            await Promise.all(
              props.site.pages.map(
                async (page) => [page.url, await getTargetKeyword(page.url)] as const,
              ),
            ),
          )
        : undefined;
      exportSiteJson(
        props.site.session.id,
        siteAuditToJson(props.site.session, props.site.pages, {
          includePageTextExcerpt: includeExcerpt,
          includeKeyword,
          targetKeywords,
          profileId: props.site.session.profileId,
          ignoredRuleIds: props.site.session.ignoredRuleIds,
          comparison: props.site.comparison ?? undefined,
        }),
      );
      return;
    }
    const options = await reportOptions();
    exportAuditJson(props.audit!, {
      targetKeyword: options.includeKeyword ? options.targetKeyword : undefined,
      includePageTextExcerpt: options.includePageTextExcerpt,
    });
  }

  async function csv() {
    if (props.site) {
      exportSiteCsv(props.site.session.id, sitePagesToCsv(props.site.session, props.site.pages));
      return;
    }
    // Reuse the established CSV download helper and its OWASP formula guard.
    const { exportFindingsCsv } = await import('@/src/export/download');
    exportFindingsCsv(props.audit!);
  }

  async function html() {
    const options = await reportOptions();
    if (props.site && siteInput) {
      const input = (await siteInputWithOptions()) ?? siteInput;
      exportSiteReportHtml(input, props.site.session.id, {
        ...options,
        includeIgnoredRules,
        profileId: options.profileId,
        ignoredRuleIds: options.ignoredRuleIds,
      });
    } else if (!props.site) exportAuditReportHtml(props.audit!, options);
  }

  async function markdown() {
    const options = await reportOptions();
    if (props.site && siteInput) {
      const input = (await siteInputWithOptions()) ?? siteInput;
      exportSiteReportMarkdown(input, props.site.session.id, {
        ...options,
        includeIgnoredRules,
        profileId: options.profileId,
        ignoredRuleIds: options.ignoredRuleIds,
      });
    } else if (!props.site) exportAuditMarkdown(props.audit!, options);
  }

  async function copyMarkdown() {
    const options = await reportOptions();
    let markdown: string;
    if (props.site && siteInput) {
      const { buildSiteAuditMarkdown } = await import('@vittix/seo-core');
      markdown = buildSiteAuditMarkdown((await siteInputWithOptions()) ?? siteInput, options);
    } else {
      const { buildAuditMarkdown } = await import('@vittix/seo-core');
      markdown = buildAuditMarkdown(props.audit!, options);
    }
    setCopied(await copyTextToClipboard(markdown));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-5 text-slate-900 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="export-dialog-title" className="text-lg font-semibold">
              Export {isSite ? 'site audit' : 'audit'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Files are built locally and downloaded only after you choose an export.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close export dialog"
            className="rounded-lg p-2 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <fieldset className="mt-5 space-y-2 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Report options</legend>
          {!isSite ? (
            <>
              <Option
                label="Include previews"
                checked={includePreviews}
                onChange={setIncludePreviews}
              />
              <Option
                label="Include content statistics"
                checked={includeContentStats}
                onChange={setIncludeContentStats}
              />
              <Option
                label="Include page text excerpt"
                checked={includeExcerpt}
                onChange={setIncludeExcerpt}
              />
              <Option
                label="Include target keyword"
                checked={includeKeyword}
                onChange={setIncludeKeyword}
              />
            </>
          ) : (
            <>
              <Option
                label="Include page text excerpt"
                checked={includeExcerpt}
                onChange={setIncludeExcerpt}
              />
              <Option
                label="Include target keywords"
                checked={includeKeyword}
                onChange={setIncludeKeyword}
              />
            </>
          )}
          <Option
            label="Include ignored rules"
            checked={includeIgnoredRules}
            onChange={setIncludeIgnoredRules}
          />
          <Option label="Agency branding" checked={includeBranding} onChange={setIncludeBranding} />
          <p className="pt-1 text-xs leading-relaxed text-slate-600">
            Page excerpts and target keywords are excluded by default. HTML and Markdown contain
            findings, profile, rule-set version, ignored rules and score cap details. JSON contains
            the stored audit; CSV contains rows and uses formula-injection protection.
          </p>
        </fieldset>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ExportButton
            testId={isSite ? 'site-export-json' : 'export-json'}
            label="JSON"
            detail="Full stored audit and snapshot"
            onClick={() => void json()}
          />
          <ExportButton
            testId={isSite ? 'site-export-csv' : 'export-csv'}
            label="CSV"
            detail="Findings or site page list"
            onClick={() => void csv()}
          />
          <ExportButton
            testId={isSite ? 'site-export-html-report' : 'export-html'}
            label="HTML report"
            detail="Self-contained, printable report"
            onClick={() => void html()}
          />
          <ExportButton
            testId={isSite ? 'site-export-markdown-report' : 'export-markdown'}
            label="Markdown"
            detail="Task-list ticket for issue trackers"
            onClick={() => void markdown()}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => void copyMarkdown()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            Copy Markdown
          </button>
          {copied ? (
            <span role="status" className="text-sm text-emerald-800">
              Markdown copied.
            </span>
          ) : null}
          <button
            type="button"
            onClick={props.onClose}
            className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function Option({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-8 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function ExportButton({
  testId,
  label,
  detail,
  onClick,
}: {
  testId: string;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-slate-300 p-3 text-left hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800">
        <Download className="size-4" aria-hidden />
      </span>
      <span>
        <strong className="block text-sm">{label}</strong>
        <span className="text-xs text-slate-600">{detail}</span>
      </span>
    </button>
  );
}
