import { SettingsPanel } from '@/src/components/SettingsPanel';
import { useEffect, useMemo, useState } from 'react';
import { RULE_IDS, SCORING_PROFILES, type ProfileId } from '@vittix/seo-core';
import type { AuditRecord, Severity } from '@vittix/shared';
import { ThemeToggle } from '@/src/components/ThemeToggle';
import { t } from '@/src/i18n';
import {
  getOriginRuleSettings,
  resetOriginRuleSettings,
  saveOriginRuleSettings,
} from '@/src/storage/rule-settings';

const BLOCKING = new Set(['robots-directives', 'title-present', 'h1-present', 'canonical-valid']);

export function SettingsView({ audit }: { audit?: AuditRecord | null }) {
  const [profileId, setProfileId] = useState<ProfileId>('standard');
  const [ignored, setIgnored] = useState<string[]>([]);
  const [unignored, setUnignored] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Severity>>({});
  const [filter, setFilter] = useState('');
  const [saved, setSaved] = useState(false);
  const url = audit?.url;
  useEffect(() => {
    let active = true;
    if (url)
      void getOriginRuleSettings(url).then((settings) => {
        if (!active) return;
        setProfileId(settings.profileId);
        setIgnored(settings.ignoredRuleIds);
        setUnignored(settings.unignoredRuleIds);
        setOverrides(settings.severityOverrides);
      });
    return () => {
      active = false;
    };
  }, [url]);
  const rules = useMemo(
    () => RULE_IDS.filter((id) => id.includes(filter.trim().toLowerCase())),
    [filter],
  );

  async function save() {
    if (!audit) return;
    await saveOriginRuleSettings(audit.url, {
      profileId,
      ignoredRuleIds: ignored,
      unignoredRuleIds: unignored,
      severityOverrides: overrides as Record<string, 'error' | 'warn' | 'info'>,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        These settings control the local audit history in this browser. The full options page (with
        privacy details) is available from Chrome’s extension settings.
      </p>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Scoring profile and rule controls</h2>
        {audit ? (
          <p className="text-xs text-slate-600">
            Settings apply to {new URL(audit.url).origin} and are stored on this device.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Open an audit first to configure rules for its origin.
          </p>
        )}
        <label htmlFor="scoring-profile" className="block text-xs font-medium text-slate-600">
          Scoring profile
        </label>
        <select
          id="scoring-profile"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value as ProfileId)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
        >
          {Object.values(SCORING_PROFILES).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">{SCORING_PROFILES[profileId].description}</p>
        <label htmlFor="rule-search" className="sr-only">
          Search rules
        </label>
        <input
          id="rule-search"
          value={filter}
          onChange={(event) => setFilter(event.target.value.toLowerCase())}
          placeholder="Search rules"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
        />
        <div className="max-h-96 space-y-2 overflow-y-auto" aria-label="Rule controls">
          {rules.map((id) =>
            (() => {
              const isIgnored =
                ignored.includes(id) ||
                (SCORING_PROFILES[profileId].ignoredRuleIds.includes(id) &&
                  !unignored.includes(id));
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs"
                >
                  <code className="min-w-48 flex-1">{id}</code>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={isIgnored}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setUnignored(unignored.filter((item) => item !== id));
                          setIgnored([...new Set([...ignored, id])]);
                        } else {
                          setIgnored(ignored.filter((item) => item !== id));
                          if (SCORING_PROFILES[profileId].ignoredRuleIds.includes(id))
                            setUnignored([...new Set([...unignored, id])]);
                        }
                      }}
                      aria-label={`${isIgnored ? 'Un-ignore' : 'Ignore'} ${id}`}
                    />
                    {isIgnored ? 'Un-ignore' : 'Ignore'}
                  </label>
                  <label className="flex items-center gap-1">
                    Severity override
                    <select
                      value={overrides[id] ?? ''}
                      onChange={(event) =>
                        setOverrides((current) => {
                          const next = { ...current };
                          if (event.target.value) next[id] = event.target.value as Severity;
                          else delete next[id];
                          return next;
                        })
                      }
                      aria-label={`Severity override for ${id}`}
                      className="rounded border border-slate-300 px-1 py-1"
                    >
                      <option value="">Default</option>
                      <option value="error">Error</option>
                      <option value="warn">Warn</option>
                      <option value="info">Info</option>
                    </select>
                  </label>
                  {BLOCKING.has(id) && overrides[id] ? (
                    <span role="status" className="w-full text-amber-800">
                      This override changes a blocking rule’s severity and can remove its score cap.
                      Verify the impact after re-analysis.
                    </span>
                  ) : null}
                </div>
              );
            })(),
          )}
        </div>
        {audit ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              Save settings
            </button>
            <button
              type="button"
              onClick={() => {
                void resetOriginRuleSettings(audit.url);
                setProfileId('standard');
                setIgnored([]);
                setUnignored([]);
                setOverrides({});
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            >
              Reset to defaults
            </button>
          </div>
        ) : null}
        {saved ? (
          <p role="status" className="text-xs text-emerald-700">
            Settings saved on this device.
          </p>
        ) : null}
      </section>
      <SettingsPanel />
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">{t('headingAppearance')}</h3>
        <ThemeToggle />
      </section>
    </div>
  );
}
