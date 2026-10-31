import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  ANALYZE_REQUEST_SCHEMA,
  PageSnapshotSchema,
  SNAPSHOT_SCHEMA_VERSION,
  analyzeFailure,
  analyzeSuccess,
  countSeverities,
  type AnalyzeResponse,
} from '@vittix/shared';
import { analyzeSnapshot } from '@vittix/seo-core';
import { extractPageSnapshot, type ExtractorLimits } from '@/src/extraction/snapshot-inject';
import { isAnalyzableUrl } from '@/src/extraction/guards';
import { pruneAudits, saveAudit } from '@/src/storage/audits';
import { getSettings } from '@/src/storage/settings';

const LIMITS: ExtractorLimits = {
  headings: 300,
  images: 500,
  links: 500,
  textSampleChars: 100_000,
  textField: 300,
};

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
      args: [LIMITS],
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
    const result = analyzeSnapshot(snapshot);
    const analyzedAt = new Date().toISOString();
    auditId = await saveAudit({
      url: snapshot.url,
      title: snapshot.title,
      analyzedAt,
      ruleSetVersion: result.ruleSetVersion,
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

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
