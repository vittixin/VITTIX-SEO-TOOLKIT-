# Roadmap

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

## Phase 2 — Power features (proposed)

- Site mode: opt-in, clearly scoped multi-page runs with
  `optional_host_permissions` granted per site by the user
- Structured data depth: schema.org vocabulary validation, required-property
  checks (clearly scoped — syntax-only today)
- Configurable scoring profiles + rule weights per project
- aria-labelledby resolution; image lazy-loading signals
- Performance & accessibility basics (Core Web Vitals pass, contrast quick
  checks) — local computation only
- History summary CSV export; audit diffing across different URLs
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
