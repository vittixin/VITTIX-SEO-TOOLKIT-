import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { SITE_LIMITS, type SitePageRecord, type SiteSession } from '@vittix/shared';
import { checkCrawlableOrigin } from '@/src/site/guards';
import { runSiteAudit } from '@/src/site/crawler';
import {
  buildSiteSummary,
  clearAllSiteData,
  createSiteSession,
  getLatestSiteSession,
  listSitePages,
  type SiteSummary,
  updateSiteSession,
  deleteSiteSession,
} from '@/src/storage/site';
import { getSettings as loadSettings } from '@/src/storage/settings';

type Phase = 'setup' | 'running' | 'finished';

/**
 * Site-audit controller for the dashboard. Owns the consent flow, the
 * crawl lifecycle and the summary state. The crawl loop runs in THIS page
 * (documented limitation: closing the tab pauses the audit; state is
 * durable in IndexedDB and resumable).
 */
export function useSiteAudit() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [originInput, setOriginInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [grantedOrigin, setGrantedOrigin] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [maxPages, setMaxPages] = useState<number>(SITE_LIMITS.maxPagesDefault);
  const [session, setSession] = useState<SiteSession | null>(null);
  const [pages, setPages] = useState<SitePageRecord[]>([]);
  const [summary, setSummary] = useState<SiteSummary | null>(null);
  const [urlFilter, setUrlFilter] = useState('');
  const runTokenRef = useRef(0);

  // Load the latest session on mount (resume affordance).
  useEffect(() => {
    void (async () => {
      const latest = await getLatestSiteSession();
      if (latest !== null) {
        setSession(latest);
        setGrantedOrigin(latest.origin);
        const latestPages = await listSitePages(latest.id ?? -1);
        setPages(latestPages);
        setSummary(buildSiteSummary(latest, latestPages));
        if (latest.status === 'running') {
          setPhase('finished'); // paused state — user can resume or discard
        } else {
          setPhase('finished');
        }
      }
      const settings = await loadSettings();
      setMaxPages(settings.siteAuditMaxPages);
    })();
  }, []);

  const refresh = useCallback(async (sessionId: number) => {
    const { getSiteSession } = await import('@/src/storage/site');
    const current = await getSiteSession(sessionId);
    const currentPages = await listSitePages(sessionId);
    if (current !== null) {
      setSession(current);
      setSummary(buildSiteSummary(current, currentPages));
    }
    setPages(currentPages);
  }, []);

  function validateInput(): string | null {
    const check = checkCrawlableOrigin(originInput);
    return check.allowed ? null : check.reason;
  }

  async function requestAccess(): Promise<boolean> {
    setError(null);
    const reason = validateInput();
    if (reason !== null) {
      setError(reason);
      return false;
    }
    const parsed = new URL(originInput.trim());
    // Store the bare origin (URL.origin never has a trailing slash).
    const normalized = parsed.origin;
    const pattern = `${parsed.origin}/*`;
    try {
      const granted = await browser.permissions.request({ origins: [pattern] });
      if (!granted) {
        setError('Permission was not granted — site mode cannot run without it.');
        return false;
      }
    } catch (requestError) {
      setError(
        `Permission request failed: ${
          requestError instanceof Error ? requestError.message : String(requestError)
        }`,
      );
      return false;
    }
    setGrantedOrigin(normalized);
    setConsented(false);
    setPhase('setup');
    return true;
  }

  async function startAudit(): Promise<void> {
    if (grantedOrigin === null) return;
    setError(null);
    const settings = await loadSettings();
    const sessionId = await createSiteSession({
      origin: grantedOrigin,
      status: 'running',
      startedAt: new Date().toISOString(),
      maxPages: Math.min(maxPages, SITE_LIMITS.maxPagesCap),
      maxDepth: SITE_LIMITS.maxDepth,
      concurrency: SITE_LIMITS.concurrencyDefault,
      delayMs: Math.max(settings.siteAuditDelayMs, SITE_LIMITS.delayMsFloor),
    });
    setPhase('running');
    setSession(await getLatestSiteSession());
    setPages([]);
    setSummary(null);

    const token = ++runTokenRef.current;
    void runSiteAudit(sessionId, {
      onProgress: () => {
        if (runTokenRef.current === token) void refresh(sessionId);
      },
    }).then(() => {
      if (runTokenRef.current === token) {
        void refresh(sessionId).then(() => setPhase('finished'));
      }
    });
  }

  async function cancelAudit(): Promise<void> {
    if (session?.id === undefined) return;
    await updateSiteSession(session.id, { stopRequested: true });
    // The loop checks stopRequested between requests; UI updates via refresh.
  }

  async function discardSession(): Promise<void> {
    runTokenRef.current += 1; // invalidate any running loop's UI updates
    if (session?.id !== undefined) await deleteSiteSession(session.id);
    setSession(null);
    setPages([]);
    setSummary(null);
    setPhase('setup');
  }

  async function clearSiteData(): Promise<void> {
    runTokenRef.current += 1;
    await clearAllSiteData();
    setSession(null);
    setPages([]);
    setSummary(null);
    setPhase('setup');
  }

  const filteredPages =
    urlFilter.trim() === ''
      ? pages
      : pages.filter((page) => page.url.toLowerCase().includes(urlFilter.trim().toLowerCase()));

  return {
    phase,
    originInput,
    setOriginInput,
    error,
    grantedOrigin,
    consented,
    setConsented,
    maxPages,
    setMaxPages,
    session,
    pages,
    filteredPages,
    summary,
    urlFilter,
    setUrlFilter,
    validateInput,
    requestAccess,
    startAudit,
    cancelAudit,
    discardSession,
    clearSiteData,
  };
}
