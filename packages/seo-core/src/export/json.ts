import type { AuditRecord } from '@vittix/shared';

export const AUDIT_EXPORT_FORMAT = 'vittix-seo-audit';
export const AUDIT_EXPORT_FORMAT_VERSION = 1;

export interface AuditJsonExportOptions {
  targetKeyword?: string;
  includePageTextExcerpt?: boolean;
}

/** Serialize a full audit (snapshot + result) as pretty-printed JSON. */
export function auditToJson(audit: AuditRecord, options: AuditJsonExportOptions = {}): string {
  const { targetKeyword, includePageTextExcerpt = false } = options;
  const { leadText, ...summaryWithoutLeadText } = audit.snapshot.textSummary;
  const exportAudit = {
    ...audit,
    snapshot: {
      ...audit.snapshot,
      textSummary: {
        ...summaryWithoutLeadText,
        ...(includePageTextExcerpt ? { leadText } : {}),
      },
    },
  };
  return JSON.stringify(
    {
      format: AUDIT_EXPORT_FORMAT,
      formatVersion: AUDIT_EXPORT_FORMAT_VERSION,
      generatedBy: 'Vittix SEO Toolkit',
      audit: targetKeyword ? { ...exportAudit, targetKeyword } : exportAudit,
    },
    null,
    2,
  );
}
