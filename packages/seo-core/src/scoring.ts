import { CATEGORIES, type Category, type Finding, type Score, type Severity } from '@vittix/shared';

/**
 * Deterministic, transparent scoring — formula (rule set v0.4.0):
 *
 * 1. Each category starts at 100.
 * 2. Only score-affecting severities deduct: error −25, warn −10.
 *    `info` and `pass` findings NEVER deduct.
 * 3. Ratio scaling (count-based rules): findings that carry an
 *    `affected/checked` ratio are penalized at the next-lower tier when the
 *    affected fraction is small (< 10%) — one missing alt out of 200 is a
 *    blemish, not a structural failure. error: 25 → 10, warn: 10 → 5.
 *    Rules without a ratio keep the flat penalty.
 * 4. Each finding deducts once — findings of the same ruleId in the same
 *    category are deduplicated.
 * 5. Category scores floor at 0.
 * 6. Blocking-issue cap: an error from a rule that prevents search engines
 *    from indexing or meaningfully evaluating the page (robots-directives
 *    noindex/none, title-present missing, h1-present missing, canonical-valid
 *    error) caps the TOTAL at SCORE_CAP_MAX (49, label "Poor") and sets
 *    `capReason`. A page a search engine cannot index should never look
 *    "average" regardless of how polished the remaining signals are.
 * 7. Total = round(Σ categoryScore × weight) / 100; weights sum to 100.
 *
 * Social category (weight 10): missing og:title / og:image are warn-level
 * (score-affecting) because social previews materially affect click-through
 * on shared links; og:description and twitter:card remain informational.
 * This removes the previous "free 10 points" where every social finding was
 * informational.
 *
 * Labels: ≥90 Excellent · ≥75 Good · ≥50 Needs work · <50 Poor. A capped
 * score always reports "Poor".
 *
 * The score is PRELIMINARY (`preliminary: true` is a schema literal so UIs
 * cannot drop the label). It measures on-page hygiene captured in the
 * snapshot only — it is NOT a search-ranking prediction and has no known
 * relationship to Google rankings.
 */
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  metadata: 25,
  headings: 20,
  images: 15,
  links: 15,
  content: 10,
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

/**
 * Rules whose ERROR severity blocks indexing or meaningful evaluation —
 * their presence caps the total score (see SCORE_CAP_MAX).
 */
export const BLOCKING_RULE_IDS: readonly string[] = [
  'robots-directives',
  'title-present',
  'h1-present',
  'canonical-valid',
];

/** Maximum total score when a blocking finding is present. */
export const SCORE_CAP_MAX = 49;

/** Penalty applied to a ratio-scaled finding when the affected ratio is small. */
export const SMALL_RATIO_THRESHOLD = 0.1;

export function scoreLabel(total: number): string {
  if (total >= 90) return 'Excellent';
  if (total >= 75) return 'Good';
  if (total >= 50) return 'Needs work';
  return 'Poor';
}

/** Effective penalty for one finding, honoring ratio scaling. */
export function penaltyFor(finding: Finding): number {
  const base = SEVERITY_PENALTIES[finding.severity];
  if (finding.ratio === undefined || base === 0) return base;
  if (finding.ratio >= SMALL_RATIO_THRESHOLD) return base;
  // Small affected fraction: drop one tier (error 25→10, warn 10→5).
  return finding.severity === 'error' ? 10 : 5;
}

function findBlocking(findings: readonly Finding[]): Finding[] {
  return findings.filter(
    (finding) => finding.severity === 'error' && BLOCKING_RULE_IDS.includes(finding.ruleId),
  );
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
      penalty += penaltyFor(finding);
    }
    return { category, score: Math.max(0, 100 - penalty) };
  });

  let total = Math.round(
    categories.reduce((sum, c) => sum + c.score * CATEGORY_WEIGHTS[c.category], 0) / 100,
  );

  // Blocking-issue cap.
  const blocking = findBlocking(findings);
  let capReason: string | null = null;
  if (blocking.length > 0) {
    const ruleIds = [...new Set(blocking.map((finding) => finding.ruleId))];
    capReason = `Score capped at ${SCORE_CAP_MAX} — blocking issues: ${ruleIds.join(', ')}`;
    total = Math.min(total, SCORE_CAP_MAX);
  }

  return {
    total,
    label: blocking.length > 0 ? 'Poor' : scoreLabel(total),
    preliminary: true,
    capReason,
    categories,
  };
}
