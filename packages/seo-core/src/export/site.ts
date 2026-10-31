import type { SitePageRecord, SiteSession, SiteSessionStatus } from '@vittix/shared';

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

/** RFC 4180 escaping + spreadsheet formula-injection guard. */
function csvEscape(value: string): string {
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface SiteComparison {
  comparable: boolean;
  reason: string;
  before: {
    sessionId?: number;
    finishedAt: string | null;
    auditedPages: number;
    totalErrors: number;
    totalWarnings: number;
    status: SiteSessionStatus;
  };
  after: {
    sessionId?: number;
    finishedAt: string | null;
    auditedPages: number;
    totalErrors: number;
    totalWarnings: number;
    status: SiteSessionStatus;
  };
  deltas: { auditedPages: number; totalErrors: number; totalWarnings: number };
}

/** The rule-set version in effect for a session (from its audited pages). */
export function sessionRuleSetVersion(pages: readonly SitePageRecord[]): string | null {
  for (const page of pages) {
    const result = page.result as { ruleSetVersion?: string } | null;
    if (result?.ruleSetVersion !== undefined) return result.ruleSetVersion;
  }
  return null;
}

/**
 * Compare two completed sessions of the same origin. Comparison is only
 * offered when BOTH sessions ran on the same rule-set version — otherwise
 * the deltas would mix two scoring models (see docs/SEO_RULES.md).
 */
export function compareSiteSessions(
  previous: { session: SiteSession; pages: readonly SitePageRecord[] },
  current: { session: SiteSession; pages: readonly SitePageRecord[] },
): SiteComparison {
  const beforeVersion = sessionRuleSetVersion(previous.pages);
  const afterVersion = sessionRuleSetVersion(current.pages);

  const summarize = (session: SiteSession, pages: readonly SitePageRecord[]) => {
    let auditedPages = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    for (const page of pages) {
      const result = page.result as { score?: unknown; findings?: { severity: string }[] } | null;
      if (result === null || result.score === undefined) continue;
      auditedPages += 1;
      totalErrors += (result.findings ?? []).filter((f) => f.severity === 'error').length;
      totalWarnings += (result.findings ?? []).filter((f) => f.severity === 'warn').length;
    }
    return {
      sessionId: session.id,
      finishedAt: session.finishedAt,
      auditedPages,
      totalErrors,
      totalWarnings,
      status: session.status,
    };
  };

  const before = summarize(previous.session, previous.pages);
  const after = summarize(current.session, current.pages);

  const comparable = beforeVersion !== null && beforeVersion === afterVersion;
  return {
    comparable,
    reason: comparable
      ? `Both audits ran on rule set v${beforeVersion ?? '?'}.`
      : `Rule-set versions differ (${beforeVersion ?? 'unknown'} vs ${afterVersion ?? 'unknown'}) — score and count deltas are not comparable.`,
    before,
    after,
    deltas: {
      auditedPages: after.auditedPages - before.auditedPages,
      totalErrors: after.totalErrors - before.totalErrors,
      totalWarnings: after.totalWarnings - before.totalWarnings,
    },
  };
}
