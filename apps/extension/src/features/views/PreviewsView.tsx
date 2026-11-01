import { useState } from 'react';
import { AtSign, ImageOff, Monitor, Search, Share2, Smartphone } from 'lucide-react';
import type { PageSnapshot } from '@vittix/shared';
import {
  DESCRIPTION_FONT_SIZE_PX,
  DESCRIPTION_PIXEL_LIMIT_DESKTOP_PX,
  DESCRIPTION_PIXEL_LIMIT_MOBILE_PX,
  TITLE_FONT_SIZE_PX,
  TITLE_PIXEL_LIMIT_PX,
  estimateTextWidth,
} from '@vittix/seo-core';
import { EmptyState } from '@/src/components/EmptyState';
import type { AuditRecord } from '@vittix/shared';

type WidthStatus = 'within' | 'near' | 'over';

interface WidthInfo {
  chars: number;
  pixels: number;
  budget: number;
  status: WidthStatus;
  overBy: number;
}

function widthInfo(text: string, fontPx: number, budget: number): WidthInfo {
  const pixels = estimateTextWidth(text, fontPx);
  const status: WidthStatus = pixels > budget ? 'over' : pixels > budget * 0.9 ? 'near' : 'within';
  return { chars: text.length, pixels, budget, status, overBy: Math.max(0, pixels - budget) };
}

function truncateToPixels(text: string, fontPx: number, budget: number): string {
  if (estimateTextWidth(text, fontPx) <= budget) return text;
  let cut = text.length;
  while (cut > 1 && estimateTextWidth(`${text.slice(0, cut)}…`, fontPx) > budget) cut -= 1;
  return `${text.slice(0, cut)}…`;
}

/**
 * Status pill for a field: text + icon so color is never the only signal.
 */
function WidthPill({ info, label }: { info: WidthInfo; label: string }) {
  const styles = {
    within: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    near: 'bg-amber-50 text-amber-700 border-amber-200',
    over: 'bg-rose-50 text-rose-700 border-rose-200',
  } as const;
  const icons = {
    within: '✓',
    near: '!',
    over: '✗',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${styles[info.status]}`}
      aria-label={`${label}: ${info.status} — ${info.chars} characters, approximately ${info.pixels} pixels${info.overBy > 0 ? `, ${info.overBy} pixels over the ${info.budget} pixel budget` : ''}`}
    >
      <span aria-hidden>{icons[info.status]}</span>
      {info.chars} chars · ~{info.pixels}px
      {info.status !== 'within' ? ` · ${info.status}` : ''}
    </span>
  );
}

function BreadcrumbUrl({ url, className }: { url: string; className?: string }) {
  let host = url;
  let path = '';
  try {
    const parsed = new URL(url);
    host = parsed.host;
    path = decodeURIComponent(parsed.pathname === '/' ? '' : parsed.pathname);
  } catch {
    // keep raw url
  }
  return (
    <p className={`truncate text-sm text-[#202124] ${className ?? ''}`}>
      {host}
      {path ? (
        <span className="text-[#5f6368]">
          {' '}
          {'›'} {path.replace(/^\//, '').replace(/\//g, ' › ')}
        </span>
      ) : null}
    </p>
  );
}

function SerpMockup({
  snapshot,
  variant,
}: {
  snapshot: PageSnapshot;
  variant: 'desktop' | 'mobile';
}) {
  const titleBudget = TITLE_PIXEL_LIMIT_PX;
  const descriptionBudget =
    variant === 'desktop' ? DESCRIPTION_PIXEL_LIMIT_DESKTOP_PX : DESCRIPTION_PIXEL_LIMIT_MOBILE_PX;
  const title = truncateToPixels(snapshot.title || '(no title)', TITLE_FONT_SIZE_PX, titleBudget);
  const description = truncateToPixels(
    snapshot.meta.description ??
      'No meta description — search engines will generate a snippet from page content.',
    DESCRIPTION_FONT_SIZE_PX,
    descriptionBudget,
  );
  const titleInfo = widthInfo(snapshot.title || '', TITLE_FONT_SIZE_PX, titleBudget);
  const descriptionInfo = widthInfo(
    snapshot.meta.description ?? '',
    DESCRIPTION_FONT_SIZE_PX,
    descriptionBudget,
  );
  const width = variant === 'desktop' ? 600 : 400;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {variant === 'desktop' ? (
          <Monitor className="size-4 text-slate-500" aria-hidden />
        ) : (
          <Smartphone className="size-4 text-slate-500" aria-hidden />
        )}
        <h4 className="text-sm font-semibold capitalize text-slate-900">{variant} result</h4>
        <span className="text-xs text-slate-400">≈{width}px viewport</span>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4" style={{ maxWidth: width }}>
        <BreadcrumbUrl url={snapshot.url} />
        <p className="mt-1 truncate text-xl text-[#1a0dab]" title={snapshot.title}>
          {title}
        </p>
        <p className="mt-1 text-sm leading-snug text-[#4d5156]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <WidthPill info={titleInfo} label="Title" />
        <WidthPill info={descriptionInfo} label="Meta description" />
      </div>
    </div>
  );
}

function SocialCard({
  kind,
  siteName,
  title,
  description,
  imageUrl,
  cardType,
}: {
  kind: 'facebook' | 'x';
  siteName: string;
  title: string;
  description: string;
  imageUrl: string | null;
  cardType: string;
}) {
  const isFacebook = kind === 'facebook';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isFacebook ? (
          <Share2 className="size-4 text-slate-500" aria-hidden />
        ) : (
          <AtSign className="size-4 text-slate-500" aria-hidden />
        )}
        <h4 className="text-sm font-semibold text-slate-900">
          {isFacebook ? 'Facebook / LinkedIn card' : `X card (${cardType || 'summary — default'})`}
        </h4>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Privacy: the og:image is deliberately NOT loaded — see note below. */}
        <div className="flex aspect-video items-center justify-center bg-slate-100">
          {imageUrl ? (
            <div className="flex items-center gap-2 px-4 text-center">
              <ImageOff className="size-5 shrink-0 text-slate-400" aria-hidden />
              <span className="break-all font-mono text-xs text-slate-500">{imageUrl}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">No image declared</span>
          )}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">{siteName}</p>
          <p className="truncate text-sm font-semibold text-slate-900" title={title}>
            {title || '(no title)'}
          </p>
          <p className="line-clamp-2 text-sm text-slate-600">{description || '(no description)'}</p>
        </div>
      </div>
    </div>
  );
}

export function PreviewsView({ audit }: { audit: AuditRecord | null }) {
  const [tab, setTab] = useState<'desktop' | 'mobile'>('desktop');

  if (!audit) {
    return (
      <EmptyState icon={Search} title="Nothing to preview yet">
        <p>
          Run an analysis from the popup first — result and social previews will be rendered from
          the captured metadata.
        </p>
      </EmptyState>
    );
  }

  const snapshot = audit.snapshot;
  let socialDomain = snapshot.url;
  try {
    socialDomain = new URL(snapshot.url).host;
  } catch {
    // keep raw url
  }

  return (
    <div className="space-y-6">
      <section aria-label="Search result previews" className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Search result previews</h3>
          <div
            className="flex rounded-lg border border-slate-300 bg-white p-0.5"
            role="tablist"
            aria-label="Preview device"
          >
            {(['desktop', 'mobile'] as const).map((variant) => (
              <button
                key={variant}
                type="button"
                role="tab"
                aria-selected={tab === variant}
                onClick={() => setTab(variant)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                  tab === variant ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {variant}
              </button>
            ))}
          </div>
        </div>

        <p
          data-testid="previews-estimate-note"
          className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
        >
          Estimate — Google may rewrite titles and snippets. Widths are approximations from a static
          character table (±10–15%), not measured rendering.
        </p>

        <SerpMockup snapshot={snapshot} variant={tab} />
      </section>

      <section aria-label="Social share previews" className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Social share previews</h3>
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
          Images are never loaded by Vittix (privacy): the declared image URL is shown as text
          instead. What you see is the metadata social platforms receive.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <SocialCard
            kind="facebook"
            siteName={snapshot.meta.ogSiteName ?? socialDomain}
            title={(snapshot.meta.ogTitle ?? snapshot.title) || '(no title)'}
            description={snapshot.meta.ogDescription ?? snapshot.meta.description ?? ''}
            imageUrl={snapshot.meta.ogImage}
            cardType="og"
          />
          <SocialCard
            kind="x"
            siteName={socialDomain}
            title={
              (snapshot.meta.twitterTitle ?? snapshot.meta.ogTitle ?? snapshot.title) ||
              '(no title)'
            }
            description={
              snapshot.meta.twitterDescription ??
              snapshot.meta.ogDescription ??
              snapshot.meta.description ??
              ''
            }
            imageUrl={snapshot.meta.twitterImage ?? snapshot.meta.ogImage}
            cardType={snapshot.meta.twitterCard ?? ''}
          />
        </div>
      </section>
    </div>
  );
}
