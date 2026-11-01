import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { SITE_LIMITS, type SitePageRecord, type SiteSession } from '@vittix/shared';
import { RULE_SET_VERSION, compareSiteSessions, type SiteComparison } from '@vittix/seo-core';
import { checkCrawlableOrigin } from '@/src/site/guards';
import { runSiteAudit } from '@/src/site/crawler';
import {
  buildSiteSummary,
  clearAllSiteData,
  createSiteSession,
  getLatestSiteSession,
  getSiteSession,
  getPreviousSiteSession,
  listSitePages,
  type SiteSummary,
  updateSiteSession,
  deleteSiteSession,
} from '@/src/storage/site';
import { getSettings as loadSettings } from '@/src/storage/settings';
import { getOriginRuleSettings } from '@/src/storage/rule-settings';

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
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [consented, setConsented] = useState(false);
  const [maxPages, setMaxPages] = useState<number>(SITE_LIMITS.maxPagesDefault);
  const [seedFromSitemap, setSeedFromSitemap] = useState(false);
  const [session, setSession] = useState<SiteSession | null>(null);
  const [pages, setPages] = useState<SitePageRecord[]>([]);
  const [summary, setSummary] = useState<SiteSummary | null>(null);
  const [comparison, setComparison] = useState<SiteComparison | null>(null);
  const [urlFilter, setUrlFilter] = useState('');
  const [responseFilter, setResponseFilter] = useState<'all' | 'slow' | 'non-html' | 'redirected'>(
    'all',
  );
  const runTokenRef = useRef(0);

  const checkPermission = useCallback(async (origin: string | null): Promise<boolean | null> => {
    if (origin === null) return null;
    try {
      return await browser.permissions.contains({ origins: [`${origin}/*`] });
    } catch {
      return false;
    }
  }, []);

  const applySession = useCallback(
    async (loaded: SiteSession | null) => {
      if (loaded === null || loaded.id === undefined) {
        setSession(null);
        setPages([]);
        setSummary(null);
        setComparison(null);
        return;
      }
      const loadedPages = await listSitePages(loaded.id);
      setSession(loaded);
      setPages(loadedPages);
      setSummary(buildSiteSummary(loaded, loadedPages));
      setPermissionGranted(await checkPermission(loaded.origin));
      // Comparison with the previous completed session of the same origin —
      // only meaningful when both ran on the same rule-set version.
      const previous = await getPreviousSiteSession(loaded.origin, loaded.id);
      if (previous !== null && previous.id !== undefined) {
        const previousPages = await listSitePages(previous.id);
        setComparison(
          compareSiteSessions(
            { session: previous, pages: previousPages },
            { session: loaded, pages: loadedPages },
          ),
        );
      } else {
        setComparison(null);
      }
    },
    [checkPermission],
  );

  // Load the latest session on mount (resume affordance).
  useEffect(() => {
    void (async () => {
      const latest = await getLatestSiteSession();
      if (latest !== null) {
        setGrantedOrigin(latest.origin);
        await applySession(latest);
        if (latest.status === 'running') {
          setPhase('finished'); // paused state — user can resume or discard
        } else {
          setPhase('finished');
        }
      }
      const settings = await loadSettings();
      setMaxPages(settings.siteAuditMaxPages);
    })();
  }, [applySession]);

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
    setPermissionGranted(true);
    setConsented(false);
    setPhase('setup');
    return true;
  }

  async function startAudit(): Promise<void> {
    if (session?.status === 'running' && session.id !== undefined) {
      setError(null);
      setPhase('running');
      const sessionId = session.id;
      const token = ++runTokenRef.current;
      void runSiteAudit(sessionId, {
        onProgress: () => {
          if (runTokenRef.current === token) void refresh(sessionId);
        },
      }).then(async () => {
        if (runTokenRef.current === token) {
          await refresh(sessionId);
          await applySession(await getSiteSession(sessionId));
          setPhase('finished');
        }
      });
      return;
    }
    if (grantedOrigin === null) return;
    setError(null);
    try {
      const settings = await loadSettings();
      const ruleSettings = await getOriginRuleSettings(grantedOrigin);
      const sessionId = await createSiteSession({
        origin: grantedOrigin,
        status: 'running',
        startedAt: new Date().toISOString(),
        maxPages: Math.min(maxPages, SITE_LIMITS.maxPagesCap),
        maxDepth: SITE_LIMITS.maxDepth,
        concurrency: SITE_LIMITS.concurrencyDefault,
        delayMs: Math.max(settings.siteAuditDelayMs, SITE_LIMITS.delayMsFloor),
        ruleSetVersion: RULE_SET_VERSION,
        profileId: ruleSettings.profileId,
        ignoredRuleIds: ruleSettings.ignoredRuleIds,
        unignoredRuleIds: ruleSettings.unignoredRuleIds,
        severityOverrides: ruleSettings.severityOverrides,
        seedFromSitemap,
      });
      setPhase('running');
      setSession(await getLatestSiteSession());
      setPages([]);
      setSummary(null);
      setComparison(null);

      const token = ++runTokenRef.current;
      // runSiteAudit never rejects by contract; the catch below guards the
      // UI refresh chain instead.
      void runSiteAudit(sessionId, {
        onProgress: () => {
          if (runTokenRef.current === token) void refresh(sessionId);
        },
      }).then(async () => {
        if (runTokenRef.current === token) {
          await refresh(sessionId);
          await applySession((await getLatestSiteSession()) ?? null);
          setPhase('finished');
        }
      });
    } catch (startError) {
      // CRITICAL: the session row could not be created — nothing can run.
      setPhase('finished');
      setError(
        `Could not start the audit: ${
          startError instanceof Error ? startError.message : String(startError)
        }`,
      );
    }
  }

  async function cancelAudit(): Promise<void> {
    if (session?.id === undefined) return;
    try {
      await updateSiteSession(session.id, { stopRequested: true });
    } catch (cancelError) {
      // CRITICAL: without the persisted flag the crawl keeps running.
      setError(
        `Could not cancel the audit (storage error): ${
          cancelError instanceof Error ? cancelError.message : String(cancelError)
        }`,
      );
    }
    // The loop checks stopRequested between requests; UI updates via refresh.
  }

  async function discardSession(): Promise<void> {
    runTokenRef.current += 1; // invalidate any running loop's UI updates
    if (session?.id !== undefined) await deleteSiteSession(session.id);
    setSession(null);
    setPages([]);
    setSummary(null);
    setComparison(null);
    setPhase('setup');
  }

  async function clearSiteData(): Promise<void> {
    runTokenRef.current += 1;
    await clearAllSiteData();
    setSession(null);
    setPages([]);
    setSummary(null);
    setComparison(null);
    setPermissionGranted(await checkPermission(grantedOrigin));
    setPhase('setup');
  }

  const filteredPages = pages.filter((page) => {
    const matchesUrl =
      urlFilter.trim() === '' || page.url.toLowerCase().includes(urlFilter.trim().toLowerCase());
    const metadata = page.responseMetadata;
    const matchesResponse =
      responseFilter === 'all' ||
      (responseFilter === 'slow' && (metadata?.durationMs ?? 0) >= 2_000) ||
      (responseFilter === 'non-html' &&
        Boolean(metadata?.contentType && !/html/i.test(metadata.contentType))) ||
      (responseFilter === 'redirected' &&
        Boolean(metadata?.redirectChain.length || metadata?.redirectObservationUnavailable));
    return matchesUrl && matchesResponse;
  });

  return {
    phase,
    originInput,
    setOriginInput,
    error,
    grantedOrigin,
    permissionGranted,
    consented,
    setConsented,
    maxPages,
    setMaxPages,
    seedFromSitemap,
    setSeedFromSitemap,
    session,
    pages,
    filteredPages,
    summary,
    comparison,
    urlFilter,
    setUrlFilter,
    responseFilter,
    setResponseFilter,
    validateInput,
    requestAccess,
    startAudit,
    cancelAudit,
    discardSession,
    clearSiteData,
  };
}
