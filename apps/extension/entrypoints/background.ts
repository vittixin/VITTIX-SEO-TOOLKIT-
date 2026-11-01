import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  ANALYZE_REQUEST_SCHEMA,
  SHOW_HIGHLIGHTS_REQUEST_SCHEMA,
  PageSnapshotSchema,
  SNAPSHOT_SCHEMA_VERSION,
  analyzeFailure,
  analyzeSuccess,
  countSeverities,
  type AnalyzeResponse,
} from '@vittix/shared';
import { analyzeSnapshot } from '@vittix/seo-core';
import { EXTRACTOR_LIMITS } from '@/src/extraction/limits';
import { extractPageSnapshot } from '@/src/extraction/snapshot-inject';
import { isAnalyzableUrl } from '@/src/extraction/guards';
import { getAudit, pruneAudits, saveAudit } from '@/src/storage/audits';
import { getSettings } from '@/src/storage/settings';
import { getTargetKeyword } from '@/src/storage/keywords';
import { getOriginRuleSettings } from '@/src/storage/rule-settings';
import { highlightOnPage } from '@/src/highlight/overlay';

/**
 * Minimal, event-driven MV3 service worker.
 *
 * Responsibilities:
 *  - answer analyze requests from popup/dashboard (query active tab → guard
 *    URL → one-shot injection → validate → analyze → persist)
 *  - run the same pipeline for the keyboard command (Ctrl+Shift+U), which is
 *    a user gesture and grants activeTab exactly like a toolbar click
 *  - apply history retention on install/startup
 *
 * No timers, no long-lived state — safe against service-worker suspension.
 */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const highlightRequest = SHOW_HIGHLIGHTS_REQUEST_SCHEMA.safeParse(message);
    if (highlightRequest.success) {
      void showAuditHighlights(highlightRequest.data.auditId).then(sendResponse);
      return true;
    }
    if (!ANALYZE_REQUEST_SCHEMA.safeParse(message).success) {
      return; // not our message; let other listeners decide
    }
    void analyzeActiveTab()
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error('[vittix] analysis failed', error);
        sendResponse(analyzeFailure('ERR_ANALYSIS_FAILED', 'Unexpected analysis failure.'));
      });
    return true; // keep the message channel open for the async response
  });

  browser.commands.onCommand.addListener((command: string) => {
    if (command !== 'analyze-page') return;
    void analyzeActiveTab()
      .then((response) => {
        if (response.ok) void setScoreBadge(response.score.total);
      })
      .catch((error: unknown) => console.error('[vittix] command analysis failed', error));
  });

  browser.runtime.onInstalled.addListener(() => void applyRetention());
  browser.runtime.onStartup.addListener(() => void applyRetention());
});

/** Show the latest preliminary score on the toolbar badge (visual feedback). */
async function setScoreBadge(score: number): Promise<void> {
  try {
    await browser.action.setBadgeText({ text: String(score) });
    const color = score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#e11d48';
    await browser.action.setBadgeBackgroundColor({ color });
  } catch (error) {
    console.warn('[vittix] badge update failed', error);
  }
}

async function analyzeActiveTab(): Promise<AnalyzeResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return analyzeFailure('ERR_NO_ACTIVE_TAB', 'No active tab found.');
  }

  const url = tab.url ?? tab.pendingUrl;
  if (!url) {
    return analyzeFailure('ERR_NO_TAB_URL', 'Active tab URL unavailable (no access granted).');
  }
  if (!isAnalyzableUrl(url)) {
    return analyzeFailure('ERR_UNSUPPORTED_URL', `Unsupported page: ${truncate(url, 120)}`);
  }

  let rawResult: unknown;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageSnapshot,
      args: [EXTRACTOR_LIMITS],
    });
    rawResult = results?.[0]?.result;
  } catch (error) {
    return analyzeFailure(
      'ERR_INJECTION_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }

  const parsed = PageSnapshotSchema.safeParse(rawResult);
  if (!parsed.success) {
    return analyzeFailure(
      'ERR_INVALID_SNAPSHOT',
      `Snapshot failed validation: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  // The schema tolerates legacy v1 for STORED records; a fresh extraction
  // must always come from the current injector.
  if (parsed.data.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return analyzeFailure(
      'ERR_INVALID_SNAPSHOT',
      `Extractor version mismatch: got v${parsed.data.schemaVersion}, expected v${SNAPSHOT_SCHEMA_VERSION}. Reload the extension and try again.`,
    );
  }
  const snapshot = parsed.data;

  let auditId: number;
  try {
    const ruleSettings = await getOriginRuleSettings(snapshot.url);
    const result = analyzeSnapshot(snapshot, {
      targetKeyword: await getTargetKeyword(snapshot.url),
      profileId: ruleSettings.profileId,
      ignoredRuleIds: ruleSettings.ignoredRuleIds,
      unignoredRuleIds: ruleSettings.unignoredRuleIds,
      severityOverrides: ruleSettings.severityOverrides,
    });
    const analyzedAt = new Date().toISOString();
    auditId = await saveAudit({
      url: snapshot.url,
      title: snapshot.title,
      analyzedAt,
      ruleSetVersion: result.ruleSetVersion,
      profileId: ruleSettings.profileId,
      snapshot,
      result,
    });

    void applyRetention(); // best-effort, never blocks the response

    return analyzeSuccess(
      { id: auditId, url: snapshot.url, title: snapshot.title, analyzedAt },
      {
        total: result.score.total,
        label: result.score.label,
        capReason: result.score.capReason,
      },
      countSeverities(result.findings),
    );
  } catch (error) {
    console.error('[vittix] analysis/persistence failed', error);
    return analyzeFailure('ERR_ANALYSIS_FAILED', 'Analysis or persistence failed.');
  }
}

async function applyRetention(): Promise<void> {
  try {
    await pruneAudits(await getSettings());
  } catch (error) {
    console.warn('[vittix] retention cleanup failed', error);
  }
}

async function showAuditHighlights(auditId: number): Promise<{ ok: boolean; message: string }> {
  const audit = await getAudit(auditId);
  if (!audit) return { ok: false, message: 'Saved audit not found — re-analyze this page.' };
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    return { ok: false, message: 'Open the popup on the page to use Show on page.' };
  }
  const locators = [...audit.snapshot.headings, ...audit.snapshot.images, ...audit.snapshot.links]
    .map((entry) => entry.locator)
    .filter((locator) => locator !== null)
    .slice(0, 50);
  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: highlightOnPage,
      args: [locators],
    });
    return {
      ok: true,
      message: 'Highlights shown on the page. Dismiss the page notice to clear them.',
    };
  } catch {
    return { ok: false, message: 'Open the popup on the page to use Show on page.' };
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
