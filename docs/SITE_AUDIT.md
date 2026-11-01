# Site Audit — Architecture and Threat Model (Phase 3)

Site mode is **opt-in**. Single-page auditing remains the default and the
only mode that works without any grant. This document defines the trust
boundary first; the implementation must satisfy it ( deviations are
blockers, not config options).

## Trust boundary summary

| Property                          | Single-page mode (default)           | Site mode (opt-in)                                                                                        |
| --------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Network requests by the extension | **zero**                             | Starts at the approved origin; browser-follow redirects may issue cross-origin requests before inspection |
| Permissions granted at install    | `activeTab`, `scripting`             | unchanged                                                                                                 |
| Additional grants                 | none                                 | one exact origin, requested at runtime (`chrome.permissions.request`), revocable                          |
| Where the crawl runs              | background service worker (one-shot) | **the dashboard page** (must stay open)                                                                   |
| Durable state                     | audits table                         | site sessions + pages tables (IndexedDB)                                                                  |

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

## Same-origin URL queue

- Only URLs whose scheme+host+port equal the approved origin are enqueued.
- Redirects are browser-followed as described below. This means the strict
  same-origin network property does not hold across redirect destinations.
- Sub-origin links (`cdn.example.com`, other schemes) discovered in page links
  are not enqueued.

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

## Redirect behavior and threat-model change

### Redirect behavior (measured)

Measured in Playwright against the local HTTPS server on distinct ports and
origins. `other.test` and `fixture.test` resolve to loopback only inside the
test browser. The secondary origin's CORS header is present only for the CORS
case. The table below records the first baseline run before the post-response
checks. Its initial robots row was invalid: the fixture had not yet disallowed
`/blocked`. The corrected, post-fix measurement is listed below.

| Redirect target                              | Destination received request? | Extension-page fetch result                                               | Current crawler record                                                  | Rules observed                               |
| -------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| Different origin, permissive CORS            | Yes                           | Resolved, status 200, `redirected=true`, final URL visible                | `skipped-external-redirect`; final URL retained, body not analyzed      | `redirect-present` info                      |
| Different origin, no CORS                    | Yes                           | Rejected with generic `TypeError: Failed to fetch`; final URL unavailable | `failed`; requested URL retained; no response findings                  | No redirect finding in the measured baseline |
| Same origin, intended robots-disallowed path | Yes                           | Resolved, status 200, same-origin final URL visible                       | Baseline fixture did not disallow `/blocked`; not a valid robots result | Not applicable                               |
| `127.0.0.1` on a third port                  | Yes                           | Resolved, status 200, final URL visible                                   | `skipped-external-redirect`; final URL retained, body not analyzed      | `redirect-present` info                      |

The server-side request log is the evidence for whether the destination was
contacted; a rejected Fetch promise does not mean that the server was not
contacted. For no-CORS failures, the crawler cannot truthfully claim it
observed an off-origin redirect because Fetch does not expose the final URL.

After correcting the fixture to return `Disallow: /blocked`, the measured
crawler outcomes are:

| Redirect target                              | Destination received request? | Fetch result                                                | Crawler record after fix                                                     | Rules after fix                                                          |
| -------------------------------------------- | ----------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Different origin, permissive CORS            | Yes                           | Resolved, status 200, final URL visible                     | `skipped-external-redirect`; body discarded; “Redirect target not permitted” | `redirect-present` info                                                  |
| Different origin, no CORS                    | Yes                           | Generic `TypeError: Failed to fetch`; final URL unavailable | `failed`; requested URL retained                                             | `fetch-failed-possible-redirect` info; no claim that a redirect occurred |
| Same origin, `/blocked` disallowed by robots | Yes                           | Resolved, status 200, same-origin final URL visible         | `skipped-robots`; body not stored or analyzed; links not enqueued            | `redirect-present` info only                                             |
| `127.0.0.1` on a third port                  | Yes                           | Resolved, status 200, final URL visible                     | `skipped-external-redirect`; body discarded; “Redirect target not permitted” | `redirect-present` info                                                  |

### Network-layer redirect blocking investigation

Dynamic `declarativeNetRequest` blocking was not adopted. The production
extension's Playwright probe requested this permission at runtime and Chromium
rejected it with `Only permissions specified in the manifest may be
requested.` [Chrome's permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
does not support this permission as an optional permission. Adding it as a required permission would violate the
site-audit-only permission boundary and would affect all extension installs.
Because a permission cannot be granted under the permitted runtime model, a
dynamic rule cannot be installed and its `initiatorDomains` scoping or blocked
fetch error cannot be meaningfully exercised in the shipped extension. No DNR
permission or rules are included. The crawler uses the disclosure and
post-response checks below; it cannot prevent the browser from following a
redirect before those checks.

- The extension-page probe confirmed `redirect: "manual"` produces an opaque
  response (`opaqueredirect`, status 0, no readable `Location`) for a redirect.
  To crawl canonical trailing-slash and scheme redirects, page requests now use
  `redirect: "follow"`. The browser exposes `response.redirected` and
  `response.url`, but not individual hop statuses, chain length, or intermediate
  destinations.
- **Important threat-model limitation:** with `redirect: "follow"`, Chromium
  has already issued the request to the redirect destination before the
  extension can inspect the final URL. Each hop in a chain can issue a request;
  individual hops, status codes, and chain length are not observable. After a
  response is available, the crawler checks the final URL's origin and
  permission, then checks same-origin final URLs against robots before reading
  their bodies. A disallowed or unpermitted final response body is discarded,
  but that does not undo the request already sent.
- Browser redirect-loop/network errors are recorded as failed page fetches.
  The browser controls its own redirect limit; Fetch does not offer a setting
  for a crawler-specific 10-hop limit. The final URL and redirect presence are
  recorded when observable; hop count and temporary/permanent status are not.

A redirect on the audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. For localhost or 127.0.0.1 audits, a redirect can reach another local-network service.

### Response-header readability probe

Verified with `e2e/siteaudit.spec.ts` on Chromium 2026-11-01. The probe
fetches a real local HTTPS server from the extension dashboard after
granting that exact fixture origin. It returns a normal `basic` 200 response.
The following response headers were readable through `Response.headers.get()`:

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

- Site mode performs network requests — unlike single-page mode — with GET
  and credentials stripped. Browser-followed redirect destinations may also
  receive requests before they can be checked.
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

### Development origins

Site audits accept HTTPS origins and, for local development only, the exact
HTTP hosts `localhost` and `127.0.0.1`. Their optional host patterns are
`http://localhost/*` and `http://127.0.0.1/*`; Chrome ignores the port in a
match pattern, so a grant covers that host at all ports. No other HTTP host
or private IP range is accepted. The UI and reports label these as
development origins. The selected scoring profile remains as chosen. HTTPS
and mixed-content findings become informational because HTTP is expected on
these local development servers. Redirect consent also warns that redirects
may reach local-network services.

### Optional side-panel permission probe

| Permission  | Chrome accepted as optional | Evidence                                                                                                                                                                                                                                                                                    |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidePanel` | Yes                         | The Playwright extension build loads with `optional_permissions: ["sidePanel"]`; `chrome.permissions.contains` is false before opt-in, and the runtime request resolves `true` in the permission-flow test. The production manifest verifier allow-lists only this optional API permission. |

The runtime request is issued only from the popup's Enable side panel button.
The panel is user-triggered and does not start analysis automatically.

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

- No arbitrary queue expansion beyond the consented origin; browser-followed
  redirect destinations can receive requests before their final URL is checked.
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

## Sitemap discovery and bounds

Sitemap discovery reads same-origin Sitemap: declarations from robots.txt and falls back to /sitemap.xml. It parses XML in the extension dashboard only; XML parse failures are stored as warnings. Index recursion is capped at depth 2, entries at 50,000, each decompressed sitemap at 10 MB, and aggregate decompressed data at 50 MB. Gzip is decompressed as a stream and stopped at the same caps. Cross-origin sitemap URLs are counted and ignored. Redirects are requested manually and never followed when location is opaque or off-origin. Every sitemap request is GET-only, credential-free, paced, robots-checked, and preceded by an origin permission check. Sitemap URLs are only added to the crawl queue when the operator selects Seed crawl from sitemap; discovery itself is still reported. Partial reads never claim crawled URLs are absent from the sitemap.

## Phase C3/C4 bounded analysis

Duplicate heuristics use only the first 50,000 characters of visible text at crawl time. A normalized text hash identifies exact normalized matches; a 64-bit SimHash over word trigrams uses Hamming distance <= 3 for near-body similarity. Pages below 50 words are skipped for body comparison. Titles and descriptions use token Jaccard >= 0.9. Clusters are deterministic and bounded to 50 pages (O(n^2)); the selected primary is the lexically first URL. A non-primary canonical pointing to that primary is labeled properly consolidated; otherwise the cluster is a warning candidate. Noindex pages are excluded. These are similarity heuristics, not a Google duplicate verdict.

The internal link graph is derived from stored crawled pages, follows final URLs for redirected pages, and caps anchor text at 2,048 characters. Orphan results are unchecked unless the crawl completed and sitemap evidence was fully read. Nodes and edges are available in CSV; edge export is capped at 5,000 with a truncation note. Site comparisons use stored records only and require matching rule-set and profile identifiers. Incomplete/capped audits are labeled partial and never claim removed pages.
