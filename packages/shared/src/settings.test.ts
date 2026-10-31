import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsSchema } from './settings.js';
import { countSeverities, FINDING_SEVERITY_ORDER, SEVERITIES } from './finding.js';

describe('SettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('accepts 0 retention days (keep forever)', () => {
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, historyRetentionDays: 0 }).success).toBe(
      true,
    );
  });

  it('rejects negative retention', () => {
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, historyRetentionDays: -1 }).success,
    ).toBe(false);
  });

  it('rejects a tiny max audit cap', () => {
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxStoredAudits: 1 }).success).toBe(
      false,
    );
  });
});

describe('countSeverities', () => {
  it('counts each severity', () => {
    const counts = countSeverities([
      { ruleId: 'a', category: 'metadata', severity: 'error', title: 't', detail: 'd' },
      { ruleId: 'b', category: 'metadata', severity: 'error', title: 't', detail: 'd' },
      { ruleId: 'c', category: 'links', severity: 'warn', title: 't', detail: 'd' },
      { ruleId: 'e', category: 'links', severity: 'pass', title: 't', detail: 'd' },
    ]);
    expect(counts).toEqual({ error: 2, warn: 1, info: 0, pass: 1 });
  });

  it('covers every severity in its ordering table', () => {
    for (const severity of SEVERITIES) {
      expect(FINDING_SEVERITY_ORDER[severity]).toBeDefined();
    }
  });
});
