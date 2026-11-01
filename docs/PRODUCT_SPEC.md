# Product Specification

## Vision

Vittix SEO Toolkit is a professional, privacy-first, open-source SEO auditing
extension for Chrome, built for SEO professionals, agencies, website owners and
developers. Every analysis runs locally in the browser; no page content ever
leaves the user's machine.

## Audience

- **SEO professionals** who need quick on-page audits while browsing
- **Agencies** reviewing client pages and exporting findings (JSON/CSV)
- **Website owners** checking basic on-page hygiene without dashboards/accounts
- **Developers** who want an open-source, auditable, dependency-light tool

## Product principles

1. **Privacy-first** — analysis only on explicit user action; zero network calls
2. **Minimal permissions** — `activeTab` + `scripting`, nothing else
3. **Explainable results** — every finding shows what was checked, what was
   found, and why it matters; no black-box scores
4. **Honest scoring** — scores are labeled _preliminary_ and never presented as
   ranking predictions
5. **Local-first data** — history in IndexedDB, user-controlled retention and
   deletion, exports as plain files

## MVP scope (delivered; current state as of rule set v0.4.0)

Rule set: **57 rules** across 7 categories (metadata, headings, images,
links, content, social, technical) — see
[SEO_RULES.md](SEO_RULES.md) for the authoritative list and severities.

| #   | Feature              | Status                                                                                                                  |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | SEO dashboard        | ✅ 10 sections (overview → settings, incl. Site Audits)                                                                 |
| 2   | Metadata analyzer    | ✅ title (chars + pixel width)/description (chars + pixel width)/canonical/viewport/lang/HTTPS/robots/hreflang/OG rules |
| 3   | Heading analyzer     | ✅ h1 presence & uniqueness, outline order                                                                              |
| 4   | Image analyzer       | ✅ alt-text coverage, decorative detection, quality heuristics                                                          |
| 5   | Link analyzer        | ✅ internal/external/other buckets, accessible names, generic anchors, nofollow                                         |
| 6   | Content analyzer     | ✅ thin-content detection (indexability-aware, partial-sample aware)                                                    |
| 7   | Structured data      | ✅ JSON-LD presence, JSON syntax, @context/@type structure                                                              |
| 8   | SEO scoring engine   | ✅ deterministic, documented, **preliminary**, blocking-issue cap + ratio scaling                                       |
| 9   | Local audit history  | ✅ IndexedDB via Dexie, retention + pruning, comparison                                                                 |
| 10  | Export               | ✅ full-audit JSON, findings/history/site CSV (RFC 4180 + formula-injection guard)                                      |
| 11  | Site audits (opt-in) | ✅ multi-page audits of one user-approved origin (robots-aware crawler)                                                 |

## Out of scope (by design, for now)

- Any network-based feature (rank checks, backlinks, keyword data, AI)
- Persistent site monitoring or scheduled audits
- Accounts, sync, or telemetry of any kind
- `ai-core` package (deferred; see [ROADMAP.md](ROADMAP.md))

## Quality bar (current)

- **265 unit tests** (16 files) — schemas, all 57 rules, scoring math,
  migration/compatibility, crawler security, limits parity
- **10 Playwright E2E tests** — popup/dashboard/options smoke, real
  injection pipeline, real-flow persistence + exports, site audit,
  browser-restart recovery, oversized/malformed page robustness
- CI: lint (ESLint + Prettier), strict typecheck (3 workspaces), frozen
  lockfile install, production MV3 build, manifest permission audit
  (exactly `activeTab` + `scripting`), gitleaks secret scanning
