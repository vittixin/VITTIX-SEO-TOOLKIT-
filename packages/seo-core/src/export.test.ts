import { describe, expect, it } from 'vitest';
import { auditToJson, csvEscape, findingsToCsv } from './index.js';
import { buildSnapshot } from './testing/fixtures.js';
import { analyzeSnapshot } from './analyze.js';
import type { AuditRecord } from '@vittix/shared';

function buildAudit(): AuditRecord {
  const snapshot = buildSnapshot({
    links: [
      // Empty anchor with a comma in the href: ends up verbatim in the
      // link-anchor-text evidence, so the CSV serializer must quote it.
      { href: '/products?ids=1,2,3', text: '', rel: null, target: null, accessibleName: '' },
      { href: '/plain', text: 'Plain link', rel: null, target: null, accessibleName: 'Plain link' },
    ],
    linkCount: 2,
  });
  return {
    id: 1,
    url: snapshot.url,
    title: snapshot.title,
    analyzedAt: '2026-10-31T12:00:00.000Z',
    ruleSetVersion: '0.2.0',
    profileId: 'standard',
    snapshot,
    result: { ...analyzeSnapshot(snapshot), truncated: false },
  };
}

describe('csvEscape', () => {
  it('leaves simple values untouched', () => {
    expect(csvEscape('plain')).toBe('plain');
  });

  it('quotes values with commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('doubles embedded quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('optional local keyword JSON export', () => {
  it('omits the target keyword unless explicitly requested', () => {
    const audit = buildAudit();
    const omitted = JSON.parse(auditToJson(audit)) as { audit: Record<string, unknown> };
    const included = JSON.parse(auditToJson(audit, { targetKeyword: 'coffee grinder' })) as {
      audit: Record<string, unknown>;
    };
    expect(omitted.audit).not.toHaveProperty('targetKeyword');
    expect(included.audit.targetKeyword).toBe('coffee grinder');
  });

  it('omits the lead-text excerpt from JSON unless explicitly requested', () => {
    const base = buildAudit();
    const audit = {
      ...base,
      snapshot: {
        ...base.snapshot,
        textSummary: { ...base.snapshot.textSummary, leadText: 'private local excerpt' },
      },
    };
    const omitted = JSON.parse(auditToJson(audit)) as { audit: AuditRecord };
    const included = JSON.parse(auditToJson(audit, { includePageTextExcerpt: true })) as {
      audit: AuditRecord;
    };
    expect(omitted.audit.snapshot.textSummary).not.toHaveProperty('leadText');
    expect(included.audit.snapshot.textSummary.leadText).toBe('private local excerpt');
    expect(findingsToCsv(audit)).not.toContain('private local excerpt');
  });
});

describe('findingsToCsv', () => {
  const audit = buildAudit();
  const csv = findingsToCsv(audit);

  it('starts with the documented header row', () => {
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'analyzedAt,url,pageTitle,category,severity,ruleId,finding,detail,evidence',
    );
  });

  it('contains one row per finding plus header', () => {
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(audit.result.findings.length + 2); // + header + trailing CRLF
  });

  it('quotes evidence fields containing commas (RFC 4180)', () => {
    expect(csv).toContain('"/products?ids=1,2,3"');
  });

  it('ends with CRLF', () => {
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('auditToJson', () => {
  it('wraps the audit with format metadata and round-trips', () => {
    const audit = buildAudit();
    const parsed = JSON.parse(auditToJson(audit)) as {
      format: string;
      formatVersion: number;
      audit: AuditRecord;
    };
    expect(parsed.format).toBe('vittix-seo-audit');
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.audit.result.findings).toEqual(audit.result.findings);
    expect(parsed.audit.snapshot.meta.description).toBe(audit.snapshot.meta.description);
  });

  it('round-trips through the Zod AuditRecordSchema (v2 fields intact)', async () => {
    const { AuditRecordSchema } = await import('@vittix/shared');
    const audit = buildAudit();
    const parsed = AuditRecordSchema.parse(JSON.parse(auditToJson(audit)).audit);
    expect(parsed.snapshot.descriptions).toEqual(audit.snapshot.descriptions);
    expect(parsed.result.truncated).toBe(false);
  });
});
