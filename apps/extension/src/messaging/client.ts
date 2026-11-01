import { browser } from 'wxt/browser';
import {
  analyzeRequest,
  AnalyzeResponseSchema,
  FRIENDLY_ERROR_MESSAGES,
  SHOW_HIGHLIGHTS_RESPONSE_SCHEMA,
  SHOW_HIGHLIGHTS_MESSAGE_TYPE,
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

/** Ask the background to inject saved locators from the popup's current page. */
export async function requestShowHighlights(auditId: number): Promise<string> {
  try {
    const raw: unknown = await browser.runtime.sendMessage({
      type: SHOW_HIGHLIGHTS_MESSAGE_TYPE,
      auditId,
    });
    const parsed = SHOW_HIGHLIGHTS_RESPONSE_SCHEMA.safeParse(raw);
    return parsed.success ? parsed.data.message : 'Open the popup on the page to use Show on page.';
  } catch {
    return 'Open the popup on the page to use Show on page.';
  }
}

/** Open (and focus) the dashboard in a new tab. */
export async function openDashboard(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
}
