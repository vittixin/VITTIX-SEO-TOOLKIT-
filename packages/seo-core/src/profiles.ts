import type { Category, Severity } from '@vittix/shared';

export const PROFILE_IDS = ['standard', 'content-site', 'e-commerce', 'developer-staging'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];
export type CategoryWeights = Record<Category, number>;

export interface ScoringProfile {
  id: ProfileId;
  name: string;
  description: string;
  weights: CategoryWeights;
  ignoredRuleIds: readonly string[];
  severityOverrides: Readonly<Record<string, Severity>>;
  relaxBlockingCap: boolean;
}

const weights = (
  metadata: number,
  headings: number,
  images: number,
  links: number,
  content: number,
  social: number,
  technical: number,
): CategoryWeights => ({ metadata, headings, images, links, content, social, technical });

/** Documented, deterministic built-in profile presets. User settings layer on these defaults. */
export const SCORING_PROFILES: Record<ProfileId, ScoringProfile> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced on-page hygiene scoring.',
    weights: weights(25, 20, 15, 15, 10, 10, 5),
    ignoredRuleIds: [],
    severityOverrides: {},
    relaxBlockingCap: false,
  },
  'content-site': {
    id: 'content-site',
    name: 'Content site',
    description: 'Emphasizes editorial content and headings.',
    weights: weights(20, 20, 10, 10, 25, 10, 5),
    ignoredRuleIds: [],
    severityOverrides: {},
    relaxBlockingCap: false,
  },
  'e-commerce': {
    id: 'e-commerce',
    name: 'E-commerce',
    description: 'Emphasizes technical structured data used by product listings.',
    weights: weights(20, 15, 15, 10, 10, 10, 20),
    ignoredRuleIds: [],
    severityOverrides: {},
    relaxBlockingCap: false,
  },
  'developer-staging': {
    id: 'developer-staging',
    name: 'Developer/staging',
    description:
      'Ignores social and transport checks on staging sites; relaxes noindex caps because staging pages are intentionally excluded.',
    weights: weights(25, 20, 15, 15, 15, 0, 10),
    ignoredRuleIds: [
      'og-title-present',
      'og-description-present',
      'og-image-present',
      'og-image-absolute-url',
      'og-url-matches-canonical',
      'twitter-card-present',
      'twitter-card-valid-type',
      'page-https',
      'mixed-content',
    ],
    severityOverrides: {},
    relaxBlockingCap: true,
  },
};

export function isProfileId(value: string): value is ProfileId {
  return (PROFILE_IDS as readonly string[]).includes(value);
}
