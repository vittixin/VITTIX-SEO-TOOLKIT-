import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Globe,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { FRIENDLY_ERROR_MESSAGES, type AnalyzeSuccess, type ErrorCode } from '@vittix/shared';
import { ScoreRing } from '@/src/components/ScoreRing';
import { isAnalyzableUrl, pageHost } from '@/src/extraction/guards';
import { formatDate } from '@/src/lib/format';
import {
  openDashboard,
  requestAnalyzeActiveTab,
  requestShowHighlights,
} from '@/src/messaging/client';

type Status = 'idle' | 'analyzing' | 'done' | 'error';

export function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [host, setHost] = useState<string | null>(null);
  const [success, setSuccess] = useState<AnalyzeSuccess | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [highlightMessage, setHighlightMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? '';
      setHost(isAnalyzableUrl(url) ? pageHost(url) : null);
    })();
  }, []);

  async function handleAnalyze() {
    setStatus('analyzing');
    setErrorMessage(null);
    setErrorCode(null);
    const response = await requestAnalyzeActiveTab();
    if (response.ok) {
      setSuccess(response);
      setStatus('done');
    } else {
      // Show the friendly message; the raw detail stays in the background log.
      setErrorMessage(FRIENDLY_ERROR_MESSAGES[response.error.code]);
      setErrorCode(response.error.code);
      setStatus('error');
    }
  }

  async function handleShowOnPage() {
    if (!success) return;
    setHighlightMessage(await requestShowHighlights(success.auditId));
  }

  return (
    <div className="w-[380px] bg-slate-50 text-slate-900">
      <header className="flex items-center gap-3 bg-slate-900 px-4 py-3 text-white">
        <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-lg font-black">
          V
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Vittix SEO Toolkit</h1>
          <p className="text-xs text-slate-400">Local-only page audits</p>
        </div>
      </header>

      <main className="space-y-4 p-4">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
          <Globe className="size-4 shrink-0 text-slate-400" aria-hidden />
          {host ? (
            <span className="truncate font-medium text-slate-700">{host}</span>
          ) : (
            <span className="text-slate-400">No analyzable web page in this tab</span>
          )}
        </div>

        <button
          type="button"
          data-testid="analyze-button"
          onClick={() => void handleAnalyze()}
          disabled={status === 'analyzing'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'analyzing' ? (
            <>
              <RefreshCw className="size-4 animate-spin" aria-hidden /> Inspecting page…
            </>
          ) : status === 'done' ? (
            <>Re-analyze Page</>
          ) : (
            <>Analyze Current Page</>
          )}
        </button>

        {status === 'error' && errorMessage ? (
          <div
            data-testid="analysis-error"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{errorMessage}</p>
            </div>
            {errorCode ? (
              <p className="mt-1 pl-6 font-mono text-[11px] text-rose-400">{errorCode}</p>
            ) : null}
          </div>
        ) : null}

        {status === 'done' ? (
          <button
            type="button"
            onClick={() => void handleShowOnPage()}
            className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            aria-label="Show analyzed elements on the page"
          >
            Show on page
          </button>
        ) : null}
        {highlightMessage ? (
          <p role="status" className="text-xs text-slate-600">
            {highlightMessage}
          </p>
        ) : null}

        {status === 'done' && success ? (
          <div
            data-testid="analysis-summary"
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-center">
              <ScoreRing score={success.score.total} size={112} />
            </div>
            <p className="text-center text-sm">
              <span className="font-semibold">{success.score.label}</span>
              <span className="text-slate-400"> · </span>
              <span className="text-slate-500">preliminary score</span>
            </p>
            {success.score.capReason ? (
              <p
                data-testid="score-cap-reason"
                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs leading-relaxed text-rose-800"
              >
                {success.score.capReason}
              </p>
            ) : null}
            <p className="truncate text-center text-xs text-slate-400" title={success.url}>
              {pageHost(success.url) ?? success.url} · {formatDate(success.analyzedAt)}
            </p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-md bg-rose-50 py-1.5">
                <div className="text-sm font-bold text-rose-600 tabular-nums">
                  {success.counts.error}
                </div>
                <div className="text-rose-500">Errors</div>
              </div>
              <div className="rounded-md bg-amber-50 py-1.5">
                <div className="text-sm font-bold text-amber-600 tabular-nums">
                  {success.counts.warn}
                </div>
                <div className="text-amber-600">Warnings</div>
              </div>
              <div className="rounded-md bg-sky-50 py-1.5">
                <div className="text-sm font-bold text-sky-600 tabular-nums">
                  {success.counts.info}
                </div>
                <div className="text-sky-600">Info</div>
              </div>
              <div className="rounded-md bg-emerald-50 py-1.5">
                <div className="text-sm font-bold text-emerald-600 tabular-nums">
                  {success.counts.pass}
                </div>
                <div className="text-emerald-600">Passed</div>
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          data-testid="open-dashboard"
          onClick={() => void openDashboard()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
        >
          <LayoutDashboard className="size-4" aria-hidden /> Open Dashboard
          <ExternalLink className="size-3.5 text-slate-400" aria-hidden />
        </button>
      </main>

      <footer className="flex items-center justify-center gap-1.5 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-400">
        <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />
        100% local analysis · No data leaves your browser
      </footer>
    </div>
  );
}
