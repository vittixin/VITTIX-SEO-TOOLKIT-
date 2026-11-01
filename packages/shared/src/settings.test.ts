import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_BRANDING,
  DEFAULT_SETTINGS,
  ExportBrandingSchema,
  SettingsSchema,
} from './settings.js';
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

  it('defaults branding on older settings rows', () => {
    const legacy = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).filter(([key]) => key !== 'exportBranding'),
    );
    expect(SettingsSchema.parse(legacy).exportBranding).toEqual(DEFAULT_EXPORT_BRANDING);
  });
});

describe('ExportBrandingSchema', () => {
  it('accepts bounded agency name, hex accent and raster logo data', () => {
    expect(
      ExportBrandingSchema.safeParse({
        agencyName: 'Example Studio',
        accentColor: '#a1B2c3',
        logoDataUri: 'data:image/png;base64,YWJj',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid colors, overlong names, SVG and oversized logos', () => {
    expect(ExportBrandingSchema.safeParse({ agencyName: 'x'.repeat(81) }).success).toBe(false);
    expect(ExportBrandingSchema.safeParse({ accentColor: 'url(javascript:1)' }).success).toBe(
      false,
    );
    expect(
      ExportBrandingSchema.safeParse({ logoDataUri: 'data:image/svg+xml;base64,PHN2Zz4=' }).success,
    ).toBe(false);
    const tooLarge = `data:image/png;base64,${'A'.repeat(136_536)}`;
    expect(ExportBrandingSchema.safeParse({ logoDataUri: tooLarge }).success).toBe(false);
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
