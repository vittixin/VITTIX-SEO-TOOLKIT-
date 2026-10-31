import { z } from 'zod';

/** Settings are stored locally in IndexedDB. No cloud, no sync. */
export const SettingsSchema = z.object({
  /** Days to keep audits. 0 = keep forever. */
  historyRetentionDays: z.number().int().min(0).max(3650),
  /** Hard cap on stored audits (oldest pruned first). */
  maxStoredAudits: z.number().int().min(10).max(5000),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  historyRetentionDays: 90,
  maxStoredAudits: 200,
};

/** Key used for the settings row in the Dexie `settings` table. */
export const SETTINGS_KEY = 'app-settings';
