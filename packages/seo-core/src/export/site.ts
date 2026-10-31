import type { SitePageRecord, SiteSession } from '@vittix/shared';

export const SITE_AUDIT_EXPORT_FORMAT = 'vittix-site-audit';
export const SITE_AUDIT_EXPORT_FORMAT_VERSION = 1;

/** Serialize a full site audit (session + per-page records) as JSON. */
export function siteAuditToJson(session: SiteSession, pages: SitePageRecord[]): string {
  return JSON.stringify(
    {
      format: SITE_AUDIT_EXPORT_FORMAT,
      formatVersion: SITE_AUDIT_EXPORT_FORMAT_VERSION,
      generatedBy: 'Vittix SEO Toolkit',
      session,
      pages,
    },
    null,
    2,
  );
}

const SITE_CSV_COLUMNS = [
  'url',
  'finalUrl',
  'status',
  'httpStatus',
  'depth',
  'score',
  'errors',
  'warnings',
  'incomplete',
] as const;

/**
 * Per-page summary CSV for a site audit. Findings themselves are exported
 * per page from the dashboard (single-page CSV export); this file is the
 * site-level overview.
 */
export function sitePagesToCsv(session: SiteSession, pages: SitePageRecord[]): string {
  const rows: string[][] = [[...SITE_CSV_COLUMNS]];
  for (const page of pages) {
    const result = page.result as {
      score?: { total?: number };
      findings?: { severity: string }[];
      truncated?: boolean;
    } | null;
    const findings = result?.findings ?? [];
    rows.push([
      page.url,
      page.finalUrl ?? '',
      page.status,
      page.httpStatus === null ? '' : String(page.httpStatus),
      String(page.depth),
      result?.score?.total === undefined || result?.score?.total === null
        ? ''
        : String(result.score.total),
      String(findings.filter((f) => f.severity === 'error').length),
      String(findings.filter((f) => f.severity === 'warn').length),
      result?.truncated === true ? 'yes' : 'no',
    ]);
  }
  void session; // session metadata is in the JSON export
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180 escaping (kept in sync with export/csv.ts). */
function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
