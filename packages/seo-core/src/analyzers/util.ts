import type { Category, Finding, Severity } from '@vittix/shared';

/** Compact finding constructor shared by all analyzers. */
export function finding(
  ruleId: string,
  category: Category,
  severity: Severity,
  title: string,
  detail: string,
  options: { evidence?: string; remediation?: string } = {},
): Finding {
  return {
    ruleId,
    category,
    severity,
    title,
    detail,
    ...(options.evidence !== undefined ? { evidence: options.evidence } : {}),
    ...(options.remediation !== undefined ? { remediation: options.remediation } : {}),
  };
}
