import { z } from 'zod';

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
