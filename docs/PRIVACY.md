# Privacy

**Short version: Vittix SEO Toolkit cannot send your data anywhere — it makes
zero network requests.**

## What is collected

When — and only when — you click _Analyze Current Page_, the extension reads a
bounded snapshot of the current tab: title and head metadata (description,
canonical, robots, viewport, charset, lang, Open Graph, twitter:card), the
first 300 headings, first 500 images (src + alt), first 500 links
(href/text/rel/target), and a capped body-text sample for word, sentence,
keyword and approximate syllable counts. Snapshot v5 also stores the first
100 visible body words (whitespace-normalized, maximum 800 characters) as a
lead excerpt for keyword prominence. Hidden content is excluded using the
extractor's documented hidden-element checks. These fields are stored only
in local IndexedDB. The JSON export omits the excerpt unless you opt in with
the “Include page text excerpt” checkbox; CSV exports never include it.

## What is never collected

- Browsing history (no `history`/`tabs` permission exists to read it)
- Content of other tabs, other windows, or other origins
- Personal data, form input, cookies, credentials
- Anything outside the analyzed page, and nothing outside the click

## Where data lives

- Snapshots, analysis results and settings are stored in the extension's own
  **IndexedDB** on your machine (`vittix-seo` database via Dexie)
- The v5 lead excerpt is page text. It remains local unless you explicitly
  include it in a JSON export.
- No cloud, no sync, no analytics, no telemetry, no crash reporting

## Network activity

**Single-page mode (default): none.** The extension performs no
fetch/XHR/WebSocket requests and loads no remote resources. You can verify
this in DevTools or by inspecting the source.

**Site-audit mode (explicit opt-in): limited, disclosed network activity.**
Only after you approve one exact origin does the extension fetch pages and
that origin's `/robots.txt` — GET requests with `credentials: "omit"` (no
cookies, no tokens), never leaving the approved origin, with robots rules
honored. Fetched page content is stored and analyzed locally; nothing is
transmitted anywhere else. Details: [SITE_AUDIT.md](SITE_AUDIT.md).

## Retention & deletion

- Default retention: **90 days** and **200 audits** (oldest pruned first);
  configurable from _Settings_ (including _Keep forever_)
- _Clear all audit data_ (Settings / Options page) wipes every stored audit
  immediately
- Uninstalling the extension removes the database with the profile

## Exports

JSON/CSV exports are generated in-browser and downloaded only when you click
an export button. What you do with those files is entirely up to you.

## Single-page applications and iframes

- Audits read the **currently rendered DOM** at the moment you click
  Analyze — this works on SPAs, because client-side navigation changes the
  real DOM that gets extracted. There is **no** background monitoring, no
  auto-refresh, and no persistent script; after a client-side navigation,
  use _Re-analyze_ from the popup.
- **Iframes are not analyzed** — extraction targets the top frame of the
  page you invoked it on. Content inside same-origin or cross-origin
  iframes is never read.

## Permissions rationale

- `activeTab`: temporary access to the tab you clicked from, so the URL can be
  read and the page inspected — granted per click, revoked on navigation
- `scripting`: runs the one-shot, read-only extractor in that tab

See [SECURITY.md](SECURITY.md) for the enforcement side (CI manifest checks,
CSP, no remote code).

## Release-candidate verification (Phase 6)

Verified against the final production build (`pnpm build:chrome`, 2026-10-31):

- **Stored page content** (site + single-page mode): title, head metadata,
  headings, image src/alt, link href/text/rel, hreflang, JSON-LD blocks and
  a bounded body-text sample plus a maximum 800-character visible lead
  excerpt — bounded by the caps documented in SEO_RULES.md, stored locally
  in IndexedDB, never transmitted by the extension.
- **Single-page mode network scan**: the only network-capable API in the
  bundle is inside React DOM's internal `<link rel="preload">` helper,
  which the extension never renders — zero requests are made. (Strings
  like `tinyurl.com`/`bit.ly` in the bundle are Dexie/React error-message
  documentation links, never fetched.)
- **Site-mode requests**: only `GET <approved-origin>/…` and
  `GET <approved-origin>/robots.txt`, credentials omitted; enforced by the
  per-fetch origin gate and verified by unit + E2E tests.
- **Permissions**: install-time grants remain exactly `activeTab` +
  `scripting` (CI-verified); `optional_host_permissions` is a grant
  catalog — one exact origin per user approval, revocable, re-verified
  before every site-mode request.
- **Private-network & credential protections**: https-only public origins,
  loopback/link-local/private ranges and IP literals rejected,
  `user:pass@host` URLs rejected — see docs/SITE_AUDIT.md.
