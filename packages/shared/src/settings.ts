import { z } from 'zod';
import { SITE_LIMITS } from './site.js';

/**
 * Settings are stored locally in IndexedDB. No cloud, no sync.
 * Site-audit fields are optional-with-defaults so pre-Phase-3 rows parse.
 */
export const SettingsSchema = z.object({
  /** Days to keep audits. 0 = keep forever. */
  historyRetentionDays: z.number().int().min(0).max(3650),
  /** Hard cap on stored audits (oldest pruned first). */
  maxStoredAudits: z.number().int().min(10).max(5000),
  /** Site mode: pages per audit (hard-capped at SITE_LIMITS.maxPagesCap). */
  siteAuditMaxPages: z
    .number()
    .int()
    .min(1)
    .max(SITE_LIMITS.maxPagesCap)
    .default(SITE_LIMITS.maxPagesDefault),
  /** Site mode: minimum interval between request starts. */
  siteAuditDelayMs: z
    .number()
    .int()
    .min(SITE_LIMITS.delayMsFloor)
    .max(10_000)
    .default(SITE_LIMITS.delayMsDefault),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  historyRetentionDays: 90,
  maxStoredAudits: 200,
  siteAuditMaxPages: SITE_LIMITS.maxPagesDefault,
  siteAuditDelayMs: SITE_LIMITS.delayMsDefault,
};

/** Key used for the settings row in the Dexie `settings` table. */
export const SETTINGS_KEY = 'app-settings';
