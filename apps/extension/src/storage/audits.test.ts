import { describe, expect, it } from 'vitest';
import { AuditRecordSchema, PageSnapshotSchema } from '@vittix/shared';
import { SNAPSHOT_SCHEMA_VERSION } from '@vittix/shared';
import { validateAuditRow } from './audits';
import { analyzeSnapshot } from '@vittix/seo-core';

/**
 * Migration/compatibility tests: audit records stored by earlier phases
 * (snapshot v1/v2) must remain readable, malformed rows must be rejected,
 * and scores must carry their rule-set version for cross-version guards.
 */

/** Minimal valid v1-shaped snapshot (Phase 0 record). */
function v1Snapshot(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    url: 'https://example.com/old',
    title: 'Old page',
    meta: {
      description: 'Old description.',
      canonical: null,
      robots: null,
      viewport: null,
      charset: null,
      lang: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      twitterImage: null,
    },
    headings: [],
    headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
    images: [],
    imageCount: 0,
    links: [{ href: '/a', text: 'A', rel: null, target: null }],
    linkCount: 1,
    textStats: { wordCount: 3 },
    extractedAt: '2026-10-30T00:00:00.000Z',
  };
}

/** Minimal v2-shaped snapshot (Phase 1 record). */
function v2Snapshot(): Record<string, unknown> {
  return {
    ...v1Snapshot(),
    schemaVersion: 2,
    titleCount: 1,
    descriptions: ['Old description.'],
    canonicals: [],
    links: [{ href: '/a', text: 'A', rel: null, target: null, accessibleName: 'A' }],
    structuredData: [],
    structuredDataCount: 0,
  };
}

function wrapAudit(snapshot: Record<string, unknown>) {
  // Normalize through the schema first (as the real pipeline does) so
  // legacy rows get their v3 defaults before analysis.
  const normalized = PageSnapshotSchema.parse(snapshot);
  const analyzed = analyzeSnapshot(normalized);
  return {
    url: 'https://example.com/old',
    title: 'Old page',
    analyzedAt: '2026-10-31T00:00:00.000Z',
    ruleSetVersion: analyzed.ruleSetVersion,
    snapshot: normalized,
    result: analyzed,
  };
}

describe('stored-record migration and compatibility', () => {
  it('accepts a v1 snapshot and applies v3 defaults', () => {
    const parsed = AuditRecordSchema.safeParse(wrapAudit(v1Snapshot()));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.snapshot.schemaVersion).toBe(1);
    expect(parsed.data.snapshot.robotsValues).toEqual([]);
    expect(parsed.data.snapshot.hreflang).toEqual([]);
    expect(parsed.data.snapshot.hidden.headings).toBe(0);
    expect(parsed.data.snapshot.svg.total).toBe(0);
  });

  it('accepts a v2 snapshot and applies v3 defaults', () => {
    const parsed = AuditRecordSchema.safeParse(wrapAudit(v2Snapshot()));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.snapshot.schemaVersion).toBe(2);
    expect(parsed.data.snapshot.omitted.links).toBe(0);
  });

  it('accepts the current v3 snapshot', () => {
    const record = wrapAudit({ ...v2Snapshot(), schemaVersion: SNAPSHOT_SCHEMA_VERSION });
    expect(AuditRecordSchema.safeParse(record).success).toBe(true);
  });

  it('rejects a snapshot from an unknown future version', () => {
    // Built manually (no normalization) to simulate a row written by a
    // future extension version.
    const record = {
      ...wrapAudit(v2Snapshot()),
      snapshot: { ...v2Snapshot(), schemaVersion: 99 },
    };
    expect(AuditRecordSchema.safeParse(record).success).toBe(false);
  });

  it('rejects malformed audit rows instead of crashing the UI', () => {
    expect(validateAuditRow(null, 'test')).toBeNull();
    expect(validateAuditRow(undefined, 'test')).toBeNull();
    expect(validateAuditRow({ nope: true }, 'test')).toBeNull();
    expect(validateAuditRow([], 'test')).toBeNull();
  });

  it('rejects a row whose result is missing (interrupted write)', () => {
    const broken = { ...wrapAudit(v1Snapshot()) } as Record<string, unknown>;
    delete broken.result;
    expect(validateAuditRow(broken, 'test')).toBeNull();
  });

  it('preserves the rule-set version on stored records for cross-version guards', () => {
    const parsed = AuditRecordSchema.parse(wrapAudit(v1Snapshot()));
    expect(parsed.result.ruleSetVersion).toBe('0.4.0');
    expect(parsed.result.score.preliminary).toBe(true);
  });
});

describe('truncated snapshot handling', () => {
  it('flags audits with explicit omitted counts (v3)', () => {
    // Use the analyzed result as-is (no truncated override) so the flag
    // reflects isTruncated() on the omitted counts.
    const record = wrapAudit({
      ...v2Snapshot(),
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      omitted: { links: 37 },
    });
    const parsed = AuditRecordSchema.parse(record);
    expect(parsed.result.truncated).toBe(true);
  });

  it('does not flag audits where nothing was omitted', () => {
    const parsed = AuditRecordSchema.parse(
      wrapAudit({ ...v2Snapshot(), schemaVersion: SNAPSHOT_SCHEMA_VERSION }),
    );
    expect(parsed.result.truncated).toBe(false);
  });
});
