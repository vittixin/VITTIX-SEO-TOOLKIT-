import type { AuditRecord } from '@vittix/shared';

const COLUMNS = [
  'analyzedAt',
  'url',
  'pageTitle',
  'category',
  'severity',
  'ruleId',
  'finding',
  'detail',
  'evidence',
] as const;

/** RFC 4180 escaping: quote fields containing commas, quotes or newlines. */
export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize an audit's findings as RFC 4180 CSV (CRLF line endings). */
export function findingsToCsv(audit: AuditRecord): string {
  const rows: string[][] = [
    [...COLUMNS],
    ...audit.result.findings.map((f) => [
      audit.analyzedAt,
      audit.url,
      audit.title,
      f.category,
      f.severity,
      f.ruleId,
      f.title,
      f.detail,
      f.evidence ?? '',
    ]),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}
