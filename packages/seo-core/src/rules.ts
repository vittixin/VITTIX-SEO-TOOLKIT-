/**
 * Rule catalog for the Phase 2 rule set.
 *
 * Every rule is documented in docs/SEO_RULES.md. Rules are pure functions of
 * a PageSnapshot: same snapshot in, same findings out. Each finding carries
 * a remediation hint ("how to fix").
 */
export const RULE_SET_VERSION = '0.3.0';

/** Rule ids implemented by the Phase 2 analyzers. */
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
  'viewport-responsive',
  'lang-present',
  'lang-format',
  'page-https',
  'robots-directives',
  'hreflang-syntax',
  'hreflang-duplicates',
  'hreflang-consistency',
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
  'internal-link-quality',
  'link-profile',
  // structured data
  'structured-data-present',
  'structured-data-valid',
  'structured-data-context',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Bounds considered healthy for the <title> element (characters). */
export const TITLE_LENGTH_BOUNDS = { min: 30, max: 60 } as const;

/** Bounds considered healthy for the meta description (characters). */
export const DESCRIPTION_LENGTH_BOUNDS = { min: 70, max: 160 } as const;

/** Below this length a non-empty alt text is considered possibly uninformative. */
export const ALT_MIN_MEANINGFUL_LENGTH = 4;

/**
 * Generic anchor texts that carry no topical signal for internal links.
 * Matched case-insensitively against the trimmed accessible name.
 */
export const GENERIC_ANCHOR_TEXTS = [
  'click here',
  'read more',
  'learn more',
  'more',
  'here',
  'this page',
  'this link',
  'details',
  'continue',
] as const;

/**
 * Loosely-valid BCP-47 language tag shape: 2–3 letter primary subtag plus
 * optional script/region/ext subtags. Not full BCP-47 validation — the goal
 * is to catch obviously malformed values like "english" or "en_US".
 */
export const LANG_TAG_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

/** Hreflang values that are valid besides language tags. */
export const HREFLANG_SPECIAL_VALUES = ['x-default'] as const;
