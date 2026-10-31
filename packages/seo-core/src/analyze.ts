import { FINDING_SEVERITY_ORDER, type AnalysisResult, type PageSnapshot } from '@vittix/shared';
import { analyzeHeadings } from './analyzers/headings.js';
import { analyzeHreflang } from './analyzers/hreflang.js';
import { analyzeImages } from './analyzers/images.js';
import { analyzeLinks } from './analyzers/links.js';
import { analyzeMetadata } from './analyzers/metadata.js';
import { analyzeContent } from './analyzers/content.js';
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
    ...analyzeHreflang(snapshot),
    ...analyzeHeadings(snapshot),
    ...analyzeImages(snapshot),
    ...analyzeLinks(snapshot),
    ...analyzeContent(snapshot),
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

/**
 * True when any collection was capped during extraction — either implicit
 * (retained count below total), explicit (v3 `omitted` counts report the
 * exact number of capped-away elements), or the body-text sample hitting
 * its cap (v3.1 `textStats.textSampleTruncated`).
 */
export function isTruncated(snapshot: PageSnapshot): boolean {
  const headingTotal = Object.values(snapshot.headingCounts).reduce((sum, count) => sum + count, 0);
  const implicit =
    snapshot.headings.length < headingTotal - (snapshot.hidden?.headings ?? 0) ||
    snapshot.images.length < snapshot.imageCount - (snapshot.hidden?.images ?? 0) ||
    snapshot.links.length < snapshot.linkCount - (snapshot.hidden?.links ?? 0) ||
    snapshot.structuredData.length < snapshot.structuredDataCount;
  const omitted = snapshot.omitted;
  const explicit =
    omitted !== undefined &&
    (omitted.headings > 0 ||
      omitted.images > 0 ||
      omitted.links > 0 ||
      omitted.descriptions > 0 ||
      omitted.canonicals > 0 ||
      omitted.structuredData > 0 ||
      omitted.hreflang > 0);
  // v3.1: the body-text sample hitting its cap also makes the audit
  // incomplete (the word count covers only part of the page).
  const textSample = snapshot.textStats?.textSampleTruncated === true;
  return implicit || explicit || textSample;
}
