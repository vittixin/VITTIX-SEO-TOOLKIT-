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

## MVP scope (delivered in Phase 0)

| #   | Feature             | Status                                                      |
| --- | ------------------- | ----------------------------------------------------------- |
| 1   | SEO dashboard       | ✅ 9 sections (overview → settings)                         |
| 2   | Metadata analyzer   | ✅ title/description/canonical/viewport/lang/HTTPS/OG rules |
| 3   | Heading analyzer    | ✅ h1 presence & uniqueness, outline order                  |
| 4   | Image analyzer      | ✅ alt-text coverage                                        |
| 5   | Link analyzer       | ✅ internal/external profile, empty anchors, nofollow       |
| 6   | SEO scoring engine  | ✅ deterministic, documented, **preliminary**               |
| 7   | Local audit history | ✅ IndexedDB via Dexie, retention + pruning                 |
| 8   | JSON and CSV export | ✅ full-audit JSON, findings CSV (RFC 4180)                 |

## Out of scope (by design, for now)

- Any network-based feature (rank checks, backlinks, keyword data, AI)
- Persistent site monitoring or scheduled audits
- Accounts, sync, or telemetry of any kind
- `ai-core` package (deferred; see [ROADMAP.md](ROADMAP.md))

## Success criteria for Phase 0

All acceptance criteria in the Phase 0 plan were met: reproducible install,
strict typecheck, lint, 74 unit tests, production MV3 build with exactly the
two approved permissions, 4 Playwright tests (including a real
extraction→validation→analysis pipeline test), and a preserved repository
history.
