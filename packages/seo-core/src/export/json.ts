import type { AuditRecord } from '@vittix/shared';

export const AUDIT_EXPORT_FORMAT = 'vittix-seo-audit';
export const AUDIT_EXPORT_FORMAT_VERSION = 1;

/** Serialize a full audit (snapshot + result) as pretty-printed JSON. */
export function auditToJson(audit: AuditRecord, targetKeyword?: string): string {
  return JSON.stringify(
    {
      format: AUDIT_EXPORT_FORMAT,
      formatVersion: AUDIT_EXPORT_FORMAT_VERSION,
      generatedBy: 'Vittix SEO Toolkit',
      audit: targetKeyword ? { ...audit, targetKeyword } : audit,
    },
    null,
    2,
  );
}
