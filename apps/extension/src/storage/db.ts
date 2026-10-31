import Dexie, { type EntityTable } from 'dexie';
import type { AuditRecord, SitePageInput, SiteSessionInput } from '@vittix/shared';
import { DB_NAME, SETTINGS_KEY } from '@vittix/shared';

export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * Local audit history, site-audit state + settings, stored in the
 * extension's own origin.
 *
 * - v1: audits, settings (Phases 0–2)
 * - v2: siteAudits, sitePages (Phase 3 site mode) — additive; v1 data is
 *   untouched (Dexie applies the delta on upgrade).
 */
export class VittixDatabase extends Dexie {
  audits!: EntityTable<AuditRecord, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  siteAudits!: EntityTable<SiteSessionInput, 'id'>;
  sitePages!: EntityTable<SitePageInput, 'id'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      // Primary key ++id; queryable: by url and by analyzedAt (ISO string,
      // which sorts chronologically).
      audits: '++id, url, analyzedAt',
      settings: 'key',
    });
    this.version(2).stores({
      audits: '++id, url, analyzedAt',
      settings: 'key',
      siteAudits: '++id, origin, status, startedAt',
      sitePages: '++id, sessionId, url, status',
    });
  }
}

export const db = new VittixDatabase();

export { SETTINGS_KEY };
