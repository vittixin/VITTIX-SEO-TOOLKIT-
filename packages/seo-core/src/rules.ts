/**
 * Rule catalog.
 *
 * Every rule is documented in docs/SEO_RULES.md. Rules are pure functions of
 * a PageSnapshot (plus optional analyzer options such as a user-supplied
 * target keyword): same input in, same findings out. Each finding carries a
 * remediation hint ("how to fix").
 */
export const RULE_SET_VERSION = '0.6.0';

/** Rule ids implemented by the analyzers. */
export const RULE_IDS = [
  // metadata
  'title-present',
  'title-duplicate',
  'title-length',
  'title-pixel-width',
  'description-pixel-width',
  'meta-description-present',
  'meta-description-multiple',
  'meta-description-length',
  'canonical-present',
  'canonical-valid',
  'canonical-self-reference',
  // technical
  'viewport-present',
  'viewport-responsive',
  'lang-present',
  'lang-format',
  'page-https',
  'robots-directives',
  'mixed-content',
  'favicon-present',
  'pagination-rel',
  'url-hygiene',
  'hreflang-syntax',
  'hreflang-duplicates',
  'hreflang-consistency',
  // social
  'og-title-present',
  'og-description-present',
  'og-image-present',
  'og-image-absolute-url',
  'og-url-matches-canonical',
  'twitter-card-present',
  'twitter-card-valid-type',
  // headings
  'h1-present',
  'h1-unique',
  'heading-order',
  'heading-empty',
  'heading-duplicate',
  'title-h1-alignment',
  // images
  'image-alt-present',
  'image-alt-empty',
  'image-alt-quality',
  'image-dimensions-missing',
  'image-lazy-loading',
  'image-modern-format',
  'image-srcset-missing',
  // links
  'link-anchor-text',
  'link-named-nonvisually',
  'internal-link-quality',
  'link-profile',
  // content
  'content-length',
  'keyword-in-title',
  'keyword-in-h1',
  // structured data
  'structured-data-present',
  'structured-data-valid',
  'structured-data-context',
  'structured-data-type-detected',
  'structured-data-required-props',
  'structured-data-recommended-props',
  // Site-audit response observations; never emitted without response metadata.
  'redirect-chain-long',
  'redirect-temporary',
  'x-robots-noindex-header',
  'non-html-content-type',
  'slow-response',
  'missing-security-headers',
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

/** Pages with fewer words are flagged as thin content (indexable pages only). */
export const CONTENT_LENGTH_MIN_WORDS = 300;

/**
 * Known twitter:card values per X/Twitter documentation. Unknown values are
 * warned against (twitter-card-valid-type).
 */
export const TWITTER_CARD_KNOWN_TYPES = ['summary', 'summary_large_image', 'app', 'player'];

/**
 * Structured-data property registry. Based on Google's documented required
 * and recommended properties
 * (https://developers.google.com/search/docs/appearance/structured-data) as
 * of 2026-11; Google may change requirements without notice. Property checks
 * are structural only — passing does NOT guarantee rich results.
 */
export const STRUCTURED_DATA_REGISTRY: Record<
  string,
  { required: string[]; recommended: string[] }
> = {
  Article: {
    required: ['headline', 'image', 'author', 'datePublished'],
    recommended: ['dateModified', 'publisher'],
  },
  NewsArticle: {
    required: ['headline', 'image', 'author', 'datePublished'],
    recommended: ['dateModified', 'publisher'],
  },
  BlogPosting: {
    required: ['headline', 'image', 'author', 'datePublished'],
    recommended: ['dateModified', 'publisher'],
  },
  Product: {
    required: ['name', 'image', 'offers'],
    recommended: ['aggregateRating', 'brand', 'description'],
  },
  FAQPage: {
    required: ['mainEntity'],
    recommended: [],
  },
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
  },
  Organization: {
    required: ['name', 'url'],
    recommended: ['logo', 'sameAs'],
  },
  LocalBusiness: {
    required: ['name', 'address', 'telephone'],
    recommended: ['url', 'image', 'priceRange', 'geo'],
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['potentialAction'],
  },
  Recipe: {
    required: ['name', 'image', 'recipeIngredient', 'recipeInstructions'],
    recommended: ['author', 'datePublished', 'nutrition', 'aggregateRating'],
  },
  Event: {
    required: ['name', 'startDate', 'location'],
    recommended: ['endDate', 'eventStatus', 'offers', 'image', 'description'],
  },
  VideoObject: {
    required: ['name', 'thumbnailUrl', 'uploadDate'],
    recommended: ['description', 'duration', 'contentUrl'],
  },
};

// --- Pixel-width estimation (v0.4.0) — see src/text-width.ts for the
// approximation disclaimer. These are the search-engine truncation budgets
// commonly quoted for an Arial/Roboto-like sans-serif.
export const TITLE_FONT_SIZE_PX = 20;
export const DESCRIPTION_FONT_SIZE_PX = 14;
export const TITLE_PIXEL_LIMIT_PX = 580;
export const DESCRIPTION_PIXEL_LIMIT_DESKTOP_PX = 920;
export const DESCRIPTION_PIXEL_LIMIT_MOBILE_PX = 680;
export { estimateTextWidth } from './text-width.js';
