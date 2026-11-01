# Testing

## Layers

| Layer                | Runner        | Location                                                         |
| -------------------- | ------------- | ---------------------------------------------------------------- |
| Schema/unit tests    | Vitest (node) | `packages/*/src/**/*.test.ts`, `apps/extension/src/**/*.test.ts` |
| E2E smoke + pipeline | Playwright    | `e2e/`                                                           |
| Manifest audit       | Node script   | `scripts/verify-manifest.mjs`                                    |

## Unit tests (Vitest 5)

207 tests covering:

- **shared**: snapshot schema v6 accept/reject paths (schema versions 1–6
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

## E2E tests (Playwright)

`pnpm test:e2e` builds both production and test-only packages, then runs the
Playwright suite. The build identity is selected explicitly at each
`loadExtension()` call; omitted arguments mean production.

### Production versus E2E manifest

`wxt.config.e2e.ts` spreads `BASE_MANIFEST`, then changes the extension name
and adds persistent `host_permissions`:

| Manifest field              | Production                          | E2E test build                                                       | Effect                                                                                                                                    |
| --------------------------- | ----------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions`               | `activeTab`, `scripting`            | Same                                                                 | No difference.                                                                                                                            |
| `optional_permissions`      | `sidePanel`                         | Same                                                                 | Runtime side-panel opt-in remains available in both.                                                                                      |
| `host_permissions`          | Absent                              | `https://fixture.test/*`, `http://localhost/*`, `http://127.0.0.1/*` | E2E pages can be scripted and crawled without the production activeTab gesture or runtime host grant. Loopback patterns cover every port. |
| `optional_host_permissions` | `https://*/*`, localhost, 127.0.0.1 | Same                                                                 | No difference in the runtime grant catalog.                                                                                               |
| `name`                      | `Vittix SEO Toolkit`                | Adds `(E2E TEST BUILD)`                                              | Test artifact identification only.                                                                                                        |

The suite has an assertion that these are the only manifest differences. Both
builds retain the same `activeTab`/`scripting` permissions, `sidePanel` optional
permission, commands, code, and UI. The extra E2E host permissions are a
material behavior difference: they make fixture injection and loopback fetches
work without the production user gesture or consent. They are never included
in the production package.

### Tests relying on test-only capabilities

| E2E test(s)                                                                                               | Test-only capability and limitation                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page highlight is bounded...`                                                                            | Uses the E2E build, but calls the highlight function directly from Playwright on the fixture DOM. It tests overlay cleanup and safety, not production `activeTab` authorization.                                                                                      |
| `permission probe...`, `side panel page renders...`, `sidePanel optional permission...`, theme preference | Use the E2E build. The runtime sidePanel probe uses `--use-fake-ui-for-permission-flow`; it proves the API permission is optional/requestable, not production activeTab access from the panel.                                                                        |
| `real message → real injection...`                                                                        | Uses the E2E build and fixture `host_permissions`; this verifies the end-to-end extraction/persistence flow but bypasses production's toolbar-gesture grant.                                                                                                          |
| Site audit tests in `siteaudit.spec.ts` and `siterestart.spec.ts`                                         | Use the E2E loopback/fixture host permissions. `--use-fake-ui-for-permission-flow` auto-accepts runtime prompts; HTTPS tests additionally map fixture hostnames to loopback and ignore the local test certificate. These tests do not prove production permission UX. |
| Manifest parity test                                                                                      | Reads both built manifests and enforces the exact differences above.                                                                                                                                                                                                  |

The remaining popup/dashboard/options smoke, pipeline, keyboard registration,
stale dashboard state, and storage migration tests use the production build.
Direct extension-page navigation is still not equivalent to clicking the
toolbar action: production `activeTab` behavior is separately tested in the
production-parity checks.

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
