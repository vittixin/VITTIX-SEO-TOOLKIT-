import { lazy, Suspense, useState } from 'react';
import {
  Download,
  BookOpen,
  FileText,
  Globe,
  Heading,
  History,
  Image,
  LayoutDashboard,
  Link2,
  ListChecks,
  Menu,
  Newspaper,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { useAudits } from '@/src/features/useAudits';
import { OverviewView } from '@/src/features/views/OverviewView';
import { analyzeSnapshot } from '@vittix/seo-core';
import { getTargetKeyword } from '@/src/storage/keywords';
import { getOriginRuleSettings } from '@/src/storage/rule-settings';
import { saveAudit } from '@/src/storage/audits';

const ExportView = lazy(() =>
  import('@/src/features/views/ExportView').then((m) => ({ default: m.ExportView })),
);
const FindingsView = lazy(() =>
  import('@/src/features/views/FindingsView').then((m) => ({ default: m.FindingsView })),
);
const HeadingsView = lazy(() =>
  import('@/src/features/views/HeadingsView').then((m) => ({ default: m.HeadingsView })),
);
const HistoryView = lazy(() =>
  import('@/src/features/views/HistoryView').then((m) => ({ default: m.HistoryView })),
);
const ImagesView = lazy(() =>
  import('@/src/features/views/ImagesView').then((m) => ({ default: m.ImagesView })),
);
const LinksView = lazy(() =>
  import('@/src/features/views/LinksView').then((m) => ({ default: m.LinksView })),
);
const MetadataView = lazy(() =>
  import('@/src/features/views/MetadataView').then((m) => ({ default: m.MetadataView })),
);
const SettingsView = lazy(() =>
  import('@/src/features/views/SettingsView').then((m) => ({ default: m.SettingsView })),
);
const SiteAuditView = lazy(() =>
  import('@/src/features/views/SiteAuditView').then((m) => ({ default: m.SiteAuditView })),
);
const PreviewsView = lazy(() =>
  import('@/src/features/views/PreviewsView').then((m) => ({ default: m.PreviewsView })),
);
const ContentView = lazy(() =>
  import('@/src/features/views/ContentView').then((m) => ({ default: m.ContentView })),
);

type Section =
  | 'overview'
  | 'metadata'
  | 'headings'
  | 'images'
  | 'links'
  | 'findings'
  | 'history'
  | 'site'
  | 'previews'
  | 'content'
  | 'export'
  | 'settings';

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'metadata', label: 'Metadata', icon: FileText },
  { id: 'headings', label: 'Headings', icon: Heading },
  { id: 'images', label: 'Images', icon: Image },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'findings', label: 'Findings', icon: ListChecks },
  { id: 'history', label: 'Audit History', icon: History },
  { id: 'site', label: 'Site Audits', icon: Globe },
  { id: 'previews', label: 'Previews', icon: Newspaper },
  { id: 'content', label: 'Content', icon: BookOpen },
  { id: 'export', label: 'Export', icon: Download },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SECTION_TITLES: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Score summary and page facts' },
  metadata: { title: 'Metadata', subtitle: 'Title, description, canonical and social tags' },
  headings: { title: 'Headings', subtitle: 'Heading outline and structure' },
  images: { title: 'Images', subtitle: 'Alt-text coverage' },
  links: { title: 'Links', subtitle: 'Internal/external profile and anchors' },
  findings: { title: 'Findings', subtitle: 'Every rule result for this audit' },
  history: { title: 'Audit History', subtitle: 'Locally stored audits' },
  site: { title: 'Site Audits', subtitle: 'Opt-in multi-page audits of one approved origin' },
  previews: { title: 'Previews', subtitle: 'Search-result and social share estimates' },
  content: { title: 'Content', subtitle: 'Text summary and keyword analysis' },
  export: { title: 'Export', subtitle: 'JSON and CSV downloads' },
  settings: { title: 'Settings', subtitle: 'Retention and local data controls' },
};

export function App() {
  const [section, setSection] = useState<Section>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const audits = useAudits();
  const version = browser.runtime.getManifest().version;

  function navigate(next: Section) {
    setSection(next);
    setSidebarOpen(false);
    // Audits can be saved while the dashboard is open (e.g. from the popup).
    // Re-read durable state when entering the sections that show it so the
    // UI never presents a stale empty state.
    if (next === 'overview') void audits.loadLatest();
    if (next === 'history') void audits.refresh();
  }

  function viewAudit(id: number) {
    void audits.loadAudit(id);
    navigate('overview');
  }

  async function reanalyzeCurrent() {
    const audit = audits.current;
    if (!audit) return;
    const settings = await getOriginRuleSettings(audit.url);
    const result = analyzeSnapshot(audit.snapshot, {
      targetKeyword: await getTargetKeyword(audit.url),
      profileId: settings.profileId,
      ignoredRuleIds: settings.ignoredRuleIds,
      unignoredRuleIds: settings.unignoredRuleIds,
      severityOverrides: settings.severityOverrides,
    });
    const id = await saveAudit({
      url: audit.url,
      title: audit.title,
      analyzedAt: new Date().toISOString(),
      ruleSetVersion: result.ruleSetVersion,
      profileId: settings.profileId,
      snapshot: audit.snapshot,
      result,
    });
    await audits.loadAudit(id);
    await audits.refresh();
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      {/* Mobile overlay */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-100 transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-lg font-black">
            V
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Vittix SEO Toolkit</p>
            <p className="text-xs text-slate-400">Local-only audits</p>
          </div>
          <button
            type="button"
            className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-800 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Dashboard sections">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                data-testid={`nav-${item.id}`}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 px-5 py-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />
            No telemetry · No network calls
          </p>
          <p className="mt-1 text-[11px] text-slate-500">v{version} · MIT License</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            data-testid="mobile-menu"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1
              className="truncate text-base font-semibold text-slate-900"
              data-testid="section-title"
            >
              {SECTION_TITLES[section].title}
            </h1>
            <p className="truncate text-xs text-slate-400">{SECTION_TITLES[section].subtitle}</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            <Suspense
              fallback={
                <p role="status" className="text-sm text-slate-500">
                  Loading section…
                </p>
              }
            >
              {section === 'overview' ? (
                <OverviewView
                  audit={audits.current}
                  previous={audits.previous}
                  onReanalyze={() => void reanalyzeCurrent()}
                />
              ) : null}
              {section === 'metadata' ? <MetadataView audit={audits.current} /> : null}
              {section === 'headings' ? <HeadingsView audit={audits.current} /> : null}
              {section === 'images' ? <ImagesView audit={audits.current} /> : null}
              {section === 'links' ? <LinksView audit={audits.current} /> : null}
              {section === 'findings' ? <FindingsView audit={audits.current} /> : null}
              {section === 'history' ? (
                <HistoryView
                  summaries={audits.summaries}
                  loading={audits.loading}
                  onView={viewAudit}
                  onDelete={(id) => void audits.remove(id)}
                />
              ) : null}
              {section === 'site' ? <SiteAuditView /> : null}
              {section === 'previews' ? <PreviewsView audit={audits.current} /> : null}
              {section === 'content' ? (
                <ContentView audit={audits.current} onReanalyze={() => void reanalyzeCurrent()} />
              ) : null}
              {section === 'export' ? <ExportView audit={audits.current} /> : null}
              {section === 'settings' ? <SettingsView audit={audits.current} /> : null}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
