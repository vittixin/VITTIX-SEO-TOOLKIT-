import Dexie, { type EntityTable } from 'dexie';
import type { AuditRecord } from '@vittix/shared';
import { DB_NAME, SETTINGS_KEY } from '@vittix/shared';

export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * Local audit history + settings, stored in the extension's own origin.
 * Schema v1 — any future change requires a new version() with a migration.
 */
export class VittixDatabase extends Dexie {
  audits!: EntityTable<AuditRecord, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      // Primary key ++id; queryable: by url and by analyzedAt (ISO string,
      // which sorts chronologically).
      audits: '++id, url, analyzedAt',
      settings: 'key',
    });
  }
}

export const db = new VittixDatabase();

export { SETTINGS_KEY };
