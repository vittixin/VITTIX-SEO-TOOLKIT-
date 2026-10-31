import { describe, expect, it } from 'vitest';
import {
  analyzeFailure,
  analyzeRequest,
  analyzeSuccess,
  ANALYZE_REQUEST_SCHEMA,
  AnalyzeResponseSchema,
  FRIENDLY_ERROR_MESSAGES,
} from './messages.js';

describe('analyze message contracts', () => {
  it('round-trips the request', () => {
    expect(ANALYZE_REQUEST_SCHEMA.parse(analyzeRequest())).toEqual({
      type: 'vittix/analyze-active-tab',
    });
  });

  it('rejects unknown message types', () => {
    expect(ANALYZE_REQUEST_SCHEMA.safeParse({ type: 'something/else' }).success).toBe(false);
  });

  it('accepts a success response', () => {
    const response = analyzeSuccess(
      {
        id: 7,
        url: 'https://example.com/',
        title: 'Example',
        analyzedAt: '2026-10-30T12:00:00.000Z',
      },
      { total: 82, label: 'Good' },
      { error: 0, warn: 2, info: 1, pass: 9 },
    );
    const parsed = AnalyzeResponseSchema.parse(response);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.score.preliminary).toBe(true);
  });

  it('accepts a failure response', () => {
    const parsed = AnalyzeResponseSchema.parse(
      analyzeFailure('ERR_UNSUPPORTED_URL', 'chrome:// pages cannot be analyzed'),
    );
    expect(parsed.ok).toBe(false);
  });

  it('rejects a success response without a positive audit id', () => {
    const bad = {
      ok: true,
      auditId: 0,
      url: 'https://example.com/',
      title: 'x',
      analyzedAt: '2026-10-30T12:00:00.000Z',
      score: { total: 50, label: 'Needs work', preliminary: true },
      counts: { error: 0, warn: 0, info: 0, pass: 0 },
    };
    expect(AnalyzeResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('has a friendly message for every error code', () => {
    for (const [code, message] of Object.entries(FRIENDLY_ERROR_MESSAGES)) {
      expect(code).toMatch(/^ERR_[A-Z_]+$/);
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
