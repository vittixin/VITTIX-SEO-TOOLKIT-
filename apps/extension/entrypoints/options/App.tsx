import { Lock, ShieldCheck, WandSparkles } from 'lucide-react';
import { browser } from 'wxt/browser';
import { RULE_SET_VERSION } from '@vittix/seo-core';
import { SITE_REDIRECT_DISCLOSURE } from '@vittix/shared';
import { SettingsPanel } from '@/src/components/SettingsPanel';
import { ThemeToggle } from '@/src/components/ThemeToggle';
import { t } from '@/src/i18n';

const PRIVACY_POINTS: { title: string; body: string }[] = [
  {
    title: 'Analysis happens only when you ask',
    body: 'Vittix reads a page only after you click “Analyze Current Page”. There is no persistent content script, no background scanning, and no automatic collection.',
  },
  {
    title: 'Audit data stays on your device',
    body: `Snapshots, audits and settings are stored locally in IndexedDB. Single-page audits make no network requests. Site audits use network requests after you approve an origin; there is no telemetry, analytics, or API service. ${SITE_REDIRECT_DISCLOSURE}`,
  },
  {
    title: 'Minimal permissions by design',
    body: 'At install, the extension requests activeTab (temporary access to the tab you are looking at, granted on click) and scripting (to run the one-shot extractor). It has no tabs or history permission. Site audits request an origin only when you start one.',
  },
  {
    title: 'You control your data',
    body: 'Audit history can be pruned by retention settings or wiped entirely with “Clear all audit data” at any time. Exports are generated locally as downloads.',
  },
];

export function App() {
  const version = browser.runtime.getManifest().version;

  return (
    <div className="min-h-screen bg-slate-50 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <header className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-2xl font-black text-white">
            V
          </div>
          <div>
            <h1 className="text-xl font-bold">Vittix SEO Toolkit — Options</h1>
            <p className="text-sm text-slate-500">Local storage, retention and privacy</p>
          </div>
        </header>

        <SettingsPanel />

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('headingAppearance')}</h2>
          <ThemeToggle />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="size-4 text-emerald-500" aria-hidden /> Privacy
          </h2>
          <ul className="mt-3 space-y-4">
            {PRIVACY_POINTS.map((point) => (
              <li key={point.title} className="flex items-start gap-3">
                <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-slate-800">{point.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <WandSparkles className="mt-0.5 size-5 shrink-0 text-indigo-500" aria-hidden />
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-800">About</p>
            <p className="mt-1">
              Version {version} · SEO rule set v{RULE_SET_VERSION} · MIT License. Scores are
              preliminary while the rule set is being calibrated — they describe on-page hygiene,
              not ranking predictions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
