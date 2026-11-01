import { describe, expect, it } from 'vitest';
import { csvEscape, historyToCsv, sitePagesToCsv } from '../index.js';
import type { AuditSummary, SitePageRecord, SiteSession } from '@vittix/shared';

describe('csvEscape — spreadsheet formula injection (OWASP)', () => {
  it('prefixes a quote before formula-sensitive leading characters', () => {
    for (const hostile of ['=1+1', '+2', '-cmd', '@SUM(1)', '\tTabbed']) {
      expect(csvEscape(hostile).startsWith("'"), hostile).toBe(true);
    }
  });

  it('leaves benign values untouched', () => {
    expect(csvEscape('plain value')).toBe('plain value');
    expect(csvEscape('42')).toBe('42');
    expect(csvEscape('safe')).toBe('safe');
  });

  it('still quotes values containing commas/quotes after the guard', () => {
    // '=a,b gets the guard prefix AND quoting (comma inside).
    expect(csvEscape('=a,b')).toBe('"\'=a,b"');
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
  });
});

describe('historyToCsv', () => {
  const summary: AuditSummary = {
    id: 1,
    url: 'https://example.com/page',
    title: 'Example page = title',
    analyzedAt: '2026-10-31T00:00:00.000Z',
    score: { total: 84, label: 'Good', preliminary: true, capReason: null, categories: [] },
    counts: { error: 1, warn: 2, info: 3, pass: 4 },
  };

  it('writes the documented header and one deterministic row per audit', () => {
    const csv = historyToCsv([summary]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'analyzedAt,url,pageTitle,score,scoreLabel,errors,warnings,info,passed,ruleSetVersion',
    );
    // A mid-string '=' is harmless; only leading formula characters are
    // guarded, and no quoting is needed without commas/quotes/newlines.
    expect(lines[1]).toBe(
      '2026-10-31T00:00:00.000Z,https://example.com/page,Example page = title,84,Good,1,2,3,4,preliminary',
    );
  });

  it('guards formula-sensitive page titles', () => {
    const csv = historyToCsv([{ ...summary, title: '=HYPERLINK("https://evil.test")' }]);
    expect(csv).toContain("'=HYPERLINK");
  });

  it('ends with CRLF', () => {
    expect(historyToCsv([summary]).endsWith('\r\n')).toBe(true);
  });
});

describe('sitePagesToCsv', () => {
  const session = {
    id: 1,
    origin: 'https://site.test',
    status: 'completed',
    startedAt: '2026-10-31T00:00:00.000Z',
  } as unknown as SiteSession;

  function makePage(overrides: Partial<SitePageRecord>): SitePageRecord {
    return {
      id: 1,
      sessionId: 1,
      url: 'https://site.test/',
      finalUrl: null,
      status: 'pending',
      depth: 0,
      httpStatus: null,
      error: null,
      analyzedAt: null,
      snapshot: null,
      result: null,
      responseMetadata: null,
      responseFindings: [],
      normalizedTextHash: null,
      simhash64: null,
      similarityWordCount: 0,
      ...overrides,
    };
  }

  it('writes one deterministic row per page with status columns', () => {
    const csv = sitePagesToCsv(session, [
      makePage({
        url: 'https://site.test/a',
        status: 'ok',
        finalUrl: 'https://site.test/a',
        httpStatus: 200,
        result: {
          ruleSetVersion: '0.3.0',
          truncated: false,
          score: { total: 88, label: 'Good', preliminary: true, categories: [] },
          findings: [],
        },
      }),
      makePage({ url: 'https://site.test/dead', status: 'failed', httpStatus: 404 }),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('graphFrom,graphTo,graphAnchor,graphNofollow');
    expect(lines).toHaveLength(5); // header + 2 page rows + one graph node + trailing CRLF
    expect(lines[1]).toContain('https://site.test/a,https://site.test/a,ok,200,0,88,0,0,no');
    // A failed page has no finalUrl (empty field) and no score.
    expect(lines[2]).toContain('https://site.test/dead,,failed,404,0,,0,0,no');
  });
});
