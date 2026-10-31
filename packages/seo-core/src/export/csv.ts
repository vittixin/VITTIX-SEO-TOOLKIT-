import type { AuditRecord, AuditSummary } from '@vittix/shared';

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

const HISTORY_COLUMNS = [
  'analyzedAt',
  'url',
  'pageTitle',
  'score',
  'scoreLabel',
  'errors',
  'warnings',
  'info',
  'passed',
  'ruleSetVersion',
] as const;

/**
 * Spreadsheet formula injection is mitigated per OWASP guidance: a field
 * whose first character could start a formula (=, +, -, @, tab, CR) is
 * prefixed with a single quote so Excel/Sheets treat it as text. Numeric
 * score fields never reach this path unquoted (they are plain digits), so
 * the readability cost is limited to hostile or unusual text values.
 */
export function csvEscape(value: string): string {
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
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

/**
 * One row per stored single-page audit (history overview). Field order is
 * the documented HISTORY_COLUMNS order and is deterministic.
 */
export function historyToCsv(summaries: readonly AuditSummary[]): string {
  const rows: string[][] = [
    [...HISTORY_COLUMNS],
    ...summaries.map((summary) => [
      summary.analyzedAt,
      summary.url,
      summary.title,
      String(summary.score.total),
      summary.score.label,
      String(summary.counts.error),
      String(summary.counts.warn),
      String(summary.counts.info),
      String(summary.counts.pass),
      summary.score.preliminary ? 'preliminary' : 'final',
    ]),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}
