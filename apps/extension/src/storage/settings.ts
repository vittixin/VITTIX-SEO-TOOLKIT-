import { DEFAULT_SETTINGS, SETTINGS_KEY, SettingsSchema, type Settings } from '@vittix/shared';
import { db } from './db';

/** Settings never leave IndexedDB; malformed rows fall back to defaults. */
export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  const parsed = SettingsSchema.safeParse(row?.value ?? DEFAULT_SETTINGS);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(next: Settings): Promise<Settings> {
  const clean = SettingsSchema.parse(next);
  await db.settings.put({ key: SETTINGS_KEY, value: clean });
  return clean;
}
