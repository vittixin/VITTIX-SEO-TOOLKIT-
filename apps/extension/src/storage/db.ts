import Dexie, { type EntityTable } from 'dexie';
import type { AuditRecord, SitePageInput, SiteSessionInput } from '@vittix/shared';
import { DB_NAME, SETTINGS_KEY } from '@vittix/shared';

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface TargetKeywordRow {
  url: string;
  keyword: string;
}

export interface OriginRuleSettingsRow {
  origin: string;
  profileId: 'standard' | 'content-site' | 'e-commerce' | 'developer-staging';
  ignoredRuleIds: string[];
  unignoredRuleIds: string[];
  severityOverrides: Record<string, 'error' | 'warn' | 'info'>;
}

/**
 * Local audit history, site-audit state + settings, stored in the
 * extension's own origin.
 *
 * - v1: audits, settings (Phases 0–2)
 * - v2: siteAudits, sitePages (Phase 3 site mode) — additive; v1 data is
 *   untouched (Dexie applies the delta on upgrade).
 * - v5: additive response metadata fields on site-page rows.
 * - v6: additive sitemap discovery state on site-audit rows.
 * - v7: browser-follow redirect outcome fields on response metadata.
 * - v8: bounded duplicate-analysis hashes on site pages.
 * - v9: site-session profile and rule overrides are snapshotted for resume/compare.
 */
export class VittixDatabase extends Dexie {
  audits!: EntityTable<AuditRecord, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  siteAudits!: EntityTable<SiteSessionInput, 'id'>;
  sitePages!: EntityTable<SitePageInput, 'id'>;
  targetKeywords!: EntityTable<TargetKeywordRow, 'url'>;
  originRuleSettings!: EntityTable<OriginRuleSettingsRow, 'origin'>;

  constructor(name = DB_NAME, schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 9) {
    super(name);
    this.version(1).stores({
      // Primary key ++id; queryable: by url and by analyzedAt (ISO string,
      // which sorts chronologically).
      audits: '++id, url, analyzedAt',
      settings: 'key',
    });
    if (schemaVersion >= 2) {
      this.version(2).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
      });
    }
    if (schemaVersion >= 3) {
      this.version(3).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
        targetKeywords: 'url',
      });
    }
    if (schemaVersion >= 4) {
      this.version(4).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
        targetKeywords: 'url',
        originRuleSettings: 'origin',
      });
    }
    if (schemaVersion >= 5) {
      this.version(5).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
        targetKeywords: 'url',
        originRuleSettings: 'origin',
      });
    }
    if (schemaVersion >= 6) {
      this.version(6).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
        targetKeywords: 'url',
        originRuleSettings: 'origin',
      });
    }
    if (schemaVersion >= 7) {
      this.version(7).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
        targetKeywords: 'url',
        originRuleSettings: 'origin',
      });
    }
    if (schemaVersion >= 8) {
      this.version(8).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
        targetKeywords: 'url',
        originRuleSettings: 'origin',
      });
    }
    if (schemaVersion >= 9) {
      this.version(9).stores({
        audits: '++id, url, analyzedAt',
        settings: 'key',
        siteAudits: '++id, origin, status, startedAt',
        sitePages: '++id, sessionId, url, status',
        targetKeywords: 'url',
        originRuleSettings: 'origin',
      });
    }
  }
}

export const db = new VittixDatabase();

export { SETTINGS_KEY };
