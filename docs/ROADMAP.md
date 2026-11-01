# Roadmap

## Phase D Part 1 — localhost/dev-origin support

- Added optional site-audit origins for `http://localhost/*` and
  `http://127.0.0.1/*` only. Chrome host patterns ignore ports.
- Marked loopback audits as development origins and softened HTTPS/mixed-
  content findings to informational without changing the selected profile.
- Side panel remains gated on runtime permission behavior; no install-time
  permission has been added.

## Phase C status update (2026-11-01)

Phase C part 1 and the requested part 2 features cover response metadata,
sitemap discovery, bounded duplicate similarity heuristics, an internal link
graph, and stored site-audit regressions. Browser-follow redirect behavior
means the crawler cannot guarantee that each network request stays on the
approved origin. It checks the final response destination after Fetch returns.
A redirect on the audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. For localhost or 127.0.0.1 audits, a redirect can reach another local-network service.

## Snapshot schema v5 (Phase A follow-up, 2026-11-01)

- Added defaulted `textSummary.syllableCount` and `textSummary.leadText` for
  stored v1–v4 compatibility.
- The lead excerpt is the first 100 visible words, whitespace-normalized and
  capped at 800 characters. It is local IndexedDB data and is excluded from
  JSON/CSV exports unless the user opts into the JSON excerpt checkbox.
- Both live-DOM and fetched-HTML extractors apply the existing hidden-element
  checks. Injector helper parity is guarded against the pure `seo-core`
  implementation.

## Phase 0 — Foundation (DONE, 2026-10-30)

Monorepo, extension shell (popup/dashboard/options/background), analysis
vertical slice (16 rules, preliminary scoring), local history, JSON/CSV
export, full toolchain (lint/typecheck/unit/e2e/CI), docs, manifest audits.

## Phase 1 — Rule depth & UX polish (DONE, 2026-10-31)

Delivered against the Phase 1 plan:

- **Snapshot schema v2**: titleCount, descriptions[], canonicals[],
  links[].accessibleName, twitter:* fields, structuredData[] (+ legacy v1
  readability), truncation flag (`result.truncated`)
- **Rule set v0.2.0 (27 rules)**: title duplication, multiple meta
  descriptions, canonical validation (relative/duplicates/conflicts/scheme),
  robots `noindex`/`nofollow`, OG image, twitter:card, JSON-LD presence +
  JSON syntax validation, aria-label & image-alt accessible names, `alt=""`
  treated as decorative (info), alt-quality heuristics, noindex-aware
  `remediation` hints on every actionable finding
- **Scoring integrity**: info/pass never penalize, per-ruleId dedup,
  documented formula, regression tests
- **Dashboard**: findings grouped by category with search + severity/category
  filters, remediation display, history search, same-URL audit comparison
  (score/severity deltas, resolved vs. new rules)
- **Keyboard command** `Ctrl+Shift+U` (grants activeTab like a toolbar click)
  - score badge feedback
- **Real-flow E2E**: production pipeline verified end-to-end via a test-only
  build variant (see TESTING.md); 6 Playwright tests total

Not done in Phase 1 (carried to Phase 2): aria-labelledby resolution,
configurable scoring profiles, history summary CSV, i18n groundwork.

## Phase 2 — Extraction accuracy & release hardening (DONE, 2026-10-31)

- **Snapshot schema v3**: hreflang[]/hreflangCount, robotsValues[],
  per-collection `omitted` counts, per-collection `hidden` counts, inline-SVG
  accessibility stats — all defaulted for v1/v2 record readability
- **Extraction accuracy**: aria-labelledby resolution (multiple IDREFs),
  hidden-content exclusion (`[hidden]`, `aria-hidden` ancestors, inline
  `display:none`/`visibility:hidden`) with counts, svg-title accessible
  names, per-cap omitted reporting
- **Rule set v0.3.0 (34 rules)**: lang-format, viewport-responsive,
  hreflang-syntax/-duplicates/-consistency, internal-link-quality,
  structured-data-context, robots reconciliation across duplicate tags
- **SPA support**: live DOM is ground truth at click time; popup Re-analyze
  action; no persistent scripts, no monitoring
- **Scoring/history stability**: cross-rule-set-version comparison guard in
  the dashboard, migration/compatibility tests for stored v1/v2/v3 records
- **Release hardening**: dependency audit clean for production deps, bundle
  network-surface reviewed, truncation banner + compare explanations in UI

## Phase 3 — Site audit foundation (DONE, 2026-10-31)

Delivered (threat model: [SITE_AUDIT.md](SITE_AUDIT.md)):

- **Opt-in site mode**: one user-approved origin per session via
  `chrome.permissions.request` (revocable); `optional_host_permissions` is a
  grant CATALOG only — install-time permissions unchanged
  (`activeTab` + `scripting`), enforced by CI manifest audit
- **Safe crawler MVP**: dashboard-run paced loop (concurrency ≤3, min
  interval + Crawl-delay), same-origin URL discovery, followed redirects
  checked after fetch, GET-only with
  `credentials: "omit"`, robots.txt `*`-group honored (4xx allow / 5xx
  block, RFC 9309), cross-origin redirects recorded-not-parsed, hard page
  cap (default 20, max 50), BFS depth ≤2, URL normalization + dedup
- **Durable crawl state**: Dexie v2 (`siteAudits`/`sitePages` tables),
  cancellation between requests, resume of pending pages after tab close
- **Site reporting**: audited/failed/skipped counts, error/warning totals,
  duplicate titles/descriptions, missing canonical, noindex warnings,
  internal/external link summary, incomplete-audit indicators
- **Dashboard**: Site Audits section (consent + scope confirmation, start/
  cancel/resume/discard, progress, page table with filter, site JSON/CSV
  export, clear site data)

Known limitations (documented, not hidden): crawl runs while the dashboard
tab is open (no background crawling claim); stylesheet-driven hiding not
detected in fetched HTML; robots parsing covers the `*` group only; resume
behavior is implemented but not E2E-verified.

## Phase 4 — Hardening & reporting (DONE, 2026-10-31)

- **Crawler reliability**: per-fetch origin-permission gate (revocation
  cancels immediately, fail closed), robots.txt cross-origin redirects
  block the audit, storage failures fail closed with durable stop reasons,
  idempotent resume with accurate persisted counters
- **Security**: embedded-credential URL rejection, OWASP CSV
  formula-injection guard on all spreadsheet exports
- **Site reporting**: missing title/description summaries, verified
  broken-link candidates (crawl-failure × inbound-link intersection),
  evidence-gated orphan analysis (null = unchecked, never "none"),
  score/error distributions, completeness indicators
- **Exports**: history-summary CSV, site pages CSV, site-summary JSON,
  version-gated site-audit comparison
- **Dashboard**: permission status display, stop-reason alerts, comparison
  explanations, distribution cards, DetailList subtitles clarifying
  verified/candidate/unchecked semantics

## RC closure & hardening (DONE, 2026-11-01)

Post–Phase 4 release-candidate work executed in multiple increments (the
commit history is the authoritative record):

- **Data integrity**: site counters derived from persisted records,
  discovery-write failures fail the session (URLs never silently lost),
  fault-injection tests for transaction aborts / quota errors /
  cancellation, page-cap deadlock fix, stale-dashboard fix + regression
- **Extraction accuracy**: aria-labelled accessible names, non-HTTP links
  in an `other` bucket, `content-length` thin-content rule, pixel-width
  estimation rules, `textSampleTruncated` completeness flag
- **Scoring v0.4.0**: social warn severity, blocking-issue score cap
  (`Score.capReason`), ratio-scaled penalties
- **robots.txt per RFC 9309**: grouped user-agents, VittixBot token
  selection, wildcards/anchors, percent-encoding normalization, Sitemap
  collection (same-origin filtered by the crawler)
- **Limits single-sourcing**: `SNAPSHOT_LIMITS` drives both extractors via
  a shared `EXTRACTOR_LIMITS` constant with a parity test
- **Release packaging**: THIRD_PARTY_NOTICES.md generation, privacy policy,
  acceptance worksheet + GUI evidence, store checklist, ZIP packaging
- **Hygiene**: AI session transcript removed from the repo, e2e version
  assertion fixed, docs synced with reality

## Phase B — Reports (completed)

- Local single-audit and site-audit HTML/Markdown reports, JSON and CSV exports
- One accessible export dialog with opt-in page excerpts and target keywords
- Optional locally stored export branding; raster logos only

## Phase C — Power features (proposed)

- Structured data depth: schema.org vocabulary validation, required-property
  checks (clearly scoped — syntax/structure-only today)
- Configurable scoring profiles + rule weights per project
- Stylesheet-aware hidden-content detection; image lazy-loading signals
- Performance & accessibility basics (Core Web Vitals pass, contrast quick
  checks) — local computation only
- Site mode: E2E-verified interruption/resume, sitemap discovery, per-agent
  robots handling; audit diffing across URLs
- i18n groundwork (extension localization)

## `ai-core` — deferred, entry criteria

A `packages/ai-core` package is **deliberately absent**. It may be introduced
only when ALL of the following are true:

1. A concrete AI feature is approved with a written privacy design
2. All network interaction is strictly opt-in, per-feature, and visible in the
   permissions prompt (no silent calls, ever)
3. Page content transmission, if any, is explicit, user-triggered, documented
   in PRIVACY.md, and reversible (works fully without it)
4. No API keys ship inside the extension; user-supplied keys stay local
5. The default build remains 100% local / zero-network

## Non-goals (standing)

- Telemetry, analytics, accounts, or any background data collection
- Rank tracking / backlink indexes (require servers and data collection)
- Firefox/Edge builds before Chrome parity is reached (WXT makes this cheap
  later)
