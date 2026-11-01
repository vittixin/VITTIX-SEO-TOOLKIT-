# Privacy

**Short version: single-page audits make no network requests. Optional site
audits make local, credential-free GET requests to the approved origin and
may contact redirect destinations before they can be checked.**

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

## Phase B export contents

- **JSON** includes the stored audit or site page records. Page excerpts (`leadText`) and target keywords are removed unless their corresponding export-dialog options are selected.
- **CSV** contains finding rows for a single audit or a site page summary. It does not include page excerpts or target keywords; fields are protected against spreadsheet formula injection.
- **HTML report** and **Markdown** include report summaries and findings. Previews/content statistics are optional. Page excerpts and target keywords are excluded unless explicitly selected. Ignored rules and score cap reasons are identified in reports.
- Agency name, accent color, and an optional raster logo are used only when branding is selected for an export. Branding stays local. SVG logos are rejected; accepted image data is PNG, JPEG, or WebP up to 100 KB.
- History retention pruning removes expired audits and their orphaned target keywords, and clears stored logo image data. “Clear all data” deletes audits, site audit rows, target keywords, and per-origin rule settings, and resets export branding. Retention preferences remain available after clearing.
- Exports are generated in the extension and downloaded through the browser. HTML reports have no remote resources or executable scripts. Page-derived text is escaped before it is rendered in HTML or Markdown.

## Site-audit response metadata

Snapshot v6 stores bounded selector ordinals for visible headings, images,
and links to support the user-triggered page highlight. These locators do not
contain text or attributes; fetched-HTML site audits leave them empty. The
popup uses the stored locators only after the user clicks Show on page, and
does not collect or transmit additional page data.

The optional side panel requests the `sidePanel` permission only when the user
clicks Enable side panel in the popup. Declining leaves the popup and dashboard
available. Opening the panel does not analyze a page; each analysis requires a
separate user click. It uses the same local extraction and storage flow.

Theme preference is stored with local settings and is not exported. The English
message catalog contains static interface strings; page-derived evidence and
rule guidance remain local and untranslated.

Site audits accept HTTPS origins and, for development only, `http://localhost`
or `http://127.0.0.1`. These are optional runtime host patterns; Chrome match
patterns ignore ports, so approving either host can cover any port on that host.
The site audit consent repeats the redirect disclosure because a redirected
request from a loopback audit can reach another local-network service. Reports
label these audits as development origins. No page text is transmitted.

Site audits now keep bounded response headers and timing locally alongside
each crawled page, including content type/length/encoding, X-Robots-Tag,
cache-control, security-header presence flags, redirect observations, and
browser/network response duration. Sitemap URLs, last-modified strings, and
alternate-language URLs are also local site-audit data. These values appear
in site reports/exports, where text fields are escaped and CSV formula-safe.
The export contains only the data stored for the audit; no page data is sent
to a server by the extension.

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
- **Site-mode requests**: requested URLs are same-origin and use `GET` with
  credentials omitted. Page fetches use browser-managed redirect following
  because extension-page Fetch returns opaque manual redirects. Each redirect
  destination may receive a credential-free request before the extension can
  inspect it; destination bodies outside the approved origin are discarded,
  and same-origin final URLs are checked against robots before parsing. Robots
  and sitemap redirects fail closed.
- **Permissions**: install-time grants remain exactly `activeTab` +
  `scripting` (CI-verified); `optional_host_permissions` is a grant
  catalog — one exact origin per user approval, revocable, re-verified
  before every site-mode request.
- **Private-network & credential protections**: https-only public origins,
  loopback/link-local/private ranges and IP literals rejected,
  `user:pass@host` URLs rejected — see docs/SITE_AUDIT.md.

A redirect on the audited site may cause the browser to send one credential-free GET request to the redirect destination before the extension can check its origin, permission, or robots rules. A redirect chain may cause one such request per hop. The extension discards a destination response body when its final URL is outside the approved origin or disallowed by robots.txt; it does not analyze or enqueue that page. For localhost or 127.0.0.1 audits, a redirect can reach another local-network service.

### Site audit sitemaps

When site audit runs, same-origin robots.txt sitemap declarations (or /sitemap.xml fallback) may be fetched and stored locally. The locally stored sitemap state is bounded to 50,000 entries and contains URLs, lastmod values, alternates, counts, and truncation warnings. Cross-origin entries are counted and discarded. No sitemap data is sent elsewhere.

### Duplicate and link-graph data

Site pages retain a normalized text hash, a 64-bit SimHash, and a word count
for bounded duplicate heuristics. The crawler computes these from at most the
first 50,000 characters of visible body text and does not persist the body
text for this feature. Reports and exports may include cluster URLs and link
edges; page-derived strings are escaped and CSV values are formula guarded.
