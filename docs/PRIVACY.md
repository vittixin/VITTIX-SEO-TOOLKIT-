# Privacy

**Short version: Vittix SEO Toolkit cannot send your data anywhere — it makes
zero network requests.**

## What is collected

When — and only when — you click _Analyze Current Page_, the extension reads a
bounded snapshot of the current tab: title and head metadata (description,
canonical, robots, viewport, charset, lang, Open Graph, twitter:card), the
first 300 headings, first 500 images (src + alt), first 500 links
(href/text/rel/target), and a capped body-text sample used only to count
words. That is everything.

## What is never collected

- Browsing history (no `history`/`tabs` permission exists to read it)
- Content of other tabs, other windows, or other origins
- Personal data, form input, cookies, credentials
- Anything outside the analyzed page, and nothing outside the click

## Where data lives

- Snapshots, analysis results and settings are stored in the extension's own
  **IndexedDB** on your machine (`vittix-seo` database via Dexie)
- No cloud, no sync, no analytics, no telemetry, no crash reporting

## Network activity

None. The extension performs no fetch/XHR/WebSocket requests and loads no
remote resources. You can verify this in DevTools or by inspecting the source.

## Retention & deletion

- Default retention: **90 days** and **200 audits** (oldest pruned first);
  configurable from _Settings_ (including _Keep forever_)
- _Clear all audit data_ (Settings / Options page) wipes every stored audit
  immediately
- Uninstalling the extension removes the database with the profile

## Exports

JSON/CSV exports are generated in-browser and downloaded only when you click
an export button. What you do with those files is entirely up to you.

## Permissions rationale

- `activeTab`: temporary access to the tab you clicked from, so the URL can be
  read and the page inspected — granted per click, revoked on navigation
- `scripting`: runs the one-shot, read-only extractor in that tab

See [SECURITY.md](SECURITY.md) for the enforcement side (CI manifest checks,
CSP, no remote code).
