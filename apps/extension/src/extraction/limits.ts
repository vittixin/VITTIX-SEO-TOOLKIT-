import { SNAPSHOT_LIMITS } from '@vittix/shared';
import type { ExtractorLimits } from './snapshot-inject';

/**
 * Single source of truth for extraction limits.
 *
 * Built from SNAPSHOT_LIMITS (packages/shared) so the shared constants drive
 * BOTH extraction paths (live-DOM injector and site-mode HTML parser) and
 * the background/crawler entry points. No hardcoded literals anywhere else.
 */
export const EXTRACTOR_LIMITS: ExtractorLimits = {
  headings: SNAPSHOT_LIMITS.headings,
  images: SNAPSHOT_LIMITS.images,
  links: SNAPSHOT_LIMITS.links,
  textSampleChars: SNAPSHOT_LIMITS.textSampleChars,
  textField: SNAPSHOT_LIMITS.textField,
  descriptions: SNAPSHOT_LIMITS.descriptions,
  canonicals: SNAPSHOT_LIMITS.canonicals,
  robotsValues: SNAPSHOT_LIMITS.robotsValues,
  structuredData: SNAPSHOT_LIMITS.structuredData,
  hreflang: SNAPSHOT_LIMITS.hreflang,
  keywords: SNAPSHOT_LIMITS.keywords,
  leadTextWords: SNAPSHOT_LIMITS.leadTextWords,
  leadTextChars: SNAPSHOT_LIMITS.leadTextChars,
  mixedContentSamples: SNAPSHOT_LIMITS.mixedContentSamples,
  foldCandidates: SNAPSHOT_LIMITS.foldCandidates,
};
