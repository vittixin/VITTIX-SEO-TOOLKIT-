import { useEffect, useState } from 'react';
import { Check, ShieldCheck, Trash2 } from 'lucide-react';
import { DEFAULT_SETTINGS, type Settings } from '@vittix/shared';
import { clearAllAudits, pruneAudits } from '@/src/storage/audits';
import { getSettings, saveSettings } from '@/src/storage/settings';

const RETENTION_OPTIONS = [
  { value: 0, label: 'Keep forever' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days (default)' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
];

const MAX_AUDITS_OPTIONS = [50, 100, 200, 500, 1000];

/** Shared settings UI used by the dashboard Settings section and the options page. */
export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void getSettings().then((next) => {
      setSettings(next);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    const next = await saveSettings(settings);
    setSettings(next);
    await pruneAudits(next);
    setSaved(true);
    setCleared(false);
  }

  async function handleClearAll() {
    await clearAllAudits();
    setConfirmClear(false);
    setCleared(true);
    setSaved(false);
  }

  const selectClasses =
    'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Local storage</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          All audit history is stored in this browser (IndexedDB). Nothing is synced or uploaded.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            History retention
            <select
              className={selectClasses}
              value={settings.historyRetentionDays}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  historyRetentionDays: Number(event.target.value),
                }))
              }
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Maximum stored audits
            <select
              className={selectClasses}
              value={settings.maxStoredAudits}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, maxStoredAudits: Number(event.target.value) }))
              }
            >
              {MAX_AUDITS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} audits
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!loaded}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save settings
          </button>
          {saved ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check className="size-4" aria-hidden /> Saved
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-rose-200 bg-rose-50/50 p-5">
        <h3 className="text-sm font-semibold text-rose-900">Danger zone</h3>
        <p className="mt-0.5 text-sm text-rose-700">
          Permanently delete every stored audit from this browser. This cannot be undone.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {confirmClear ? (
            <>
              <button
                type="button"
                data-testid="clear-all-confirm"
                onClick={() => void handleClearAll()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500"
              >
                Yes, delete everything
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="clear-all-button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
            >
              <Trash2 className="size-4" aria-hidden /> Clear all audit data
            </button>
          )}
          {cleared ? (
            <span className="text-sm font-medium text-emerald-600">All audit data deleted.</span>
          ) : null}
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" aria-hidden />
        <p className="text-sm leading-relaxed text-slate-600">
          Vittix analyzes pages <strong>locally</strong> in your browser. Page content is read only
          when you click <em>Analyze</em>, is never transmitted anywhere, and can be deleted at any
          time.
        </p>
      </section>
    </div>
  );
}
