import { browser } from 'wxt/browser';
import {
  analyzeRequest,
  AnalyzeResponseSchema,
  FRIENDLY_ERROR_MESSAGES,
  type AnalyzeResponse,
} from '@vittix/shared';

/**
 * Ask the background service worker to analyze the active tab.
 * The response is validated at the boundary; anything unexpected becomes a
 * generic failure so the UI always has something to render.
 */
export async function requestAnalyzeActiveTab(): Promise<AnalyzeResponse> {
  let raw: unknown;
  try {
    raw = await browser.runtime.sendMessage(analyzeRequest());
  } catch {
    return {
      ok: false,
      error: { code: 'ERR_ANALYSIS_FAILED', message: FRIENDLY_ERROR_MESSAGES.ERR_ANALYSIS_FAILED },
    };
  }

  const parsed = AnalyzeResponseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return {
    ok: false,
    error: { code: 'ERR_ANALYSIS_FAILED', message: FRIENDLY_ERROR_MESSAGES.ERR_ANALYSIS_FAILED },
  };
}

/** Open (and focus) the dashboard in a new tab. */
export async function openDashboard(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
}
