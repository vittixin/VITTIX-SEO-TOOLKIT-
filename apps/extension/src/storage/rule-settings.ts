import type { ProfileId } from '@vittix/seo-core';
import type { Severity } from '@vittix/shared';
import { db, type OriginRuleSettingsRow } from './db';

export type RuleSettings = Pick<
  OriginRuleSettingsRow,
  'profileId' | 'ignoredRuleIds' | 'unignoredRuleIds' | 'severityOverrides'
>;

export async function getOriginRuleSettings(url: string): Promise<RuleSettings> {
  const origin = new URL(url).origin;
  const saved = await db.originRuleSettings.get(origin);
  return (
    saved ?? {
      profileId: 'standard',
      ignoredRuleIds: [],
      unignoredRuleIds: [],
      severityOverrides: {},
    }
  );
}

export async function saveOriginRuleSettings(url: string, settings: RuleSettings): Promise<void> {
  const origin = new URL(url).origin;
  await db.originRuleSettings.put({ origin, ...settings });
}

export async function resetOriginRuleSettings(url: string): Promise<void> {
  await db.originRuleSettings.delete(new URL(url).origin);
}

export function defaultProfileSettings(profileId: ProfileId): RuleSettings {
  return {
    profileId,
    ignoredRuleIds: [],
    unignoredRuleIds: [],
    severityOverrides: {},
  };
}

export type RuleSeverity = Severity;
