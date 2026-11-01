import { z } from 'zod';
import { FindingSchema } from './finding.js';

/**
 * Site-audit domain types. Site mode is opt-in and performs network requests
 * ONLY to one user-approved origin — see docs/SITE_AUDIT.md.
 */

export const SITE_SESSION_STATUSES = ['running', 'completed', 'cancelled', 'failed'] as const;
export type SiteSessionStatus = (typeof SITE_SESSION_STATUSES)[number];
export const SiteSessionStatusSchema = z.enum(SITE_SESSION_STATUSES);

export const SITE_PAGE_STATUSES = [
  'pending',
  'ok',
  'failed',
  'failed-auth',
  'skipped-robots',
  'skipped-duplicate',
  'skipped-external-redirect',
  'skipped-non-html',
] as const;
export type SitePageStatus = (typeof SITE_PAGE_STATUSES)[number];
export const SitePageStatusSchema = z.enum(SITE_PAGE_STATUSES);

export const RedirectHopSchema = z.object({
  url: z.string().max(2048),
  status: z.number().int().min(300).max(399).nullable().default(null),
  location: z.string().max(2048).nullable().default(null),
  opaque: z.boolean().default(false),
});

/** Bounded same-origin response metadata captured by the site crawler. */
export const SiteResponseMetadataSchema = z.object({
  finalStatus: z.number().int().min(100).max(599).nullable().default(null),
  redirectChain: z.array(RedirectHopSchema).max(10).default([]),
  redirectObservationUnavailable: z.boolean().default(false),
  contentType: z.string().max(2048).nullable().default(null),
  contentLength: z.number().int().nonnegative().nullable().default(null),
  contentEncoding: z.string().max(256).nullable().default(null),
  xRobotsTag: z.string().max(2048).nullable().default(null),
  cacheControl: z.string().max(2048).nullable().default(null),
  hasHsts: z.boolean().default(false),
  hasCsp: z.boolean().default(false),
  hasXContentTypeOptions: z.boolean().default(false),
  hasReferrerPolicy: z.boolean().default(false),
  hasFrameProtection: z.boolean().default(false),
  durationMs: z.number().min(0).nullable().default(null),
  bodyTruncated: z.boolean().default(false),
});
export type SiteResponseMetadata = z.infer<typeof SiteResponseMetadataSchema>;

/** Session record (crawl state lives here — NOT in the service worker). */
export const SiteSessionSchema = z.object({
  id: z.number().int().positive().optional(),
  origin: z.string().min(1),
  status: SiteSessionStatusSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().nullable().default(null),
  maxPages: z.number().int().min(1).max(50),
  maxDepth: z.number().int().min(0).max(2),
  concurrency: z.number().int().min(1).max(3),
  delayMs: z.number().int().min(100).max(10_000),
  robotsStatus: z.enum(['allowed', 'unreachable', 'blocked']).default('allowed'),
  /** Running counters, persisted so the UI and recovery can read them. */
  pagesDone: z.number().int().nonnegative().default(0),
  pagesFailed: z.number().int().nonnegative().default(0),
  pagesSkipped: z.number().int().nonnegative().default(0),
  stopRequested: z.boolean().default(false),
  /** Rule set in effect when the session started (comparison gate). */
  ruleSetVersion: z.string().optional(),
  /** Why the session stopped abnormally (permission revoked, robots blocked…). */
  stopReason: z.string().nullable().default(null),
});
export type SiteSession = z.infer<typeof SiteSessionSchema>;
/** Input shape: fields with schema defaults may be omitted on write. */
export type SiteSessionInput = z.input<typeof SiteSessionSchema>;

/** Per-page record: pending → ok | failed* | skipped-*. */
export const SitePageRecordSchema = z.object({
  id: z.number().int().positive().optional(),
  sessionId: z.number().int().positive(),
  url: z.string().min(1),
  /** The URL after redirects (same-origin); null while pending. */
  finalUrl: z.string().nullable().default(null),
  status: SitePageStatusSchema,
  depth: z.number().int().nonnegative().default(0),
  httpStatus: z.number().int().nullable().default(null),
  error: z.string().nullable().default(null),
  analyzedAt: z.string().nullable().default(null),
  /** Present only for status 'ok'. */
  snapshot: z.unknown().nullable().default(null),
  /** Present only for status 'ok' (AnalysisResult). */
  result: z.unknown().nullable().default(null),
  /** Absent on legacy rows; populated only for site-audit fetches. */
  responseMetadata: SiteResponseMetadataSchema.nullable().default(null),
  /** Site-only response rules for pages that cannot be parsed as HTML. */
  responseFindings: z.array(FindingSchema).default([]),
});
export type SitePageRecord = z.infer<typeof SitePageRecordSchema>;
/** Input shape: fields with schema defaults may be omitted on write. */
export type SitePageInput = z.input<typeof SitePageRecordSchema>;

/** Hard caps — enforced in code, not just defaults. */
export const SITE_LIMITS = {
  maxPagesDefault: 20,
  maxPagesCap: 50,
  maxDepth: 2,
  concurrencyDefault: 2,
  concurrencyCap: 3,
  delayMsDefault: 250,
  delayMsFloor: 100,
  /** Responses larger than this are truncated before parsing. */
  maxResponseBytes: 2_000_000,
  /** Sessions kept (most recent pruned like single-page audits). */
  maxStoredSessions: 20,
} as const;
