import { FINDING_SEVERITY_ORDER, type AnalysisResult, type PageSnapshot } from '@vittix/shared';
import { analyzeHeadings } from './analyzers/headings.js';
import { analyzeImages } from './analyzers/images.js';
import { analyzeLinks } from './analyzers/links.js';
import { analyzeMetadata } from './analyzers/metadata.js';
import { analyzeStructuredData } from './analyzers/structured-data.js';
import { computeScore } from './scoring.js';
import { RULE_SET_VERSION } from './rules.js';

/**
 * Run the full rule set over a validated page snapshot.
 * Pure and deterministic: the same snapshot always yields the same result.
 */
export function analyzeSnapshot(snapshot: PageSnapshot): AnalysisResult {
  const findings = [
    ...analyzeMetadata(snapshot),
    ...analyzeHeadings(snapshot),
    ...analyzeImages(snapshot),
    ...analyzeLinks(snapshot),
    ...analyzeStructuredData(snapshot),
  ].sort(
    (a, b) =>
      FINDING_SEVERITY_ORDER[a.severity] - FINDING_SEVERITY_ORDER[b.severity] ||
      a.ruleId.localeCompare(b.ruleId),
  );

  return {
    ruleSetVersion: RULE_SET_VERSION,
    findings,
    score: computeScore(findings),
    truncated: isTruncated(snapshot),
  };
}

/** True when any collection was capped during extraction. */
export function isTruncated(snapshot: PageSnapshot): boolean {
  const headingTotal = Object.values(snapshot.headingCounts).reduce((sum, count) => sum + count, 0);
  return (
    snapshot.headings.length < headingTotal ||
    snapshot.images.length < snapshot.imageCount ||
    snapshot.links.length < snapshot.linkCount ||
    snapshot.structuredData.length < snapshot.structuredDataCount
  );
}
