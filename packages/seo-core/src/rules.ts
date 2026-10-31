/**
 * Rule catalog for the Phase 1 rule set.
 *
 * Every rule is documented in docs/SEO_RULES.md. Rules are pure functions of
 * a PageSnapshot: same snapshot in, same findings out. Each finding carries
 * a remediation hint ("how to fix").
 */
export const RULE_SET_VERSION = '0.2.0';

/** Rule ids implemented by the Phase 1 analyzers. */
export const RULE_IDS = [
  // metadata
  'title-present',
  'title-duplicate',
  'title-length',
  'meta-description-present',
  'meta-description-multiple',
  'meta-description-length',
  'canonical-present',
  'canonical-valid',
  // technical
  'viewport-present',
  'lang-present',
  'page-https',
  'robots-directives',
  // social
  'og-title-present',
  'og-description-present',
  'og-image-present',
  'twitter-card-present',
  // headings
  'h1-present',
  'h1-unique',
  'heading-order',
  // images
  'image-alt-present',
  'image-alt-empty',
  'image-alt-quality',
  // links
  'link-anchor-text',
  'link-named-nonvisually',
  'link-profile',
  // structured data
  'structured-data-present',
  'structured-data-valid',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Bounds considered healthy for the <title> element (characters). */
export const TITLE_LENGTH_BOUNDS = { min: 30, max: 60 } as const;

/** Bounds considered healthy for the meta description (characters). */
export const DESCRIPTION_LENGTH_BOUNDS = { min: 70, max: 160 } as const;

/** Below this length a non-empty alt text is considered possibly uninformative. */
export const ALT_MIN_MEANINGFUL_LENGTH = 4;
