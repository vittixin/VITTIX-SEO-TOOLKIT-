import type { AuditRecord } from '@vittix/shared';
import { auditToJson, findingsToCsv } from '@vittix/seo-core';

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

export function exportAuditJson(audit: AuditRecord): void {
  downloadFile(
    `vittix-audit-${fileStamp(audit.analyzedAt)}-${audit.id ?? 'latest'}.json`,
    auditToJson(audit),
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
