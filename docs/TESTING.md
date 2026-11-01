# Testing

## Layers

| Layer                | Runner        | Location                                                         |
| -------------------- | ------------- | ---------------------------------------------------------------- |
| Schema/unit tests    | Vitest (node) | `packages/*/src/**/*.test.ts`, `apps/extension/src/**/*.test.ts` |
| E2E smoke + pipeline | Playwright    | `e2e/`                                                           |
| Manifest audit       | Node script   | `scripts/verify-manifest.mjs`                                    |

## Unit tests (Vitest 5)

207 tests covering:

- **shared**: snapshot schema v5 accept/reject paths (schema versions 1–5
  incl. legacy readability, caps, invalid tags, null-vs-empty alt, omitted/
  hidden/svg defaults), settings validation, message contracts (discriminated
  union, error codes, friendly messages), severity counting
- **seo-core**: all 34 rules across healthy/broken/edge fixtures
  (metadata incl. duplicates, canonical conflicts, lang format, viewport
  responsiveness, robots reconciliation; hreflang syntax/duplicates/
  consistency; headings; images incl. decorative alt & quality heuristics;
  links incl. accessible names & generic-anchor quality; structured data
  incl. invalid JSON, @graph, @context/@type structure), scoring math
  (penalties, floors, weights, labels, info-not-penalized, per-ruleId dedup,
  determinism, REGRESSION cases), truncation detection, CSV escaping
  (RFC 4180 + OWASP formula-injection guard), history-summary CSV, site
  pages CSV and JSON round-trip
- **extension**: URL guard accept/reject matrix (chrome://, extension pages,
  file://, view-source, embedded user:pass credentials), stored-record
  migration/compatibility tests (v1/v2 records accept v3 defaults, future
  versions rejected, malformed rows skipped, truncated rows flagged), AND
  the site-audit security suite: SSRF/private-network origin boundary
  (loopback, link-local, private ranges, IPv4/IPv6 literals,
  `.local`/`.internal`), URL normalization and dedup, robots.txt parsing
  (longest-match, Allow-wins-ties, Crawl-delay, comments), paced-runner
  concurrency/stop, and crawler behavior with mocked fetch/storage (robots
  block/disallow/off-origin-redirect, cross-origin redirects, non-HTML,
  auth failures, page caps, cancellation, network errors, permission
  revocation before and mid-audit, storage-failure fail-closed, idempotent
  resume with accurate counters) plus site-summary reporting tests
  (missing fields, verified broken-link candidates, evidence-gated orphan
  analysis, score/error distributions, incomplete markers)

Run: `pnpm test` · Watch: `pnpm test:watch`

## E2E tests (Playwright 1.64)

Seven tests, each with a fresh browser profile (clean IndexedDB):

1. **Popup smoke** — popup renders; clicking Analyze on a chrome-extension://
   page produces the friendly unsupported-page error (guard + error UI)
2. **Dashboard smoke** — sidebar renders, empty overview state, navigation
   through all nine sections
3. **Options smoke** — settings render, two-step clear-all-data flow,
   privacy information present
4. **Pipeline** — the **real** `extractPageSnapshot` runs inside a **real**
   rendered fixture page (served via route interception, no network); the
   result must validate against `PageSnapshotSchema` and produce correct
   v3 findings: aria-labelledby resolution, hidden-element exclusion +
   counts (`[hidden]`, `aria-hidden` ancestor, `display:none`), hreflang
   extraction incl. malformed/duplicate codes, inline-SVG stats, generic
   internal anchors, JSON-LD structural warning, and remediation present on
   every actionable finding
5. **Real flow** — the full production pipeline: analyze message → URL guard
   → real `chrome.scripting` injection on a real page → Zod validation →
   seo-core analysis → Dexie persistence → dashboard rendering → **real
   JSON/CSV file downloads** verified byte-for-byte
6. **Keyboard command** — the `analyze-page` command is registered and bound
7. **Site audit** — the REAL opt-in site-mode flow: consent prompt
   (auto-accepted via Chromium's `--use-fake-ui-for-permission-flow` test
   switch), real paced crawl of routed fixture pages, robots.txt honored
   (`/b` skipped), cross-origin link never fetched, 403 recorded as
   failed-auth, site summary rendered, filterable URL list, real site
   JSON/CSV downloads. Cancellation, caps and rate limiting are covered by
   the crawler unit tests (mocked fetch/storage); resume-after-tab-close is
   implemented but only manually verifiable — NOT claimed as tested.

### The E2E build variant (test-only)

MV3 toolbar clicks and keyboard accelerators cannot be synthesized by
automation (CDP keystrokes never reach Chrome's command dispatcher), so test 5
runs against a **test-only build** (`wxt.config.e2e.ts` →
`.output/chrome-mv3-e2e`) that is byte-identical to production except for two
manifest keys: the name gains "(E2E TEST BUILD)" and a host permission is
added for the single fixture origin (`https://fixture.test/*`). The
`chrome.tabs.query` + `chrome.scripting.executeScript` path is then exercised
for real. This artifact is never shipped; `pnpm verify:manifest` and CI audit
only the production build, which keeps exactly `["activeTab", "scripting"]`.
The production messaging path itself is proven by tests 1–3 (runtime message
round-trips against the production build).

### Running e2e

```bash
npx playwright install chromium   # once
pnpm test:e2e                     # builds + runs
```

Browser requirement: Playwright's **full Chromium with new headless**
(`channel: 'chromium'`). The default headless shell has no extension support,
and branded Chrome ignores `--load-extension` since Chrome 137 — see
[DEVELOPMENT.md](DEVELOPMENT.md#gotchas-learned-during-phase-0-read-before-upgrading).

## Manifest audit

`pnpm verify:manifest` (also a CI step) parses
`apps/extension/.output/chrome-mv3/manifest.json` and fails unless:

- `permissions` is exactly `["activeTab", "scripting"]`
- `host_permissions`, `optional_host_permissions`, `optional_permissions`,
  `content_scripts`, `web_accessible_resources` are absent/empty
- any declared CSP excludes `unsafe-eval` and remote sources
- `background.service_worker` exists

## CI (GitHub Actions)

On every push/PR: frozen-lockfile install → lint (ESLint + Prettier) →
typecheck → unit tests → production Chrome build → manifest audit → Playwright
(with Chromium installed per commit) → gitleaks secret scan. See
`.github/workflows/ci.yml`.
