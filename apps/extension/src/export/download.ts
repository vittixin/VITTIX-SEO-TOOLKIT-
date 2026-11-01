import type { AuditRecord } from '@vittix/shared';
import {
  auditToJson,
  buildAuditMarkdown,
  buildSiteAuditMarkdown,
  buildSiteAuditReportHtml,
  findingsToCsv,
  type AuditReportOptions,
  type SiteReportInput,
  type SiteReportOptions,
} from '@vittix/seo-core';

/**
 * Export downloads use a Blob URL + user gesture — this requires no extra
 * Chrome permission (no `downloads` permission needed).
 */
function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-').slice(0, 19);
}

export function exportAuditJson(
  audit: AuditRecord,
  options: { targetKeyword?: string; includePageTextExcerpt?: boolean } = {},
): void {
  downloadFile(
    `vittix-audit-${fileStamp(audit.analyzedAt)}-${audit.id ?? 'latest'}.json`,
    auditToJson(audit, options),
    'application/json',
  );
}

export function exportFindingsCsv(audit: AuditRecord): void {
  downloadFile(
    `vittix-findings-${fileStamp(audit.analyzedAt)}-${audit.id ?? 'latest'}.csv`,
    findingsToCsv(audit),
    'text/csv',
  );
}

export function exportAuditMarkdown(audit: AuditRecord, options: AuditReportOptions = {}): string {
  const markdown = buildAuditMarkdown(audit, options);
  downloadFile(
    `vittix-audit-${fileStamp(audit.analyzedAt)}-${audit.id ?? 'latest'}.md`,
    markdown,
    'text/markdown;charset=utf-8',
  );
  return markdown;
}

/** Copy is attempted only from the explicit user click; it needs no new extension permission. */
export async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the focused legacy copy path, still within this gesture.
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

export function exportSiteReportHtml(
  site: SiteReportInput,
  sessionId: number | undefined,
  options: SiteReportOptions = {},
): void {
  downloadFile(
    `vittix-site-report-${sessionId ?? 'latest'}.html`,
    buildSiteAuditReportHtml(site, options),
    'text/html;charset=utf-8',
  );
}

export function exportSiteReportMarkdown(
  site: SiteReportInput,
  sessionId: number | undefined,
  options: SiteReportOptions = {},
): void {
  downloadFile(
    `vittix-site-report-${sessionId ?? 'latest'}.md`,
    buildSiteAuditMarkdown(site, options),
    'text/markdown;charset=utf-8',
  );
}
