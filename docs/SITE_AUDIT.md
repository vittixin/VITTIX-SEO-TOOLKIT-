# Site Audit — Architecture and Threat Model (Phase 3)

Site mode is **opt-in**. Single-page auditing remains the default and the
only mode that works without any grant. This document defines the trust
boundary first; the implementation must satisfy it ( deviations are
blockers, not config options).

## Trust boundary summary

| Property                          | Single-page mode (default)           | Site mode (opt-in)                                                               |
| --------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Network requests by the extension | **zero**                             | **only to the approved origin** (page fetches + that origin's `/robots.txt`)     |
| Permissions granted at install    | `activeTab`, `scripting`             | unchanged                                                                        |
| Additional grants                 | none                                 | one exact origin, requested at runtime (`chrome.permissions.request`), revocable |
| Where the crawl runs              | background service worker (one-shot) | **the dashboard page** (must stay open)                                          |
| Durable state                     | audits table                         | site sessions + pages tables (IndexedDB)                                         |

## Permission request and revocation lifecycle

1. The user opens _Site Audits_, enters or confirms an origin.
2. The extension validates the origin (see SSRF boundaries below) and calls
   `chrome.permissions.request({ origins: ["https://<host>/*"] })` — one
   exact pattern, no wildcards across sites.
3. Chrome shows the native prompt; nothing is fetched unless it is accepted.
4. The grant is **scoped**: fetches and discovery are restricted to that
   origin for the lifetime of the audit session (and any later session for
   the same origin, until revoked).
5. Revocation: Chrome's extension details (_Remove permission_), plus the
   UI offers `chrome.permissions.remove` for the granted origin. A session
   started without the still-valid grant fails fast with a clear error.
6. Manifest implications: `optional_host_permissions: ["https://*/*"]` is
   declared so arbitrary user-entered origins can be requested. This is a
   **catalog of grantable patterns, not a grant** — the install-time
   permission warning surface does not change, `host_permissions` stays
   absent, and `permissions` stays exactly `["activeTab","scripting"]`.
   CI (`verify:manifest`) enforces that `optional_host_permissions` never
   exceeds this single entry.

## Per-origin consent model

- One origin per audit session; the confirmed origin is displayed at all
  times while the crawl runs.
- Changing the target requires finishing/cancelling the current session and
  a new permission prompt for the new origin.
- Consent covers `http(s)` pages of that origin only; subdomains are
  **different origins** (documented; no wildcard subdomain requests).

## URL normalization and deduplication

- Discovery candidates are normalized before enqueueing: lowercase scheme
  and host, drop the fragment, drop default ports (:80/:443), remove
  trailing slash outside the root path.
- The normalized URL is the dedup key; each URL is fetched at most once per
  session. A URL discovered again is recorded as `skipped-duplicate`.

## Same-origin restrictions

- Only URLs whose scheme+host+port equal the approved origin are enqueued.
- Redirects are followed by the browser, but the **final URL** is checked:
  a redirect that leaves the origin is recorded (`skipped-external-redirect`)
  and its content is not parsed.
- Sub-origin links (`cdn.example.com`, other schemes) are recorded in the
  internal-link summary but never fetched.

## Page-count, depth and size limits

| Limit                        | Default         | Hard cap                                          |
| ---------------------------- | --------------- | ------------------------------------------------- |
| Pages per audit              | 20              | 50 (user-configurable up to the cap)              |
| Discovery depth (BFS)        | 2               | 2                                                 |
| Concurrent fetches           | 2               | 3                                                 |
| Delay between request starts | 250 ms          | user-configurable, ≥100 ms                        |
| Response size parsed         | first 2 MB      | 2 MB (larger bodies are truncated before parsing) |
| Stored page results          | = pages audited | bounded by the page cap                           |

## Rate limiting and concurrency

- A semaphore caps in-flight fetches at the configured concurrency.
- A minimum interval between request starts (plus any robots.txt
  `Crawl-delay`, whichever is larger) is enforced in the crawler loop.
- No parallel burst behavior: requests are paced from a single loop.

## Redirect behavior

- In the E2E Chromium extension-page probe, a 302 requested with
  `redirect: "manual"` produced `type: "opaqueredirect"`, `status: 0`, and
  no readable `Location` header. The crawler therefore uses manual redirect
  mode, records an opaque redirect observation, and does **not** follow it.
  It cannot truthfully report a final URL or hop status in this browser. The
  page is marked failed with an explicit observation-unavailable reason.
  This deliberately sacrifices redirect traversal to ensure the browser
  never fetches an unchecked cross-origin redirect target.
- Redirect metadata can still be recorded when a browser exposes a basic
  same-origin redirect response: up to 10 hops, each path is rechecked against
  robots, the exact origin permission is rechecked, the request is paced, and
  cross-origin destinations are recorded but never fetched.

### Response-header readability probe

Verified with `e2e/siteaudit.spec.ts` on Chromium 2026-11-01. The probe
fetches a routed local fixture from the extension dashboard after granting
that exact fixture origin. It returns a normal `basic` 200 response. The
following response headers were readable through `Response.headers.get()`:

| Header                                                      | Readable in extension page |
| ----------------------------------------------------------- | -------------------------- |
| `content-type`                                              | yes                        |
| `content-length`                                            | yes                        |
| `x-robots-tag`                                              | yes                        |
| `cache-control`                                             | yes                        |
| `content-encoding`                                          | yes                        |
| `strict-transport-security`                                 | yes                        |
| `content-security-policy`                                   | yes                        |
| `x-content-type-options`                                    | yes                        |
| `referrer-policy`                                           | yes                        |
| `x-frame-options`                                           | yes                        |
| redirect `Location` when manual redirect response is opaque | **no**                     |

The fixture did not set `Access-Control-Expose-Headers`; the custom headers
were readable through the granted host permission. Header values are
treated as untrusted text, truncated before persistence, and escaped in
reports and the UI. Only presence flags are retained for security-header
families.

## Authentication and private-site protections

- All fetches use `credentials: "omit"`: **no cookies, no Authorization
  headers, no tokens** are attached, so the extension never presents
  credentials it did not explicitly receive in the page HTML itself.
- The crawler never submits forms, never performs state-changing requests
  (GET only), never retries on 401/403 (recorded as `failed-auth` and
  skipped), and never attempts to bypass CAPTCHAs or paywalls.
- Sites behind cookie-based login will typically yield login pages; that is
  the honest outcome and is reported as such.

## Robots.txt policy

- Before the first page fetch, the crawler fetches `<origin>/robots.txt`
  (GET, `credentials: "omit"`).
- Parsed: the `User-agent: *` group's `Disallow:`/`Allow:` prefixes
  (longest-prefix match; `Allow` wins ties) and `Crawl-delay`.
- `4xx` robots.txt → crawling allowed (RFC 9309 behavior), recorded as
  `unreachable`. `5xx`/network failure → the audit is **blocked** for this
  run (conservative).
- Redirects from robots.txt are requested manually. If Chromium returns an
  opaque redirect (status 0 and no readable `Location`), the crawl is blocked
  and the redirect is not followed. A visible 3xx is also blocked rather than
  followed because this environment did not provide a reliable safe target.
- Matching paths are skipped (`skipped-robots`), never fetched.
- Limitations: no per-agent handling beyond `*`, no sitemap consumption,
  no `Site-map`/`Cache-delay` support — documented, not hidden.

## Audit cancellation and resumability

- **Cancel** sets the session status to `cancelled` in IndexedDB; the loop
  checks the flag between every request and stops, leaving completed page
  results intact.
- Because the crawl loop lives in the dashboard page, closing the tab
  **pauses** the audit. Sessions persist (`running` state in IndexedDB) and
  the dashboard offers **Resume** (pending URLs are re-enqueued; completed
  pages are never re-fetched). Unfinished sessions can be discarded.
- No background crawling is claimed: MV3 service workers are unsuitable for
  long-running loops (they are suspended), so the MVP explicitly requires
  the dashboard to stay open. This is a documented product decision, not an
  oversight.

## MV3 service-worker suspension recovery

- The site-audit path does not use the service worker for orchestration.
  The service worker remains exactly what it was in Phases 0–2 (single-page
  analyze message + command). Nothing in site mode depends on worker
  lifetime.

## IndexedDB storage quotas

- Per page we store the snapshot + result (worst case ~100–200 KB); at the
  50-page cap a session is bounded to roughly 10 MB, well within the
  extension-origin quota. Sessions are user-deletable
  (_Clear site-audit data_), and the existing retention settings apply to
  single-page audits only (site sessions are explicit artifacts).

## Privacy disclosures (shown in the UI before consent)

- Site mode performs network requests — unlike single-page mode — but only
  to the origin the user approved, only GET requests, and with credentials
  stripped.
- robots.txt of the approved origin is fetched as part of every audit.
- Page content of the audited pages is stored locally in IndexedDB and
  never transmitted anywhere else. Exports are manual.

## SSRF, localhost and private-network boundaries

Rejected before any permission request or fetch (default-deny list):

- schemes other than `https:` (http is rejected in site mode; single-page
  mode still allows http)
- `localhost`, `*.localhost`, `*.local`, loopback (`127.0.0.0/8`, `::1`),
  link-local (`169.254.0.0/16`, `fe80::/10`), private ranges
  (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), unique-local
  (`fc00::/7`), and any IP-literal host (including `0.0.0.0`)
- hostnames ending in `.internal`

Limitations (documented): the extension filters by hostname string; DNS
resolution and the actual TCP connection are performed by the browser's
network stack, so DNS-level rebinding is outside the extension's control
and equally affects any browser fetch. No proxying of any kind exists.

## Chrome Web Store permission review implications

- Install-time warnings are unchanged (no `host_permissions`, no
  `<all_urls>`, no content scripts).
- `optional_host_permissions: ["https://*/*"]` is the standard pattern for
  runtime, per-origin grants; the store review looks at _usage_ — the
  privacy policy (docs/PRIVACY.md) and this document must state that host
  access is requested one origin at a time, only on user action, with a
  visible purpose (site audit), and revocable.
- Single-purpose justification: site mode serves the same SEO-audit purpose
  as the rest of the tool.

## Non-goals / explicit refusals

- No arbitrary crawling beyond the consented origin.
- No bypassing of authentication, CAPTCHAs, robots directives, or access
  controls.
- No form submission or state-changing requests.
- No collection of passwords, cookies, or authentication tokens.
- No claims of background crawling until interruption/restart behavior is
  actually tested end-to-end.

## Phase 4 hardening additions

- **Per-fetch permission gate**: the origin grant is re-verified via
  `browser.permissions.contains` before the robots fetch and before every
  page fetch. Revocation mid-audit stops the crawl immediately and records
  a durable `stopReason`; pending pages stay pending (recoverable after
  re-grant).
- **robots.txt redirects fail closed**: a robots fetch that redirects
  off-origin blocks the audit instead of being treated as "no rules".
- **Storage failures fail closed**: if crawl state cannot be persisted
  (quota, interrupted transaction), the audit refuses to run unrecorded and
  records the storage error. Counter/page-write failures during the loop
  are warned and swallowed so one bad write cannot crash the run.
- **Idempotent resume**: pages are processed at most once per session
  (pending-on-disk check); the `seen` set is rebuilt from all existing
  records on resume; progress counters continue from their persisted
  values and stay accurate across restarts.
- **Comparison gating**: site-vs-site comparison is only offered when both
  sessions ran on the same rule-set version (`sessionRuleSetVersion` read
  from audited page results; the version is stamped on the session at
  start).
