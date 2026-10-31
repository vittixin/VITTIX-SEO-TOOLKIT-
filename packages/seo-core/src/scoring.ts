import { CATEGORIES, type Category, type Finding, type Score, type Severity } from '@vittix/shared';

/**
 * Deterministic, transparent scoring — formula (rule set v0.2.0):
 *
 * 1. Each of the six categories starts at 100.
 * 2. Only score-affecting severities deduct: error −25, warn −10.
 *    `info` and `pass` findings NEVER deduct (see SCORE_AFFECTING_SEVERITIES).
 * 3. Each finding deducts once — findings of the same ruleId in the same
 *    category are deduplicated (defensive; analyzers emit one finding per
 *    rule, but this guarantees no double penalty for one underlying issue).
 * 4. Category scores floor at 0.
 * 5. Total = round(Σ categoryScore × weight) / 100; weights sum to 100.
 *
 * Labels: ≥90 Excellent · ≥75 Good · ≥50 Needs work · <50 Poor.
 *
 * The score is PRELIMINARY (`preliminary: true` is a schema literal so UIs
 * cannot drop the label). It measures on-page hygiene captured in the
 * snapshot only — it is NOT a search-ranking prediction and has no known
 * relationship to Google rankings.
 */
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  metadata: 30,
  headings: 20,
  images: 20,
  links: 15,
  social: 10,
  technical: 5,
};

/** Penalty points per severity. `info`/`pass` are observations, not faults. */
export const SEVERITY_PENALTIES: Record<Severity, number> = {
  error: 25,
  warn: 10,
  info: 0,
  pass: 0,
};

/** Severities that reduce the score. Informational ≠ penalized. */
export const SCORE_AFFECTING_SEVERITIES: readonly Severity[] = ['error', 'warn'];

export function scoreLabel(total: number): string {
  if (total >= 90) return 'Excellent';
  if (total >= 75) return 'Good';
  if (total >= 50) return 'Needs work';
  return 'Poor';
}

export function computeScore(findings: readonly Finding[]): Score {
  const categories = CATEGORIES.map((category) => {
    // Deduplicate by ruleId so one underlying issue can never be penalized
    // twice, and only score-affecting severities count.
    const seen = new Set<string>();
    let penalty = 0;
    for (const finding of findings) {
      if (finding.category !== category) continue;
      if (!SCORE_AFFECTING_SEVERITIES.includes(finding.severity)) continue;
      if (seen.has(finding.ruleId)) continue;
      seen.add(finding.ruleId);
      penalty += SEVERITY_PENALTIES[finding.severity];
    }
    return { category, score: Math.max(0, 100 - penalty) };
  });

  const total = Math.round(
    categories.reduce((sum, c) => sum + c.score * CATEGORY_WEIGHTS[c.category], 0) / 100,
  );

  return { total, label: scoreLabel(total), preliminary: true, categories };
}
