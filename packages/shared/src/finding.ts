import { z } from 'zod';

/** Severities used by every SEO finding. */
export const SEVERITIES = ['error', 'warn', 'info', 'pass'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SeveritySchema = z.enum(SEVERITIES);

/** Analyzer categories. Also the scoring dimensions. */
export const CATEGORIES = [
  'metadata',
  'headings',
  'images',
  'links',
  'content',
  'social',
  'technical',
] as const;
export type Category = (typeof CATEGORIES)[number];
export const CategorySchema = z.enum(CATEGORIES);

/** A single, deterministic analysis result produced by a rule. */
export const FindingSchema = z.object({
  ruleId: z.string().min(1),
  category: CategorySchema,
  severity: SeveritySchema,
  title: z.string().min(1),
  detail: z.string(),
  /** Optional short evidence excerpt, e.g. an offending src or heading text. */
  evidence: z.string().optional(),
  /**
   * Actionable fix suggestion. Analyzers always emit it for new findings;
   * optional in the schema so Phase 0 records stay readable.
   */
  remediation: z.string().optional(),
  /**
   * Affected/checked ratio (0–1) for count-based rules (missing alt, unnamed
   * links, generic anchors, thin coverage). Used by the scoring engine to
   * scale the penalty; optional so older records validate.
   */
  ratio: z.number().min(0).max(1).optional(),
  /** Rule-control state: ignored findings remain visible but do not score. */
  ignored: z.boolean().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

/** Sort order for display: most severe first. */
export const FINDING_SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warn: 1,
  info: 2,
  pass: 3,
};

export type SeverityCounts = Record<Severity, number>;

/** Count findings per severity. Pure helper used by UI and messages. */
export function countSeverities(findings: readonly Finding[]): SeverityCounts {
  const counts: SeverityCounts = { error: 0, warn: 0, info: 0, pass: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}
