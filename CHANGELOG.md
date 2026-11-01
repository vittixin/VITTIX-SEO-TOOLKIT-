# Changelog

## Unreleased — Phase D Part 1

- Added opt-in site audits for only `http://localhost/*` and
  `http://127.0.0.1/*`; match patterns ignore ports. Development-origin
  badges and informational HTTPS/mixed-content severity are provided without
  switching the chosen scoring profile.
- Added redirect consent wording that loopback redirects may reach local
  network services.
- Snapshot schema v6 adds bounded heading/image/link locators. The popup can
  outline stored elements after an explicit Show on page click; fetched HTML
  keeps locator values empty.
- Added an opt-in side panel behind the optional `sidePanel` permission. The
  panel reuses the popup's user-triggered analyze flow and does not auto-run.

## Unreleased — Phase C redirect observations, duplicate heuristics, link graph, and comparisons

- Page fetches now follow browser redirects, record requested/final URLs, discard off-origin response bodies, and report redirect presence, off-origin destinations, and internal-link hygiene. Individual redirect hops remain unobservable; Chromium may issue a cross-origin destination request before the extension can inspect it.
- Added Dexie v7 redirect outcome fields, v8 bounded duplicate hashes (normalized text hash, 64-bit SimHash, word count), and v9 session-frozen profile/rule settings. Legacy rows validate with defaults.
- Added deterministic duplicate similarity heuristics and an internal link graph with click depth, inbound/outbound counts, anchor diversity, and evidence-gated orphan status. Site reports and CSV include these summaries.
- Site comparisons now gate by rule-set and scoring profile and expose stored-data regressions with incomplete-coverage labeling.
- Rule set bumped to v0.8.0; removed `redirect-chain-long` and `redirect-temporary`, added `redirect-present`, `redirect-off-origin`, and `redirect-in-internal-links`.

### Added — Phase C Part 1 response metadata (rule set v0.6.0)

- Site crawls capture bounded response headers, status, redirects when
  observable, response duration, and body truncation state; single-page audits
  remain header-blind.
- Added site-only response findings, including a blocking X-Robots-Tag noindex
  finding reconciled with meta robots.
- Chromium manual redirects are opaque (`opaqueredirect`, status 0, no
  Location); the crawler stops and records that limitation instead of following
  the redirect.

### Added — Phase C Part 1 sitemap discovery

- Site audits read bounded same-origin sitemap indexes and URL sets, honor
  robots, and compare discovered URLs only when sitemap reading completes.
- Sitemap crawl seeding is opt-in. Parse failures, truncation, duplicates,
  invalid lastmod values, and ignored cross-origin URLs are reported.
- Resume continues the existing durable session without re-analyzing
  completed pages.

All notable changes to the Vittix SEO Toolkit extension. Versions follow the
manifest version; the SEO rule set has its own `RULE_SET_VERSION` documented
in [docs/SEO_RULES.md](docs/SEO_RULES.md).

## Unreleased (0.1.0 hardening)

### Added — Phase B reports

- Local single-audit and site-audit HTML and Markdown reports, plus a unified
  JSON/CSV/HTML/Markdown export dialog.
- Explicit opt-ins for page excerpts and target keywords in reports and JSON.
- Optional local agency branding with validated PNG/JPEG/WebP logos; SVG is
  rejected. Clear-all and retention cleanup remove branding images and orphaned
  keywords.
- Self-contained print-friendly HTML reports with escaped page content and no
  external resources or executable scripts.

### Changed — scoring rework (rule set v0.4.0)

- **Blocking-issue score cap**: an error from a blocking rule (robots
  noindex/none, missing title, missing h1, invalid canonical) now caps the
  total score at **49 ("Poor")** and sets `Score.capReason`, surfaced in the
  popup and dashboard Overview. Previously a noindex page lost only ~1.25
  points from the weight-5 technical category.
- **Ratio-scaled penalties**: count-based rules (`image-alt-present`,
  `image-alt-quality`, `link-anchor-text`, `internal-link-quality`) emit an
  affected/checked ratio; when the affected fraction is below 10% the
  penalty drops one tier (error 25 → 10, warn 10 → 5). One missing alt out
  of 200 images is now a blemish instead of a structural failure.
- **Social severity**: missing `og:title` / `og:image` now **warn**
  (score-affecting); `og:description` and `twitter:card` stay informational.
  The social category previously could never score below 100, giving every
  page 10 free points.
- Weights rebalanced for the new **content** category (metadata 30 → 25,
  images 20 → 15, content +10); weights still sum to 100.
- Schema additions (backward compatible): `Finding.ratio`,
  `Score.capReason`.

### Added

- **content-length rule** (new `content` category): warns below 300 words on
  indexable pages, info when the text sample is truncated (partial count),
  never errors; non-indexable pages skip it.
- **Pixel-width rules**: `title-pixel-width` (~580px budget) and
  `description-pixel-width` (~920px desktop / ~680px mobile) using a static
  per-character width estimate; informational unless the character rule did
  not already warn (no double penalty). The approximation (±10–15%) is
  documented.
- **THIRD_PARTY_NOTICES.md** generation (`pnpm notices`) bundled into the
  release package; public-facing privacy policy
  ([docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md), hosting pending);
  owner acceptance worksheet and GUI evidence screenshots.

### Fixed

- Non-HTTP links (`mailto:`, `tel:`, `sms:`, `javascript:`, `data:`,
  `#fragment`) were counted as **external** (empty host); they now land in
  an `other` bucket excluded from internal/external counts, the nofollow
  tally and the generic-anchor check. A nameless `mailto:` link is still an
  accessibility error. Internal = same host after stripping a leading
  `www.` from both sides; other subdomains are external.
- **robots.txt parser rewritten per RFC 9309**: grouped User-agent lines,
  longest-prefix group selection for the `VittixBot` token (the `*` group
  applies only without a specific match), `*` wildcards and `$` anchors,
  percent-encoding normalization on both pattern and path, path+query
  matching, additive `Sitemap:` collection (same-origin filtered by the
  crawler), Crawl-delay from the matched group.
- **Dashboard staleness**: an audit saved while the dashboard was open no
  longer leaves a stale "No audit yet" Overview — Overview/History re-read
  durable state on navigation (regression-tested).
- Thin-content blind spot: body-text samples hitting the 100 kB extraction
  cap now set `textStats.textSampleTruncated`, marking those audits
  incomplete end-to-end (result → summary → export).
- Page-cap deadlock in the site crawler: the seeded start URL no longer
  counts against `maxPages` before being processed.
- E2E rule-set version assertion updated to 0.4.0 (was left at 0.3.0 by the
  scoring commit).

### Refactored

- `SNAPSHOT_LIMITS` (packages/shared) is the single source of truth for
  extraction limits; `EXTRACTOR_LIMITS` (one place) derives all ten caps
  for both extractors, passed via `executeScript` args — no hardcoded
  5/10-caps remain; parity test added.
- Removal of the AI session transcript from the repository (pattern
  gitignored).

### Tests

360 unit tests (24 files) · 11 Playwright E2E tests. All gates green:
lint, strict typecheck (3 workspaces), frozen-lockfile install, production
MV3 build, manifest permission audit, zero known dependency vulnerabilities.

## 0.1.0 (initial release candidate)

- 37-rule SEO engine across 7 categories, preliminary scoring, popup,
  10-section dashboard, options page, local history, JSON/CSV exports
- Opt-in site audits (per-origin permission, robots-aware crawler)
- Chrome MV3, WXT + React 19 + TypeScript strict, Tailwind CSS 4

## Unreleased � Phase C Part 1

- Added bounded same-origin sitemap discovery and evidence-gated sitemap comparisons to site audits, with optional sitemap crawl seeding.
