import { z } from 'zod';
import { type SeverityCounts } from './finding.js';

/** Message type used by popup/dashboard to ask the background worker to analyze. */
export const ANALYZE_MESSAGE_TYPE = 'vittix/analyze-active-tab';

export const ANALYZE_REQUEST_SCHEMA = z.object({
  type: z.literal(ANALYZE_MESSAGE_TYPE),
});
export type AnalyzeRequest = z.infer<typeof ANALYZE_REQUEST_SCHEMA>;

export function analyzeRequest(): AnalyzeRequest {
  return { type: ANALYZE_MESSAGE_TYPE };
}

/** Every failure mode the analysis pipeline can report to the UI. */
export const ERROR_CODES = [
  'ERR_NO_ACTIVE_TAB',
  'ERR_NO_TAB_URL',
  'ERR_UNSUPPORTED_URL',
  'ERR_INJECTION_FAILED',
  'ERR_INVALID_SNAPSHOT',
  'ERR_ANALYSIS_FAILED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

const nonNegativeInt = z.number().int().nonnegative();

export const AnalyzeSuccessSchema = z.object({
  ok: z.literal(true),
  auditId: z.number().int().positive(),
  url: z.string().min(1),
  title: z.string(),
  analyzedAt: z.string().min(1),
  score: z.object({
    total: z.number().min(0).max(100),
    label: z.string().min(1),
    preliminary: z.literal(true),
    /** Present when a blocking issue capped the score (rule set v0.4.0+). */
    capReason: z.string().nullable().optional(),
  }),
  counts: z.object({
    error: nonNegativeInt,
    warn: nonNegativeInt,
    info: nonNegativeInt,
    pass: nonNegativeInt,
  }),
});
export type AnalyzeSuccess = z.infer<typeof AnalyzeSuccessSchema>;

export const AnalyzeFailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
  }),
});
export type AnalyzeFailure = z.infer<typeof AnalyzeFailureSchema>;

export const AnalyzeResponseSchema = z.discriminatedUnion('ok', [
  AnalyzeSuccessSchema,
  AnalyzeFailureSchema,
]);
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export function analyzeFailure(code: ErrorCode, message: string): AnalyzeFailure {
  return { ok: false, error: { code, message } };
}

export function analyzeSuccess(
  audit: { id: number; url: string; title: string; analyzedAt: string },
  score: { total: number; label: string; capReason?: string | null },
  counts: SeverityCounts,
): AnalyzeSuccess {
  return {
    ok: true,
    auditId: audit.id,
    url: audit.url,
    title: audit.title,
    analyzedAt: audit.analyzedAt,
    score: { ...score, preliminary: true },
    counts,
  };
}

/** Human-friendly messages for every error code. Used by popup and dashboard. */
export const FRIENDLY_ERROR_MESSAGES: Record<ErrorCode, string> = {
  ERR_NO_ACTIVE_TAB: 'No active tab found. Open a web page and try again.',
  ERR_NO_TAB_URL:
    'Page URL is unavailable. Click the Vittix icon again from the page you want to analyze.',
  ERR_UNSUPPORTED_URL:
    'This page cannot be analyzed. Vittix only inspects regular http(s) web pages — not browser-internal pages, extension pages, files or PDF viewers.',
  ERR_INJECTION_FAILED:
    'Vittix could not inspect this page. The site may block page scripts, or the page may not have finished loading. Reload the page and try again.',
  ERR_INVALID_SNAPSHOT:
    'The page data extracted was incomplete or invalid, so the analysis was aborted. Nothing was saved.',
  ERR_ANALYSIS_FAILED:
    'Something went wrong while analyzing this page. Nothing was saved. Please try again.',
};
